import { SYSTEM_PROMPT } from "./prompt";
import { Phase, CollectedInfo } from "./phases";
import { buildSystemBlocks, type SystemBlock } from "./prompt-blocks";
import { createMessage } from "./ai-client";
import { withRetry } from "@/lib/utils/with-retry";
import { supabase } from "@/lib/supabase/client";
import { normalizeItems, type RawItem } from "@/lib/utils/item-normalizer";

/**
 * AI 응답에서 JSON 객체/배열을 안전하게 추출 (Anthropic + OpenAI 호환)
 * GPT는 코드블록, 설명 텍스트, markdown 등을 함께 출력하는 경향이 있음
 */
function extractJSONFromResponse(text: string, type: "object" | "array" = "object"): string {
  let t = text.trim();

  // 1) markdown 코드블록 내부 추출 (```json ... ``` 또는 ``` ... ```)
  const codeBlockMatch = t.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    t = codeBlockMatch[1].trim();
  }

  // 2) 직접 JSON 파싱 시도
  try {
    JSON.parse(t);
    return t;
  } catch { /* continue */ }

  // 3) 텍스트에서 JSON 객체/배열 추출
  if (type === "array") {
    const arrMatch = t.match(/\[[\s\S]*\]/);
    if (arrMatch) return arrMatch[0];
  } else {
    const objMatch = t.match(/\{[\s\S]*\}/);
    if (objMatch) return objMatch[0];
  }

  return t;
}

/** app_settings에서 extraction_model 설정값 조회 (기본: sonnet) */
async function getExtractionModel(): Promise<string> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "extraction_model")
      .single();
    const key = data?.value as string;
    return key === "haiku" ? "haiku" : "sonnet";
  } catch {
    return "sonnet";
  }
}

interface SessionMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIResponseResult {
  response: string;
  intent: "AUTO_REPLY" | "NEED_HUMAN" | "CANCEL";
}

const INTENT_INSTRUCTION = `

## 의도 분류 (응답 맨 앞에 태그로 출력)
응답 본문을 작성하기 전에, 고객 메시지의 의도를 분류하여 태그로 출력하세요:
- <intent>NEED_HUMAN</intent> — 결제/환불/클레임/법적문의/특수폐기물 등 상담사 필요
- <intent>CANCEL</intent> — 진행 거부, 취소, 비싸다, 다음에 등 이탈 의사
- <intent>AUTO_REPLY</intent> — 그 외 일반 문의
반드시 응답 맨 첫 줄에 위 태그 중 하나를 출력한 후, 그 다음 줄부터 응답 본문을 작성하세요.`;

