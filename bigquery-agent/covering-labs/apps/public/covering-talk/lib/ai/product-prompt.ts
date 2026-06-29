/**
 * 프롬프트 기반 품목 매칭 시스템 (v2)
 *
 * DB의 전체 품목 리스트를 시스템 프롬프트에 포함하고,
 * AI가 직접 매칭 + 미등록 품목 부피 추정까지 처리.
 * prompt caching으로 품목 리스트(~7K 토큰)는 캐싱 대상.
 */

import { createMessage } from "./ai-client";
import { supabase } from "@/lib/supabase/client";
import { withRetry } from "@/lib/utils/with-retry";

// ── 타입 ──

export interface MatchedItem {
  productId: number | null;
  raw: string;
  matchedName: string;
  category: string;
  quantity: number;
  volume: number;
  unitPrice: number;
  confidence: "high" | "medium" | "low";
  note?: string;
}

export interface ExtractionResult {
  items: MatchedItem[];
  conditions: string[];
}

// ── 품목 리스트 캐시 ──

let cachedProductList: string | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10분

async function getProductListPrompt(): Promise<string> {
  if (cachedProductList && Date.now() < cacheExpiry) return cachedProductList;

  const { data, error } = await supabase
    .from("products")
    .select("id, category, name, item_group, width, depth, height, volume, unit_price")
    .order("category")
    .order("name");

  if (error) throw new Error(`products 조회 실패: ${error.message}`);

  const lines = (data ?? []).map((p) => {
    const w = (p.width / 100).toFixed(2);
    const d = (p.depth / 100).toFixed(2);
    const h = (p.height / 100).toFixed(2);
    const vol = p.volume?.toFixed(2) ?? "0.00";
    const price = p.unit_price?.toLocaleString() ?? "0";
    const group = p.item_group ? `${p.item_group} > ` : "";
    return `P-${String(p.id).padStart(3, "0")} | ${group}${p.category} > ${p.name} | ${w}×${d}×${h}m | ${vol}m³ | ₩${price}`;
  });

  cachedProductList = lines.join("\n");
  cacheExpiry = Date.now() + CACHE_TTL;
  console.log(`[product-prompt] ${lines.length}개 품목 리스트 생성 (${cachedProductList.length}자)`);
  return cachedProductList;
}

// ── 시스템 프롬프트 ──

const MATCHING_RULES = `너는 커버링스팟 방문수거 견적 품목 분류 전문가다.

[가격 산출 공식 - 리스트에 없는 품목용]
가격 = 가로(m) × 세로(m) × 높이(m) × 50,000원

[판단 규칙]
1. 고객 메시지에서 품목과 수량을 추출해라
2. 각 품목을 아래 리스트에서 매칭하고, 등록된 크기와 가격을 반환해라
3. 리스트에 없는 품목이면 일반적인 크기를 추정하여 부피와 가격을 계산해라
4. 매칭이 애매하면 confidence를 "medium"으로 하고 note에 사유를 적어라
5. 해체, 사다리차, 엘리베이터 불가 등 추가 조건도 추출해라
6. 반드시 JSON으로만 응답해라

[매칭 우선순위]
1. 정확 매칭: "킹 침대 세트" → 침대 > 킹 SET
2. 카테고리+사이즈: "2인용 소파" → 소파 > 2~3인용
3. 유사 매칭: "옷장" → 장롱 (가장 가까운 사이즈)
4. 추정: 리스트에 없으면 크기 추정 후 계산

[크기 추정 가이드 - 리스트에 없는 품목용]
- "작은", "미니", "1인용" → 소형 기준
- "큰", "대형", "킹" → 대형 기준
- 침대: 싱글 1.00×2.00×0.50 / 더블 1.40×2.00×0.50 / 퀸 1.50×2.00×0.50
- 소파: 1인 0.90×0.85×0.80 / 2인 1.40×0.85×0.80 / 3인 1.80×0.85×0.80
- 책상: 소 0.80×0.50×0.75 / 중 1.20×0.60×0.75 / 대 1.50×0.70×0.75
- 냉장고: 소 0.50×0.55×0.85 / 중 0.60×0.65×1.70 / 대 0.90×0.75×1.80

[특수 규칙]
- "침대" = 매트리스+프레임 세트(SET) 기본. "프레임만", "매트리스만" 명시 시 해당 품목만.
- "장농 N자" → 1자=약30cm. 3자=1문, 6자=2문, 9자=3문. 해당 사이즈로 매칭.
- "패밀리 침대" → 구성 침대 사이즈별로 분리 (예: SS+Q → 슈퍼싱글 SET + 퀸 SET)
- 수량 미명시 → 기본 1개
- "A, B, C" 나열 → 각각 별도 품목으로 추출

[출력 JSON 형식]
{
  "items": [
    {
      "productId": 123,
      "raw": "고객 원문 그대로",
      "matchedName": "카테고리 - 사이즈/타입",
      "category": "카테고리",
      "quantity": 1,
      "volume": 0.50,
      "unitPrice": 25000,
      "confidence": "high",
      "note": "필요 시 사유"
    }
  ],
  "conditions": ["해체 필요: 침대", "엘리베이터 불가"]
}

- productId: 리스트의 P-XXX 번호 (숫자만). 미등록이면 null
- confidence: "high"=정확매칭, "medium"=유사매칭/사이즈 추정, "low"=리스트 미등록 추정
- conditions: 해체, 사다리, 내용물 등 특수 조건 (없으면 빈 배열)

[품목 리스트]
`;

