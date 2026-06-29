/**
 * 커버링 AI 상담 추천 엔진
 *
 * 파이프라인:
 * 1. Sonnet으로 메시지 정제 + 카테고리 분류
 * 2. 프롬프트 + RAG 병렬 로드
 * 3. 답변 생성 (정확성 중심, Sonnet)
 * 4. 톤 가이드 적용 (스타일 다듬기, Haiku)
 * 5. 결과 반환
 */

import { createMessage } from "@/lib/ai/ai-client";
import { embedText } from "@/lib/ai/voyage";
import { supabase } from "@/lib/supabase/client";
import { normalizeAndClassify } from "./normalize";
import { getCategoryPrompt, getAccumulatedPolicySections } from "./category-prompts";
import type {
  ScoredCandidate,
  ConsultationMatch,
  SuggestResult,
} from "./types";
import { SCORING_WEIGHTS } from "./types";
import { getPolicySectionsForCategory } from "./validate";
import { lookupServiceArea } from "./service-area";

const POLICY_ANSWER_THRESHOLD = 60;

/** 프롬프트 캐싱 적용 통합 AI 호출 헬퍼 */
async function cachedMessageCreate(params: {
  system: string;
  userMessage: string;
  model?: string;
  maxTokens?: number;
}) {
  return createMessage({
    model: params.model ?? "sonnet",
    max_tokens: params.maxTokens ?? 1024,
    system: [
      { type: "text" as const, text: params.system, cache_control: { type: "ephemeral" as const } },
    ],
    messages: [{ role: "user" as const, content: params.userMessage }],
  });
}

// 실제 상담사 이름 (봇/워크플로우 메시지 구분용)

type RecentTurn = { role: "user" | "manager"; text: string; senderName?: string };

/** 실제 상담사가 답변했는지 확인 (봇/워크플로우 메시지 제외) */
function hasRealManagerReply(turns?: RecentTurn[]): boolean {
  if (!turns?.length) return false;
  // 봇("커버링") 제외, 실제 상담사만 체크
  return turns.some(
    (t) => t.role === "manager" && !!t.senderName && t.senderName !== "커버링"
  );
}

// 스코어링에서 제외할 태그
const EXCLUDE_TAG_PREFIXES = ["고객유형/"];
const EXCLUDE_TAGS = new Set(["무응종결", "중복"]);

function filterInputTags(tags: string[]): string[] {
  return tags.filter(
    (t) =>
      !EXCLUDE_TAG_PREFIXES.some((prefix) => t.startsWith(prefix)) &&
      !EXCLUDE_TAGS.has(t)
  );
}

// ─── 톤 & 매너 가이드 (Step 4: Haiku 톤 리라이팅용) ───

const TONE_GUIDE = `## 톤 & 매너 (커버링 상담사 스타일)

[인사/시작]
- 첫 응대: "안녕하세요, 커버링 입니다." (밝은 톤)
- 오전 10시 이후 1시간 이상 기다린 고객: "안녕하세요, 커버링 입니다. 금일 문의량 급증으로 답변이 지연된 점 양해 부탁드립니다."
- 문의 내용 없이 연결된 고객: "안녕하세요, 커버링 입니다. 문의 내용을 작성해 주시면 확인 후 안내드리겠습니다!"
- 이미 대화 중: 인사 생략, 바로 본론

[말투 핵심]
- 따뜻하고 다정한 존댓말. "~드립니다" 보다 "~드릴게요", "~감사하겠습니다!" 선호.
- "부탁드립니다" 단독 사용 금지. → "~해주시면 감사하겠습니다", "~도와드리도록 하겠습니다!"
- "좋은 질문입니다", "궁금하실 수 있는데요" 같은 평가성/교육적 표현 절대 금지.
- 고객 입장에 공감 먼저: "아쉽게도...", "불편을 드려 정말 죄송합니다", "번거로우시겠지만"
- 거절 시 반드시 대안 제시: "마땅히 ~라면, ~진행 도와드리도록 하겠습니다."
- 개인적 책임감: "제가 직접 전달하겠습니다", "제가 확인해서 안내드릴게요"
- 한계/제한사항: "나중에는 해당 부분 개선된 방향으로 제공해 드릴 수 있도록 더 고민해 볼게요!"

[말투 — 답변 구조: 공감 → 사실 → 기준 → 안내]
- 공감: "불편 느끼셨을 것 같습니다"
- 사실: "확인해 본 결과~"
- 기준: "해당 경우 ~ 기준에 따라"
- 안내: "~로 진행됩니다"
- "확인 기반" 문장 사용: "확인 결과", "확인된 내용으로는", "내부 확인 결과" — 모든 판단은 "확인"에서 시작.
- 완곡하지만 단정적: "어렵습니다", "진행되지 않는 점 안내드립니다" — 부드럽지만 명확하게.
- 정책/기준 중심 설명: "수거 기준상", "이용 정책에 따라", "안전 및 오인 수거 방지를 위해"
- 고객 선택권 열어두기: "~해 주시면 확인 가능합니다", "필요 시 말씀해 주시면 안내드리겠습니다"
- 불필요한 감정 제거: 담백하고 짧게, 반복 금지, 과한 수식어 금지.
- 재발 방지 표현 (책임 인정 없이): "개선될 수 있도록 하겠습니다", "내부적으로 점검하겠습니다"
- 온도가 높거나 불만 고객에게 "~요" 체는 자제. "~입니다", "~드립니다" 체 사용.

[말투 — 존칭 규칙]
- 물건/품목에 존칭(-시-) 절대 금지. 존댓말은 고객(사람)에게만 사용.
  "봉투에 담기신다면" (X) → "봉투에 담아주신다면" 또는 "봉투에 넣으시면" (O)
  "카페트가 들어가기 어려우신 경우" (X) → "카페트가 봉투에 들어가지 않는 경우" (O)
  "물건이 담기시면" (X) → "물건을 담아주시면" (O). 주어가 사물이면 "-시-" 불가.

[이모지]
- : ) 이모티콘은 한 답변에 최대 1개까지만 허용. 대부분의 답변(70%)에서는 사용하지 않는다.
- 😊 💛 🌳 😥 등 유니코드 이모지는 절대 금지. : ) 만 허용.
- 누락 또는 불만을 이야기하는 고객에게는 : ) 포함한 모든 이모지/이모티콘 금지.

[간결함 — 가장 중요]
- 고객이 물어본 것에만 답한다. 물어보지 않은 정보를 추가하지 않는다.
- 짧고 핵심만. 3~5문장이면 충분하다. 길다고 좋은 답변이 아니다.
- "배차가 완료되면~", "추가로 안내드리자면~" 같은 불필요한 부연 금지.

[포맷]
- 마크다운(**, ##, - 등) 절대 금지. 일반 텍스트만.
- 모바일 환경. 한 문장 끝 → 줄바꿈. 2~3문장마다 빈 줄로 단락 구분.
- 긴 설명은 짧은 문장으로. 한 문장에 정보 하나만.

[확인/질문]
- 이해한 내용 확인: "~맞으실까요?"
- 불명확한 문의: "혹시 조금 더 자세히 알려주시면 정확하게 안내 도와드릴게요"

[마무리]
- "참고해주시면 감사하겠습니다.", "도움이 되셨으면 좋겠습니다 : )"
- "추가로 궁금하신 점 있으시면 편하게 말씀해 주세요!"
- 불필요한 클로징 반복 금지.

[정책 관련]
- 정책에 없는 내용은 답변하지 말 것. → [AI답변불가] 처리.
- 실제 문의 없이 인사만: "어떤 부분에서 도움이 필요하신지 말씀해 주시면 안내 도와드릴게요!"
- 고객 정보가 제공되었으면 배송 현황, 주문 상태, 구독 여부 등은 답변 가능하다. "계정 조회 필요"로 답변불가 처리하지 않는다.
- 고객 정보에도 없는 영역(실시간 배송 위치 추적, 결제 카드 정보 등)만 [AI답변불가] 처리.
- "본인이 AI라서 확인이 불가하다" 같은 표현 절대 금지.

[절대 금지 표현]
- "안됩니다", "절대 안됩니다" 절대 금지 → "어렵습니다", "어려울 수 있습니다"로 대체.
- "매니저 연결해드리겠습니다", "담당자에게 전달", "잠시만 기다려주세요" — 당신이 상담사이므로 다른 사람에게 넘기는 말 금지.
- "본인이 AI라서 확인이 불가하다" 금지 → "확인 후 안내해 드릴게요, 시간 소요 양해 부탁드립니다."
- 내부 시스템/도구 용어 노출 금지: "백오피스", "관리자 시스템", "어드민", "DB", "두발히어로", "스크래퍼", "캐시" 등 내부 용어 절대 언급 금지.
  → "확인해 본 결과", "고객님 계정으로 조회 시" 같은 고객 친화적 표현으로 대체.
- 과도한 책임 인정: "저희 잘못입니다", "전적으로 책임지겠습니다", "명백한 오류입니다" 금지.
- 감정 과잉 사과: "너무 죄송합니다… 정말 죄송합니다…", "깊이 사과드립니다" 같은 과한 톤 반복 금지.
- 고객 주장 그대로 인정: "말씀하신 대로입니다", "맞습니다, 저희 과실입니다" — 사실 확인 전 과실 인정 절대 금지.
- 단정/추측: "아마 ~일 것 같습니다", "~였던 것 같아요" 금지 → "확인해 본 결과", "~로 보입니다"로 대체.
- 공격/방어형: "저희는 그런 적 없습니다", "그건 고객님 과실입니다", "확인 안 하신 거 아닌가요?" 절대 금지.
- 애매한 책임 회피: "저희 쪽 문제는 아닌 것 같습니다" 금지 → "확인해 본 결과, ~은 확인되지 않았습니다"로 대체.`;

