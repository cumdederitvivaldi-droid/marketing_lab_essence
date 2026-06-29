import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { periodFromSearchParams } from "@/lib/dashboard/period";
import { loadDashboardSettings } from "@/lib/dashboard/settings";
import { fetchConversationsInRange, buildFunnel } from "@/lib/dashboard/funnel";
import { computeChurn } from "@/lib/dashboard/churn";
import { fetchMessagesForSessions, computePhaseAssignees } from "@/lib/dashboard/operators";
import { getCompletedRevenue, countOrdersByDateRange } from "@/lib/dashboard/revenue";
import { getDailyFunnel } from "@/lib/dashboard/daily-funnel";
import { fetchUnserviceableSessionIds } from "@/lib/dashboard/serviceability";
import { getHealthMetrics } from "@/lib/dashboard/health";
import { buildInsight } from "@/lib/dashboard/insight";
import { JOURNEY_PHASES, KrCardData, PhaseColumnData, JourneyMapData, TrafficChannel } from "@/lib/dashboard/types";
import { Phase } from "@/lib/ai/phases";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "@/lib/dashboard/_paginate";

const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);

// [CS-ADM-016] 관리자 대시보드 통합 분석 (KR + Journey + Health + Traffic)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_DASHBOARD_ALLOWED_USERS.has(user.name)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const range = periodFromSearchParams(params);
  const settings = await loadDashboardSettings();
  const nowMs = Date.now();

  try {
    // 1. conversations 두 종류 동시 로드
    //    - scope: 기간 내 생성된 conversations (퍼널 모집단)
    //    - reentryPool: 기간 + 재진입 윈도우(14d) 까지 — 동일 user_key 재진입 검사
    const reentryStartMs = range.fromMs;
    const reentryEndMs = nowMs;
    const reentryStartIso = new Date(reentryStartMs).toISOString();
    const reentryEndIso = new Date(reentryEndMs).toISOString();

    const [scopeConvs, reentryPool] = await Promise.all([
      fetchConversationsInRange(range.fromIso, range.toIso),
      fetchConversationsInRange(reentryStartIso, reentryEndIso),
    ]);

    // 2. funnel + churn (메모리 계산)
    const { columns: funnelCols, meta } = buildFunnel(scopeConvs);
    const churn = computeChurn(
      scopeConvs,
      reentryPool,
      nowMs,
      settings.churn_window_hours,
      settings.reentry_window_days,
    );

    // 3. messages (담당 상담사 산출용)
    //    이탈 사유는 P2/P4/P5 한정 on-demand 분류 (churn-reasons API) — 여기서 미리 안 넣음.
    const sessionIds = scopeConvs.map((c) => c.session_id);
    const messages = await fetchMessagesForSessions(sessionIds, range.fromIso, range.toIso);
    const assigneeMap = computePhaseAssignees(scopeConvs, messages, nowMs);

    // 4. revenue + health + P7/P8 orders 카운트 동시 로드.
    //   P7 일정확정 = orders date in range 전체 (취소 포함 — 예약 발생 자체)
    //   P8 수거완료 = 수거가 끝난 건. 신규 정책(§6.1) 도입 후:
    //     - completed (수거+결제 모두 끝) — 항상 포함
    //     - prepaid (결제 끝, 수거 대기) — 수거 후 prepaid-complete cron 이 20시에 completed 로 전이.
    //       prepaid 자체는 "수거 안 끝남" 이므로 P8 에 포함 X.
    //     - 기존 흐름의 payment_requested (수거 끝, 결제 대기) 는 payment-sync 가 completed 로 전이하므로
    //       자연스럽게 completed 에 흡수됨. 신규 payment_requested 는 결제 대기/수거 전 이라 P8 제외.
    const [revenue, healthCards, p7CountFromOrders, p8CompletedCount, cancelledCount, confirmedCount, paymentRequestedCount, prepaidCount, dailyFunnel, unserviceableSet] = await Promise.all([
      getCompletedRevenue(range.fromIso, range.toIso),
      getHealthMetrics(range.fromIso, range.toIso, settings),
      countOrdersByDateRange(["confirmed", "payment_requested", "prepaid", "completed", "cancelled"], range.fromIso, range.toIso),
      countOrdersByDateRange(["completed"], range.fromIso, range.toIso),
      countOrdersByDateRange(["cancelled"], range.fromIso, range.toIso),
      countOrdersByDateRange(["confirmed"], range.fromIso, range.toIso),
      countOrdersByDateRange(["payment_requested"], range.fromIso, range.toIso),
      countOrdersByDateRange(["prepaid"], range.fromIso, range.toIso),
      getDailyFunnel(range.fromIso, range.toIso),
      fetchUnserviceableSessionIds(range.fromIso, range.toIso),
    ]);

    // 5. PhaseColumnData 조립
    //   - churnStatuses 는 phase 별로 5-1b/c 에서 strict 정의 (P2/P4) 또는 빈 배열
    //   - churnReasons 는 클라이언트가 P2/P4/P5 에 한해 churn-reasons API 결과로 override
    const columns: PhaseColumnData[] = funnelCols.map((c) => {
      const ch = churn.byPhase.get(c.phase);
      return {
        ...c,
        churnedCount: ch?.churnedCount ?? c.churnedCount,
        reentryRate: ch?.reentryRate ?? null,
        churnStatuses: [],   // 5-1b/c 에서 strict 한 phase 만 채움
        churnReasons: [],    // P2/P4/P5 만 클라이언트에서 신방식 결과로 채움
        assigneeRatio: assigneeMap.byPhase.get(c.phase) ?? null,
      };
    });

    // 5-1. 비즈니스 정의에 맞춰 reachedCount 보정
    //   - P2 정보수집 = collected_info.address 또는 items 1개+ (단순 phase_2 자동전이 제외)
    //   - P4 견적안내 = quote.sentAt 가 있거나 status 가 견적발송계열 (기존 /dashboard/monthly 와 동일)
    //   - P8 수거완료 = orders.status='completed' (예약관리 화면과 동일)
    const p2Count = scopeConvs.filter((c) => {
      const ci = c.collected_info;
      if (!ci) return false;
      if (typeof ci.address === "string" && ci.address.trim()) return true;
      if (Array.isArray(ci.items) && ci.items.length > 0) return true;
      return false;
    }).length;

    // 견적이 발송된 흔적이 있는 모든 status — 견적 발송 후 진행된 상태 (completed/payment_requested/payment_check) 포함
    const QUOTE_SENT_STATUSES = new Set([
      "quote_sent_nudge", "quote_sent_no_nudge", "nudge_sent", "booked",
      "payment_requested", "payment_check", "completed",
    ]);
    // P4 정의 = "P2 도달한 conversation 이 견적 발송 단계까지 진행한 것" — 정상 흐름 강제.
    //   (정보 없이 견적이 발송된 비정상 케이스는 funnel 흐름에서 제외해 셀 합계 정합성 보장)
    const p4Count = scopeConvs.filter((c) => {
      const ci = c.collected_info;
      const reachedP2 =
        (typeof ci?.address === "string" && !!ci.address.trim()) ||
        (Array.isArray(ci?.items) && ci.items.length > 0);
      if (!reachedP2) return false;
      if (c.quote?.sentAt != null) return true;
      return QUOTE_SENT_STATUSES.has(c.status);
    }).length;

    const p2Idx = columns.findIndex((col) => col.phase === Phase.PHASE_2_COLLECT);
    if (p2Idx >= 0) columns[p2Idx].reachedCount = p2Count;

    const p4Idx = columns.findIndex((col) => col.phase === Phase.PHASE_4_QUOTE);
    if (p4Idx >= 0) columns[p4Idx].reachedCount = p4Count;

    // P5 넛지 = 견적 발송 후 넛지 흔적 있는 status (quote_sent_nudge 예정 + nudge_sent 발송완료)
    //   기존 phase_history.to=phase_5 는 자동전이 안 되는 케이스가 많아 funnel 왜곡 → status 기반으로 변경
    const NUDGE_STATUSES = new Set(["quote_sent_nudge", "nudge_sent"]);
    const p5Count = scopeConvs.filter((c) => {
      const ci = c.collected_info;
      const reachedP2 =
        (typeof ci?.address === "string" && !!ci.address.trim()) ||
        (Array.isArray(ci?.items) && ci.items.length > 0);
      if (!reachedP2) return false;
      return NUDGE_STATUSES.has(c.status);
    }).length;
    const p5Idx = columns.findIndex((col) => col.phase === Phase.PHASE_5_NUDGE);
    if (p5Idx >= 0) columns[p5Idx].reachedCount = p5Count;

    // P7 일정확정 = orders 활성 3종 row 수 (예약관리 화면과 일치)
    const p7Idx = columns.findIndex((col) => col.phase === Phase.PHASE_7_CONFIRM);
    if (p7Idx >= 0) columns[p7Idx].reachedCount = p7CountFromOrders;

    const p8Idx = columns.findIndex((col) => col.phase === Phase.PHASE_8_POST);
    if (p8Idx >= 0) columns[p8Idx].reachedCount = p8CompletedCount;

    // 5-1b. P2 정보수집 셀의 이탈 키워드 = [오인입, 야간수거, 무응답]
    //       "첫인사 → 정보수집 못 간" 케이스 (P1 도달 - P2 도달).
    //       합계 = (totalStarted - p2Count) 와 정확히 일치.
    const p2DroppedConvs = scopeConvs.filter((c) => {
      const ci = c.collected_info;
      const reachedP2 =
        (typeof ci?.address === "string" && !!ci.address.trim()) ||
        (Array.isArray(ci?.items) && ci.items.length > 0);
      return !reachedP2;
    });
    const wrongInboundCount = p2DroppedConvs.filter((c) => c.status === "wrong_inbound").length;
    const nightPickupCount = p2DroppedConvs.filter((c) => c.status === "night_pickup").length;
    // 수거불가(지역) — messages 패턴 매칭으로 식별. 상담완료 이중 카운트 방지를 위해 별도 추적.
    const p2Unserviceable = p2DroppedConvs.filter((c) => unserviceableSet.has(c.session_id));
    const p2UnserviceableCount = p2Unserviceable.length;
    // 상담완료에서 수거불가 케이스를 제외한 순수 정상 종료
    const p2CompletedCount = p2DroppedConvs.filter(
      (c) => c.status === "completed" && !unserviceableSet.has(c.session_id),
    ).length;
    const p2OtherCount = Math.max(
      0,
      p2DroppedConvs.length - wrongInboundCount - nightPickupCount - p2UnserviceableCount - p2CompletedCount,
    );

    if (p2Idx >= 0) {
      const p2Statuses: { keyword: string; count: number }[] = [];
      if (wrongInboundCount > 0) p2Statuses.push({ keyword: "오인입", count: wrongInboundCount });
      if (nightPickupCount > 0) p2Statuses.push({ keyword: "야간수거", count: nightPickupCount });
      if (p2UnserviceableCount > 0) p2Statuses.push({ keyword: "수거불가(지역)", count: p2UnserviceableCount });
      if (p2CompletedCount > 0) p2Statuses.push({ keyword: "상담완료", count: p2CompletedCount });
      if (p2OtherCount > 0) p2Statuses.push({ keyword: "기타", count: p2OtherCount });
      if (p2Statuses.length > 0) columns[p2Idx].churnStatuses = p2Statuses;
    }

    // 5-1c. P4 견적안내 셀의 이탈 키워드 = [오인입, 야간수거]
    //       P2 와 같은 맥락 — "이 단계 도달 못 한 사람들의 분류":
    //       모집단 = P2 도달 했지만 P4 미도달 (= p2Count - p4Count). 합계 ≈ p2Count - p4Count.
    const p4DroppedConvs = scopeConvs.filter((c) => {
      const ci = c.collected_info;
      const reachedP2 =
        (typeof ci?.address === "string" && !!ci.address.trim()) ||
        (Array.isArray(ci?.items) && ci.items.length > 0);
      if (!reachedP2) return false;
      const reachedP4 = c.quote?.sentAt != null || QUOTE_SENT_STATUSES.has(c.status);
      return !reachedP4;
    });
    const p4WrongInbound = p4DroppedConvs.filter((c) => c.status === "wrong_inbound").length;
    const p4NightPickup = p4DroppedConvs.filter((c) => c.status === "night_pickup").length;
    // 수거불가(지역) — P2 와 같은 패턴. 상담완료 이중 카운트 방지.
    const p4UnserviceableCount = p4DroppedConvs.filter((c) => unserviceableSet.has(c.session_id)).length;
    const p4CompletedClosed = p4DroppedConvs.filter(
      (c) => c.status === "completed" && !unserviceableSet.has(c.session_id),
    ).length;
    const p4Other = Math.max(
      0,
      p4DroppedConvs.length - p4WrongInbound - p4NightPickup - p4UnserviceableCount - p4CompletedClosed,
    );

    // P4 이탈 상태 = 오인입 + 야간수거 + 수거불가(지역) + 상담완료 + 기타 (모집단 합과 정확히 일치)
    // 이탈 사유 (Haiku) 는 별도 행 (churnReasons)
    if (p4Idx >= 0) {
      const p4Statuses: { keyword: string; count: number }[] = [];
      if (p4WrongInbound > 0) p4Statuses.push({ keyword: "오인입", count: p4WrongInbound });
      if (p4NightPickup > 0) p4Statuses.push({ keyword: "야간수거", count: p4NightPickup });
      if (p4UnserviceableCount > 0) p4Statuses.push({ keyword: "수거불가(지역)", count: p4UnserviceableCount });
      if (p4CompletedClosed > 0) p4Statuses.push({ keyword: "상담완료", count: p4CompletedClosed });
      if (p4Other > 0) p4Statuses.push({ keyword: "기타", count: p4Other });
      if (p4Statuses.length > 0) columns[p4Idx].churnStatuses = p4Statuses;
    }

    // 5-1d. P5 넛지 셀의 이탈 상태 = [넛지불가, 상담완료, 기타]
    //       P4 도달 → P5 미도달 케이스의 status 분류. 합계 = P4 - P5.
    const p5DroppedConvs = scopeConvs.filter((c) => {
      const ci = c.collected_info;
      const reachedP2 =
        (typeof ci?.address === "string" && !!ci.address.trim()) ||
        (Array.isArray(ci?.items) && ci.items.length > 0);
      if (!reachedP2) return false;
      const reachedP4 = c.quote?.sentAt != null || QUOTE_SENT_STATUSES.has(c.status);
      if (!reachedP4) return false;
      const reachedP5 = NUDGE_STATUSES.has(c.status);
      return !reachedP5;
    });
    const p5NoNudge = p5DroppedConvs.filter((c) => c.status === "quote_sent_no_nudge").length;
    const p5Completed = p5DroppedConvs.filter((c) => c.status === "completed").length;
    const p5OtherCount = Math.max(0, p5DroppedConvs.length - p5NoNudge - p5Completed);
    if (p5Idx >= 0) {
      const p5Statuses: { keyword: string; count: number }[] = [];
      if (p5NoNudge > 0) p5Statuses.push({ keyword: "넛지불가", count: p5NoNudge });
      if (p5Completed > 0) p5Statuses.push({ keyword: "상담완료", count: p5Completed });
      if (p5OtherCount > 0) p5Statuses.push({ keyword: "기타", count: p5OtherCount });
      if (p5Statuses.length > 0) columns[p5Idx].churnStatuses = p5Statuses;
    }

    // 5-1e. P8 수거완료 셀의 이탈 상태 = [일정확정/결제대기/선결제완료/예약취소]
    //       합계 = P7 - P8 = 예약 잡혔으나 아직 수거 안 된 + 취소된 케이스.
    //       신규 정책(§6.1): prepaid 도 수거 대기 상태로 별도 분류.
    if (p8Idx >= 0) {
      const p8Statuses: { keyword: string; count: number }[] = [];
      if (cancelledCount > 0) p8Statuses.push({ keyword: "예약취소", count: cancelledCount });
      if (confirmedCount > 0) p8Statuses.push({ keyword: "일정확정", count: confirmedCount });
      if (paymentRequestedCount > 0) p8Statuses.push({ keyword: "결제대기", count: paymentRequestedCount });
      if (prepaidCount > 0) p8Statuses.push({ keyword: "선결제완료", count: prepaidCount });
      if (p8Statuses.length > 0) columns[p8Idx].churnStatuses = p8Statuses;
    }

    // 5-2. 모든 phase 의 conversionRate / conversionDelta / reachedDelta 재계산
    //      reachedCount 변경 후 일관된 funnel 비율 + 절대 증감 보장
    const totalStarted = meta.totalStarted;
    let prevMainRate: number | null = null;
    let prevMainReached: number | null = null;
    for (const col of columns) {
      const newRate = totalStarted > 0
        ? Math.round((col.reachedCount / totalStarted) * 1000) / 10
        : 0;
      col.conversionRate = newRate;
      const isMainFlow = col.phase !== Phase.PHASE_3_1_MODIFY;
      col.conversionDelta = isMainFlow && prevMainRate !== null
        ? Math.round((newRate - prevMainRate) * 10) / 10
        : null;
      col.reachedDelta = isMainFlow && prevMainReached !== null
        ? col.reachedCount - prevMainReached
        : null;
      if (isMainFlow) {
        prevMainRate = newRate;
        prevMainReached = col.reachedCount;
      }
    }

    // 6. KR 카드 빌드
    const krCards: KrCardData[] = [
      buildKr1Card(revenue.totalAmount, settings.kr1_target),
      buildKrHardcodedCard("kr2", "월 5억 원 이상 운영 구조", settings.kr2_use_hardcoded, settings.kr2_current_hardcoded, settings.kr2_target, "percent"),
      buildKrHardcodedCard("kr3", "커버링앱 외 트래픽 매출 비중", settings.kr3_use_hardcoded, settings.kr3_current_hardcoded, settings.kr3_target, "percent"),
    ];

    // 7. Journey Map data
    const journeyMap: JourneyMapData = {
      totalStarted: meta.totalStarted,
      totalCompleted: meta.totalCompleted,
      columns,
      reentryByPhase: JOURNEY_PHASES.map((p) => {
        const ch = churn.byPhase.get(p);
        return { phase: p, rate: ch?.reentryRate ?? null, sample: ch?.sampleSize ?? 0 };
      }),
      dailyFunnel,
      skipTransitions: meta.skipTransitions,
      modificationCount: meta.modificationCount,
      insight: buildInsight(columns), // 룰 기반 폴백 — AI 실패 시 사용
    };

    // 7-1. AI 인사이트는 별도 endpoint(/api/new_dashboard/insight)에서 비동기 호출.
    //      여기선 룰 기반 폴백만 두고 빠르게 응답 반환 — 클라이언트가 별도로 fetch 해서 덮어씀.

    // 8. Traffic — conversations.referrer 카운트
    // 인입(전체) + 전환(active orders 매칭) 두 축. 동적 코드 desc 정렬 + 색상 자동 배정.
    const referrerRows = await paginate<{ session_id: string; referrer: string }>(() =>
      supabase
        .from("conversations")
        .select("session_id, referrer")
        .gte("created_at", range.fromIso)
        .lte("created_at", range.toIso)
        .not("referrer", "is", null),
    );

    // 전환 = 해당 conversation 의 session_id 가 active 3 orders 가 있는 케이스
    const conversionSessionIds = new Set<string>();
    if (referrerRows.length > 0) {
      const sessionIds = referrerRows.map((r) => r.session_id);
      const CHUNK = 500;
      for (let i = 0; i < sessionIds.length; i += CHUNK) {
        const chunk = sessionIds.slice(i, i + CHUNK);
        const { data: orders } = await supabase
          .from("orders")
          .select("session_id")
          .in("session_id", chunk)
          .in("status", ["confirmed", "payment_requested", "prepaid", "completed"]);
        for (const o of orders ?? []) if (o.session_id) conversionSessionIds.add(o.session_id);
      }
    }

    const inflowCounts = new Map<string, number>();
    const convCounts = new Map<string, number>();
    for (const r of referrerRows) {
      const k = (r.referrer ?? "").trim();
      if (!k) continue;
      inflowCounts.set(k, (inflowCounts.get(k) ?? 0) + 1);
      if (conversionSessionIds.has(r.session_id)) {
        convCounts.set(k, (convCounts.get(k) ?? 0) + 1);
      }
    }

    const REFERRER_PALETTE = ["#3B82F6", "#10B981", "#F59E0B", "#A855F7", "#EF4444", "#06B6D4", "#EC4899", "#84CC16", "#F97316", "#94A3B8"];
    const colorByName = new Map<string, string>();
    [...inflowCounts.entries()].sort(([, a], [, b]) => b - a).forEach(([name], idx) => {
      colorByName.set(name, REFERRER_PALETTE[idx % REFERRER_PALETTE.length]);
    });

    const totalInflow = [...inflowCounts.values()].reduce((a, b) => a + b, 0);
    const traffic: TrafficChannel[] = [...inflowCounts.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => ({
        name,
        color: colorByName.get(name) ?? "#94A3B8",
        count,
        pct: totalInflow > 0 ? Math.round((count / totalInflow) * 1000) / 10 : 0,
      }));

    const totalConverted = [...convCounts.values()].reduce((a, b) => a + b, 0);
    const trafficConverted: TrafficChannel[] = [...convCounts.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => ({
        name,
        color: colorByName.get(name) ?? "#94A3B8",
        count,
        pct: totalConverted > 0 ? Math.round((count / totalConverted) * 1000) / 10 : 0,
      }));

    return NextResponse.json({
      period: {
        preset: range.preset,
        from: range.fromIso,
        to: range.toIso,
        fromDateKst: range.fromDateKst,
        toDateKst: range.toDateKst,
        label: range.label,
      },
      generatedAt: new Date(nowMs).toISOString(),
      krCards,
      journeyMap,
      healthCards,
      traffic,
      trafficConverted,
    });
  } catch (err) {
    console.error("[new_dashboard/analytics] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

function buildKr1Card(currentAmount: number, target: number): KrCardData {
  const achievement = target > 0 ? Math.round((currentAmount / target) * 1000) / 10 : null;
  return {
    id: "kr1",
    label: "월 매출 3억 원",
    current: currentAmount,
    currentDisplay: formatCurrency(currentAmount),
    target,
    targetDisplay: formatCurrency(target),
    achievementPct: achievement,
    isHardcoded: false,
    unit: "currency",
  };
}

function buildKrHardcodedCard(
  id: "kr2" | "kr3",
  label: string,
  useHardcoded: boolean,
  hardcodedValue: number,
  target: number,
  unit: "currency" | "percent",
): KrCardData {
  if (!useHardcoded) {
    // hardcoded 해제됐지만 산출 로직이 아직 없을 때 — TBD 카드
    return {
      id,
      label,
      current: null,
      currentDisplay: "—",
      target,
      targetDisplay: unit === "currency" ? formatCurrency(target) : `${target}%`,
      achievementPct: null,
      isHardcoded: false,
      unit,
    };
  }
  // hardcoded 사용 중 — 0이라도 명시 표시 (KR3 0% 같이 의도적 0값 노출).
  return {
    id,
    label,
    current: hardcodedValue,
    currentDisplay: unit === "currency" ? formatCurrency(hardcodedValue) : `${hardcodedValue}%`,
    target,
    targetDisplay: unit === "currency" ? formatCurrency(target) : `${target}%`,
    achievementPct: target === 0 ? null : Math.round((hardcodedValue / target) * 1000) / 10,
    isHardcoded: true,
    unit,
  };
}

function formatCurrency(amount: number): string {
  if (amount === 0) return "0원";
  if (amount >= 100_000_000) {
    const eok = amount / 100_000_000;
    return eok % 1 === 0 ? `${eok.toFixed(0)}억 원` : `${eok.toFixed(1)}억 원`;
  }
  if (amount >= 10_000) {
    const man = Math.round(amount / 10_000);
    return `${man.toLocaleString("ko-KR")}만 원`;
  }
  return `${amount.toLocaleString("ko-KR")}원`;
}
