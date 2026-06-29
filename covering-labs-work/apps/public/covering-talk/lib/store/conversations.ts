import { supabase } from "@/lib/supabase/client";
import { Phase, CollectedInfo, PhaseTransition, EMPTY_COLLECTED_INFO } from "@/lib/ai/phases";
import { trackEvent } from "@/lib/tracking/mixpanel";
import { driverChats } from "@/lib/store/driver-chats";

// ─── Types ──────────────────────────────────

export type ConversationStatus =
  | "pending"
  | "quote_sent_nudge"
  | "quote_sent_no_nudge"
  | "nudge_sent"
  | "wrong_inbound"
  | "night_pickup"
  | "booked"
  | "cancelled"
  | "needs_check"
  | "no_response"
  | "completed"
  | "payment_check";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "ai_draft";
  content: string;
  messageType: "text" | "image" | "file";
  imageUrl?: string;
  timestamp: number;
  sentBy?: string;
  isEdited?: boolean;
  /** 내부대화 (상담사간 메모) 표식. true 면 고객에게 발송되지 않음. */
  isInternal?: boolean;
  /** 내부 메시지에서 멘션된 상담사 id 배열. */
  mentionedUserIds?: number[];
}

// AI 웹 검색으로 찾은 미등록 품목 스펙 제안
export interface ProductSuggestion {
  category: string;
  name: string;
  item_group: string;
  width: number;
  depth: number;
  height: number;
  volume: number;
  unit_price: number;
  weight: number;
  aliases: string[];
  source: string;       // "web_search" | "ai_estimate"
  confidence: "high" | "medium" | "low";
}

export interface QuoteItem {
  name: string;
  category: string;
  quantity: number;
  volumeM3: number;
  unitPrice: number;
  note: string;
  confidence?: "high" | "medium" | "low";
  aiSuggestion?: ProductSuggestion;
  productId?: number;
  sizeUnconfirmed?: boolean;
  sourceKeyword?: string;
}

export interface ExtraFee {
  type: string;
  description: string;
  amount: number;
}

export interface QuoteEditLog {
  field: string;
  oldValue: string;
  newValue: string;
  reason: string;
  editedBy: string;
  editedAt: number;
}

export interface Quote {
  items: QuoteItem[];
  subtotalVolume: number;
  basePrice: number;
  ladderFee: number;
  tripFee: number;           // 출장비 (지역 기반)
  workerCount: number;       // 인원 수 (1, 2, 3)
  extraFees: ExtraFee[];
  vatAmount: number;         // 부가세 (10%)
  totalPrice: number;
  createdAt: number;
  sentAt: number | null;
  editLog: QuoteEditLog[];
  manuallyEdited?: boolean;  // 운영자가 견적편집기에서 수동 편집했으면 true
}

export interface Booking {
  customerName: string;
  phone: string;
  address: string;
  floor: number;
  hasElevator: boolean;
  hasParking: boolean;
  ladderNeeded: boolean;
  preferredDate: string;
  preferredTime: string;
  confirmedAt: number | null;
  reminderSentAt: number | null;
  specialNotes: string;
}

export interface Conversation {
  sessionId: string;
  userKey: string;
  senderKey: string;
  phone: string;
  name: string | null;
  status: ConversationStatus;
  assignee: string | null;
  tags: string[];
  messages: ChatMessage[];
  aiDraft: string | null;
  quote: Quote | null;
  booking: Booking | null;
  memo: string;
  needsHuman: boolean;
  unreadCount: number;
  createdAt: number;
  updatedAt: number;
  // Phase 머신
  currentPhase: Phase;
  collectedInfo: CollectedInfo;
  phaseHistory: PhaseTransition[];
  // 카카오 상담톡 진입 시 메타 webhook (reference.extra) 으로 받은 referrer
  referrer: string | null;
  referrerAt: number | null;
}

export const STATUS_LABELS: Record<ConversationStatus, string> = {
  pending: "대기중",
  quote_sent_nudge: "견적완료(넛지예정)",
  quote_sent_no_nudge: "견적완료(넛지불가)",
  nudge_sent: "넛지완료",
  wrong_inbound: "오인입",
  night_pickup: "야간수거",
  booked: "예약완료",
  cancelled: "예약취소",
  needs_check: "확인필요",
  no_response: "무응답",
  completed: "상담완료",
  payment_check: "결제확인필요",
};