// ─── 답변 생성 프롬프트 빌더 (정확성 + 톤 가이드 통합) ───

// "지역" 맥락이 명확한 키워드만 — 이것만으로 서비스지역 조회 트리거
const SERVICE_AREA_KEYWORDS_STRICT = [
  "서비스지역", "서비스 지역", "수거 지역", "수거지역",
  "지역인가", "지역 인가",
  "불가 지역", "불가지역", "안되는 지역", "안되는지역",
  "되는 지역", "되는지역", "가능한 지역", "가능지역",
  "지역 확인", "지역확인",
  "어디까지", "어디 까지",
  "동 서비스", "구 서비스", "시 서비스",
];

// "가능/이용" 계열 — 주소 패턴이 함께 있을 때만 트리거 (단독 시 품목 문의와 혼동)
const SERVICE_AREA_KEYWORDS_LOOSE = [
  "이용 가능", "이용가능", "서비스 가능", "서비스가능",
  "배달 가능", "배달가능", "수거 가능", "수거가능",
  "가능한가", "가능 한가",
];

// 주소 패턴: "OO구 OO동", "OO시 OO동" 등 지역명이 포함된 문의
const ADDRESS_PATTERN = /[가-힣]{1,4}(시|구|군)\s*[가-힣]{1,5}(동|읍|면)/;

function isServiceAreaQuery(message: string): boolean {
  // 1. "서비스 지역", "수거 지역" 등 명확한 키워드 → 바로 트리거
  if (SERVICE_AREA_KEYWORDS_STRICT.some((kw) => message.includes(kw))) return true;
  // 2. 주소 패턴이 있으면 → 트리거 (주소를 직접 언급한 경우)
  if (ADDRESS_PATTERN.test(message)) return true;
  // 3. "수거 가능", "이용 가능" 등 느슨한 키워드 + "지역/동/구" 맥락 → 트리거
  if (SERVICE_AREA_KEYWORDS_LOOSE.some((kw) => message.includes(kw)) && /지역|동\s|구\s|[가-힣]+동|[가-힣]+구/.test(message)) return true;
  return false;
}

async function getServiceAreaInfo(message: string): Promise<string | undefined> {
  if (!isServiceAreaQuery(message)) return undefined;
  try {
    const result = await lookupServiceArea(message);
    return `조회 주소: ${result.normalized_address ?? message}\n서비스 가능: ${result.available ? "예" : "아니오"}\n${result.message}${result.pickup_days ? `\n수거 요일: ${result.pickup_days}` : ""}`;
  } catch {
    return undefined;
  }
}

// ─── 고객 컨텍스트 (백오피스 데이터) ───

export interface CustomerContext {
  name?: string;
  grade?: string;
  isSubscriber?: boolean;
  subscriptionDate?: string;
  address?: string;
  totalOrders?: string;
  validOrders?: string;
  recentOrders?: Array<{ date: string; orderName: string; status: string; weight: string }>;
  activeOrders?: Array<{ orderId: string; orderName: string; status: string; pickupDate: string; address: string }>;
  deliveries?: Array<{ bookId: string; status: number; receivedDate: string | null; deliveredDate: string | null; address: string | null; allocatedDate: string | null }>;
}

