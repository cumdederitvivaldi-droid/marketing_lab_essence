// 서버 측 Phase 전환 로직 — AI 응답 전후에 호출하여 다음 Phase 결정.
// 9단계 머신: 1→인사 / 2→정보수집 / 3→사양확인 / 3-1→품목수정 / 4→견적 / 5→넛지 / 6→예약접수 / 7→예약확정 / 8→사후관리 / closed.

import { Phase, CollectedInfo } from "./phases";
import { findNextPendingAmbiguousItem } from "./ambiguous-items";

interface TransitionResult {
  nextPhase: Phase;
  reason: string;
}

/** 예약 의사 키워드 패턴 */
const BOOKING_KEYWORDS = [
  "예약", "접수", "신청",
  "진행할게", "진행해주", "진행합니",
  "예약할게", "예약해주", "예약합니",
  "접수할게", "접수해주",
  "신청할게", "신청해주",
  // "부탁드"/"부탁합니" 제거 — "견적부탁드릴게요" 등 오탐 유발
];

/** 넓은 예약 의사 키워드 (Phase 5 넛지 후, Phase 7 확정) */
const BROAD_BOOKING_KEYWORDS = [
  ...BOOKING_KEYWORDS,
  "진행", "부탁", "확정",
  "할게요", "할래요", "하겠습니다", "해주세요",
];

/** 품목 변경 키워드 패턴 */
const ITEM_CHANGE_KEYWORDS = [
  "추가", "빼주", "제거", "삭제", "변경",
  "더 있", "하나 더", "빠졌", "빼고",
];

/** 고민/보류 키워드 — 견적 후 즉시 예약하지 않고 고민 중인 경우 */
const DELIBERATION_KEYWORDS = [
  "고민", "보류", "나중에", "생각해", "생각 좀",
  "다음에", "좀 더", "아직", "고려", "검토",
  "비교", "알아보", "알아볼",
];

/** 예약 취소 키워드 */
const CANCEL_KEYWORDS = [
  "취소", "안할게", "안할래", "안하겠", "취소할게",
  "취소해주", "예약취소", "캔슬",
];

/** 재문의 키워드 — 종료/넛지 후 다시 견적/예약 원할 때 */
const REENTRY_KEYWORDS = [
  "다시", "새로", "견적", "문의", "상담",
  "버리", "수거", "폐기",
];

/**
 * 새 견적 요청 패턴 감지 — 주소 + 품목 수량이 함께 있으면 새 견적으로 판단
 * 키워드 없이 바로 정보만 보내는 고객 대응 (예: "서울 용산구 도원동... 침대 1개")
 */
function isNewQuoteRequest(message: string): boolean {
  // 주소 패턴: 광역시/도/시 + 구/군 또는 동/로/길 + 번지/호
  const hasAddress =
    /(?:서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)/.test(message) &&
    /(?:[가-힣]+(?:구|군|시|동|로|길))/.test(message) ||
    /(?:아파트|빌라|오피스텔|캐슬|타워|맨션|파크|힐스|자이)\s*\d*/.test(message) ||
    /\d+동\s*\d+호/.test(message) ||
    /\d+호/.test(message) && /[가-힣]+(?:구|동|로|길)/.test(message);
  // 품목 수량 패턴: N개, N대, N세트 등
  const hasItemQuantity = /\d+\s*(?:개|대|세트|장|ea)/.test(message);
  return hasAddress && hasItemQuantity;
}

/** 부정 맥락 패턴 — 예약/확정 키워드 앞뒤에 부정 표현이 있으면 booking이 아님 */
const NEGATION_PATTERN = /(?:안\s|않|아닌|아니|말고|못\s|아직|안할|안해|안하|취소)/;

/**
 * 수집 정보 기본 항목(주소, 지역, 엘베, 주차) 확인 여부
 * district가 확인되어야 출장비가 정확하게 산출됨 → 견적 전환 조건에 필수
 */