export async function generateAIResponse(
  userMessage: string,
  history: SessionMessage[],
  imageUrl?: string,
  quoteContext?: string,
  phase?: Phase,
  collectedInfo?: CollectedInfo,
  autoMode?: boolean,
  outOfServiceArea?: boolean,
  wfConfig?: Record<string, unknown>
): Promise<AIResponseResult> {
  const model = "claude-sonnet-4-6";

  // 시스템 프롬프트: Phase가 있으면 캐싱 블록 사용, 없으면 폴백
  let systemBlocks: SystemBlock[];

  if (phase && collectedInfo) {
    // Phase별 조합형 프롬프트 (캐싱 적용)
    const blocks = buildSystemBlocks(phase, collectedInfo, quoteContext, autoMode, outOfServiceArea, wfConfig);
    // intent 분류 지시를 마지막 동적 블록에 추가
    blocks[blocks.length - 1].text += INTENT_INSTRUCTION;
    systemBlocks = blocks;
  } else {
    // 폴백: 단일 프롬프트 (이미지 분석 등)
    let fallbackPrompt = SYSTEM_PROMPT;
    if (quoteContext) {
      fallbackPrompt += `\n\n## 현재 견적 정보 (시스템 자동 산출)\n${quoteContext}\n\n위 견적 데이터가 있으므로 "확인 후 안내드리겠습니다" 같은 대기 메시지 대신, 바로 품목명/수량/금액을 포함한 견적 안내 메시지를 작성해. Case 1 형식을 참고해.\n중요: 반드시 위 견적 데이터의 품목명과 금액만 사용해. 임의로 가격을 추정하거나 견적에 없는 품목의 가격을 만들어내지 마.`;
    }
    fallbackPrompt += INTENT_INSTRUCTION;
    systemBlocks = [
      { type: "text", text: fallbackPrompt, cache_control: { type: "ephemeral" } },
    ];
  }

  const messages: { role: "user" | "assistant"; content: string | unknown[] }[] = history.map((h) => ({
    role: h.role,
    content: h.content,
  }));

  if (imageUrl) {
    messages.push({
      role: "user",
      content: [
        { type: "image", source: { type: "url", url: imageUrl } },
        { type: "text", text: userMessage || "이 사진의 폐기물 품목을 확인해주세요." },
      ],
    });
  } else {
    messages.push({ role: "user", content: userMessage });
  }

  const apiResponse = await withRetry(() =>
    createMessage({
      model,
      max_tokens: 1024,
      system: systemBlocks,
      messages: messages as { role: "user" | "assistant"; content: string }[],
    })
  );

  const rawText = apiResponse.text;

  // intent 태그 파싱
  const intentMatch = rawText.match(/<intent>(AUTO_REPLY|NEED_HUMAN|CANCEL)<\/intent>/);
  const intent = (intentMatch?.[1] as AIResponseResult["intent"]) ?? "AUTO_REPLY";
  // <thinking>·<intent> 등 내부 메타 태그 제거 (간혹 모델이 자발적으로 CoT 출력)
  const cleanResponse = rawText
    .replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, "")
    .replace(/<intent>[\s\S]*?<\/intent>\s*/g, "")
    .trim();

  return { response: cleanResponse, intent };
}

export function extractMessage(aiResponse: string): string {
  // 마크다운 코드블록 제거
  let cleaned = aiResponse.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "");
  cleaned = cleaned.trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.message === "string") return parsed.message;
  } catch {
    // JSON 아닐 경우 원문 그대로
  }
  return cleaned;
}

export async function generateMemoSummary(
  messages: { role: string; content: string }[]
): Promise<string> {
  if (messages.length < 2) return "";

  const chatLog = messages
    .slice(-50)
    .map((m) => `${m.role === "user" ? "고객" : "상담사"}: ${m.content}`)
    .join("\n");

  const response = await withRetry(() => createMessage({
    model: "haiku",
    max_tokens: 300,
    system: "당신은 상담 내용을 요약하는 어시스턴트입니다. 대화 내용을 읽고 핵심을 3줄 이내로 간결하게 요약하세요. 고객의 요청사항, 품목, 주소, 일정 등 중요 정보를 포함하세요. 요약만 출력하세요.",
    messages: [{ role: "user", content: chatLog }],
  }));

  return response.text.trim();
}