function buildCustomerContextBlock(ctx?: CustomerContext): string {
  if (!ctx) return "";
  const lines: string[] = [];
  if (ctx.name) lines.push(`이름: ${ctx.name}`);
  if (ctx.grade) lines.push(`등급: ${ctx.grade}`);
  if (ctx.isSubscriber) lines.push(`구독: 구독중${ctx.subscriptionDate ? ` (${ctx.subscriptionDate})` : ""}`);
  else if (ctx.isSubscriber === false) lines.push("구독: 미구독");
  if (ctx.address) lines.push(`주소: ${ctx.address}`);
  if (ctx.totalOrders) lines.push(`총 주문: ${ctx.totalOrders}건`);
  if (ctx.validOrders) lines.push(`유효 주문: ${ctx.validOrders}건`);
  if (ctx.activeOrders?.length) {
    lines.push("진행 중 주문:");
    lines.push("  (유형: '쓰레기 수거'=[수거], '일반 커버링 봉투'=[봉투배송](배송만, 수거없음). 대형봉투는 이 목록에 없고 별도 배송 내역에서만 확인)");
    for (const o of ctx.activeOrders) {
      const isBagDelivery = /봉투/.test(o.orderName);
      const typeLabel = isBagDelivery ? "[봉투배송]" : "[수거]";
      lines.push(`  - ${o.orderId} | ${typeLabel} ${o.orderName} | ${o.status} | 방문예정: ${o.pickupDate}${o.address ? ` | ${o.address}` : ""}`);
    }
    lines.push("  (방문예정일 오후 10시 이후~익일 새벽 사이에 진행)");
  }
  if (ctx.recentOrders?.length) {
    lines.push("최근 주문:");
    lines.push("  (유형: '쓰레기 수거'=[수거], '일반 커버링 봉투'=[봉투배송](배송만, 수거없음). 대형봉투는 이 목록에 없고 별도 배송 내역에서만 확인)");
    for (const o of ctx.recentOrders) {
      const isBagDelivery = /봉투/.test(o.orderName);
      const typeLabel = isBagDelivery ? "[봉투배송]" : "[수거]";
      lines.push(`  - ${o.date} | ${typeLabel} ${o.orderName} | ${o.status}${o.weight ? ` | ${o.weight}` : ""}`);
    }
  }
  // 배송 조회 결과
  const DSTATUS: Record<number, string> = { 0: "예약", 1: "수거배차", 2: "수거완료", 3: "입고완료", 4: "출고완료", 5: "배송완료", 6: "반송완료", 7: "분실완료", 8: "배송대기", 12: "배송연기" };
  if (ctx.deliveries?.length) {
    lines.push("봉투 배송 조회 결과:");
    for (const d of ctx.deliveries) {
      const status = DSTATUS[d.status] ?? `상태${d.status}`;
      lines.push(`  - ${d.bookId} | ${status} | 접수: ${d.receivedDate?.slice(0, 10) ?? "-"} | 배송완료: ${d.deliveredDate?.slice(0, 10) ?? "-"}${d.allocatedDate ? ` | 배차: ${d.allocatedDate.slice(0, 10)}` : ""}`);
    }
  } else if (ctx.deliveries !== undefined) {
    lines.push("봉투 배송 조회 결과: 해당 전화번호로 최근 14일 내 배송 내역 없음 (대형봉투 포함 조회됨)");
  }
  if (lines.length === 0) return "";
  return `\n## 고객 정보\n${lines.join("\n")}\n`;
}

function buildAnswerPrompt(params: {
  policySections: string;
  categoryRules?: string;
  customerMessage: string;
  recentTurns?: RecentTurn[];
  serviceAreaInfo?: string;
  hasManagerReply?: boolean;
  customerContext?: CustomerContext;
}): { system: string; userMessage: string } {
  const turnsBlock = params.recentTurns?.length
    ? `\n최근 대화:\n${params.recentTurns.map((t) => `${t.role === "user" ? "고객" : "매니저"}: ${t.text}`).join("\n")}\n`
    : "";

  const serviceAreaBlock = params.serviceAreaInfo
    ? `\n## 서비스 지역 조회 결과\n${params.serviceAreaInfo}\n위 조회 결과를 바탕으로 고객에게 서비스 가능 여부와 수거 요일을 안내해주세요.\n`
    : "";

  const customerBlock = buildCustomerContextBlock(params.customerContext);

  const categoryRulesBlock = params.categoryRules
    ? `\n## 카테고리 답변 규칙\n${params.categoryRules}\n`
    : "";

  const greetingRule = params.hasManagerReply
    ? "이미 대화 진행 중이므로 인사 없이 바로 본론."
    : '"안녕하세요 커버링입니다 !" 로 밝게 시작.';

  // 시스템 프롬프트 (캐시 가능 — 역할 규칙 + 정책 + 톤 가이드 + 답변 규칙)
  const system = `당신은 커버링(생활폐기물 야간 수거 서비스)의 **상담사**입니다. 고객과 직접 대화하는 당사자입니다.

## 중요: 역할 규칙
- 당신이 곧 상담사입니다. "매니저 연결해드리겠습니다", "담당자에게 전달하겠습니다", "잠시만 기다려주세요" 같은 **중간 전달자/봇 표현 절대 금지**.
- 고객의 질문에 직접 답변하세요. 다른 사람에게 넘기는 답변은 하지 마세요.
${categoryRulesBlock}
## 관련 정책
${params.policySections}

## 답변 규칙
- 고객이 물어본 것에만 정확히 답변한다. 물어보지 않은 추가 정보를 덧붙이지 않는다.
- 정책에서 관련 정보를 찾아 구체적 숫자/조건 포함.
- 매니저가 이미 답변한 내용은 반복하지 않기.
- 짧고 간결하게. 핵심만. 3~5문장이면 충분하다.
- 정책에 없는 내용을 추측하지 말 것. 고객이 잘못 알고 있는 정보(예: "봉투마다 기본요금 붙나요?")는 정책 기준으로 바로잡아줄 것.
- "매니저/담당자 연결", "확인 후 안내", "잠시만 기다려주세요" 등 전달자 표현 금지. 직접 답변할 것.
- 고객 정보가 제공된 경우, 해당 정보를 활용하여 구체적으로 답변할 것. (예: 구독 여부, 주문 상태, 배송 예정일, 수거 실패 사유 등)
- 고객 정보에 진행 중 주문/방문예정일/주문상태가 있으면 이를 근거로 답변한다. "계정 조회 필요"로 답변불가 처리하지 않는다.
- 고객 정보를 그대로 나열하지 말 것. 고객 질문에 필요한 정보만 자연스럽게 활용.
- 내부 시스템/도구 용어 노출 절대 금지: "백오피스", "관리자", "어드민", "DB", "두발히어로", "스크래퍼", "캐시", "시스템 조회" 등. → "확인해 본 결과", "고객님 계정으로 조회 시" 등으로 대체.
- 답변 불가능한 경우 (고객 정보에도 없는 건) → 반드시 아래 형식으로:
  [AI답변불가] 사유: ... / 문의 요약: ...

${TONE_GUIDE}

추가:
- ${greetingRule}`;

  // 유저 메시지 (매 호출 다름 — 캐시 불가)
  const userMessage = `${customerBlock}${serviceAreaBlock}${turnsBlock}
## 현재 고객 메시지
${params.customerMessage}

답변만 작성하세요:`;

  return { system, userMessage };
}

