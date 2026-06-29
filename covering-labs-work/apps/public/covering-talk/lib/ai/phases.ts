// 방문수거 9단계 Phase enum + 라벨/색상/status 매핑.

export enum Phase {
  PHASE_1_INITIAL = "phase_1",
  PHASE_2_COLLECT = "phase_2",
  PHASE_3_SPEC = "phase_3",
  PHASE_3_1_MODIFY = "phase_3_1",
  PHASE_4_QUOTE = "phase_4",
  PHASE_5_NUDGE = "phase_5",
  PHASE_6_BOOKING = "phase_6",
  PHASE_7_CONFIRM = "phase_7",
  PHASE_8_POST = "phase_8",
  CLOSED = "closed",
}

export interface CollectedInfoItem {
  category: string;
  spec: string;
  quantity: number;
}

export interface CollectedInfo {
  address: string | null;
  district: string | null;  // 구/시군 단위 (예: "강남구", "수원")
  floor: number | null;
  elevator: boolean | null;
  parking: boolean | null;
  items: CollectedInfoItem[];
  special_notes: string[];
  photos: string[];
  // ABC 타임 예약 관련 (사이드 드롭박스·[시간안내] 버튼·webhook 응답)
  requestedDate?: string | null;         // AI 가 대화에서 추출한 수거 희망일 YYYY-MM-DD
  selectedTimeBlock?: "A" | "B" | "C" | null;  // 고객이 ABC 버튼 클릭 시 저장
  selectedDate?: string | null;          // 고객이 버튼 클릭한 날짜 (requestedDate 와 다를 수 있음)
}

export interface PhaseTransition {
  from: Phase;
  to: Phase;
  reason: string;
  triggered_by: "auto" | "agent";
  timestamp: string;
}

export const EMPTY_COLLECTED_INFO: CollectedInfo = {
  address: null,
  district: null,
  floor: null,
  elevator: null,
  parking: null,
  items: [],
  special_notes: [],
  photos: [],
};

export const PHASE_LABELS: Record<Phase, string> = {
  [Phase.PHASE_1_INITIAL]: "1 - 초기 인입",
  [Phase.PHASE_2_COLLECT]: "2 - 정보 수집",
  [Phase.PHASE_3_SPEC]: "3 - 사양 확인",
  [Phase.PHASE_3_1_MODIFY]: "3-1 - 품목 변경",
  [Phase.PHASE_4_QUOTE]: "4 - 견적 안내",
  [Phase.PHASE_5_NUDGE]: "5 - 넛지",
  [Phase.PHASE_6_BOOKING]: "6 - 예약 접수",
  [Phase.PHASE_7_CONFIRM]: "7 - 예약 확인",
  [Phase.PHASE_8_POST]: "8 - 사후 관리",
  [Phase.CLOSED]: "종료",
};

export const PHASE_COLORS: Record<Phase, string> = {
  [Phase.PHASE_1_INITIAL]: "bg-gray-100 text-gray-600",
  [Phase.PHASE_2_COLLECT]: "bg-blue-100 text-blue-700",
  [Phase.PHASE_3_SPEC]: "bg-indigo-100 text-indigo-700",
  [Phase.PHASE_3_1_MODIFY]: "bg-amber-100 text-amber-700",
  [Phase.PHASE_4_QUOTE]: "bg-emerald-100 text-emerald-700",
  [Phase.PHASE_5_NUDGE]: "bg-orange-100 text-orange-700",
  [Phase.PHASE_6_BOOKING]: "bg-purple-100 text-purple-700",
  [Phase.PHASE_7_CONFIRM]: "bg-green-100 text-green-700",
  [Phase.PHASE_8_POST]: "bg-teal-100 text-teal-700",
  [Phase.CLOSED]: "bg-gray-100 text-gray-400",
};

/** Phase → 기본 ConversationStatus 매핑 */
export function getDefaultStatusForPhase(phase: Phase): string {
  switch (phase) {
    case Phase.PHASE_1_INITIAL:
    case Phase.PHASE_2_COLLECT:
    case Phase.PHASE_3_SPEC:
    case Phase.PHASE_6_BOOKING:
      return "pending";
    case Phase.PHASE_3_1_MODIFY:
      return "pending";
    case Phase.PHASE_4_QUOTE:
      return "pending";
    case Phase.PHASE_5_NUDGE:
      return "quote_sent_nudge";
    case Phase.PHASE_7_CONFIRM:
      return "pending";
    case Phase.PHASE_8_POST:
      return "booked";
    case Phase.CLOSED:
      return "completed";
    default:
      return "pending";
  }
}
