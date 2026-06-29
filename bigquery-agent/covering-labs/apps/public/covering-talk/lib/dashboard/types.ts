/**
 * 관리자 대시보드 — 공유 타입
 */

import { Phase } from "@/lib/ai/phases";

/** Customer Journey Map 표에 표시할 Phase 컬럼.
 *  P3 사양확인은 실 운영에서 거의 사용되지 않아 화면에서 제외.
 *  P3.1 품목 변경은 분기 phase 이지만 별도 컬럼으로 표시 (수거·사후 그룹). */
export const JOURNEY_PHASES: Phase[] = [
  Phase.PHASE_1_INITIAL,
  Phase.PHASE_2_COLLECT,
  Phase.PHASE_4_QUOTE,
  Phase.PHASE_5_NUDGE,
  Phase.PHASE_7_CONFIRM,
  Phase.PHASE_8_POST,
  Phase.PHASE_3_1_MODIFY,
];

/** Phase 그룹 헤더 */
export interface PhaseGroup {
  label: string;
  phases: Phase[];
  /** 그룹별 색상 (배경/텍스트/테두리) */
  bg: string;
  fg: string;
  border: string;
}

export const PHASE_GROUPS: PhaseGroup[] = [
  {
    label: "유입 · 상담",
    phases: [Phase.PHASE_1_INITIAL, Phase.PHASE_2_COLLECT],
    bg: "rgba(59,130,246,0.12)", fg: "#1E40AF", border: "rgba(59,130,246,0.22)",
  },
  {
    label: "예약 · 확정",
    phases: [Phase.PHASE_4_QUOTE, Phase.PHASE_5_NUDGE, Phase.PHASE_7_CONFIRM],
    bg: "rgba(245,158,11,0.12)", fg: "#92400E", border: "rgba(245,158,11,0.25)",
  },
  {
    label: "수거 · 사후",
    phases: [Phase.PHASE_8_POST, Phase.PHASE_3_1_MODIFY],
    bg: "rgba(16,185,129,0.12)", fg: "#065F46", border: "rgba(16,185,129,0.25)",
  },
];

/** Phase별 짧은 표시명 (대시보드 표 컬럼 헤더용) */
export const PHASE_SHORT_NAMES: Partial<Record<Phase, string>> = {
  [Phase.PHASE_1_INITIAL]: "첫 인사",
  [Phase.PHASE_2_COLLECT]: "정보 수집",
  [Phase.PHASE_3_SPEC]: "사양 확인",
  [Phase.PHASE_3_1_MODIFY]: "품목 변경",
  [Phase.PHASE_4_QUOTE]: "견적 안내",
  [Phase.PHASE_5_NUDGE]: "넛지",
  [Phase.PHASE_6_BOOKING]: "예약 접수",
  [Phase.PHASE_7_CONFIRM]: "일정 확정",
  [Phase.PHASE_8_POST]: "수거 완료",
};

/** Phase별 진행 채널 (카카오톡 / 기사 현장 등) */
export const PHASE_CHANNELS: Partial<Record<Phase, string>> = {
  [Phase.PHASE_1_INITIAL]: "카카오톡",
  [Phase.PHASE_2_COLLECT]: "카카오톡",
  [Phase.PHASE_3_SPEC]: "카카오톡",
  [Phase.PHASE_3_1_MODIFY]: "카카오톡",
  [Phase.PHASE_4_QUOTE]: "카카오톡",
  [Phase.PHASE_5_NUDGE]: "카카오톡",
  [Phase.PHASE_6_BOOKING]: "카카오톡",
  [Phase.PHASE_7_CONFIRM]: "카카오톡",
  [Phase.PHASE_8_POST]: "기사 현장",
};

/** Phase 컬럼 1개 분량의 모든 지표 */
export interface PhaseColumnData {
  phase: Phase;
  shortName: string;
  channel: string;
  reachedCount: number;          // 해당 Phase 도달 unique 세션 수
  transitionedCount: number;     // 다음 Phase로 전이된 세션 수
  churnedCount: number;          // 이탈된 세션 수 (24h 무전이)
  conversionRate: number;        // % (전체 P1 시작자 대비 도달률)
  conversionDelta: number | null;// 전 Phase 전환율 대비 증감 (% point)
  reachedDelta: number | null;   // 전 Phase 도달 건수 대비 절대 증감 (예: -200)
  avgDurationMs: number | null;  // 다음 Phase 전이까지 평균 ms (전이된 세션만)
  durationLabel: string;         // "즉시" / "2분" / "1시간" / "당일" 등
  durationIsAlert: boolean;      // 비정상적으로 긴 값
  churnStatuses: KeywordCount[];   // 이탈 상태 — status 분류 (오인입/야간수거/상담완료/무응답/기타)
  churnReasons: KeywordCount[];    // 이탈 사유 — Haiku 추출 키워드 (실제 고객 발화 분석)
  assigneeRatio: AssigneeRatio | null;  // 이 Phase 동안 AI vs 사람 응답 비율
  reentryRate: number | null;    // 재진입률 % (이탈 후 14일 이내 동일 user_key/phone 재발화)
  // 이탈 사유 — MVP에서는 제외, "TODO" 표시
}

export interface KeywordCount {
  keyword: string;
  count: number;
}

export interface AssigneeRef {
  name: string;          // "AI" / "박소리" / "신민섭"
  isAI: boolean;
  utteranceCount: number;
}

export interface AssigneeRatio {
  aiCount: number;        // AI(시스템·자동·넛지·시간안내) 발화 수
  humanCount: number;     // 사람 상담사 발화 수
  total: number;
  aiPct: number;          // 0~100, 소수점 1자리
  humanPct: number;
}

/** Customer Journey Map 전체 데이터 */
export interface JourneyMapData {
  totalStarted: number;            // 헤더 — 여정 시작 (Phase 1 도달)
  totalCompleted: number;          // 헤더 — 여정 완료 (Phase 8 도달 또는 closed)
  columns: PhaseColumnData[];
  reentryByPhase: Array<{ phase: Phase; rate: number | null; sample: number }>;
  dailyFunnel: Array<{ date: string; intake: number; quote: number; booked: number }>;  // 일별 인입/견적/전환
  skipTransitions: Array<{ from: Phase; to: Phase; count: number }>;
  insight: string | null;          // 자동 생성 인사이트 문구
  modificationCount: number;       // P3.1 (품목 변경) 발생 건수
}

/** KR 카드 1개 분량 */
export interface KrCardData {
  id: "kr1" | "kr2" | "kr3";
  label: string;
  current: number | null;       // null = "—" 표시 (하드코딩 0이거나 산출 불가)
  currentDisplay: string;       // "1.2억 원" / "—" / "0%"
  target: number;
  targetDisplay: string;        // "3억 원" / "5억 원" / "50%"
  achievementPct: number | null;
  isHardcoded: boolean;
  unit: "currency" | "percent";
}

/** Health Check 카드 1개 분량 */
export interface HealthCardData {
  id: string;
  label: string;
  threshold: number;
  thresholdLabel: string;       // "≤ 3.0%" / "≥ 60pt"
  current: number | null;       // null = TBD
  currentDisplay: string;
  unit: "percent" | "count" | "pt";
  status: "ok" | "warn" | "alert" | "tbd";
  thresholdDirection: "lte" | "gte"; // ≤ 또는 ≥
}

/** Traffic 채널 데이터 */
export interface TrafficChannel {
  name: string;
  color: string;
  count: number;
  pct: number;
}
