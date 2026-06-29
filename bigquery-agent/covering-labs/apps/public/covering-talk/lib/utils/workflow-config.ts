/**
 * 워크플로우 설정 — 설정 페이지에서 편집 가능한 템플릿 & Phase 토글
 * app_settings 테이블의 key="workflow_config"에 JSON으로 저장
 */

import { supabase } from "@/lib/supabase/client";

export interface WorkflowConfig {
  greeting: string;
  quote: string;
  booking_confirm: string;
  skip_nudge: boolean;
  skip_doublecheck: boolean;
}

// ── 기본 템플릿 ──────────────────────────────────────

// 전화 상담 안내 — 채팅 default, 원하는 고객만 전화 옵션. 두 곳에서 공유:
//   1) 첫 인입 인사 끝에 자동 첨부
//   2) 고객이 템플릿 선기입해서 인입한 경우 별도 발송
export const PHONE_CONSULT_NOTICE = `혹시 전화 상담을 원하시나요? ☎️
성함과 연락처를 남겨주시면 1시간 이내로 연락드릴게요 :)
(전화 상담 가능 시간: 오전 10시 ~ 오후 6시)`;

export const DEFAULT_GREETING = `안녕하세요, 커버링입니다 :)

📝 정확한 견적을 위해 아래 내용을 채팅으로 작성해주세요

1.수거 희망 일시 📅
예) {{예시날짜}}

2. 상세 주소 📍
예) 서울시 성동구 성수동 123-45, 3층
주거 형태(주택·빌라/아파트) 차량(탑차) 진입이 원활한가요?

3. 버릴 품목 📦
예) 싱글 침대 1개, 3인용 소파 1개, 양문형 냉장고 1개

📌 아래 항목에 해당하는 품목이 있다면 별도로 알려주세요
  - 현관문/엘리베이터를 통과하기 어려운 대형 품목
  - 해체가 필요한 품목
  - 가전/가구에 내용물이 들어있는 경우

4. 작업 환경 🏢
• 엘리베이터: 사용 가능 / 사용 불가
• 주차: 가능 / 불가능

위 내용을 작성해서 보내주시면
담당자가 확인 후 견적을 안내드리겠습니다.

${PHONE_CONSULT_NOTICE}`;

export const DEFAULT_QUOTE = `고객님, 기다려주셔서 감사합니다.
전달해 주신 내용에 따라 예상 견적 안내해 드립니다!

견적: {{금액}}
* 내용물이 비워지지 않으면 추가 비용이 발생할 수 있으며, 함께 수거가 필요한 품목이 있으시면 말씀 부탁드립니다.

수거를 희망하시면 예약 확정 도와드리겠습니다.
추가로 궁금하신 점이 있으시다면 언제든지 말씀 주세요 : )`;

// {{결제정보}} — 서버가 feature flag(prepayment_enabled) ON 시 결제 금액·링크·12h 자동취소 안내 블록으로 치환.
//   OFF 또는 링크 발급 실패 시 placeholder 자체를 제거 → 기존(post-pay) 흐름과 동일한 메시지.
export const DEFAULT_BOOKING_CONFIRM = `말씀해 주신 날짜와 주소로 수거 예약 완료 되었습니다!

{{결제정보}}

혹시 수거 관련하여 변동 사항이 있으신 경우, 수거 24시간 전까지만 말씀해 주세요.
깔끔한 수거로 찾아뵙겠습니다!

감사합니다 : )`;

export const DEFAULTS: WorkflowConfig = {
  greeting: DEFAULT_GREETING,
  quote: DEFAULT_QUOTE,
  booking_confirm: DEFAULT_BOOKING_CONFIRM,
  skip_nudge: false,
  skip_doublecheck: false,
};

// ── 캐시 (1분) ───────────────────────────────────────

let cachedConfig: WorkflowConfig | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000;

export async function getWorkflowConfig(): Promise<WorkflowConfig> {
  if (cachedConfig && Date.now() - cacheTime < CACHE_TTL) {
    return cachedConfig;
  }
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "workflow_config")
      .single();
    if (data?.value && typeof data.value === "object") {
      cachedConfig = { ...DEFAULTS, ...(data.value as Partial<WorkflowConfig>) };
    } else {
      cachedConfig = { ...DEFAULTS };
    }
  } catch {
    cachedConfig = { ...DEFAULTS };
  }
  cacheTime = Date.now();
  return cachedConfig;
}

/** 캐시 무효화 (설정 저장 후 호출) */
export function invalidateWorkflowCache(): void {
  cachedConfig = null;
  cacheTime = 0;
}

// ── 플레이스홀더 치환 ────────────────────────────────

/** 인사말의 {{예시날짜}} → "2026년 3월 15일 오후1시" */
export function resolveGreeting(template: string): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  const dateStr = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 오후1시`;
  return template.replace(/\{\{예시날짜\}\}/g, dateStr);
}

/** 견적 템플릿의 {{금액}} → "88,000원 (부가세 포함)" */
export function resolveQuote(template: string, price: number, hasLadder: boolean): string {
  const label = hasLadder ? "(사다리차/부가세 포함)" : "(부가세 포함)";
  const priceStr = `${price.toLocaleString("ko-KR")}원 ${label}`;
  return template.replace(/\{\{금액\}\}/g, priceStr);
}
