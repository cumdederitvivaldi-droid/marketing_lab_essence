import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "@/lib/dashboard/_paginate";
import { fetchConversationsInRange, ConversationRow } from "@/lib/dashboard/funnel";
import { classifyChurnReasons, CHURN_REASON_KEYWORDS } from "@/lib/dashboard/churn-classify";
import { Phase } from "@/lib/ai/phases";

const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);
// 견적 발송 흔적이 있는 모든 status (수거까지 진행된 케이스 포함 — analytics route 와 동일)
const QUOTE_SENT_STATUSES = new Set([
  "quote_sent_nudge", "quote_sent_no_nudge", "nudge_sent", "booked",
  "payment_requested", "payment_check", "completed",
]);
const NUDGE_STATUSES = new Set(["quote_sent_nudge", "nudge_sent"]);

export const maxDuration = 60;

type SupportedPhase = "phase_2" | "phase_4" | "phase_5" | "phase_8";

const SUPPORTED: SupportedPhase[] = ["phase_2", "phase_4", "phase_5", "phase_8"];

// [CS-ADM-023] Phase 별 이탈 사유 분류 (P2/P4/P5/P8, Haiku on-demand + DB 캐시)
//   P8 = 예약확정(P7) 후 orders.status='cancelled' 된 케이스 — 수거완료 단계 이탈.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_DASHBOARD_ALLOWED_USERS.has(user.name)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { phase, fromIso, toIso } = body as { phase?: string; fromIso?: string; toIso?: string };
    if (!phase || !fromIso || !toIso) {
      return NextResponse.json({ error: "phase/fromIso/toIso required" }, { status: 400 });
    }
    if (!SUPPORTED.includes(phase as SupportedPhase)) {
      return NextResponse.json({ error: `phase must be one of ${SUPPORTED.join(", ")}` }, { status: 400 });
    }

    // 1. 모집단 산출 — phase 별 정의 (P8 은 cancelled orders session_id 별도 fetch 필요)
    const scopeConvs = await fetchConversationsInRange(fromIso, toIso);
    const cancelledOrderIds = phase === "phase_8"
      ? await fetchCancelledOrderSessionIds(fromIso, toIso)
      : null;
    const dropped = filterDroppedConvs(scopeConvs, phase as SupportedPhase, cancelledOrderIds);

    if (dropped.length === 0) {
      const empty = Object.fromEntries(CHURN_REASON_KEYWORDS.map((k) => [k, 0]));
      return NextResponse.json({ counts: empty, total: 0 });
    }

    // 2. 마지막 고객 발화 — phase 에 따라 시점 필터 (P5 는 quote.sentAt 이후만 의미 있음)
    const sessionIds = dropped.map((c) => c.session_id);
    const lastMessages = await fetchLastUserMessages(sessionIds, dropped, phase as SupportedPhase);

    const inputs = dropped.map((c) => ({
      sessionId: c.session_id,
      lastUserMessage: lastMessages.get(c.session_id) ?? null,
    }));

    const counts = await classifyChurnReasons(inputs, phase);

    // P2 정보수집 단계는 견적 발송 전이라 "비싸다" 분류 의미 없음 → 기타로 합산
    if (phase === "phase_2" && counts["비싸다"]) {
      counts["기타"] = (counts["기타"] ?? 0) + counts["비싸다"];
      counts["비싸다"] = 0;
    }

    return NextResponse.json({ counts, total: dropped.length });
  } catch (err) {
    console.error("[new_dashboard/churn-reasons] error:", err);
    return NextResponse.json(
      { counts: {}, total: 0, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/** Phase 별 이탈 모집단 정의 — analytics route 의 정의와 일치시킴 */
function filterDroppedConvs(
  scope: ConversationRow[],
  phase: SupportedPhase,
  cancelledOrderIds: Set<string> | null,
): ConversationRow[] {
  return scope.filter((c) => {
    const ci = c.collected_info;
    const reachedP2 =
      (typeof ci?.address === "string" && !!ci.address.trim()) ||
      (Array.isArray(ci?.items) && ci.items.length > 0);

    if (phase === "phase_2") {
      return !reachedP2;
    }
    if (phase === "phase_4") {
      if (!reachedP2) return false;
      const reachedP4 = c.quote?.sentAt != null || QUOTE_SENT_STATUSES.has(c.status);
      return !reachedP4;
    }
    if (phase === "phase_5") {
      if (!reachedP2) return false;
      return NUDGE_STATUSES.has(c.status);
    }
    if (phase === "phase_8") {
      // P8 이탈 = 예약확정 후 orders.status='cancelled' 된 케이스
      return cancelledOrderIds?.has(c.session_id) ?? false;
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
  // 1. cancelled session_id 수집
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

  // 2. 같은 session 들의 active order 존재 여부 검사 (기간 무관 — 재예약은 기간 외에도 발생 가능)
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

  // 3. cancelled - active = 진짜 이탈
  return new Set([...cancelledIds].filter((id) => !activeIds.has(id)));
}

/** 마지막 고객 발화 fetch — P5 는 quote.sentAt 이후만 (견적 보고 한 말) */
async function fetchLastUserMessages(
  sessionIds: string[],
  dropped: ConversationRow[],
  phase: SupportedPhase,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (sessionIds.length === 0) return map;

  const sentAtBySession = new Map<string, number>();
  if (phase === "phase_5") {
    for (const c of dropped) {
      if (c.quote?.sentAt) sentAtBySession.set(c.session_id, c.quote.sentAt);
    }
  }

  const CHUNK = 500;
  for (let i = 0; i < sessionIds.length; i += CHUNK) {
    const chunk = sessionIds.slice(i, i + CHUNK);
    const rows = await paginate<{ session_id: string; content: string; created_at: string }>(() =>
      supabase
        .from("messages")
        .select("session_id, content, created_at")
        .in("session_id", chunk)
        .eq("role", "user")
        .order("created_at", { ascending: false }),
    );
    for (const r of rows) {
      if (!r.content || map.has(r.session_id)) continue;
      // P5 는 quote.sentAt 이후 메시지만 의미 있음.
      //   sentAt 자체가 없으면 (데이터 누락) 시점 비교 불가 → 정보수집 응답이 잘못 잡히지 않도록
      //   user 메시지 자체를 무시 → 결과적으로 "무응답" 자동 분류.
      if (phase === "phase_5") {
        const sentAt = sentAtBySession.get(r.session_id);
        if (!sentAt) continue;
        if (new Date(r.created_at).getTime() < sentAt) continue;
      }
      map.set(r.session_id, r.content);
    }
  }
  return map;
}

// Phase enum 미사용 경고 회피 (위에서 string 비교만 함)
void Phase;