// ─── 스코어링 ───

function calcSimilarityScore(similarity: number): number {
  const { max, threshold } = SCORING_WEIGHTS.similarity;
  if (similarity <= threshold) return 0;
  return Math.round(((similarity - threshold) / (1 - threshold)) * max);
}

function calcTagScore(
  candidateTag: string | null,
  currentTags: string[]
): number {
  if (!candidateTag || currentTags.length === 0) return 0;
  const { exact, partial, topLevel } = SCORING_WEIGHTS.tag;

  for (const tag of currentTags) {
    if (tag === candidateTag) return exact;
    const tagParts = tag.split("/");
    const candParts = candidateTag.split("/");
    if (tagParts.length >= 2 && candParts.length >= 2) {
      if (tagParts[0] === candParts[0] && tagParts[1] === candParts[1]) {
        return partial;
      }
    }
    if (tagParts[0] === candParts[0]) return topLevel;
  }
  return 0;
}

function calcCategoryScore(
  candidateCategory: string | null,
  currentCategory: string
): number {
  if (!candidateCategory) return 0;
  return candidateCategory === currentCategory ? SCORING_WEIGHTS.category.exact : 0;
}

function scoreCandidate(
  match: ConsultationMatch,
  currentTags: string[],
  currentCategory: string
): ScoredCandidate {
  const similarityScore = calcSimilarityScore(match.similarity);
  const tagScore = calcTagScore(match.tag, currentTags);
  const categoryScore = calcCategoryScore(match.category, currentCategory);

  return {
    id: match.id,
    chatId: match.chat_id,
    questionText: match.question_text,
    answerText: match.answer_text,
    tag: match.tag,
    category: match.category,
    managerName: match.manager_name,
    similarity: match.similarity,
    similarityScore,
    tagScore,
    categoryScore,
    totalScore: similarityScore + tagScore + categoryScore,
    chatCreatedAt: match.chat_created_at,
  };
}

// ─── AI답변불가 감지 ───

function parseCannotAnswer(text: string): { canAnswer: false; reason: string; summary: string } | null {
  const match = text.match(/\[AI답변불가\]\s*사유:\s*(.+?)(?:\/|\n)\s*(?:문의\s*요약|고객\s*문의\s*요약):\s*([\s\S]+)/);
  if (match) {
    return {
      canAnswer: false,
      reason: match[1].trim(),
      summary: match[2].trim(),
    };
  }
  return null;
}

// ─── 정책문서 기반 답변 생성 (Step 3) ───

async function generatePolicyAnswer(params: {
  normalizedMessage: string;
  category: string;
  previousCategories: string[];
  recentTurns?: RecentTurn[];
  serviceAreaInfo?: string;
  customerContext?: CustomerContext;
}): Promise<{ candidate: ScoredCandidate; canAnswer: boolean; reason?: string; summary?: string } | null> {
  // 카테고리 프롬프트 로드 시도
  const categoryPrompt = await getCategoryPrompt(params.category);

  // 누적 정책 로드 (DB 카테고리 프롬프트 있으면 누적, 없으면 기존 방식)
  let policySections: string;
  if (categoryPrompt) {
    policySections = await getAccumulatedPolicySections(params.category, params.previousCategories);
  } else {
    policySections = getPolicySectionsForCategory(params.category);
  }

  const hasManagerReply = hasRealManagerReply(params.recentTurns);
  const serviceAreaInfo = params.serviceAreaInfo;

  const { system, userMessage } = buildAnswerPrompt({
    policySections,
    categoryRules: categoryPrompt?.prompt_rules,
    customerMessage: params.normalizedMessage,
    recentTurns: params.recentTurns,
    serviceAreaInfo,
    hasManagerReply,
    customerContext: params.customerContext,
  });

  try {
    const response = await cachedMessageCreate({ system, userMessage });

    const rawText = response.text;
    if (!rawText) return null;

    // AI답변불가 체크
    const cannotAnswer = parseCannotAnswer(rawText);
    if (cannotAnswer) {
      return {
        candidate: {
          id: -1,
          chatId: "policy-generated",
          questionText: params.normalizedMessage,
          answerText: `[AI답변 불가]\n사유: ${cannotAnswer.reason}\n문의 요약: ${cannotAnswer.summary}`,
          tag: null,
          category: params.category,
          managerName: "AI (답변불가)",
          similarity: 0,
          similarityScore: 0,
          tagScore: 0,
          categoryScore: 0,
          totalScore: 100,
          chatCreatedAt: null,
        },
        canAnswer: false,
        reason: cannotAnswer.reason,
        summary: cannotAnswer.summary,
      };
    }

    // 톤 가이드가 buildAnswerPrompt에 포함되어 Sonnet이 바로 톤 적용된 답변 생성
    return {
      candidate: {
        id: -1,
        chatId: "policy-generated",
        questionText: params.normalizedMessage,
        answerText: rawText.trim(),
        tag: null,
        category: params.category,
        managerName: "AI (정책문서)",
        similarity: 0,
        similarityScore: 0,
        tagScore: 0,
        categoryScore: 0,
        totalScore: 100,
        chatCreatedAt: null,
      },
      canAnswer: true,
    };
  } catch (err) {
    console.error("[suggest] 정책 기반 답변 생성 실패:", err);
    return null;
  }
}

// ─── 정책문서 기반 직접 답변 (policy-only 모드) ───