// ── 메인 함수 ──

export async function extractAndMatchItems(
  userMessage: string
): Promise<ExtractionResult> {
  const productList = await getProductListPrompt();
  console.log(`[product-prompt] 품목 리스트 로드 완료: ${productList.length}자`);

  const systemBlocks = [
    {
      type: "text" as const,
      text: MATCHING_RULES + productList,
      cache_control: { type: "ephemeral" as const },
    },
  ];

  const response = await withRetry(() =>
    createMessage({
      model: "sonnet",
      max_tokens: 8192,
      system: systemBlocks,
      messages: [{ role: "user", content: userMessage }],
    })
  );

  const rawText = response.text || "{}";
  console.log(`[product-prompt] AI 응답 (${rawText.length}자):`, rawText.slice(0, 300));

  // JSON 객체 추출 (코드블록, 후행 텍스트, GPT 설명문 등 제거)
  let jsonStr = rawText.trim();

  // markdown 코드블록 내부 추출
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // JSON 객체 추출
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI 응답에서 JSON을 찾을 수 없습니다");

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    // JSON이 잘린 경우 복구 시도: 마지막 완전한 객체까지만 파싱
    let truncated = jsonMatch[0];
    // 마지막 완전한 }, 찾기
    const lastComplete = truncated.lastIndexOf("},");
    if (lastComplete > 0) {
      truncated = truncated.slice(0, lastComplete + 1) + '], "conditions": []}';
      console.warn(`[product-prompt] JSON 잘림 복구 시도 (${rawText.length}자)`);
      parsed = JSON.parse(truncated);
    } else {
      throw new Error(`AI 응답 JSON 파싱 실패 (${rawText.length}자): ${rawText.slice(0, 200)}`);
    }
  }
  const items: MatchedItem[] = (parsed.items ?? []).map((item: Record<string, unknown>) => ({
    productId: item.productId ?? null,
    raw: String(item.raw ?? ""),
    matchedName: String(item.matchedName ?? ""),
    category: String(item.category ?? "기타"),
    quantity: Number(item.quantity) || 1,
    volume: Number(item.volume) || 0,
    unitPrice: Number(item.unitPrice) || 0,
    confidence: (["high", "medium", "low"].includes(item.confidence as string) ? item.confidence : "low") as "high" | "medium" | "low",
    note: item.note ? String(item.note) : undefined,
  }));

  const conditions: string[] = Array.isArray(parsed.conditions)
    ? parsed.conditions.map(String)
    : [];

  // 캐시 사용 로그
  const usage = response.usage;
  console.log(`[product-prompt] usage: input=${usage.input_tokens} cache_create=${usage.cache_creation_input_tokens ?? 0} cache_read=${usage.cache_read_input_tokens ?? 0} output=${usage.output_tokens}`);

  return { items, conditions };
}