export function parseQuoteFromAI(aiResponse: string): { type: string; items?: unknown[]; extras?: unknown[]; total?: number } | null {
  try {
    const parsed = JSON.parse(aiResponse);
    if (parsed.type === "quote") return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * 대화 내용에서 폐기물 품목을 추출하여 JSON 배열로 반환
 *
 * 2단계 분리 구조:
 * 1단계: AI가 고객 메시지에서 품목명+수량만 "있는 그대로" 추출 (raw)
 * 2단계: normalizeItems()가 코드 기반으로 DB keyword로 정규화
 */
export async function extractItemsFromConversation(
  messages: { role: string; content: string }[]
): Promise<{ keyword: string; quantity: number; raw: string }[]> {
  const chatLog = messages
    .slice(-50)
    .map((m) => `${m.role === "user" ? "고객" : "상담사"}: ${m.content}`)
    .join("\n");

  try {
    const extractionModel = await getExtractionModel();
    const response = await withRetry(() => createMessage({
      model: extractionModel,
      max_tokens: 500,
      system: `당신은 이사/폐기물 상담 대화에서 고객이 언급한 품목을 추출하는 어시스턴트입니다.
대화 내용을 읽고 고객이 처리/이사하려는 품목만 추출하세요.
반드시 JSON 배열만 출력하세요. 다른 텍스트는 출력하지 마세요.

⚠️ 품목명은 고객이 말한 그대로 추출하세요. 변환하거나 DB명으로 바꾸지 마세요.
⚠️ "예)" "ex)" "예시:" 접두어가 있어도 무시하고 실제 품목으로 간주하세요.
⚠️ 이모지/서식(번호, 구분선, •)은 무시하고 품목 내용만 추출하세요.
⚠️ 고객이 동일한 내용을 반복/복붙한 경우 중복 추출하지 말고 1회만 추출!
⚠️ 쉼표/슬래시/줄바꿈으로 나열된 품목은 반드시 각각 별도로 추출!
⚠️ 수량은 고객이 명시한 그대로! 없으면 기본 1. 텍스트 기준 우선.
⚠️ 마지막 품목까지 절대 누락하지 마세요!
⚠️ "A+B" "A와 B" "A, B 전부/모두" 등 여러 사이즈/품목이 나열되면 각각 별도 추출!
⚠️ "매트리스와 프레임 전부/세트" = 세트(SET)로 추출 (프레임만 아님!)

출력: [{"raw": "고객 원문 그대로", "quantity": 수량}]

예시:
"싱글침대 1개, 장농12자, 드럼세탁기" →
[{"raw":"싱글침대","quantity":1},{"raw":"장농12자","quantity":1},{"raw":"드럼세탁기","quantity":1}]

"옷장 2개, 책상/책장 1세트, 아기침대" →
[{"raw":"옷장","quantity":2},{"raw":"책상/책장 1세트","quantity":1},{"raw":"아기침대","quantity":1}]

"냉장고1대(단문형), 세탁기1대" →
[{"raw":"냉장고(단문형)","quantity":1},{"raw":"세탁기","quantity":1}]

"패밀리침대 슈퍼싱글+퀸 매트리스와 프레임 전부" →
[{"raw":"슈퍼싱글침대 세트","quantity":1},{"raw":"퀸침대 세트","quantity":1}]
(패밀리침대는 형태 설명이므로 제거, 사이즈별로 분리, "매트리스+프레임 전부"=세트)

"침대 싱글+더블 프레임만" →
[{"raw":"싱글침대 프레임","quantity":1},{"raw":"더블침대 프레임","quantity":1}]

품목이 없으면 [] 출력.`,
      messages: [{ role: "user", content: chatLog }],
    }));

    const text = response.text.trim();
    const cleaned = extractJSONFromResponse(text, "array");
    const rawItems: RawItem[] = JSON.parse(cleaned);

    // ── 2단계: 코드 기반 정규화 (동의어, 단위 변환, 사이즈 매핑 등) ──
    const normalizedItems = normalizeItems(rawItems);

    // ── 하위 호환: { keyword, quantity, raw } 형태로 반환 ──
    const items = normalizedItems.map((n, i) => ({
      keyword: n.keyword,
      quantity: n.quantity,
      raw: rawItems[i]?.raw ?? n.keyword,
    }));

    // ── 누락 검증: 고객 메시지의 주요 품목 키워드가 추출 결과에 있는지 확인 ──
    const COMMON_ITEMS = [
      "냉장고", "세탁기", "건조기", "에어컨", "소파", "침대", "책상", "의자", "식탁",
      "옷장", "장롱", "장농", "책장", "서랍장", "화장대", "신발장", "행거", "거울",
      "선반", "수납장", "거실장", "장식장", "러닝머신", "자전거", "피아노", "금고",
      "TV", "모니터", "프린터", "정수기", "가습기", "제습기", "청소기", "선풍기",
      "비데", "전자레인지", "오븐", "인덕션", "밥솥", "싱크대", "욕조", "변기",
      "화분", "테이블", "캐비닛", "파티션", "매트리스", "토퍼", "붙박이장", "패밀리",
    ];
    const userMessages = messages.filter(m => m.role === "user").map(m => m.content).join(" ");
    const extractedKeywords = items.map(i => i.keyword).join(" ") + " " + items.map(i => i.raw).join(" ");
    // 동의어 그룹: 하나라도 추출됐으면 나머지도 추출된 것으로 간주
    const SYNONYM_GROUPS = [
      ["장롱", "장농", "옷장"],
      ["냉장고", "김치냉장고"],
    ];
    const missingItems = COMMON_ITEMS.filter(item => {
      if (!userMessages.includes(item)) return false;
      if (extractedKeywords.includes(item)) return false;
      // 동의어 중 하나라도 추출됐으면 누락 아님
      const synonymGroup = SYNONYM_GROUPS.find(g => g.includes(item));
      if (synonymGroup && synonymGroup.some(s => extractedKeywords.includes(s))) return false;
      return true;
    });

    if (missingItems.length > 0) {
      console.warn(`[extractItems] 누락 감지: ${missingItems.join(", ")} — 보정 추출 시도`);
      for (const missing of missingItems) {
        items.push({ keyword: missing, quantity: 1, raw: missing });
      }
    }

    return items;
  } catch (err) {
    console.error("[extractItems] 오류:", err);
    return [];
  }
}

/**
 * v3: 대화에서 수집 정보(주소, 층수, 엘베, 주차, 품목, 특이사항) 추출
 */
export interface ExtractedCollectedInfo extends Partial<CollectedInfo> {
  customerName?: string | null;
  customerPhone?: string | null;
  wantsPhoneConsult?: boolean | null;
}

export async function extractCollectedInfo(
  messages: { role: string; content: string }[]
): Promise<ExtractedCollectedInfo> {
  const chatLog = messages
    .slice(-50)
    .map((m) => `${m.role === "user" ? "고객" : "상담사"}: ${m.content}`)
    .join("\n");

  const systemPrompt = `대화에서 수거 작업 관련 기본 정보만 추출하세요. 반드시 JSON 객체만 출력하세요.
⚠️ 품목(items)은 추출하지 마세요! 별도 시스템이 처리합니다.

⚠️ "상담사:" 메시지는 안내 템플릿(예시)이고, "고객:" 메시지가 실제 데이터입니다.
고객이 "예)"를 지우지 않고 그대로 작성해도 고객 메시지의 내용은 실제 데이터입니다.

출력 형식:
{"address": "주소 또는 null", "district": "구/시군 또는 null", "floor": 층수 또는 null, "elevator": true/false/null, "parking": true/false/null, "special_notes": ["특이사항"], "customerName": "고객 이름 또는 null", "customerPhone": "010-xxxx-xxxx 형식 또는 null", "wantsPhoneConsult": true/false/null}

규칙:
- address: 고객이 말한 주소를 **있는 그대로 전부** 추출. 건물번호 / 아파트명 / 동·호수 / 층수가 함께 적혀 있으면 **반드시 호수까지 포함**해서 한 줄로 합쳐 추출 ("서울 관악구 봉천동 1688-7 201호" → "서울 관악구 봉천동 1688-7 201호" 그대로). 동/읍/면 수준 이상이면 유효한 주소로 추출. 건물번호/아파트명이 없어도 "서울시 강남구 역삼동" 같은 지역 주소는 추출. 이모지/서식/"이요"/"요" 같은 어미만 제거. 확인 안 됐으면 null
- district: 주소에서 "구" 또는 "시" 단위 추출. 서울은 "구" (예: "강남구"), 경기는 "시" (예: "성남", "수원", "고양"). 확인 안 됐으면 null
- floor: 숫자만. 호수에서 추론 가능 (401호→4, 1203호→12, B1→-1). 확인 안 됐으면 null
- elevator: "사용 가능"/"있음" → true, "불가"/"없음" → false. 확인 안 됐으면 null
- parking: "가능"/"있음" → true, "불가능"/"없음" → false. 확인 안 됐으면 null
- special_notes: 해체 필요, 내용물 등 특이사항. 없으면 []
- customerName: 고객이 "이름/성함" 컨텍스트에서 명시한 한글 이름 2~4자. "네네"/"감사"/"안녕" 같은 응답 단어는 이름 아님. 확신 없으면 null
- customerPhone: 고객이 명시한 한국 휴대폰 번호 (010 으로 시작). 형식 정규화. 확신 없으면 null
- wantsPhoneConsult: 고객이 **전화 상담을 명확히 원할 때만** true. "전화 상담 부탁드려요" / "통화 가능하신가요" 같은 적극 요청은 true. "전화 상담 괜찮아요" (거절) / "톡으로만 부탁" / "전화는 안 받아도 됩니다" 는 false. 그 외 언급 없으면 null

확인 안 된 항목은 null. 추측하지 마세요.`;

  try {
    const response = await withRetry(() =>
      createMessage({
        model: "haiku",
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: "user", content: chatLog }],
      })
    );

    const text = response.text.trim() || "{}";
    const cleaned = extractJSONFromResponse(text, "object");
    console.log(`[extractCollectedInfo] AI 응답:`, cleaned.slice(0, 400));
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("[extractCollectedInfo] 실패:", err);
    return {};
  }
}

