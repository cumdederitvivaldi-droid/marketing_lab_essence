import { createMessage } from "@/lib/ai/ai-client";
import { ProductSuggestion } from "@/lib/store/conversations";
import { withRetry } from "@/lib/utils/with-retry";

const SPEC_PROMPT = (keyword: string) =>
  `한국 폐기물 수거/이사 업체 기준으로 "${keyword}" 품목의 규격 정보를 알려주세요.

필요 정보:
- category: 대분류 카테고리 (가전, 가구, 운동, 기타가전, 주방, 건강, 생활용품 등)
- name: 품목 세부명 (예: "양문형", "일반", "3인용" 등)
- item_group: 고객이 부르는 이름 그대로 (예: "냉장고", "세탁기", "러닝머신")
- width: 가로 크기 (cm)
- depth: 세로/깊이 크기 (cm)
- height: 높이 크기 (cm)
- volume: 부피 (m³, 소수점 2자리)
- unit_price: 폐기물 처리 예상 단가 (원, 한국 대형폐기물 수거 기준. 소형 생활용품은 1000~3000원, 의자류 5000~15000원, 대형가구 20000~50000원 정도)
- weight: 무게 (kg)
- aliases: 이 품목을 부르는 다른 이름들 배열
- confidence: 정보 신뢰도 ("high" = 공식 스펙, "medium" = 유사 제품 기반 추정, "low" = 대략적 추정)

정확한 스펙을 모르면 일반적인 크기와 무게를 추정해서 작성해주세요.
반드시 아래 JSON 형식만 출력하세요. 다른 텍스트, 설명, 마크다운 없이 순수 JSON만:
{"category":"","name":"","item_group":"","width":0,"depth":0,"height":0,"volume":0,"unit_price":0,"weight":0,"aliases":[],"confidence":"medium"}`;

function parseResponse(response: { text: string; content: unknown[]; usage: unknown }): ProductSuggestion | null {
  const lastText = response.text.trim();

  if (!lastText) {
    console.warn("[ProductLookup] AI 응답에 텍스트 없음");
    return null;
  }

  const cleaned = lastText
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn("[ProductLookup] JSON 파싱 실패:", cleaned.substring(0, 200));
    return null;
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // 필수 필드 검증 — "unknown" 등 무의미한 값도 거부
  const invalid = ["", "unknown", "null", "없음", "미상"];
  const cat = String(parsed.category || "");
  const name = String(parsed.name || "");
  const group = String(parsed.item_group || "");

  if (invalid.includes(cat.toLowerCase()) || !name || invalid.includes(group.toLowerCase())) {
    console.warn("[ProductLookup] 필수 필드 무효:", { category: cat, name, item_group: group });
    return null;
  }

  const volume = Number(parsed.volume) || 0;
  // 단가: 부피(m³) × 50,000원, 최소 5,000원
  const calculatedPrice = Math.max(Math.round(volume * 50000), 5000);

  return {
    category: cat,
    name,
    item_group: group,
    width: Number(parsed.width) || 0,
    depth: Number(parsed.depth) || 0,
    height: Number(parsed.height) || 0,
    volume,
    unit_price: calculatedPrice,
    weight: Number(parsed.weight) || 0,
    aliases: Array.isArray(parsed.aliases) ? parsed.aliases.map(String) : [],
    source: "ai_estimate",
    confidence: ["high", "medium", "low"].includes(parsed.confidence)
      ? parsed.confidence
      : "low",
  };
}

/**
 * DB 미등록 품목의 스펙을 AI로 추정
 * createMessage 통합 클라이언트를 사용하여 품목 규격/가격 추정
 */
export async function lookupProductSpecs(
  keyword: string
): Promise<ProductSuggestion | null> {
  // 1차: AI 추정 (web_search 제거 — createMessage로 통합)
  try {
    const response = await withRetry(() => createMessage({
      model: "haiku",
      max_tokens: 512,
      messages: [{ role: "user", content: SPEC_PROMPT(keyword) }],
    }), { maxAttempts: 1 });

    const suggestion = parseResponse(response);
    if (suggestion) {
      suggestion.confidence = "low";
      suggestion.source = "ai_estimate";
      console.log(`[ProductLookup] "${keyword}" AI 추정 성공: ${suggestion.item_group} - ${suggestion.name}`);
      return suggestion;
    }
  } catch (err) {
    console.error(`[ProductLookup] "${keyword}" AI 추정도 실패:`, err);
  }

  return null;
}
