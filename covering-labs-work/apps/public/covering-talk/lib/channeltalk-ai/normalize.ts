/**
 * 커버링 AI 상담 — Sonnet 메시지 정제 & 카테고리 분류
 * 분류 정확도가 전체 답변 품질의 핵심이므로 Sonnet 사용
 */

import { createMessage } from "@/lib/ai/ai-client";

export const CATEGORIES = [
  // A. 서비스이용 (4분할)
  "이용_배출품목",      // 배출방법/수거품목/수거시간
  "이용_대형폐기물",    // 대형폐기물 전체
  "이용_서비스안내",    // 가입/요금/지역/등급
  "이용_주문관리",      // 주문변경/일정/스팟/대량수거

  // B. 구독
  "구독_관리",          // 구독/해지/재개/결제실패

  // C. 배송/봉투 (2분할)
  "배송_현황",          // 배송기간/추적/정상배송
  "배송_이슈",          // 누락/파손/분실/환불

  // D. 미수거 (3분할)
  "미수거_정책위반",    // 배출규정 미준수 (미배출/봉투미사용/무게초과/외부배출)
  "미수거_누락",        // 수거 누락/지연/분실 (수거지연/주소착오/고객과실)
  "미수거_출입실패",    // 출입 문제 (출입실패_고객과실/커버링과실)

  // E. 결제 (2분할)
  "결제_안내",          // 결제방법/내역 확인/증빙서류
  "결제_이슈",          // 무게오류/중복결제/환불

  // F. 독립 카테고리
  "앱_오류",            // 앱/시스템/인증
  "수거_확인",          // 수거 확인/고객혼동/일부수거
  "오인수거",           // 타인 물품 수거/보상
  "계정_정보",          // 탈퇴/주소변경/계정이전
  "쿠폰",              // 사용/발급/유효기간/이벤트
  "VOC",               // 불만/개선의견
  "기타",              // 미분류/분실물/마케팅/자체해결
  "빼기주문",           // 빼기주문 (신규 운영)
] as const;

export type Category = (typeof CATEGORIES)[number];

// 분류 프롬프트용 카테고리 설명
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "이용_배출품목": "수거 가능 품목, 배출 방법, 배출 위치, 수거 시간, 분리수거 방법 문의",
  "이용_대형폐기물": "대형폐기물(매트리스/가전/가구 등) 수거 품목, 배출 방법, 요금, 신청, 대형봉투",
  "이용_서비스안내": "서비스 지역, 요금 체계, 봉투 구매 방법, 등급제, 신규 가입, 이용 안내 전반",
  "이용_주문관리": "주문 수정/취소, 주문 내역 확인, 스팟 서비스, 대량 수거, 오피스/빌딩 서비스",
  "구독_관리": "구독 해지, 구독 환불, 결제 실패로 인한 해지, 구독 재개, 구독 이용방법",
  "배송_현황": "봉투 배송 기간, 배송 추적, 정상 배송 확인, 배송 지연, 봉투 종류 혼동",
  "배송_이슈": "봉투 누락(구매/기본/첫봉투), 봉투 분실, 봉투 파손, 봉투 오배송, 봉투 환불/취소",
  "미수거_정책위반": "미배출, 봉투 미사용, 무게 초과, 외부 배출, 박스 사용, 물 흐름 등 배출 규정 위반",
  "미수거_누락": "수거 지연, 수거 누락, 주소 착오, 고객 과실, 쓰레기 분실, 수량 불일치",
  "미수거_출입실패": "출입 실패(고객 과실/커버링 과실), 비밀번호 변경, 출입 불가",
  "결제_안내": "결제 이용 방법, 결제 내역 확인/혼동, 증빙서류 발급",
  "결제_이슈": "무게 오입력, 무게 확인 요청, 중복 결제, 결제 오류, 결제 취소",
  "앱_오류": "앱 오류, 시스템 장애, 인증번호 미수신, 로그인 문제",
  "수거_확인": "수거 완료 확인, 수거 고객 혼동, 일부 수거, 현장 오염",
  "오인수거": "타인 물품 오인 수거, 보상 요청, 분실물 관련",
  "계정_정보": "회원 탈퇴, 주소 변경, 계정 이전, 개인정보 수정",
  "쿠폰": "쿠폰 사용 방법, 쿠폰 유효기간, 쿠폰 미발급, 이벤트 쿠폰",
  "VOC": "서비스 불만, 개선 의견, 강성 민원",
  "기타": "위 카테고리에 해당하지 않는 문의, 분실물, 마케팅/제휴, 자체 해결",
  "빼기주문": "빼기주문 관련 문의 (신규 운영 서비스)",
};

