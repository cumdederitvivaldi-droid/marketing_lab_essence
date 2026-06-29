/**
 * Customer Journey Map — Phase 전이/전환율/스킵 전이 집계
 *
 * 입력: 기간 내 생성된 conversations (phase_history 포함)
 * 출력: PhaseColumnData[] + 부가 메타 (스킵 전이, P3.1 발생수, 시작/완료 카운트)
 *
 * 이탈 판정은 churn.ts 가 별도로 수행하며, 본 모듈은 "도달/전이 카운트"와
 * "전이된 세션의 평균 소요시간" 만 책임진다.
 */

import { Phase } from "@/lib/ai/phases";
import {
  JOURNEY_PHASES,
  PHASE_SHORT_NAMES,
  PHASE_CHANNELS,
  PhaseColumnData,
} from "./types";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "./_paginate";

export interface DbPhaseTransition {
  from: Phase;
  to: Phase;
  reason: string;
  triggered_by: "auto" | "agent";
  timestamp: string;
}

export interface ConversationRow {
  session_id: string;
  user_key: string;
  phone: string | null;
  current_phase: string | null;
  phase_history: DbPhaseTransition[] | null;
  created_at: string;
  status: string;
  /** P4 견적 발송 판정용 — quote.sentAt 가 있으면 실제 발송 완료 (sentAt 도입 전엔 null) */
  quote: { sentAt?: number | null } | null;
  /** P2 정보 수집 판정용 — address 또는 items 1개 이상이면 의미있는 정보 수집 진행 */
  collected_info: { address?: string | null; items?: unknown[] } | null;
}

export async function fetchConversationsInRange(fromIso: string, toIso: string): Promise<ConversationRow[]> {
  const rows = await paginate<ConversationRow>(() =>
    supabase
      .from("conversations")
      .select("session_id, user_key, phone, current_phase, phase_history, created_at, status, quote, collected_info")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: true }),
  );
  return rows.map((c) => ({ ...c, phase_history: c.phase_history ?? [] }));
}

const PHASE_ORDER: Phase[] = [
  Phase.PHASE_1_INITIAL,
  Phase.PHASE_2_COLLECT,
  Phase.PHASE_3_SPEC,
  Phase.PHASE_4_QUOTE,
  Phase.PHASE_5_NUDGE,
  Phase.PHASE_6_BOOKING,
  Phase.PHASE_7_CONFIRM,
  Phase.PHASE_8_POST,
];

const PHASE_INDEX = new Map<string, number>(PHASE_ORDER.map((p, i) => [p, i]));

/** Phase 진입 시각 (ms). Phase 1 은 conversation.created_at, 그 외는 phase_history 의 to=phase 첫 entry */
function entryMsOf(conv: ConversationRow, phase: Phase): number | null {
  if (phase === Phase.PHASE_1_INITIAL) return new Date(conv.created_at).getTime();
  const t = (conv.phase_history ?? []).find((h) => h.to === phase);
  return t ? new Date(t.timestamp).getTime() : null;
}

/** Phase 탈출 시각 (ms) — from=phase 첫 entry */
function exitMsOf(conv: ConversationRow, phase: Phase): { ms: number; toPhase: Phase } | null {
  const t = (conv.phase_history ?? []).find((h) => h.from === phase);
  return t ? { ms: new Date(t.timestamp).getTime(), toPhase: t.to } : null;
}

function fmtDuration(ms: number): { label: string; isAlert: boolean } {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return { label: "즉시", isAlert: false };
  const min = Math.round(sec / 60);
  if (min < 60) return { label: `${min}분`, isAlert: min > 30 };
  const hour = Math.round(min / 60);
  if (hour < 24) return { label: `${hour}시간`, isAlert: hour > 3 };
  const day = Math.round(hour / 24);
  return { label: day === 1 ? "당일" : `${day}일`, isAlert: true };
}

export interface FunnelMeta {
  totalStarted: number;
  totalCompleted: number;
  skipTransitions: Array<{ from: Phase; to: Phase; count: number }>;
  modificationCount: number;
  /** 각 Phase 도달 conversation 목록 — churn.ts 가 재사용 */
  reachedByPhase: Map<Phase, ConversationRow[]>;
}

