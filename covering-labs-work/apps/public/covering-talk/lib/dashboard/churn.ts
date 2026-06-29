/**
 * 이탈 판정 + 14일 재진입률
 *
 * 이탈 정의: Phase 진입 후 N시간(기본 24h) 다음 Phase 전이 없음.
 *   - "현재 시각 기준" 으로 N시간 경과한 세션만 이탈로 카운트 (그 이전엔 진행 중일 수 있음)
 *
 * 재진입 정의: 이탈 발생 시각 ~ +N일(기본 14d) 사이에 동일 user_key 또는 phone 으로
 *   신규 conversation 이 생성됨.
 *   - user_key 우선, 없으면 phone 매칭 (전화번호는 정규화: 숫자만)
 *
 * 이탈 사유는 별도 흐름: app/api/new_dashboard/churn-reasons (P2/P4/P5 on-demand Haiku 분류).
 */

import { Phase } from "@/lib/ai/phases";
import { JOURNEY_PHASES } from "./types";
import { ConversationRow } from "./funnel";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface ChurnPhaseStat {
  churnedCount: number;
  reentryRate: number | null;   // % — null = 샘플 부족 또는 0
  sampleSize: number;           // 재진입 분모 (이탈 후 충분한 시간 경과한 케이스)
}

export interface ChurnResult {
  byPhase: Map<Phase, ChurnPhaseStat>;
}

/** Phase 진입 시각 (ms). Phase 1 은 created_at, 그 외는 phase_history.to=phase 첫 entry */
function entryMsOf(conv: ConversationRow, phase: Phase): number | null {
  if (phase === Phase.PHASE_1_INITIAL) return new Date(conv.created_at).getTime();
  const t = (conv.phase_history ?? []).find((h) => h.to === phase);
  return t ? new Date(t.timestamp).getTime() : null;
}

/** Phase 탈출 시각 (ms) */
function exitMsOf(conv: ConversationRow, phase: Phase): number | null {
  const t = (conv.phase_history ?? []).find((h) => h.from === phase);
  return t ? new Date(t.timestamp).getTime() : null;
}

function normPhone(p: string | null): string | null {
  if (!p) return null;
  const digits = p.replace(/[^0-9]/g, "");
  return digits.length >= 10 ? digits : null;
}

/**
 * 이탈/재진입 산출
 *
 * @param scopeConversations  기간 필터 내 conversations (이탈 후보 모집단)
 * @param reentryPool         재진입 검사용 — 가장 최근 까지의 conversations 전체 (Phase 진입과 무관하게 신규 생성만 보면 됨)
 * @param nowMs               기준 시각
 * @param churnWindowHours    이탈 판정 시간
 * @param reentryWindowDays   재진입 윈도우
 */
export function computeChurn(
  scopeConversations: ConversationRow[],
  reentryPool: ConversationRow[],
  nowMs: number,
  churnWindowHours: number,
  reentryWindowDays: number,
): ChurnResult {
  const churnWindowMs = churnWindowHours * HOUR_MS;
  const reentryWindowMs = reentryWindowDays * DAY_MS;

  // 재진입 매칭용 인덱스: user_key → 정렬된 created_at[] / phone → ditto
  const byUserKey = new Map<string, number[]>();
  const byPhone = new Map<string, number[]>();
  for (const c of reentryPool) {
    const created = new Date(c.created_at).getTime();
    if (c.user_key) {
      const arr = byUserKey.get(c.user_key) ?? [];
      arr.push(created);
      byUserKey.set(c.user_key, arr);
    }
    const ph = normPhone(c.phone);
    if (ph) {
      const arr = byPhone.get(ph) ?? [];
      arr.push(created);
      byPhone.set(ph, arr);
    }
  }
  // 정렬 (선형 스캔으로 충분)
  for (const arr of byUserKey.values()) arr.sort((a, b) => a - b);
  for (const arr of byPhone.values()) arr.sort((a, b) => a - b);

  function hasReentry(conv: ConversationRow, churnedAtMs: number): boolean {
    const fromMs = churnedAtMs + 1; // 같은 conversation 자체는 제외
    const toMs = churnedAtMs + reentryWindowMs;
    const checkArr = (arr: number[] | undefined) => {
      if (!arr) return false;
      // 선형 스캔 — 데이터량 작음
      return arr.some((ts) => ts > fromMs && ts <= toMs);
    };
    if (conv.user_key && checkArr(byUserKey.get(conv.user_key))) return true;
    const ph = normPhone(conv.phone);
    if (ph && checkArr(byPhone.get(ph))) return true;
    return false;
  }

  const byPhase = new Map<Phase, ChurnPhaseStat>();

  for (const phase of JOURNEY_PHASES) {
    let churned = 0;
    let reentered = 0;
    let sampleSize = 0;

    for (const conv of scopeConversations) {
      const enteredMs = entryMsOf(conv, phase);
      if (enteredMs == null) continue;
      const exitMs = exitMsOf(conv, phase);
      if (exitMs != null) continue; // 전이됨 — 이탈 아님

      const churnedAtMs = enteredMs + churnWindowMs;
      if (churnedAtMs > nowMs) continue; // 아직 이탈 판정 시점이 안 됨 (진행 중일 수 있음)

      churned++;

      // 재진입 분모: 이탈 후 reentryWindow 가 지났거나, 지나지 않았어도 그 안에 재발화가 이미 발생한 경우 카운트
      const reentryDeadline = churnedAtMs + reentryWindowMs;
      const windowComplete = nowMs >= reentryDeadline;
      const reentered1 = hasReentry(conv, churnedAtMs);
      if (windowComplete || reentered1) {
        sampleSize++;
        if (reentered1) reentered++;
      }
    }

    const reentryRate = sampleSize > 0 ? Math.round((reentered / sampleSize) * 1000) / 10 : null;
    byPhase.set(phase, { churnedCount: churned, reentryRate, sampleSize });
  }

  return { byPhase };
}