/**
 * 고객 메시지 정제 + 카테고리 분류 (단일 Sonnet 호출)
 *
 * - 오타 정리, 단편 메시지 맥락 통합
 * - 최근 2~3턴 맥락 반영
 * - 20개 카테고리 분류 (분류 정확도가 핵심이므로 Sonnet 사용)
 */
export async function normalizeAndClassify(params: {
  currentMessage: string;
  recentTurns?: Array<{ role: "user" | "manager"; text: string }>;
  classifyModel?: string;
}): Promise<{ normalizedMessage: string; category: Category }> {
  const turnsBlock = params.recentTurns?.length
    ? `\n최근 대화 맥락:\n${params.recentTurns.map((t) => `${t.role === "user" ? "고객" : "매니저"}: ${t.text}`).join("\n")}\n`
    : "";

  const categoryList = CATEGORIES.map(
    (c) => `- ${c}: ${CATEGORY_DESCRIPTIONS[c] ?? ""}`
  ).join("\n");

  // 시스템 프롬프트 (카테고리 목록 + 분류 규칙 — 캐시 가능, 매 호출 동일)
  const systemPrompt = `커버링(생활폐기물 야간 수거 서비스) 고객 상담 대화를 분석하세요.

**핵심 규칙: 고객이 명시적으로 물어본 것이 최우선입니다.**

분석 순서:
1. 고객 메시지에서 **질문/요청**을 먼저 찾으세요 ("궁금해요", "어떻게", "왜", "언제" 등)
2. 나머지 메시지는 **상황 설명**으로 취급하세요 (보조 정보)
3. 매니저가 "자세히 작성해주세요" 같은 일반 안내만 한 경우, 아직 답변하지 않은 것으로 간주
4. 매니저가 구체적으로 답변한 내용만 "답변 완료"로 처리

카테고리 분류 기준:
${categoryList}

**분류 팁:**
- "대형"이 포함되면 → 이용_대형폐기물 우선 검토
- 봉투 "배송/도착/언제" → 배송_현황, 봉투 "없어요/안 왔어요" → 배송_이슈
- 수거 "안 됐어요/왜 안 가져갔어요" → 미수거 계열
- 구독 관련 키워드(해지/취소/구독료) → 구독_관리

응답 형식 (JSON만, 설명 없이):
{"normalized": "고객의 핵심 질문 (검색 최적화 문장)", "category": "카테고리명"}`;

  // 유저 메시지 (매 호출 다름 — 캐시 불가)
  const userMessage = `${turnsBlock}현재 고객 메시지: "${params.currentMessage}"`;

  try {
    const response = await createMessage({
      model: params.classifyModel || "sonnet",
      max_tokens: 256,
      system: [
        { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userMessage }],
    });

    const text = response.text;
    const match = text.match(/\{[\s\S]*?\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const category = (CATEGORIES as readonly string[]).includes(parsed.category)
        ? (parsed.category as Category)
        : "기타";
      return {
        normalizedMessage: parsed.normalized || params.currentMessage,
        category,
      };
    }
  } catch (err) {
    console.error("[normalize] Sonnet 호출 실패:", err);
  }

  // 폴백: 원본 메시지 반환
  return {
    normalizedMessage: params.currentMessage,
    category: "기타",
  };
}