export async function generatePolicyAnswerDirect(params: {
  customerMessage: string;
  chatTags?: string[];
  recentTurns?: RecentTurn[];
  previousCategories?: string[];
  skipPolicy?: boolean;
  classifyModel?: string;
  customerContext?: CustomerContext;
}): Promise<{ answer: string; normalizedMessage: string; source: "ai"; classifiedCategory: string; canAnswer: boolean; reason?: string; timings?: Record<string, number> }> {
  const startTime = Date.now();
  const timings: Record<string, number> = {};

  const t1 = Date.now();
  const classifyResult = await normalizeAndClassify({
    currentMessage: params.customerMessage,
    recentTurns: params.recentTurns,
    classifyModel: params.classifyModel,
  });
  const { category } = classifyResult;
  timings["1_classify"] = Date.now() - t1;

  const categoryPrompt = await getCategoryPrompt(category);
  let policySections: string;
  if (params.skipPolicy) {
    policySections = "(정책 섹션 생략 — 카테고리 프롬프트 규칙만 사용)";
  } else if (categoryPrompt) {
    policySections = await getAccumulatedPolicySections(category, params.previousCategories ?? []);
  } else {
    policySections = getPolicySectionsForCategory(category);
  }

  const hasManagerReply = hasRealManagerReply(params.recentTurns);

  const t2 = Date.now();
  const serviceAreaInfo = await getServiceAreaInfo(params.customerMessage);
  timings["2_serviceArea"] = Date.now() - t2;

  const { system, userMessage } = buildAnswerPrompt({
    policySections,
    categoryRules: categoryPrompt?.prompt_rules,
    customerMessage: params.customerMessage,
    recentTurns: params.recentTurns,
    serviceAreaInfo,
    hasManagerReply,
    customerContext: params.customerContext,
  });

  try {
    const t3 = Date.now();
    const response = await cachedMessageCreate({ system, userMessage });
    timings["3_policy_answer"] = Date.now() - t3;

    const rawText = response.text;

    // AI답변불가 체크
    const cannotAnswer = parseCannotAnswer(rawText);
    timings["total"] = Date.now() - startTime;
    console.log("[suggest:policy-only] timings:", JSON.stringify(timings));

    if (cannotAnswer) {
      return {
        answer: `[AI답변 불가]\n사유: ${cannotAnswer.reason}\n문의 요약: ${cannotAnswer.summary}`,
        normalizedMessage: params.customerMessage,
        source: "ai",
        classifiedCategory: category,
        canAnswer: false,
        reason: cannotAnswer.reason,
        timings,
      };
    }

    return {
      answer: rawText.trim(),
      normalizedMessage: params.customerMessage,
      source: "ai",
      classifiedCategory: category,
      canAnswer: true,
      timings,
    };
  } catch (err) {
    console.error("[suggest] 정책 직접 답변 실패:", err);
    timings["total"] = Date.now() - startTime;
    return {
      answer: "답변 생성에 실패했습니다.",
      normalizedMessage: params.customerMessage,
      source: "ai",
      classifiedCategory: category,
      canAnswer: true,
      timings,
    };
  }
}

// ─── 1회 호출 통합 모드 (분류+답변 합침) ───

export async function generateCombinedAnswer(params: {
  customerMessage: string;
  chatTags?: string[];
  recentTurns?: RecentTurn[];
  customerContext?: CustomerContext;
}): Promise<{ answer: string; normalizedMessage: string; source: "ai"; classifiedCategory: string; canAnswer: boolean; reason?: string; timings?: Record<string, number> }> {
  const startTime = Date.now();
  const timings: Record<string, number> = {};

  // 정책문서 전체 로드 (캐시됨)
  const { loadPolicyDocument } = await import("./validate");
  const policyDoc = loadPolicyDocument();

  // 카테고리 목록
  const { CATEGORIES } = await import("./normalize");
  const categoryList = CATEGORIES.join(", ");

  const hasManagerReply = hasRealManagerReply(params.recentTurns);
  const turnsBlock = params.recentTurns?.length
    ? `\n최근 대화:\n${params.recentTurns.map((t) => `${t.role === "user" ? "고객" : "매니저"}: ${t.text}`).join("\n")}\n`
    : "";

  const greetingRule = hasManagerReply
    ? "이미 대화 진행 중이므로 인사 없이 바로 본론."
    : '"안녕하세요 커버링입니다 !" 로 밝게 시작.';

  // 시스템 프롬프트 (캐시 가능 — 정책 + 톤 가이드 + 카테고리 목록)
  const combinedSystem = `당신은 커버링(생활폐기물 야간 수거 서비스)의 **상담사**입니다. 고객과 직접 대화하는 당사자입니다.

## 중요: 역할 규칙
- 당신이 곧 상담사입니다. "매니저 연결해드리겠습니다", "담당자에게 전달하겠습니다", "잠시만 기다려주세요" 같은 **중간 전달자/봇 표현 절대 금지**.
- 고객의 질문에 직접 답변하세요. 다른 사람에게 넘기는 답변은 하지 마세요.

## 전체 정책 문서
${policyDoc}

${TONE_GUIDE}

## 지시사항
1. 고객 메시지를 아래 카테고리 중 하나로 분류하세요:
${categoryList}

2. 분류한 카테고리의 관련 정책을 참고하여 답변을 작성하세요.

## 답변 규칙
- 고객이 물어본 것에만 정확히 답변. 물어보지 않은 추가 정보 금지.
- 정책에서 관련 정보를 찾아 구체적 숫자/조건 포함.
- 짧고 간결하게. 3~5문장.
- 정책에 없는 내용을 추측하지 말 것. 고객이 잘못 알고 있는 정보(예: "봉투마다 기본요금 붙나요?")는 정책 기준으로 바로잡아줄 것.
- ${greetingRule}
- "매니저/담당자 연결", "확인 후 안내", "잠시만 기다려주세요" 등 전달자 표현 금지. 직접 답변할 것.
- 고객 정보가 제공된 경우, 해당 정보를 활용하여 구체적으로 답변할 것. 진행 중 주문/방문예정일/주문상태가 있으면 이를 근거로 답변한다. "계정 조회 필요"로 답변불가 처리하지 않는다.
- 고객 정보를 그대로 나열하지 말고 질문에 필요한 정보만 자연스럽게 활용.
- 내부 시스템/도구 용어 노출 절대 금지: "백오피스", "관리자", "어드민", "DB", "두발히어로", "스크래퍼", "캐시", "시스템 조회" 등. → "확인해 본 결과", "고객님 계정으로 조회 시" 등으로 대체.
- 답변 불가능한 경우 (고객 정보에도 없는 건) → [AI답변불가] 사유: ... / 문의 요약: ...

응답 형식 (JSON만, 설명 없이):
{"category": "카테고리명", "answer": "고객에게 보낼 답변"}`;

  // 유저 메시지 (매 호출 다름)
  const customerBlock = buildCustomerContextBlock(params.customerContext);
  const combinedUserMessage = `${customerBlock}${turnsBlock}
## 고객 메시지
${params.customerMessage}`;

  try {
    const t1 = Date.now();
    const response = await cachedMessageCreate({ system: combinedSystem, userMessage: combinedUserMessage });
    timings["1_combined"] = Date.now() - t1;

    const rawText = response.text;

    // JSON 파싱
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    let category = "기타";
    let answer = rawText.trim();

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        category = parsed.category || "기타";
        answer = parsed.answer || rawText.trim();
      } catch {
        // JSON 파싱 실패 시 원문 사용
      }
    }

    // AI답변불가 체크
    const cannotAnswer = parseCannotAnswer(answer);
    timings["total"] = Date.now() - startTime;
    console.log("[suggest:combined] timings:", JSON.stringify(timings));

    if (cannotAnswer) {
      return {
        answer: `[AI답변 불가]\n사유: ${cannotAnswer.reason}\n문의 요약: ${cannotAnswer.summary}`,
        normalizedMessage: params.customerMessage,
        source: "ai",
        classifiedCategory: category,
        canAnswer: false,
        reason: cannotAnswer.reason,
        timings,
      };
    }

    return {
      answer,
      normalizedMessage: params.customerMessage,
      source: "ai",
      classifiedCategory: category,
      canAnswer: true,
      timings,
    };
  } catch (err) {
    console.error("[suggest] 통합 답변 실패:", err);
    timings["total"] = Date.now() - startTime;
    return {
      answer: "답변 생성에 실패했습니다.",
      normalizedMessage: params.customerMessage,
      source: "ai",
      classifiedCategory: "기타",
      canAnswer: true,
      timings,
    };
  }
}