export const STATUS_COLORS: Record<ConversationStatus, string> = {
  pending: "bg-red-100 text-red-600",
  quote_sent_nudge: "bg-yellow-100 text-yellow-700",
  quote_sent_no_nudge: "bg-orange-100 text-orange-700",
  nudge_sent: "bg-emerald-100 text-emerald-700",
  wrong_inbound: "bg-gray-100 text-gray-500",
  night_pickup: "bg-purple-100 text-purple-700",
  booked: "bg-green-100 text-green-700",
  cancelled: "bg-red-200 text-red-700",
  needs_check: "bg-red-100 text-red-600",
  no_response: "bg-gray-200 text-gray-500",
  completed: "bg-gray-100 text-gray-400",
  payment_check: "bg-blue-100 text-blue-600",
};

// ─── DB Row → App 타입 변환 ──────────────────────────

interface DbConversation {
  session_id: string;
  user_key: string;
  sender_key: string;
  phone: string | null;
  name: string | null;
  status: string;
  assignee: string | null;
  tags: string[] | null;
  memo: string | null;
  needs_human: boolean;
  unread_count: number;
  ai_draft: string | null;
  quote: Quote | null;
  booking: Booking | null;
  created_at: string;
  updated_at: string;
  // Phase 머신
  current_phase: string | null;
  collected_info: CollectedInfo | null;
  phase_history: PhaseTransition[] | null;
  // 메타 webhook referrer
  referrer: string | null;
  referrer_at: string | null;
}

interface DbMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  message_type: string;
  image_url: string | null;
  sent_by: string | null;
  is_edited: boolean;
  created_at: string;
  is_internal?: boolean | null;
  mentioned_user_ids?: number[] | null;
}

function dbToConversation(row: DbConversation, messages: DbMessage[] = []): Conversation {
  return {
    sessionId: row.session_id,
    userKey: row.user_key,
    senderKey: row.sender_key,
    phone: row.phone ?? "",
    name: row.name,
    status: row.status as ConversationStatus,
    assignee: row.assignee,
    tags: row.tags ?? [],
    messages: messages.map(dbToMessage),
    aiDraft: row.ai_draft,
    quote: row.quote,
    booking: row.booking,
    memo: row.memo ?? "",
    needsHuman: row.needs_human,
    unreadCount: row.unread_count,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    // collected_info 가 NULL / {} 일 때 안전하게 기본값 병합
    currentPhase: (row.current_phase as Phase) ?? Phase.PHASE_1_INITIAL,
    collectedInfo: {
      ...EMPTY_COLLECTED_INFO,
      ...(row.collected_info ?? {}),
      items: (row.collected_info as CollectedInfo | null)?.items ?? [],
      special_notes: (row.collected_info as CollectedInfo | null)?.special_notes ?? [],
      photos: (row.collected_info as CollectedInfo | null)?.photos ?? [],
    },
    phaseHistory: row.phase_history ?? [],
    referrer: row.referrer ?? null,
    referrerAt: row.referrer_at ? new Date(row.referrer_at).getTime() : null,
  };
}

