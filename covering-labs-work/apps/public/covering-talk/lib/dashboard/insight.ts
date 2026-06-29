/**
 * Customer Journey Map 자동 인사이트 문구 생성
 *
 * 룰 기반 — 이탈율 최고 Phase + 재진입률 + 평균 소요시간 + 액션 제안.
 * Haiku 호출 없이 즉시 산출 (페이지 로드 비용 0).
 */

import { Phase } from "@/lib/ai/phases";
import { PHASE_SHORT_NAMES, PhaseColumnData } from "./types";

// 메인 흐름 (P1~P8 원본 순서)을 기준으로 인덱스 매기기.
// JOURNEY_PHASES 는 화면 표시 순서(P3 제외, P3.1 끝)이라 phase 번호 표시용으로 부적합.
const MAIN_FLOW_ORDER: Phase[] = [
  Phase.PHASE_1_INITIAL, Phase.PHASE_2_COLLECT, Phase.PHASE_3_SPEC, Phase.PHASE_4_QUOTE,
  Phase.PHASE_5_NUDGE, Phase.PHASE_6_BOOKING, Phase.PHASE_7_CONFIRM, Phase.PHASE_8_POST,
];

function phaseDisplayLabel(p: Phase): string {
  const idx = MAIN_FLOW_ORDER.indexOf(p);
  if (idx >= 0) return String(idx + 1).padStart(2, "0");
  if (p === Phase.PHASE_3_1_MODIFY) return "3.1";
  return p;
}

const PHASE_ACTION_HINT: Record<Phase, string> = {
  [Phase.PHASE_1_INITIAL]: "첫 응답 자동화 강화",
  [Phase.PHASE_2_COLLECT]: "정보 수집 단계 단순화",
  [Phase.PHASE_3_SPEC]: "사양 확인 흐름 자동화",
  [Phase.PHASE_3_1_MODIFY]: "품목 변경 흐름 점검",
  [Phase.PHASE_4_QUOTE]: "견적 자동화로 회복",
  [Phase.PHASE_5_NUDGE]: "넛지 메시지 강화",
  [Phase.PHASE_6_BOOKING]: "예약 접수 단순화",
  [Phase.PHASE_7_CONFIRM]: "확정 알림 강화",
  [Phase.PHASE_8_POST]: "사후 만족도 점검",
  [Phase.CLOSED]: "—",
};

function riskLabel(reentryRate: number | null): string {
  if (reentryRate == null) return "데이터 부족";
  if (reentryRate < 20) return "영구 이탈 위험";
  if (reentryRate < 50) return "회복 일부 가능";
  return "넛지 회복 가능";
}

export function buildInsight(columns: PhaseColumnData[]): string | null {
  // 도달자가 적은 Phase는 노이즈 — 최소 5건 이상만 후보로
  const candidates = columns.filter((c) => c.reachedCount >= 5 && c.churnedCount > 0);
  if (candidates.length === 0) return null;

  // 이탈율 = churned / reached. 동률이면 reached 큰 쪽 우선
  const top = candidates
    .map((c) => ({ ...c, churnRate: (c.churnedCount / c.reachedCount) * 100 }))
    .sort((a, b) => b.churnRate - a.churnRate || b.reachedCount - a.reachedCount)[0];

  const phaseLabel = `${phaseDisplayLabel(top.phase)} ${PHASE_SHORT_NAMES[top.phase] ?? ""}`;
  const reentryStr = top.reentryRate == null ? "—" : `${top.reentryRate.toFixed(1)}%`;
  const action = PHASE_ACTION_HINT[top.phase];

  return `가장 큰 이탈 · ${phaseLabel} ${top.churnRate.toFixed(1)}% · 재진입률 ${reentryStr}. 대기 시간 ${top.durationLabel}. ${riskLabel(top.reentryRate)}, ${action}.`;
}
