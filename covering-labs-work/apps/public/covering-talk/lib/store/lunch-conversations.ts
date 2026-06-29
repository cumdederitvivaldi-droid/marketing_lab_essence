import { supabase } from "@/lib/supabase/client";

// ─── Types ──────────────────────────────────

export type LunchConversationStatus = "active" | "closed" | "needs_check";

export interface LunchMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  messageType: "text" | "image" | "file";
  imageUrl?: string;
  sentBy?: string;
  isEdited: boolean;
  createdAt: string;
  isInternal?: boolean;
  mentionedUserIds?: number[];
}

export interface LunchConversation {
  sessionId: string;
  userKey: string;
  senderKey: string;
  vendorId: string | null;
  vendorName: string;
  phone: string;
  status: LunchConversationStatus;
  assignee: string | null;
  tags: string[];
  memo: string;
  unreadCount: number;
  aiDraft: string | null;
  aiPhase: string;
  aiOrderData: string | null;
  messages: LunchMessage[];
  createdAt: string;
  updatedAt: string;
}

// ─── DB ↔ App 변환 ──────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToMessage(row: any): LunchMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    messageType: row.message_type ?? "text",
    imageUrl: row.image_url ?? undefined,
    sentBy: row.sent_by ?? undefined,
    isEdited: row.is_edited ?? false,
    createdAt: row.created_at,
    isInternal: row.is_internal ?? false,
    mentionedUserIds: row.mentioned_user_ids ?? [],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToConversation(row: any, msgs: any[] = []): LunchConversation {
  return {
    sessionId: row.session_id,
    userKey: row.user_key,
    senderKey: row.sender_key,
    vendorId: row.vendor_id ?? null,
    vendorName: row.vendor_name ?? "",
    phone: row.phone ?? "",
    status: row.status ?? "active",
    assignee: row.assignee ?? null,
    tags: row.tags ?? [],
    memo: row.memo ?? "",
    unreadCount: row.unread_count ?? 0,
    aiDraft: row.ai_draft ?? null,
    aiPhase: row.ai_phase ?? "idle",
    aiOrderData: row.ai_order_data ?? null,
    messages: msgs.map(dbToMessage),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Store ──────────────────────────────────

export const lunchConversationStore = {
  /** 목록 조회 (messages 제외, 경량) */
  async getAll(filters?: {
    status?: LunchConversationStatus;
    vendorId?: string;
    search?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ conversations: LunchConversation[]; nextCursor: string | null }> {
    const limit = filters?.limit ?? 50;

    let query = supabase
      .from("lunch_conversations")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.vendorId) query = query.eq("vendor_id", filters.vendorId);
    if (filters?.search) {
      const s = filters.search;
      query = query.or(`vendor_name.ilike.%${s}%,phone.ilike.%${s}%`);
    }
    if (filters?.cursor) query = query.lt("updated_at", filters.cursor);

    const { data, error } = await query;
    if (error) {
      console.error("[lunchConversationStore.getAll]", error);
      return { conversations: [], nextCursor: null };
    }

    const rows = data ?? [];
    const nextCursor = rows.length >= limit ? rows[rows.length - 1].updated_at : null;

    // 각 대화의 마지막 메시지 1건씩 가져오기 (미리보기용)
    // RPC가 있으면 사용, 없으면 fallback (limit 제한)
    const sessionIds = rows.map((r) => r.session_id);
    let lastMsgMap: Record<string, { content: string; message_type: string }> = {};
    if (sessionIds.length > 0) {
      // RPC 우선 시도 (DISTINCT ON — DB 레벨 최적화)
      const { data: rpcRows, error: rpcErr } = await supabase.rpc("get_lunch_last_messages", {
        session_ids: sessionIds,
      });

      if (!rpcErr && rpcRows) {
        for (const m of rpcRows) {
          lastMsgMap[m.session_id] = { content: m.content, message_type: m.message_type };
        }
      } else {
        // Fallback: 제한된 쿼리 (RPC 없는 환경)
        const { data: msgRows } = await supabase
          .from("lunch_messages")
          .select("session_id, content, message_type")
          .in("session_id", sessionIds)
          .order("created_at", { ascending: false })
          .limit(sessionIds.length * 3);

        if (msgRows) {
          for (const m of msgRows) {
            if (!lastMsgMap[m.session_id]) {
              lastMsgMap[m.session_id] = { content: m.content, message_type: m.message_type };
            }
          }
        }
      }
    }

    return {
      conversations: rows.map((r) => {
        const conv = dbToConversation(r);
        const last = lastMsgMap[r.session_id];
        if (last) {
          conv.messages = [{
            id: "__preview__",
            sessionId: r.session_id,
            role: "user",
            content: last.message_type === "image" ? "[이미지]" : last.content,
            messageType: last.message_type as "text" | "image" | "file",
            isEdited: false,
            createdAt: r.updated_at,
          }];
        }
        return conv;
      }),
      nextCursor,
    };
  },

  /** 단건 조회 (메시지 포함) */
  async getById(sessionId: string): Promise<LunchConversation | null> {
    const { data: conv, error: convErr } = await supabase
      .from("lunch_conversations")
      .select("*")
      .eq("session_id", sessionId)
      .single();

    if (convErr || !conv) return null;

    const { data: msgs } = await supabase
      .from("lunch_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(300);

    return dbToConversation(conv, msgs ?? []);
  },

  /**
   * 인바운드 메시지 수신 시 호출:
   * - 대화가 없으면 생성, 있으면 unread_count+1 / updated_at 갱신
   * - 메시지를 lunch_messages에 저장
   * - 중복 메시지 방지 (5초 내 동일 content)
   */
  async upsertIncoming(params: {
    sessionId: string;
    userKey: string;
    senderKey: string;
    vendorId?: string | null;
    vendorName?: string;
    phone?: string;
    content: string;
    messageType?: "text" | "image" | "file";
    imageUrl?: string;
    serialNumber?: string;
  }): Promise<LunchConversation | null> {
    const now = new Date().toISOString();

    const { data: existing } = await supabase
      .from("lunch_conversations")
      .select("session_id, unread_count, status")
      .eq("session_id", params.sessionId)
      .single();

    if (existing) {
      await supabase
        .from("lunch_conversations")
        .update({
          unread_count: (existing.unread_count ?? 0) + 1,
          // 상담완료(closed) 상태에서 신규 메시지 수신 시 대기중(active)으로 복귀
          // — 상담완료 탭에 묻혀 상담사가 놓치는 것 방지
          ...(existing.status === "closed" ? { status: "active" } : {}),
          // 벤더 정보 보완 (처음 매칭 못 했다가 나중에 매칭되는 경우)
          ...(params.vendorId ? { vendor_id: params.vendorId } : {}),
          ...(params.vendorName ? { vendor_name: params.vendorName } : {}),
          ...(params.phone ? { phone: params.phone } : {}),
          updated_at: now,
        })
        .eq("session_id", params.sessionId);
    } else {
      const { error } = await supabase.from("lunch_conversations").insert({
        session_id: params.sessionId,
        user_key: params.userKey,
        sender_key: params.senderKey,
        vendor_id: params.vendorId ?? null,
        vendor_name: params.vendorName ?? "",
        phone: params.phone ?? "",
        status: "active",
        unread_count: 1,
        updated_at: now,
      });
      if (error) {
        console.error("[lunchConversationStore.upsertIncoming] insert conv:", error);
        return null;
      }
    }

    // 중복 메시지 방지 (30초 내 동일 content)
    const isMedia = params.messageType === "image" || params.messageType === "file";
    let skipDup = false;
    if (!isMedia) {
      const thirtySecsAgo = new Date(Date.now() - 30000).toISOString();
      const { data: dup } = await supabase
        .from("lunch_messages")
        .select("id")
        .eq("session_id", params.sessionId)
        .eq("role", "user")
        .eq("content", params.content)
        .gt("created_at", thirtySecsAgo)
        .limit(1);
      skipDup = (dup?.length ?? 0) > 0;
    }

    if (!skipDup) {
      const serialKey = params.serialNumber ? `${params.sessionId}_${params.serialNumber}` : null;
      const { error: msgErr } = await supabase.from("lunch_messages").insert({
        id: makeId(),
        session_id: params.sessionId,
        role: "user",
        content: params.content,
        message_type: params.messageType ?? "text",
        image_url: params.imageUrl ?? null,
        ...(serialKey ? { serial_number: serialKey } : {}),
      });
      if (msgErr) console.error("[lunchConversationStore.upsertIncoming] insert msg:", msgErr);
    }

    return this.getById(params.sessionId);
  },

  /** 발신(상담사/시스템) 메시지 저장 */
  async addOutgoingMessage(
    sessionId: string,
    content: string,
    sentBy?: string,
    messageType: "text" | "image" | "file" = "text",
    imageUrl?: string,
    meta?: { replyKind?: "ai_auto" | "ai_assist" | "human"; draftCharOverlap?: number; respondedInMs?: number },
  ): Promise<void> {
    await supabase.from("lunch_messages").insert({
      id: makeId(),
      session_id: sessionId,
      role: "assistant",
      content,
      message_type: messageType,
      image_url: imageUrl ?? null,
      sent_by: sentBy ?? null,
      reply_kind: meta?.replyKind ?? null,
      draft_char_overlap: meta?.draftCharOverlap ?? null,
      responded_in_ms: meta?.respondedInMs ?? null,
    });

    await supabase
      .from("lunch_conversations")
      .update({ unread_count: 0, updated_at: new Date().toISOString() })
      .eq("session_id", sessionId);
  },

  /** 대화 메타데이터 업데이트 */
  async update(
    sessionId: string,
    updates: Partial<Pick<LunchConversation, "status" | "assignee" | "tags" | "memo" | "unreadCount" | "vendorId" | "vendorName" | "aiDraft" | "aiPhase" | "aiOrderData">>
  ): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: Record<string, any> = {};
    if (updates.status !== undefined) row.status = updates.status;
    if (updates.assignee !== undefined) row.assignee = updates.assignee;
    if (updates.tags !== undefined) row.tags = updates.tags;
    if (updates.memo !== undefined) row.memo = updates.memo;
    if (updates.unreadCount !== undefined) row.unread_count = updates.unreadCount;
    if (updates.vendorId !== undefined) row.vendor_id = updates.vendorId;
    if (updates.vendorName !== undefined) row.vendor_name = updates.vendorName;
    if ((updates as Record<string, unknown>).phone !== undefined) row.phone = (updates as Record<string, unknown>).phone;
    if (updates.aiDraft !== undefined) row.ai_draft = updates.aiDraft;
    if (updates.aiPhase !== undefined) row.ai_phase = updates.aiPhase;
    if (updates.aiOrderData !== undefined) row.ai_order_data = updates.aiOrderData;

    if (Object.keys(row).length === 0) return true;
    row.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from("lunch_conversations")
      .update(row)
      .eq("session_id", sessionId);

    if (error) {
      console.error("[lunchConversationStore.update]", error);
      return false;
    }
    return true;
  },

  /** 읽음 처리 */
  async resetUnread(sessionId: string): Promise<void> {
    await supabase
      .from("lunch_conversations")
      .update({ unread_count: 0 })
      .eq("session_id", sessionId);
  },

  /** 런치 내부대화 — 채널톡 isInternal 패턴.
   *   외부 발신 코드 경로와 분리됨 → 벤더에게 절대 안 나감. */
  async addInternalMessage(
    sessionId: string,
    content: string,
    sentBy: string,
    mentionedUserIds: number[] = [],
  ): Promise<{ id: string; createdAt: string }> {
    const msgId = Math.random().toString(36).slice(2, 10);
    const { data, error } = await supabase
      .from("lunch_messages")
      .insert({
        id: msgId,
        session_id: sessionId,
        role: "assistant",
        content,
        message_type: "text",
        image_url: null,
        sent_by: sentBy,
        is_edited: false,
        is_internal: true,
        mentioned_user_ids: mentionedUserIds,
      })
      .select("id, created_at")
      .single();
    if (error) throw error;
    await supabase
      .from("lunch_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("session_id", sessionId);
    return { id: msgId, createdAt: (data as { created_at: string }).created_at };
  },
};