function hasBasicInfo(info: CollectedInfo): boolean {
  return (
    info.address != null &&
    info.district != null &&
    info.elevator != null &&
    info.parking != null
  );
}

/**
 * 모든 품목 사양이 확정되었는지 (pending ambiguous 없음)
 */
function allSpecsConfirmed(
  messages: { role: string; content: string }[]
): boolean {
  const nextPending = findNextPendingAmbiguousItem(messages);
  return nextPending === null;
}

/**
 * Phase 전환 조건 체크
 *
 * @param currentPhase 현재 Phase
 * @param collectedInfo 수집된 정보
 * @param hasQuote 견적 데이터 존재 여부
 * @param latestUserMessage 최신 고객 메시지
 * @param messageType 메시지 타입 ("text" | "image" | "photo" | "file")
 * @param messages 전체 대화 기록 (ambiguous items 체크용)
 * @param hasBookingInfo 예약 정보(성함+연락처+일자+시간) 완성 여부
 */
export function checkPhaseTransition(
  currentPhase: Phase,
  collectedInfo: CollectedInfo,
  hasQuote: boolean,
  latestUserMessage: string,
  messageType: string,
  messages: { role: string; content: string }[],
  hasBookingInfo?: boolean,
  options?: { skipNudge?: boolean; skipDoublecheck?: boolean }
): TransitionResult | null {
  switch (currentPhase) {
    // ── Phase 1 → 2: 고객 텍스트 응답 수신 ──
    case Phase.PHASE_1_INITIAL: {
      if (messageType === "image" || messageType === "photo" || messageType === "file") {
        // 사진/파일만 → 상담사 개입 (Phase 전환 없음, needs_human 플래그로 처리)
        return null;
      }
      return {
        nextPhase: Phase.PHASE_2_COLLECT,
        reason: "고객 텍스트 응답 수신",
      };
    }

    // ── Phase 2 → 4 (Phase 3 사양확인 생략 — 사양 버튼 비활성화) ──
    case Phase.PHASE_2_COLLECT: {
      if (!hasBasicInfo(collectedInfo)) return null;
      if (!hasQuote) return null;
      // 모호 품목(매트리스 사이즈, 세탁기 종류 등) 질문이 남아있으면 대기
      if (!allSpecsConfirmed(messages)) return null;

      return {
        nextPhase: Phase.PHASE_4_QUOTE,
        reason: "모든 필수 항목 충족, 견적 산출 완료",
      };
    }

    // ── Phase 3 → 4: 사양 확인 생략 — 견적 있으면 바로 전환 ──
    case Phase.PHASE_3_SPEC: {
      if (!hasQuote) return null;

      return {
        nextPhase: Phase.PHASE_4_QUOTE,
        reason: "견적 산출 완료 (사양 확인 생략)",
      };
    }

    // ── Phase 4 → 2 (새 견적) 또는 → 5 (고민/보류) 또는 → 6 (예약 의사) ──
    case Phase.PHASE_4_QUOTE: {
      const hasBookingIntent = BOOKING_KEYWORDS.some((kw) =>
        latestUserMessage.includes(kw)
      );
      // 성함+연락처를 바로 보내는 경우도 예약 의사로 간주
      const hasPersonalInfo = /\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4}/.test(latestUserMessage);

      // ⚠️ 예약 의사를 먼저 확인 — "수거 부탁드려요"는 예약이지 재인입이 아님
      const hasDeliberation = DELIBERATION_KEYWORDS.some((kw) =>
        latestUserMessage.includes(kw)
      );
      const hasNegation = NEGATION_PATTERN.test(latestUserMessage);

      // 고민/보류가 있으면: 명시적 예약행동("예약할게", "진행해주세요")이 없는 한 Phase 5
      if (hasDeliberation) {
        const hasExplicitBooking = /예약\s*(할|해|진행)(?![지까])|진행\s*(할|해)(?![지까])|접수\s*(할|해)(?![지까])|신청\s*(할|해)(?![지까])/.test(latestUserMessage);
        if (!hasExplicitBooking && !hasPersonalInfo) {
          // 넛지 스킵 설정 시 Phase 4에 머무름
          if (options?.skipNudge) return null;
          return {
            nextPhase: Phase.PHASE_5_NUDGE,
            reason: "고객 고민/보류 표현",
          };
        }
      }

      // 부정 맥락이 있으면 예약 의사 아님
      if (hasNegation && !hasPersonalInfo) {
        return null;
      }

      // 예약 의사 확인 (재인입 체크보다 우선!)
      if (hasBookingIntent || hasPersonalInfo) {
        return {
          nextPhase: Phase.PHASE_6_BOOKING,
          reason: hasPersonalInfo ? "고객 성함/연락처 제공 (예약 의사)" : "고객 예약 의사 표현",
        };
      }

      // 예약 의사 없을 때만 재인입 감지 (새 견적 요청)
      // "수거 부탁드려요" 같은 경우는 위에서 이미 booking으로 처리됨
      const hasReentryInQuote = REENTRY_KEYWORDS.some((kw) =>
        latestUserMessage.includes(kw)
      );
      const hasNewQuoteInQuote = isNewQuoteRequest(latestUserMessage);

      // ⚠️ 의문문이면 단순 질문 → 재인입 아님 (견적 초기화 방지)
      // 예: "견적금액은 달라질 수 있나요?", "수거 시 방문하나요?"
      const isQuestion = /[?？]|(?:인가요|나요|까요|ㄴ가요|는지요|한가요|할까요|되나요|있나요|없나요|인지요|죠\??|가요\??|건지|건가|세요\??)/.test(latestUserMessage);

      if (hasReentryInQuote || hasNewQuoteInQuote) {
        // 의문문 + 새 주소/품목 패턴이 아니면 → 단순 질문으로 판단, 재인입 아님
        if (isQuestion && !hasNewQuoteInQuote) {
          return null;
        }
        return {
          nextPhase: Phase.PHASE_2_COLLECT,
          reason: hasNewQuoteInQuote
            ? "견적 후 고객 새 견적 정보 감지 (주소+품목 패턴)"
            : "견적 후 고객 재문의 (새 견적 요청)",
        };
      }

      return null;
    }

    // ── Phase 5 → 6 (예약 의사) 또는 → 2 (새 견적 요청) ──
    case Phase.PHASE_5_NUDGE: {
      // 고민/보류 키워드가 같은 메시지에 있으면 → 이 메시지가 Phase 5를 유발한 것
      // 즉시 Phase 6으로 바운스하지 않음 (다음 메시지에서 판단)
      const hasDeliberation = DELIBERATION_KEYWORDS.some((kw) =>
        latestUserMessage.includes(kw)
      );
      if (hasDeliberation) {
        return null;
      }

      // 재문의 키워드 먼저 체크 ("다시 견적 부탁드려요"는 재문의, 예약 아님)
      const hasNewInquiry = REENTRY_KEYWORDS.some((kw) =>
        latestUserMessage.includes(kw)
      );
      // 주소 + 품목 수량 패턴 감지 (키워드 없이 바로 새 견적 정보를 보내는 경우)
      const hasNewQuotePattern = isNewQuoteRequest(latestUserMessage);
      if (hasNewInquiry || hasNewQuotePattern) {
        return {
          nextPhase: Phase.PHASE_2_COLLECT,
          reason: hasNewQuotePattern
            ? "고객 새 견적 정보 감지 (주소+품목 패턴)"
            : "넛지 후 고객 재문의 (새 견적 요청)",
        };
      }
      // 넛지 후에는 넓은 키워드 사용 (고민 후 돌아온 고객은 간단히 "할게요"라고 할 수 있음)
      const hasBookingIntent = BROAD_BOOKING_KEYWORDS.some((kw) =>
        latestUserMessage.includes(kw)
      );
      if (hasBookingIntent) {
        return {
          nextPhase: Phase.PHASE_6_BOOKING,
          reason: "넛지 후 고객 예약 의사 표현",
        };
      }
      return null;
    }

    // ── Phase 6 → 7: 예약 정보 완성 ──
    case Phase.PHASE_6_BOOKING: {
      if (hasBookingInfo) {
        return {
          nextPhase: Phase.PHASE_7_CONFIRM,
          reason: "성함, 연락처, 일자, 시간 모두 확인",
        };
      }
      return null;
    }

    // ── Phase 7 → 8: 고객이 예약 확정 의사 표현 ──
    case Phase.PHASE_7_CONFIRM: {
      const confirmKeywords = ["네", "넵", "넹", "응", "ㅇㅇ", "맞아요", "맞아", "맞습니다", "확정", "예약", "진행", "좋아요", "좋아", "그렇게", "부탁", "오케이", "ㅇㅋ", "ok"];
      const hasConfirm = confirmKeywords.some((kw) => latestUserMessage.includes(kw));
      if (hasConfirm) {
        return {
          nextPhase: Phase.PHASE_8_POST,
          reason: "고객 예약 확정 의사 표현",
        };
      }
      return null;
    }

    // ── Phase 8 → 3-1 (품목 변경) 또는 → CLOSED (취소) ──
    case Phase.PHASE_8_POST: {
      // 취소 요청 → CLOSED
      const hasCancelIntent = CANCEL_KEYWORDS.some((kw) =>
        latestUserMessage.includes(kw)
      );
      if (hasCancelIntent) {
        return {
          nextPhase: Phase.CLOSED,
          reason: "고객 예약 취소 요청",
        };
      }
      // 품목 변경 요청 → 3-1
      const hasChangeIntent = ITEM_CHANGE_KEYWORDS.some((kw) =>
        latestUserMessage.includes(kw)
      );
      if (hasChangeIntent) {
        return {
          nextPhase: Phase.PHASE_3_1_MODIFY,
          reason: "고객 품목 추가/제거 요청",
        };
      }
      return null;
    }

    // ── Phase 3-1 → 8: 변경 견적 확인 완료 ──
    case Phase.PHASE_3_1_MODIFY: {
      // 품목 변경 키워드가 같은 메시지에 있으면 → 이 메시지가 Phase 3-1을 유발한 것
      // 즉시 Phase 8로 바운스하지 않음 (다음 메시지에서 판단)
      const hasItemChangeInMsg = ITEM_CHANGE_KEYWORDS.some((kw) =>
        latestUserMessage.includes(kw)
      );
      if (hasItemChangeInMsg) {
        return null;
      }
      // 변경 견적이 산출되었으면 Phase 8로 복귀
      if (hasQuote) {
        return {
          nextPhase: Phase.PHASE_8_POST,
          reason: "변경 견적 확인 완료",
        };
      }
      return null;
    }

    // ── CLOSED → 2: 종료 후 재문의 ──
    case Phase.CLOSED: {
      // 취소 키워드가 있으면 → 이 메시지가 CLOSED를 유발한 것
      // 즉시 재진입하지 않음 (다음 메시지에서 판단)
      const hasCancelInMsg = CANCEL_KEYWORDS.some((kw) =>
        latestUserMessage.includes(kw)
      );
      if (hasCancelInMsg) {
        return null;
      }

      const hasReentry = REENTRY_KEYWORDS.some((kw) =>
        latestUserMessage.includes(kw)
      );
      const hasNewQuoteInClosed = isNewQuoteRequest(latestUserMessage);
      // 종료 후 고객이 어떤 메시지든 보내면 → 대기중으로 전환 (상담사가 확인 가능)
      return {
        nextPhase: Phase.PHASE_2_COLLECT,
        reason: hasNewQuoteInClosed
          ? "고객 새 견적 정보 감지 (주소+품목 패턴)"
          : hasReentry
            ? "종료 후 고객 재문의"
            : "종료 후 고객 재연락",
      };
    }

    default:
      return null;
  }
}