function dbToMessage(row: DbMessage): ChatMessage {
  return {
    id: row.id,
    role: row.role as ChatMessage["role"],
    content: row.content,
    messageType: row.message_type as ChatMessage["messageType"],
    imageUrl: row.image_url ?? undefined,
    sentBy: row.sent_by ?? undefined,
    isEdited: row.is_edited,
    timestamp: new Date(row.created_at).getTime(),
    isInternal: row.is_internal ?? false,
    mentionedUserIds: row.mentioned_user_ids ?? [],
  };
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Supabase Store ──────────────────────────────────

export const conversationStore = {
  /** 목록용 경량 조회: 대화당 마지막 메시지 1개만 로드 (cursor 기반 페이지네이션) */
  async getAllForList(opts?: { cursor?: string; limit?: number; search?: string; statuses?: string[] }): Promise<{
    conversations: Conversation[];
    nextCursor: string | null;
  }> {
    const limit = opts?.limit ?? 50;

    let query = supabase
      .from("conversations")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (opts?.search) {
      // 서버사이드 검색: 이름, 전화번호, 세션ID (ilike = case-insensitive)
      const s = opts.search.trim();
      query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%,session_id.ilike.%${s}%`);
    }

    if (opts?.statuses && opts.statuses.length > 0) {
      query = query.in("status", opts.statuses);
    }

    if (opts?.cursor) {
      query = query.lt("updated_at", opts.cursor);
    }

    // 기사님 채팅 세션은 메인 큐에서 제외 — 별도 도크에서 관리
    const driverIds = await driverChats.getActiveSessionIds();
    if (driverIds.size > 0) {
      const inList = `(${[...driverIds].map((id) => `"${id}"`).join(",")})`;
      query = query.not("session_id", "in", inList);
    }

    const { data: convRows, error } = await query;

    if (error) {
      console.error("[Store] getAllForList error:", error);
      return { conversations: [], nextCursor: null };
    }

    if (!convRows || convRows.length === 0) {
      return { conversations: [], nextCursor: null };
    }

    // 대화별 마지막 메시지 1개만 가져오기 (RPC: get_last_messages)
    const sessionIds = convRows.map((r) => r.session_id);
    const { data: lastMsgs } = await supabase.rpc("get_last_messages", {
      session_ids: sessionIds,
    });

    const msgMap = new Map<string, DbMessage[]>();
    for (const msg of lastMsgs ?? []) {
      msgMap.set(msg.session_id, [msg]);
    }

    const conversations = convRows.map((row) =>
      dbToConversation(row, msgMap.get(row.session_id) ?? [])
    );

    // 다음 페이지 cursor (마지막 행의 updated_at)
    const nextCursor = convRows.length >= limit
      ? convRows[convRows.length - 1].updated_at
      : null;

    return { conversations, nextCursor };
  },

  async getById(sessionId: string): Promise<Conversation | undefined> {
    const { data: convRow, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .eq("session_id", sessionId)
      .single();

    if (convError) {
      console.error(`[Store] getById conv error (${sessionId}):`, convError.message);
      return undefined;
    }
    if (!convRow) return undefined;

    const { data: msgs, error: msgError } = await supabase
      .from("messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(500);

    if (msgError) {
      console.error(`[Store] getById msgs error (${sessionId}):`, msgError.message);
    }

    return dbToConversation(convRow, msgs ?? []);
  },

  async upsertMessage(params: {
    sessionId: string;
    userKey: string;
    senderKey: string;
    userMessage: string;
    messageType?: "text" | "image" | "file";
    imageUrl?: string;
    aiDraft: string | null;
    needsHuman: boolean;
  }): Promise<Conversation> {
    const msgId = makeId();
    // user_key가 전화번호 형식(01x-xxxx-xxxx)인 경우에만 phone으로 사용
    const phoneCandidate = params.userKey.replace(/[^0-9+]/g, "");
    const phone = /^01[016789]\d{7,8}$/.test(phoneCandidate) ? phoneCandidate : "";
    const now = new Date().toISOString();

    // 기존 대화 존재 여부 확인
    const { data: existing } = await supabase
      .from("conversations")
      .select("session_id, unread_count, status")
      .eq("session_id", params.sessionId)
      .single();

    if (existing) {
      // 기존 대화 업데이트 — 고객 메시지가 오면 항상 pending으로 전환
      await supabase
        .from("conversations")
        .update({
          status: "pending",
          ai_draft: params.aiDraft,
          needs_human: params.needsHuman,
          unread_count: (existing.unread_count ?? 0) + 1,
          updated_at: now,
        })
        .eq("session_id", params.sessionId);
    } else {
      // 새 대화 생성 — referrer 우선순위:
      //   1. pending_referrers (해피톡 reference webhook 이 메시지보다 먼저 도착한 케이스)
      //   2. 같은 user_key 의 이전 conv 의 referrer (재진입 — 카카오가 새 session_id 발급해도 동일 user)
      //   3. 둘 다 없으면 null
      const { data: pending } = await supabase
        .from("pending_referrers")
        .select("referrer, received_at")
        .eq("user_key", params.userKey)
        .maybeSingle();

      let referrer: string | null = null;
      let referrerAt: string | null = null;
      if (pending) {
        referrer = pending.referrer;
        referrerAt = pending.received_at;
      } else {
        const { data: prevConv } = await supabase
          .from("conversations")
          .select("referrer, referrer_at")
          .eq("user_key", params.userKey)
          .not("referrer", "is", null)
          .order("referrer_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (prevConv?.referrer) {
          referrer = prevConv.referrer;
          referrerAt = prevConv.referrer_at;
        }
      }

      const { error: convErr } = await supabase
        .from("conversations")
        .insert({
          session_id: params.sessionId,
          user_key: params.userKey,
          sender_key: params.senderKey,
          phone,
          status: "pending",
          ai_draft: params.aiDraft,
          needs_human: params.needsHuman,
          unread_count: 1,
          updated_at: now,
          ...(referrer ? { referrer, referrer_at: referrerAt } : {}),
        });
      if (convErr) {
        console.error("[Store] insert conv error:", convErr);
      } else {
        trackEvent("[EVENT] SpotConversationStart", { sessionId: params.sessionId });
        if (pending) {
          await supabase.from("pending_referrers").delete().eq("user_key", params.userKey);
        }
      }
    }

    // 중복 메시지 방지: 최근 5초 내 동일 content 있으면 스킵
    // ⚠️ 이미지/파일은 content가 동일("[사진 수신]")하므로 image_url로 구분
    const isMedia = params.messageType === "image" || params.messageType === "file";
    let skipDuplicate = false;
    if (!isMedia) {
      const fiveSecsAgo = new Date(Date.now() - 5000).toISOString();
      const { data: recentDup } = await supabase
        .from("messages")
        .select("id")
        .eq("session_id", params.sessionId)
        .eq("role", "user")
        .eq("content", params.userMessage)
        .gt("created_at", fiveSecsAgo)
        .limit(1);
      skipDuplicate = (recentDup?.length ?? 0) > 0;
    }

    if (!skipDuplicate) {
      const { error: msgErr } = await supabase
        .from("messages")
        .insert({
          id: msgId,
          session_id: params.sessionId,
          role: "user",
          content: params.userMessage,
          message_type: params.messageType ?? "text",
          image_url: params.imageUrl ?? null,
        });
      if (msgErr) console.error("[Store] insert message error:", msgErr);
    }

    return (await this.getById(params.sessionId))!;
  },

  async addAssistantMessage(
    sessionId: string,
    content: string,
    sentBy?: string,
    isEdited?: boolean,
    messageType?: "text" | "image" | "file",
    imageUrl?: string,
    meta?: { replyKind?: "ai_auto" | "ai_assist" | "human"; draftCharOverlap?: number; respondedInMs?: number },
  ): Promise<void> {
    const msgId = makeId();

    await supabase
      .from("messages")
      .insert({
        id: msgId,
        session_id: sessionId,
        role: "assistant",
        content,
        message_type: messageType ?? "text",
        image_url: imageUrl ?? null,
        sent_by: sentBy ?? null,
        is_edited: isEdited ?? false,
        reply_kind: meta?.replyKind ?? null,
        draft_char_overlap: meta?.draftCharOverlap ?? null,
        responded_in_ms: meta?.respondedInMs ?? null,
      });

    await supabase
      .from("conversations")
      .update({
        ai_draft: null,
        unread_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId);
  },

  /** 내부대화 메시지 추가 — 채널톡 isInternal 패턴과 동일.
   *   sendSplitMessage 등 외부 발신 코드 경로와 완전히 분리됨 → 고객에게 절대 안 나감.
   *   role 은 "assistant" 로 저장하되 is_internal=true 로 구분.
   */
  async addInternalMessage(
    sessionId: string,
    content: string,
    sentBy: string,
    mentionedUserIds: number[] = [],
  ): Promise<{ id: string; createdAt: string }> {
    const msgId = makeId();
    const { data, error } = await supabase
      .from("messages")
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
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("session_id", sessionId);
    return { id: msgId, createdAt: (data as { created_at: string }).created_at };
  },

  async updateStatus(sessionId: string, status: ConversationStatus): Promise<void> {
    // 상담완료 시 "전화요청" tag 를 "전화요청완료" 마커로 치환 — 재인입 시 다시 전화요청 배지가 뜨지 않도록.
    if (status === "completed") {
      const { data } = await supabase
        .from("conversations")
        .select("tags")
        .eq("session_id", sessionId)
        .single();
      const existing = (data?.tags as string[] | null) ?? [];
      if (existing.includes("전화요청")) {
        const newTags = existing.filter((t) => t !== "전화요청");
        if (!newTags.includes("전화요청완료")) newTags.push("전화요청완료");
        await supabase
          .from("conversations")
          .update({ status, tags: newTags, updated_at: new Date().toISOString() })
          .eq("session_id", sessionId);
      } else {
        await supabase
          .from("conversations")
          .update({ status, updated_at: new Date().toISOString() })
          .eq("session_id", sessionId);
      }
    } else {
      await supabase
        .from("conversations")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("session_id", sessionId);
    }

    // 견적 발송 퍼널 이벤트
    if (status === "quote_sent_nudge") {
      this.getById(sessionId).then((conv) => {
        trackEvent("[EVENT] SpotQuoteSent", {
          sessionId,
          estimatedPrice: conv?.quote?.totalPrice ?? 0,
          itemCount: conv?.quote?.items?.length ?? 0,
        });
      }).catch(() => {});
    }
  },

  async updateDraft(sessionId: string, draft: string): Promise<void> {
    await supabase
      .from("conversations")
      .update({ ai_draft: draft, updated_at: new Date().toISOString() })
      .eq("session_id", sessionId);
  },

  async updateBooking(sessionId: string, booking: Booking): Promise<void> {
    await supabase
      .from("conversations")
      .update({ booking, updated_at: new Date().toISOString() })
      .eq("session_id", sessionId);
  },

  async updateQuote(sessionId: string, quote: Quote): Promise<void> {
    await supabase
      .from("conversations")
      .update({ quote, updated_at: new Date().toISOString() })
      .eq("session_id", sessionId);
  },

  async updateMemo(sessionId: string, memo: string): Promise<void> {
    await supabase
      .from("conversations")
      .update({ memo, updated_at: new Date().toISOString() })
      .eq("session_id", sessionId);
  },

  async updateName(sessionId: string, name: string): Promise<void> {
    await supabase
      .from("conversations")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("session_id", sessionId);
  },

  async updatePhone(sessionId: string, phone: string): Promise<void> {
    await supabase
      .from("conversations")
      .update({ phone, updated_at: new Date().toISOString() })
      .eq("session_id", sessionId);
  },

  async updateAssignee(sessionId: string, assignee: string | null): Promise<void> {
    await supabase
      .from("conversations")
      .update({ assignee, updated_at: new Date().toISOString() })
      .eq("session_id", sessionId);
  },

  /** tag 추가 (중복 방지). 기존 tags 가져와서 union 후 저장.
   *   특수 규칙: 이미 "전화요청완료" 마커가 있는 세션엔 "전화요청" 을 다시 추가하지 않음
   *   (한 번 상담완료된 세션은 재인입해도 전화요청 배지가 다시 뜨지 않도록). */
  async addTag(sessionId: string, tag: string): Promise<void> {
    const { data } = await supabase
      .from("conversations")
      .select("tags")
      .eq("session_id", sessionId)
      .single();
    const existing = (data?.tags as string[] | null) ?? [];
    if (existing.includes(tag)) return;
    if (tag === "전화요청" && existing.includes("전화요청완료")) return;
    await supabase
      .from("conversations")
      .update({ tags: [...existing, tag], updated_at: new Date().toISOString() })
      .eq("session_id", sessionId);
  },

  /** tag 제거 (배열에서 빼고 저장). 없으면 no-op. */
  async removeTag(sessionId: string, tag: string): Promise<void> {
    const { data } = await supabase
      .from("conversations")
      .select("tags")
      .eq("session_id", sessionId)
      .single();
    const existing = (data?.tags as string[] | null) ?? [];
    if (!existing.includes(tag)) return;
    const next = existing.filter((t) => t !== tag);
    await supabase
      .from("conversations")
      .update({ tags: next, updated_at: new Date().toISOString() })
      .eq("session_id", sessionId);
  },

  /** 전화요청 → 전화요청완료 마커 전환 (상태 변경 없이).
   *   상담사가 전화 걸어 처리한 뒤 사이드패널에서 직접 종료할 때 사용. */
  async markPhoneRequestDone(sessionId: string): Promise<void> {
    const { data } = await supabase
      .from("conversations")
      .select("tags")
      .eq("session_id", sessionId)
      .single();
    const existing = (data?.tags as string[] | null) ?? [];
    if (!existing.includes("전화요청") && existing.includes("전화요청완료")) return;
    const next = existing.filter((t) => t !== "전화요청");
    if (!next.includes("전화요청완료")) next.push("전화요청완료");
    await supabase
      .from("conversations")
      .update({ tags: next, updated_at: new Date().toISOString() })
      .eq("session_id", sessionId);
  },

  async markRead(sessionId: string): Promise<void> {
    await supabase
      .from("conversations")
      .update({ unread_count: 0, ai_draft: null })
      .eq("session_id", sessionId);
  },

  async closeSession(sessionId: string): Promise<void> {
    await supabase
      .from("conversations")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("session_id", sessionId);
  },

  // ─── Phase 머신 메서드 ──────────────────────────

  async updatePhase(
    sessionId: string,
    phase: Phase,
    reason: string,
    triggeredBy: "auto" | "agent"
  ): Promise<void> {
    // 현재 대화 조회하여 phase_history에 append
    const { data: conv } = await supabase
      .from("conversations")
      .select("current_phase, phase_history")
      .eq("session_id", sessionId)
      .single();

    const currentPhase = conv?.current_phase ?? Phase.PHASE_1_INITIAL;
    const history: PhaseTransition[] = (conv?.phase_history as PhaseTransition[]) ?? [];
    history.push({
      from: currentPhase as Phase,
      to: phase,
      reason,
      triggered_by: triggeredBy,
      timestamp: new Date().toISOString(),
    });

    await supabase
      .from("conversations")
      .update({
        current_phase: phase,
        phase_history: history,
        updated_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId);
  },

  async updateCollectedInfo(
    sessionId: string,
    info: Partial<CollectedInfo>
  ): Promise<void> {
    // 기존 collected_info와 merge
    const { data: conv } = await supabase
      .from("conversations")
      .select("collected_info")
      .eq("session_id", sessionId)
      .single();

    const existing: CollectedInfo = (conv?.collected_info as CollectedInfo) ?? { ...EMPTY_COLLECTED_INFO };
    const KNOWN_FIELDS = new Set(['address', 'district', 'floor', 'elevator', 'parking', 'items', 'special_notes', 'photos']);
    const merged: CollectedInfo = {
      address: info.address !== undefined ? info.address : existing.address,
      district: info.district !== undefined ? info.district : existing.district,
      floor: info.floor !== undefined ? info.floor : existing.floor,
      elevator: info.elevator !== undefined ? info.elevator : existing.elevator,
      parking: info.parking !== undefined ? info.parking : existing.parking,
      items: info.items !== undefined ? info.items : existing.items,
      special_notes: info.special_notes !== undefined ? info.special_notes : existing.special_notes,
      photos: info.photos !== undefined ? info.photos : existing.photos,
    };
    // extra fields 보존 (e.g., _reentryMsgIdx, _prevQuoteSummary)
    const mergedAny = merged as unknown as Record<string, unknown>;
    const existingAny = existing as unknown as Record<string, unknown>;
    const infoAny = info as unknown as Record<string, unknown>;
    for (const key of Object.keys(existingAny)) {
      if (!KNOWN_FIELDS.has(key) && !(key in mergedAny)) {
        mergedAny[key] = existingAny[key];
      }
    }
    for (const key of Object.keys(infoAny)) {
      if (!KNOWN_FIELDS.has(key)) {
        mergedAny[key] = infoAny[key];
      }
    }

    await supabase
      .from("conversations")
      .update({
        collected_info: merged,
        updated_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId);
  },

  /**
   * 배치 업데이트: 여러 필드를 1회 UPDATE로 저장
   * 개별 updateCollectedInfo + updatePhase + updateQuote 등을 1회로 통합
   */
  async batchUpdate(
    sessionId: string,
    updates: {
      collectedInfo?: Partial<CollectedInfo>;
      phase?: { phase: Phase; reason: string; triggeredBy: "auto" | "agent" };
      quote?: Quote;
      status?: string;
      aiDraft?: string | null;
      memo?: string;
      needsHuman?: boolean;
    },
    /** 이미 로드된 conversation 객체가 있으면 DB 조회 생략 */
    existingConv?: { collectedInfo: CollectedInfo; currentPhase: Phase; phaseHistory: PhaseTransition[] }
  ): Promise<void> {
    const now = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbUpdates: Record<string, any> = { updated_at: now };

    // collectedInfo merge: 기존 값과 merge
    if (updates.collectedInfo) {
      let existing: CollectedInfo;
      if (existingConv) {
        existing = existingConv.collectedInfo;
      } else {
        const { data: conv } = await supabase
          .from("conversations")
          .select("collected_info")
          .eq("session_id", sessionId)
          .single();
        existing = (conv?.collected_info as CollectedInfo) ?? { ...EMPTY_COLLECTED_INFO };
      }
      const info = updates.collectedInfo;
      dbUpdates.collected_info = {
        address: info.address !== undefined ? info.address : existing.address,
        district: info.district !== undefined ? info.district : existing.district,
        floor: info.floor !== undefined ? info.floor : existing.floor,
        elevator: info.elevator !== undefined ? info.elevator : existing.elevator,
        parking: info.parking !== undefined ? info.parking : existing.parking,
        items: info.items !== undefined ? info.items : existing.items,
        special_notes: info.special_notes !== undefined ? info.special_notes : existing.special_notes,
        photos: info.photos !== undefined ? info.photos : existing.photos,
      };
    }

    // phase 전환: history에 append
    if (updates.phase) {
      let currentPhase: Phase;
      let history: PhaseTransition[];
      if (existingConv) {
        currentPhase = existingConv.currentPhase;
        history = [...existingConv.phaseHistory];
      } else {
        const { data: conv } = await supabase
          .from("conversations")
          .select("current_phase, phase_history")
          .eq("session_id", sessionId)
          .single();
        currentPhase = (conv?.current_phase as Phase) ?? Phase.PHASE_1_INITIAL;
        history = (conv?.phase_history as PhaseTransition[]) ?? [];
      }
      history.push({
        from: currentPhase,
        to: updates.phase.phase,
        reason: updates.phase.reason,
        triggered_by: updates.phase.triggeredBy,
        timestamp: now,
      });
      dbUpdates.current_phase = updates.phase.phase;
      dbUpdates.phase_history = history;
    }

    if (updates.quote !== undefined) dbUpdates.quote = updates.quote;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.aiDraft !== undefined) dbUpdates.ai_draft = updates.aiDraft;
    if (updates.memo !== undefined) dbUpdates.memo = updates.memo;
    if (updates.needsHuman !== undefined) dbUpdates.needs_human = updates.needsHuman;

    await supabase.from("conversations").update(dbUpdates).eq("session_id", sessionId);
  },

  // 폴링용: 특정 시간 이후 업데이트된 대화 조회
  async getUpdatedSince(since: string): Promise<{ sessionIds: string[]; timestamp: string }> {
    const { data, error } = await supabase
      .from("conversations")
      .select("session_id, updated_at")
      .gt("updated_at", since)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("[Store] getUpdatedSince error:", error);
      return { sessionIds: [], timestamp: since };
    }

    const driverIds = await driverChats.getActiveSessionIds();
    const sessionIds = (data ?? [])
      .map((r: { session_id: string }) => r.session_id)
      .filter((id) => !driverIds.has(id));
    const latestTime = data?.[0]?.updated_at ?? since;

    return { sessionIds, timestamp: latestTime };
  },
};