export function buildFunnel(conversations: ConversationRow[]): {
  columns: Omit<PhaseColumnData, "churnStatuses" | "churnReasons" | "assigneeRatio" | "reentryRate">[];
  meta: FunnelMeta;
} {
  // 1. Phase별 도달/전이/스킵/소요시간 누적
  const reached = new Map<Phase, ConversationRow[]>();
  const transitioned = new Map<Phase, number>();
  const durations = new Map<Phase, number[]>(); // 다음 Phase 전이까지 ms (전이된 세션만)
  const skipMap = new Map<string, number>();    // "from→to" → count
  let modificationCount = 0;

  for (const p of JOURNEY_PHASES) {
    reached.set(p, []);
    transitioned.set(p, 0);
    durations.set(p, []);
  }

  for (const conv of conversations) {
    // P3.1 발생 카운트
    if ((conv.phase_history ?? []).some((h) => h.to === Phase.PHASE_3_1_MODIFY || h.from === Phase.PHASE_3_1_MODIFY)) {
      modificationCount++;
    }

    for (const phase of JOURNEY_PHASES) {
      const enteredMs = entryMsOf(conv, phase);
      if (enteredMs == null) continue;
      reached.get(phase)!.push(conv);

      const exit = exitMsOf(conv, phase);
      if (exit) {
        transitioned.set(phase, transitioned.get(phase)! + 1);
        durations.get(phase)!.push(exit.ms - enteredMs);

        // 스킵 전이: 다음 단계가 phase+1 이 아닌 경우 (P3.1 으로의 분기는 제외)
        const fromIdx = PHASE_INDEX.get(phase);
        const toIdx = PHASE_INDEX.get(exit.toPhase);
        if (fromIdx != null && toIdx != null && toIdx > fromIdx + 1) {
          const key = `${phase}→${exit.toPhase}`;
          skipMap.set(key, (skipMap.get(key) ?? 0) + 1);
        }
      }
    }
  }

  // 2. 전환율(funnel) + 평균 소요시간 + 전 Phase 대비 증감
  //    전환율 정의: 전체 P1 시작자 대비 해당 Phase 도달률 (reachedCount / totalStarted × 100)
  //    → 진짜 funnel — 후반으로 갈수록 단조 감소가 정상
  const totalStartedForRate = reached.get(Phase.PHASE_1_INITIAL)!.length;
  const conversionRates: number[] = [];
  const columns = JOURNEY_PHASES.map((phase, idx) => {
    const reachedCount = reached.get(phase)!.length;
    const transitionedCount = transitioned.get(phase)!;
    const conversionRate = totalStartedForRate > 0
      ? Math.round((reachedCount / totalStartedForRate) * 1000) / 10
      : 0;
    conversionRates.push(conversionRate);
    // P3.1 은 분기 phase 라 직전 phase 와 비교 의미 없음 → delta 없음
    // P8 의 전 단계는 (순서상 P3.1 이지만) 메인 흐름인 P7 과 비교해야 함
    const isMainFlow = phase !== Phase.PHASE_3_1_MODIFY;
    let prevMainIdx = -1;
    for (let i = idx - 1; i >= 0; i--) {
      if (JOURNEY_PHASES[i] !== Phase.PHASE_3_1_MODIFY) { prevMainIdx = i; break; }
    }
    const conversionDelta = isMainFlow && prevMainIdx >= 0
      ? Math.round((conversionRate - conversionRates[prevMainIdx]) * 10) / 10
      : null;

    const ds = durations.get(phase)!;
    const avgMs = ds.length > 0 ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : null;
    const fmt = avgMs == null ? { label: "—", isAlert: false } : fmtDuration(avgMs);

    return {
      phase,
      shortName: PHASE_SHORT_NAMES[phase] ?? String(phase),
      channel: PHASE_CHANNELS[phase] ?? "—",
      reachedCount,
      transitionedCount,
      churnedCount: reachedCount - transitionedCount, // 임시 — churn.ts 가 재계산
      conversionRate,
      conversionDelta,
      reachedDelta: null, // analytics route 의 재계산 블록에서 채움
      avgDurationMs: avgMs,
      durationLabel: fmt.label,
      durationIsAlert: fmt.isAlert,
    };
  });

  // 3. 시작/완료 카운트
  const totalStarted = reached.get(Phase.PHASE_1_INITIAL)!.length;
  const totalCompleted = conversations.filter(
    (c) => c.current_phase === Phase.PHASE_8_POST || c.current_phase === Phase.CLOSED,
  ).length;

  const skipTransitions = [...skipMap.entries()]
    .map(([key, count]) => {
      const [from, to] = key.split("→") as [Phase, Phase];
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count);

  return {
    columns,
    meta: {
      totalStarted,
      totalCompleted,
      skipTransitions,
      modificationCount,
      reachedByPhase: reached,
    },
  };
}
