import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "@/lib/dashboard/_paginate";
import { fetchConversationsInRange } from "@/lib/dashboard/funnel";

const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);

interface ConversationListItem {
  sessionId: string;
  customerName: string | null;
  lastUserMessage: string | null;
  status: string;
  createdAt: string;
}

interface ChurnReasonRow {
  session_id: string;
  reason_keyword: string;
  last_user_message: string | null;
}

interface ConvMetaRow {
  session_id: string;
  name: string | null;
  status: string;
  created_at: string;
}

// [CS-ADM-024] Phase × 이탈사유 별 conversation list (모달용)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_DASHBOARD_ALLOWED_USERS.has(user.name)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const params = new URL(request.url).searchParams;
    const phase = params.get("phase");
    const reason = params.get("reason");
    const fromIso = params.get("fromIso");
    const toIso = params.get("toIso");
    if (!phase || !reason || !fromIso || !toIso) {
      return NextResponse.json({ error: "phase/reason/fromIso/toIso required" }, { status: 400 });
    }

    // 1. scope conversations + phase 별 모집단 필터 (stale 캐시 제외 — 현재 그 phase 미도달인 것만)
    const scopeConvs = await fetchConversationsInRange(fromIso, toIso);
    let droppedConvs;
    if (phase === "phase_8") {
      const cancelledIds = await fetchCancelledOrderSessionIds(fromIso, toIso);
      droppedConvs = scopeConvs.filter((c) => cancelledIds.has(c.session_id));
    } else {
      droppedConvs = filterDroppedByPhase(scopeConvs, phase);
    }
    const scopeMap = new Map<string, ConvMetaRow>();
    for (const c of droppedConvs) {
      scopeMap.set(c.session_id, {
        session_id: c.session_id,
        name: null,
        status: c.status,
        created_at: c.created_at,
      });
    }
    if (scopeMap.size === 0) return NextResponse.json({ items: [], total: 0 });

    // 2. 해당 (phase, reason) 으로 분류된 session_id + last_user_message 조회
    const scopeIds = [...scopeMap.keys()];
    const matchedRows: ChurnReasonRow[] = [];
    const CHUNK = 500;
    for (let i = 0; i < scopeIds.length; i += CHUNK) {
      const chunk = scopeIds.slice(i, i + CHUNK);
      const rows = await paginate<ChurnReasonRow>(() =>
        supabase
          .from("dashboard_churn_reasons")
          .select("session_id, reason_keyword, last_user_message")
          .eq("phase", phase)
          .eq("reason_keyword", reason)
          .in("session_id", chunk),
      );
      matchedRows.push(...rows);
    }
    if (matchedRows.length === 0) return NextResponse.json({ items: [], total: 0 });

    // 3. 고객명 조회 (conversations.name) — UI 표시용
    const matchedIds = matchedRows.map((r) => r.session_id);
    for (let i = 0; i < matchedIds.length; i += CHUNK) {
      const chunk = matchedIds.slice(i, i + CHUNK);
      const rows = await paginate<{ session_id: string; name: string | null }>(() =>
        supabase
          .from("conversations")
          .select("session_id, name")
          .in("session_id", chunk),
      );
      for (const r of rows) {
        const meta = scopeMap.get(r.session_id);
        if (meta) meta.name = r.name;
      }
    }

    // 4. 응답 조립 (created_at 최신순)
    const items: ConversationListItem[] = matchedRows
      .map((r) => {
        const meta = scopeMap.get(r.session_id);
        if (!meta) return null;
        return {
          sessionId: r.session_id,
          customerName: meta.name,
          lastUserMessage: r.last_user_message,
          status: meta.status,
          createdAt: meta.created_at,
        };
      })
      .filter((x): x is ConversationListItem => x != null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ items, total: items.length });
  } catch (err) {
    console.error("[churn-reasons/conversations] error:", err);
    return NextResponse.json(
      { items: [], total: 0, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// 견적 발송 흔적이 있는 모든 status (수거까지 진행된 케이스 포함 — analytics route 와 동일)
const QUOTE_SENT_STATUSES = new Set([
  "quote_sent_nudge", "quote_sent_no_nudge", "nudge_sent", "booked",
  "payment_requested", "payment_check", "completed",
]);
const NUDGE_STATUSES = new Set(["quote_sent_nudge", "nudge_sent"]);

/** Phase 별 "현재" 이탈 모집단 — churn-reasons/route.ts 의 filterDroppedConvs 와 동일 정의.
 *  stale 캐시 (이미 다음 단계로 진행된 conversation) 제외용. */
function filterDroppedByPhase(scope: Awaited<ReturnType<typeof fetchConversationsInRange>>, phase: string) {
  return scope.filter((c) => {
    const ci = c.collected_info;
    const reachedP2 =
      (typeof ci?.address === "string" && !!ci.address.trim()) ||
      (Array.isArray(ci?.items) && ci.items.length > 0);
    if (phase === "phase_2") return !reachedP2;
    if (phase === "phase_4") {
      if (!reachedP2) return false;
      const reachedP4 = c.quote?.sentAt != null || QUOTE_SENT_STATUSES.has(c.status);
      return !reachedP4;
    }
    if (phase === "phase_5") {
      if (!reachedP2) return false;
      return NUDGE_STATUSES.has(c.status);
    }
    return false;
  });
}

/**
 * 기간 내 "진짜 취소만 있는" session_id (P8 모집단 산출용).
 *   cancelled order 가 있고 + 같은 session 의 active order(confirmed/payment_requested/completed) 가 0건 인 경우만.
 *   (예약 변경 후 재예약 케이스 — cancelled + completed 같이 있으면 진짜 이탈 아님)
 */
async function fetchCancelledOrderSessionIds(fromIso: string, toIso: string): Promise<Set<string>> {
  const cancelledRows = await paginate<{ session_id: string | null }>(() =>
    supabase
      .from("orders")
      .select("session_id")
      .eq("status", "cancelled")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .not("session_id", "is", null),
  );
  const cancelledIds = new Set(cancelledRows.map((r) => r.session_id).filter((s): s is string => !!s));
  if (cancelledIds.size === 0) return cancelledIds;

  const idArray = [...cancelledIds];
  const activeIds = new Set<string>();
  const CHUNK = 500;
  for (let i = 0; i < idArray.length; i += CHUNK) {
    const chunk = idArray.slice(i, i + CHUNK);
    const rows = await paginate<{ session_id: string | null }>(() =>
      supabase
        .from("orders")
        .select("session_id")
        .in("status", ["confirmed", "payment_requested", "prepaid", "completed"])
        .in("session_id", chunk),
    );
    for (const r of rows) if (r.session_id) activeIds.add(r.session_id);
  }
  return new Set([...cancelledIds].filter((id) => !activeIds.has(id)));
}