// ─── AI 초안 → 인간 답변 매칭 (ai-then-human 모드) ───

export async function generateAiThenHuman(params: {
  customerMessage: string;
  chatTags?: string[];
  recentTurns?: RecentTurn[];
  previousCategories?: string[];
}): Promise<{
  answer: string;
  aiDraft: string;
  source: "human" | "ai";
  similarity?: number;
  matchedQuestion?: string;
  classifiedCategory: string;
}> {
  const classifyResult = await normalizeAndClassify({
    currentMessage: params.customerMessage,
    recentTurns: params.recentTurns,
  });
  const { category } = classifyResult;

  const categoryPrompt = await getCategoryPrompt(category);
  let policySections: string;
  if (categoryPrompt) {
    policySections = await getAccumulatedPolicySections(category, params.previousCategories ?? []);
  } else {
    policySections = getPolicySectionsForCategory(category);
  }

  const hasManagerReply = hasRealManagerReply(params.recentTurns);
  const serviceAreaInfo = await getServiceAreaInfo(params.customerMessage);

  const { system, userMessage } = buildAnswerPrompt({
    policySections,
    categoryRules: categoryPrompt?.prompt_rules,
    customerMessage: params.customerMessage,
    recentTurns: params.recentTurns,
    serviceAreaInfo,
    hasManagerReply,
  });

  let aiDraft = "";
  try {
    const response = await cachedMessageCreate({ system, userMessage });
    aiDraft = response.text.trim();
  } catch (err) {
    console.error("[suggest] AI 초안 생성 실패:", err);
    return { answer: "답변 생성에 실패했습니다.", aiDraft: "", source: "ai", classifiedCategory: category };
  }

  if (!aiDraft) {
    return { answer: "답변 생성에 실패했습니다.", aiDraft: "", source: "ai", classifiedCategory: category };
  }

  // AI 초안을 임베딩 → 유사 인간 답변 검색
  const draftEmbedding = await embedText(aiDraft);
  if (!draftEmbedding) {
    return { answer: aiDraft, aiDraft, source: "ai", classifiedCategory: category };
  }

  const { data: matches } = await supabase.rpc("match_consultations", {
    query_embedding: JSON.stringify(draftEmbedding),
    match_threshold: 0.75,
    match_count: 5,
  });

  if (matches && matches.length > 0) {
    const filteredTags = filterInputTags(params.chatTags || []);
    const scored = (matches as ConsultationMatch[])
      .map((m) => scoreCandidate(m, filteredTags, category))
      .sort((a, b) => b.totalScore - a.totalScore);

    const best = scored[0];
    if (best && best.similarity >= 0.75) {
      return {
        answer: best.answerText,
        aiDraft,
        source: "human",
        similarity: best.similarity,
        matchedQuestion: best.questionText,
        classifiedCategory: category,
      };
    }
  }

  return { answer: aiDraft, aiDraft, source: "ai", classifiedCategory: category };
}

// ─── AI 초안 → 매크로 매칭 (macro-match 모드) ───

interface MacroMatch {
  id: number;
  macro_name: string;
  macro_category: string;
  content: string;
  tag: string | null;
  similarity: number;
}

export async function generateMacroAnswer(params: {
  customerMessage: string;
  recentTurns?: RecentTurn[];
  previousCategories?: string[];
}): Promise<{
  answer: string;
  aiDraft: string;
  source: "macro" | "ai";
  macroName?: string;
  similarity?: number;
  topMatches?: Array<{ name: string; similarity: number; content: string }>;
  classifiedCategory: string;
}> {
  const classifyResult = await normalizeAndClassify({
    currentMessage: params.customerMessage,
    recentTurns: params.recentTurns,
  });
  const { category } = classifyResult;

  const categoryPrompt = await getCategoryPrompt(category);
  let policySections: string;
  if (categoryPrompt) {
    policySections = await getAccumulatedPolicySections(category, params.previousCategories ?? []);
  } else {
    policySections = getPolicySectionsForCategory(category);
  }

  const hasManagerReply = hasRealManagerReply(params.recentTurns);
  const serviceAreaInfo = await getServiceAreaInfo(params.customerMessage);

  const { system: macroSystem, userMessage: macroUserMessage } = buildAnswerPrompt({
    policySections,
    categoryRules: categoryPrompt?.prompt_rules,
    customerMessage: params.customerMessage,
    recentTurns: params.recentTurns,
    serviceAreaInfo,
    hasManagerReply,
  });

  let aiDraft = "";
  try {
    const response = await cachedMessageCreate({ system: macroSystem, userMessage: macroUserMessage });
    aiDraft = response.text.trim();
  } catch (err) {
    console.error("[suggest] AI 초안 생성 실패:", err);
    return { answer: "답변 생성에 실패했습니다.", aiDraft: "", source: "ai", classifiedCategory: category };
  }

  if (!aiDraft) {
    return { answer: "답변 생성에 실패했습니다.", aiDraft: "", source: "ai", classifiedCategory: category };
  }

  const draftEmbedding = await embedText(aiDraft);
  if (!draftEmbedding) {
    return { answer: aiDraft, aiDraft, source: "ai", classifiedCategory: category };
  }

  const { data: matches, error } = await supabase.rpc("match_macros", {
    query_embedding: JSON.stringify(draftEmbedding),
    match_threshold: 0.5,
    match_count: 5,
  });

  if (error) {
    console.error("[suggest] 매크로 검색 오류:", error.message);
    return { answer: aiDraft, aiDraft, source: "ai", classifiedCategory: category };
  }

  const topMatches = (matches as MacroMatch[] || []).map((m) => ({
    name: m.macro_name,
    similarity: m.similarity,
    content: m.content.substring(0, 200) + (m.content.length > 200 ? "..." : ""),
  }));

  if (!matches || matches.length === 0) {
    return { answer: aiDraft, aiDraft, source: "ai", topMatches, classifiedCategory: category };
  }

  const best = matches[0] as MacroMatch;

  if (best.similarity >= 0.65) {
    return {
      answer: best.content,
      aiDraft,
      source: "macro",
      macroName: best.macro_name,
      similarity: best.similarity,
      topMatches,
      classifiedCategory: category,
    };
  }

  return {
    answer: aiDraft,
    aiDraft,
    source: "ai",
    macroName: best.macro_name,
    similarity: best.similarity,
    topMatches,
    classifiedCategory: category,
  };
}