/**
 * 대화 내용에서 예약 정보를 추출
 */
export async function extractBookingInfo(
  messages: { role: string; content: string }[]
): Promise<{
  customerName: string;
  phone: string;
  address: string;
  floor: number;
  hasElevator: boolean;
  hasParking: boolean;
  preferredDate: string;
  preferredTime: string;
  specialNotes: string;
} | null> {
  const chatLog = messages
    .slice(-30)
    .map((m) => `${m.role === "user" ? "고객" : "상담사"}: ${m.content}`)
    .join("\n");

  try {
    const response = await withRetry(() => createMessage({
      model: "haiku",
      max_tokens: 500,
      system: `당신은 상담 대화에서 예약 정보를 추출하는 어시스턴트입니다.
대화 내용을 읽고 예약 관련 정보를 추출하세요.
반드시 JSON 객체만 출력하세요. 다른 텍스트는 출력하지 마세요.

출력 형식:
{"customerName": "이름", "phone": "전화번호", "address": "주소", "floor": 층수, "hasElevator": true/false, "hasParking": true/false, "preferredDate": "YYYY-MM-DD", "preferredTime": "HH:MM", "specialNotes": "특이사항"}

규칙:
- address: 고객이 말한 주소를 **있는 그대로 전부** 추출. 호수·동·층 모두 포함 ("봉천동 1688-7 201호" → "봉천동 1688-7 201호"). 임의로 잘라내지 마세요.
- 날짜는 YYYY-MM-DD 형식으로 변환 (예: "2월 28일" → "2026-02-28", "내일" → 오늘 기준 계산)
- 시간은 HH:MM 형식 (예: "오전 10시" → "10:00", "오후 2시" → "14:00")
- 정보가 없는 필드는 빈 문자열(""), 층수는 0, hasElevator/hasParking는 false로
- 예약 정보가 전혀 없으면 null 출력

오늘 날짜: ${new Date().toISOString().split("T")[0]}`,
      messages: [{ role: "user", content: chatLog }],
    }));

    const text = response.text.trim() || "null";
    const cleaned = extractJSONFromResponse(text, "object");
    if (cleaned === "null" || cleaned === "") return null;
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("[extractBookingInfo] 오류:", err);
    return null;
  }
}