// ─── 메인 추천 함수 (default 모드) ───

export async function suggestAnswers(params: {
  customerMessage: string;
  chatTags: string[];
  recentTurns?: RecentTurn[];
  previousCategories?: string[];
  skipValidation?: boolean;
  debug?: boolean;
  skipNormalize?: boolean;
}): Promise<SuggestResult> {
  const startTime = Date.now();
  const timings: Record<string, number> = {};
  const filteredTags = filterInputTags(params.chatTags);
  const previousCategories = params.previousCategories ?? [];

  // Step 1: 메시지 정제 + 카테고리 분류 (Sonnet)
  let normalizedMessage: string;
  let category: string;

  const t1 = Date.now();
  if (params.skipNormalize) {
    normalizedMessage = params.customerMessage;
    category = "기타";
  } else {
    const result = await normalizeAndClassify({
      currentMessage: params.customerMessage,
      recentTurns: params.recentTurns,
    });
    normalizedMessage = result.normalizedMessage;
    category = result.category;
  }
  timings["1_classify"] = Date.now() - t1;

  const accumulatedCategories = [...new Set([...previousCategories, category])];

  // Step 2: 임베딩 + 서비스지역 병렬 실행
  const t2 = Date.now();
  const [embedding, serviceAreaInfo] = await Promise.all([
    embedText(normalizedMessage),
    getServiceAreaInfo(params.customerMessage), // 원본 메시지로 키워드 감지 (정규화하면 키워드 소실)
  ]);
  timings["2_embed+serviceArea"] = Date.now() - t2;

  if (!embedding) {
    console.log("[suggest] timings:", timings, "total:", Date.now() - startTime, "ms");
    return {
      suggestions: [],
      classifiedCategory: category,
      normalizedMessage,
      canAnswer: true,
      accumulatedCategories,
    };
  }

  // Step 2b: pgvector 검색
  const t2b = Date.now();
  const { data: matches, error } = await supabase.rpc("match_consultations", {
    query_embedding: JSON.stringify(embedding),
    match_threshold: SCORING_WEIGHTS.similarity.threshold,
    match_count: 20,
  });
  timings["2b_rag_search"] = Date.now() - t2b;

  if (error || !matches || matches.length === 0) {
    if (error) console.error("[suggest] RPC 오류:", error.message);
    return {
      suggestions: [],
      classifiedCategory: category,
      normalizedMessage,
      canAnswer: true,
      accumulatedCategories,
    };
  }

  // Step 2: 스코어링
  const allScored = (matches as ConsultationMatch[])
    .map((m) => scoreCandidate(m, filteredTags, category))
    .sort((a, b) => b.totalScore - a.totalScore);

  const scored = allScored
    .filter((s) => s.totalScore >= SCORING_WEIGHTS.minTotalScore)
    .slice(0, 3);

  // Step 3: 검색 결과 퀄리티가 낮으면 정책문서 기반 답변 생성 (Sonnet + Haiku 톤)
  const topScore = scored.length > 0 ? scored[0].totalScore : 0;
  let policyResult: { candidate: ScoredCandidate; canAnswer: boolean; reason?: string; summary?: string } | null = null;

  if (topScore < POLICY_ANSWER_THRESHOLD) {
    const t3 = Date.now();
    policyResult = await generatePolicyAnswer({
      normalizedMessage,
      category,
      previousCategories,
      recentTurns: params.recentTurns,
      serviceAreaInfo,
    });
    timings["3_policy_answer"] = Date.now() - t3;
  }

  const finalSuggestions = policyResult
    ? [policyResult.candidate, ...scored.slice(0, 2)]
    : scored;

  // 톤 가이드가 buildAnswerPrompt에 포함되어 별도 Haiku 호출 불필요
  // RAG 후보는 이미 실제 상담사 답변이므로 톤 리라이팅 불필요
  const suggestionsWithValidation = finalSuggestions.map((s) => ({
    ...s,
    validation: { isValid: true, confidence: 100, issues: [] as string[] },
  }));

  timings["total"] = Date.now() - startTime;
  console.log("[suggest] timings:", JSON.stringify(timings));

  const debugInfo = params.debug
    ? {
        allCandidates: allScored,
        inputTags: filteredTags,
        embeddingDimension: embedding.length,
        matchCount: matches.length,
        processingTimeMs: Date.now() - startTime,
        timings,
      }
    : undefined;

  if (finalSuggestions.length === 0) {
    return {
      suggestions: [],
      classifiedCategory: category,
      normalizedMessage,
      canAnswer: true,
      accumulatedCategories,
      timings,
      debug: debugInfo,
    };
  }

  return {
    suggestions: suggestionsWithValidation,
    classifiedCategory: category,
    normalizedMessage,
    canAnswer: policyResult ? policyResult.canAnswer : true,
    reason: policyResult?.reason,
    summary: policyResult?.summary,
    accumulatedCategories,
    timings,
    debug: debugInfo,
  };
}

// ─── 스트리밍 버전 (실시간 파이프라인 표시용) ───

export type PipelineStep = {
  step: string;
  status: "running" | "done" | "skipped" | "error";
  label: string;
  duration?: number;
  data?: Record<string, unknown>;
};

export async function suggestAnswersStreaming(
  params: {
    customerMessage: string;
    chatTags: string[];
    recentTurns?: RecentTurn[];
    previousCategories?: string[];
  },
  emit: (event: PipelineStep) => void,
): Promise<SuggestResult> {
  const startTime = Date.now();
  const timings: Record<string, number> = {};
  const filteredTags = filterInputTags(params.chatTags);
  const previousCategories = params.previousCategories ?? [];

  // Step 1: 분류
  emit({ step: "classify", status: "running", label: "메시지 정제 + 카테고리 분류 (Sonnet)" });
  const t1 = Date.now();
  const result = await normalizeAndClassify({
    currentMessage: params.customerMessage,
    recentTurns: params.recentTurns,
  });
  const { normalizedMessage, category } = result;
  timings["1_classify"] = Date.now() - t1;
  emit({
    step: "classify", status: "done", label: "메시지 정제 + 카테고리 분류",
    duration: timings["1_classify"],
    data: { normalizedMessage, category, original: params.customerMessage },
  });

  const accumulatedCategories = [...new Set([...previousCategories, category])];

  // Step 2: 임베딩 + 서비스지역 병렬
  emit({ step: "embed", status: "running", label: "Voyage 임베딩 + 서비스지역 조회" });
  const t2 = Date.now();
  const [embedding, serviceAreaInfo] = await Promise.all([
    embedText(normalizedMessage),
    getServiceAreaInfo(params.customerMessage),
  ]);
  timings["2_embed+serviceArea"] = Date.now() - t2;
  emit({
    step: "embed", status: "done", label: "임베딩 + 서비스지역",
    duration: timings["2_embed+serviceArea"],
    data: {
      embeddingDim: embedding?.length ?? 0,
      serviceArea: serviceAreaInfo ?? "해당없음",
    },
  });

  if (!embedding) {
    timings["total"] = Date.now() - startTime;
    emit({ step: "done", status: "done", label: "완료 (임베딩 실패)", duration: timings["total"] });
    return { suggestions: [], classifiedCategory: category, normalizedMessage, canAnswer: true, accumulatedCategories, timings };
  }

  // Step 2b: RAG 검색
  emit({ step: "rag", status: "running", label: "pgvector RAG 검색" });
  const t2b = Date.now();
  const { data: matches, error } = await supabase.rpc("match_consultations", {
    query_embedding: JSON.stringify(embedding),
    match_threshold: SCORING_WEIGHTS.similarity.threshold,
    match_count: 20,
  });
  timings["2b_rag_search"] = Date.now() - t2b;

  if (error || !matches || matches.length === 0) {
    emit({
      step: "rag", status: error ? "error" : "done", label: "RAG 검색",
      duration: timings["2b_rag_search"],
      data: { matchCount: 0, error: error?.message },
    });
  } else {
    // 스코어링
    const allScored = (matches as ConsultationMatch[])
      .map((m) => scoreCandidate(m, filteredTags, category))
      .sort((a, b) => b.totalScore - a.totalScore);

    const top3 = allScored.slice(0, 3);
    emit({
      step: "rag", status: "done", label: "RAG 검색 + 스코어링",
      duration: timings["2b_rag_search"],
      data: {
        matchCount: matches.length,
        topScores: top3.map((s) => ({ score: s.totalScore, question: s.questionText?.substring(0, 60) })),
      },
    });

    const scored = allScored
      .filter((s) => s.totalScore >= SCORING_WEIGHTS.minTotalScore)
      .slice(0, 3);

    const topScore = scored.length > 0 ? scored[0].totalScore : 0;

    // Step 3: 정책 답변 (RAG 점수 낮으면)
    let policyResult: { candidate: ScoredCandidate; canAnswer: boolean; reason?: string; summary?: string } | null = null;

    if (topScore < POLICY_ANSWER_THRESHOLD) {
      emit({
        step: "policy", status: "running",
        label: `정책 기반 답변 생성 (RAG top=${topScore} < ${POLICY_ANSWER_THRESHOLD})`,
      });
      const t3 = Date.now();
      policyResult = await generatePolicyAnswer({
        normalizedMessage, category, previousCategories,
        recentTurns: params.recentTurns, serviceAreaInfo,
      });
      timings["3_policy_answer"] = Date.now() - t3;
      emit({
        step: "policy", status: "done", label: "정책 기반 답변 생성",
        duration: timings["3_policy_answer"],
        data: {
          canAnswer: policyResult?.canAnswer ?? true,
          reason: policyResult?.reason,
          answerPreview: policyResult?.candidate.answerText?.substring(0, 100),
        },
      });
    } else {
      emit({
        step: "policy", status: "skipped",
        label: `RAG 점수 충분 (top=${topScore} ≥ ${POLICY_ANSWER_THRESHOLD})`,
        data: { topScore, answerPreview: scored[0]?.answerText?.substring(0, 100) },
      });
    }

    const finalSuggestions = policyResult
      ? [policyResult.candidate, ...scored.slice(0, 2)]
      : scored;

    const suggestionsWithValidation = finalSuggestions.map((s) => ({
      ...s,
      validation: { isValid: true, confidence: 100, issues: [] as string[] },
    }));

    timings["total"] = Date.now() - startTime;
    emit({ step: "done", status: "done", label: "파이프라인 완료", duration: timings["total"] });

    return {
      suggestions: suggestionsWithValidation,
      classifiedCategory: category,
      normalizedMessage,
      canAnswer: policyResult ? policyResult.canAnswer : true,
      reason: policyResult?.reason,
      summary: policyResult?.summary,
      accumulatedCategories,
      timings,
    };
  }

  // RAG 실패 시 정책 답변으로 폴백
  emit({ step: "policy", status: "running", label: "정책 기반 답변 생성 (RAG 결과 없음)" });
  const t3 = Date.now();
  const policyResult = await generatePolicyAnswer({
    normalizedMessage, category, previousCategories,
    recentTurns: params.recentTurns, serviceAreaInfo,
  });
  timings["3_policy_answer"] = Date.now() - t3;
  emit({
    step: "policy", status: "done", label: "정책 기반 답변 생성",
    duration: timings["3_policy_answer"],
    data: { canAnswer: policyResult?.canAnswer ?? true, answerPreview: policyResult?.candidate.answerText?.substring(0, 100) },
  });

  timings["total"] = Date.now() - startTime;
  emit({ step: "done", status: "done", label: "파이프라인 완료", duration: timings["total"] });

  const finalSuggestions = policyResult ? [policyResult.candidate] : [];
  const suggestionsWithValidation = finalSuggestions.map((s) => ({
    ...s,
    validation: { isValid: true, confidence: 100, issues: [] as string[] },
  }));

  return {
    suggestions: suggestionsWithValidation,
    classifiedCategory: category,
    normalizedMessage,
    canAnswer: policyResult ? policyResult.canAnswer : true,
    reason: policyResult?.reason,
    summary: policyResult?.summary,
    accumulatedCategories,
    timings,
  };
}
