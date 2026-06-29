import { NextRequest, NextResponse } from "next/server";
import { createMessage } from "@/lib/ai/ai-client";
import { supabase } from "@/lib/supabase/client";
import regionPricesData from "@/lib/data/region-prices.json";
import { applyPromoCap } from "@/lib/utils/trip-fee";
import ladderFeesData from "@/lib/data/ladder-fees.json";
import { getTripFee as getTripFeeShared } from "@/lib/utils/trip-fee";

/**
 * 견적 산출 API — 외부 연동용
 *
 * POST /api/quote/calculate
 *
 * 구조화된 입력(품목 + 지역 + 옵션)을 받아 견적을 계산합니다.
 * 애매한 품목명도 별칭(alias) 테이블 + 유사 검색으로 자동 매칭합니다.
 */

interface RequestItem {
  /** spot_items 테이블의 id (UUID) — id 또는 name 중 하나 필수 */
  id?: string;
  /** 품목명 (예: "장롱 - 3자", "옷장", "작은냉장고" 등 자유 입력 가능) */
  name?: string;
  /** 카테고리 (name과 함께 사용 시 정확도 향상) */
  category?: string;
  /** 수량 (기본값: 1) */
  quantity?: number;
}

interface RequestBody {
  /** 품목 배열 (필수) */
  items: RequestItem[];
  /** 지역명 — spot_areas.name (예: "광진구", "수원") (필수) */
  district: string;
  /** 인력 수 (1, 2, 3) — 기본값: 1 */
  crewSize?: number;
  /** 사다리차 정보 (선택) */
  ladder?: {
    /** "10층 미만" 또는 "10층 이상" */
    type: string;
    /** "1시간 미만" | "1시간" | "2시간" | ... | "7시간" */
    duration: string;
  };
}

interface CandidateItem {
  id: string;
  category: string;
  name: string;
  displayName: string;
  price: number;
  loadingCube: number;
}

interface ResolvedItem {
  id: string;
  category: string;
  name: string;
  displayName: string;
  price: number;
  loadingCube: number;
  quantity: number;
  subtotal: number;
  matched: boolean;
  /** 매칭 방법 (exact | alias | fuzzy | products | ai) */
  matchedBy?: string;
  /** 원본 입력값 (자동 매칭된 경우 원래 뭘 입력했는지) */
  originalInput?: string;
  /** 같은 카테고리의 다른 옵션들 (사이즈 선택 등) */
  candidates?: CandidateItem[];
  /** AI가 추론한 설명 (ai 매칭 시) */
  aiReasoning?: string;
  /** AI 추천 여부 (가격이 추정값임을 표시) */
  aiEstimated?: boolean;
  /** 매칭 실패 시 오류 메시지 */
  error?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSpotItem(row: any) {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    displayName: row.display_name,
    price: row.price,
    loadingCube: row.loading_cube ?? 0,
  };
}

// 사다리차 duration → key 매핑
const LADDER_DURATION_MAP: Record<string, string> = {
  "1시간 미만": "under1h",
  "1시간미만": "under1h",
  "기본요금": "under1h",
  "1시간": "h1",
  "2시간": "h2",
  "3시간": "h3",
  "4시간": "h4",
  "5시간": "h5",
  "6시간": "h6",
  "7시간": "h7",
};

function getLadderFee(type: string, duration: string): number {
  const entry = ladderFeesData.find((d) => d.type === type);
  if (!entry) return 0;
  const key = LADDER_DURATION_MAP[duration];
  if (!key) return 0;
  return (entry as Record<string, number | string>)[key] as number ?? 0;
}

// PROMO cap (lib/utils/trip-fee.ts) 일관 적용 위해 shared 함수 위임.
function getTripFee(district: string, crewSize: number): number {
  return getTripFeeShared(district, crewSize);
}

/**
 * 같은 카테고리의 다른 옵션(사이즈 변형) 조회
 * 예: "장롱 - 3자" 매칭 시 → "장롱 - 4자", "장롱 - 5자" 등 반환
 */
async function getCategoryCandidates(category: string, excludeName?: string): Promise<CandidateItem[]> {
  let query = supabase
    .from("spot_items")
    .select("*")
    .eq("category", category)
    .eq("active", true)
    .order("price", { ascending: true });

  if (excludeName) {
    query = query.neq("name", excludeName);
  }

  const { data } = await query.limit(10);
  return (data ?? []).map(toSpotItem);
}

// ── AI 폴백: 카탈로그에 없는 품목 추론 ──

// AI client is now unified via createMessage

interface AiResolveResult {
  suggestedCategory: string | null;
  suggestedName: string | null;
  estimatedPrice: number | null;
  estimatedVolume: number | null;
  reasoning: string;
}

/**
 * AI로 품목 추론 — 카탈로그 매칭 or 가격 추정
 * 우리 카탈로그의 카테고리/품목 목록을 AI에게 넘기고,
 * 입력 품목이 어떤 카탈로그 품목에 해당하는지 판단하게 함.
 * 카탈로그에 없으면 크기/무게를 추론하여 적정 가격을 제시.
 */
async function aiResolveItem(itemName: string): Promise<AiResolveResult | null> {
  // 카테고리별 대표 품목 목록 가져오기
  const { data: categories } = await supabase
    .from("spot_items")
    .select("category, name, price")
    .eq("active", true)
    .order("category")
    .order("price");

  if (!categories?.length) return null;

  // 카테고리별 그룹핑 (AI 프롬프트용)
  const catMap: Record<string, { name: string; price: number }[]> = {};
  for (const row of categories) {
    if (!catMap[row.category]) catMap[row.category] = [];
    catMap[row.category].push({ name: row.name, price: row.price });
  }

  const catalogSummary = Object.entries(catMap)
    .map(([cat, items]) => {
      const itemList = items.map((i) => `  - ${i.name}: ${i.price.toLocaleString()}원`).join("\n");
      return `[${cat}]\n${itemList}`;
    })
    .join("\n\n");

  const response = await createMessage({
    model: "haiku",
    max_tokens: 500,
    system: `너는 방문수거(가구/가전 폐기물 수거) 견적 전문가야.
사용자가 입력한 품목명을 보고 아래 카탈로그에서 가장 적합한 품목을 찾아줘.

카탈로그에 정확히 매칭되는 품목이 있으면 그 카테고리와 이름을 반환해.
카탈로그에 없지만 비슷한 품목이 있으면 가장 유사한 것을 추천해.
카탈로그에 전혀 없는 품목이면 크기/무게를 추정하여 적정 수거 가격을 제시해.

가격 추정 기준:
- 소형(1인 운반 가능, ~30kg): 20,000~40,000원
- 중형(2인 운반, ~60kg): 40,000~80,000원
- 대형(2인+ 운반, 60kg~): 80,000~150,000원
- 초대형(특수 장비 필요): 150,000원~

반드시 아래 JSON 형식으로만 응답해:
{"suggestedCategory":"카테고리명 또는 null","suggestedName":"품목명 또는 null","estimatedPrice":숫자 또는 null,"estimatedVolume":부피m3 또는 null,"reasoning":"한줄 설명"}`,
    messages: [{
      role: "user",
      content: `입력 품목: "${itemName}"

카탈로그:
${catalogSummary}`,
    }],
  });

  const text = response.text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      suggestedCategory: parsed.suggestedCategory || null,
      suggestedName: parsed.suggestedName || null,
      estimatedPrice: parsed.estimatedPrice ? Math.round(parsed.estimatedPrice) : null,
      estimatedVolume: parsed.estimatedVolume || null,
      reasoning: parsed.reasoning || "",
    };
  } catch {
    return null;
  }
}

/**
 * 스마트 품목 검색 — 5단계 폴백
 * 1. spot_items id 직접 조회
 * 2. spot_items name 정확 매칭
 * 3. spot_item_aliases 별칭 매칭
 * 4. products 테이블 aliases 배열 매칭 → spot_items 역매핑
 * 5. spot_items ilike 유사 검색
 */
async function resolveItem(
  item: RequestItem,
  qty: number
): Promise<ResolvedItem> {
  const inputName = item.name?.trim() ?? "";
  const inputNoSpace = inputName.replace(/\s/g, "");

  // ── 1. ID 직접 조회 ──
  if (item.id) {
    const { data } = await supabase
      .from("spot_items")
      .select("*")
      .eq("id", item.id)
      .eq("active", true)
      .single();

    if (data) {
      const si = toSpotItem(data);
      const candidates = await getCategoryCandidates(si.category, si.name);
      return {
        ...si, quantity: qty, subtotal: si.price * qty,
        matched: true, matchedBy: "exact",
        candidates: candidates.length > 0 ? candidates : undefined,
      };
    }
  }

  // ── 2. spot_items name 정확 매칭 ──
  if (inputName) {
    let query = supabase.from("spot_items").select("*").eq("active", true);
    if (item.category) {
      query = query.eq("category", item.category).eq("name", inputName);
    } else {
      query = query.eq("name", inputName);
    }
    const { data } = await query.limit(1).single();

    if (data) {
      const si = toSpotItem(data);
      const candidates = await getCategoryCandidates(si.category, si.name);
      return {
        ...si, quantity: qty, subtotal: si.price * qty,
        matched: true, matchedBy: "exact",
        candidates: candidates.length > 0 ? candidates : undefined,
      };
    }
  }

  // ── 3. spot_item_aliases 별칭 매칭 ──
  if (inputName) {
    // 정확 매칭
    const { data: aliasRow } = await supabase
      .from("spot_item_aliases")
      .select("category, name")
      .eq("alias", inputName)
      .limit(1)
      .single();

    // 공백 제거 매칭
    const aliasMatch = aliasRow ?? (inputNoSpace !== inputName ? (await supabase
      .from("spot_item_aliases")
      .select("category, name")
      .eq("alias", inputNoSpace)
      .limit(1)
      .single()).data : null);

    if (aliasMatch) {
      // 별칭이 가리키는 실제 spot_items 조회
      const { data: spotRow } = await supabase
        .from("spot_items")
        .select("*")
        .eq("category", aliasMatch.category)
        .ilike("name", `%${aliasMatch.name}%`)
        .eq("active", true)
        .limit(1)
        .single();

      if (spotRow) {
        const si = toSpotItem(spotRow);
        const candidates = await getCategoryCandidates(si.category, si.name);
        return {
          ...si, quantity: qty, subtotal: si.price * qty,
          matched: true, matchedBy: "alias",
          originalInput: inputName,
          candidates: candidates.length > 0 ? candidates : undefined,
        };
      }
    }
  }

  // ── 4. products 테이블 aliases 배열 매칭 ──
  if (inputName) {
    const { data: prodRow } = await supabase
      .from("products")
      .select("category, name")
      .contains("aliases", [inputName])
      .limit(1)
      .single();

    const prodMatch = prodRow ?? (inputNoSpace !== inputName ? (await supabase
      .from("products")
      .select("category, name")
      .contains("aliases", [inputNoSpace])
      .limit(1)
      .single()).data : null);

    if (prodMatch) {
      // products 결과로 spot_items 역매핑
      const { data: spotRow } = await supabase
        .from("spot_items")
        .select("*")
        .eq("category", prodMatch.category)
        .ilike("name", `%${prodMatch.name}%`)
        .eq("active", true)
        .limit(1)
        .single();

      if (spotRow) {
        const si = toSpotItem(spotRow);
        const candidates = await getCategoryCandidates(si.category, si.name);
        return {
          ...si, quantity: qty, subtotal: si.price * qty,
          matched: true, matchedBy: "products",
          originalInput: inputName,
          candidates: candidates.length > 0 ? candidates : undefined,
        };
      }
    }
  }

  // ── 5. spot_items ilike 유사 검색 ──
  if (inputName) {
    const searchTerms = [inputName, inputNoSpace];
    for (const term of searchTerms) {
      const { data: fuzzyRows } = await supabase
        .from("spot_items")
        .select("*")
        .eq("active", true)
        .or(`name.ilike.%${term}%,category.ilike.%${term}%,display_name.ilike.%${term}%`)
        .order("price", { ascending: true })
        .limit(5);

      if (fuzzyRows?.length) {
        // 첫 번째를 베스트 매칭으로, 나머지를 후보로
        const best = toSpotItem(fuzzyRows[0]);
        const otherCandidates = fuzzyRows.slice(1).map(toSpotItem);
        // 같은 카테고리 내 추가 후보도 포함
        const catCandidates = await getCategoryCandidates(best.category, best.name);
        const allCandidates = [...otherCandidates, ...catCandidates]
          .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i)
          .slice(0, 8);

        return {
          ...best, quantity: qty, subtotal: best.price * qty,
          matched: true, matchedBy: "fuzzy",
          originalInput: inputName,
          candidates: allCandidates.length > 0 ? allCandidates : undefined,
        };
      }
    }

    // 카테고리로라도 매칭 시도 (예: "냉장고" → 가전 카테고리)
    const { data: catRows } = await supabase
      .from("spot_items")
      .select("*")
      .eq("active", true)
      .ilike("category", `%${inputName}%`)
      .order("price", { ascending: true })
      .limit(8);

    if (catRows?.length) {
      return {
        id: "", category: catRows[0].category,
        name: inputName, displayName: "",
        price: 0, loadingCube: 0,
        quantity: qty, subtotal: 0,
        matched: false, matchedBy: undefined,
        originalInput: inputName,
        error: `"${inputName}" — 정확한 품목을 특정할 수 없습니다. 아래 후보 중 선택해주세요.`,
        candidates: catRows.map(toSpotItem),
      };
    }
  }

  // ── 6. AI 폴백 — 품목 추론 + 카탈로그 매칭 ──
  if (inputName) {
    try {
      const aiResult = await aiResolveItem(inputName);
      if (aiResult) {
        // AI가 카탈로그 매칭을 제안한 경우 → 유사도 체크 후 spot_items 조회
        if (aiResult.suggestedName) {
          // 이름 유사도 체크: 입력과 제안이 너무 다르면 매칭 거부 → 추정 가격 사용
          const inputNorm = inputName.toLowerCase().replace(/\s/g, "");
          const suggestedNorm = aiResult.suggestedName.toLowerCase().replace(/\s/g, "");
          const hasCommonChar = [...inputNorm].some(c => suggestedNorm.includes(c));
          const lengthRatio = Math.min(inputNorm.length, suggestedNorm.length) / Math.max(inputNorm.length, suggestedNorm.length);
          const isSimilarEnough = hasCommonChar && (
            inputNorm.includes(suggestedNorm) || suggestedNorm.includes(inputNorm) ||
            lengthRatio > 0.3
          );

          // "세트"만 공유하는 등 핵심 키워드가 다르면 거부
          const inputCore = inputNorm.replace(/(세트|set|1개|2개|대형|소형|중형)/g, "");
          const suggestedCore = suggestedNorm.replace(/(세트|set|1개|2개|대형|소형|중형)/g, "");
          const coreOverlap = [...inputCore].filter(c => suggestedCore.includes(c)).length;
          const coreSimilarity = inputCore.length > 0 ? coreOverlap / inputCore.length : 0;

          if (isSimilarEnough && coreSimilarity > 0.3) {
            const { data: aiSpot } = await supabase
              .from("spot_items")
              .select("*")
              .eq("active", true)
              .ilike("name", `%${aiResult.suggestedName}%`)
              .limit(1)
              .single();

            if (aiSpot) {
              const si = toSpotItem(aiSpot);
              const candidates = await getCategoryCandidates(si.category, si.name);
              return {
                ...si, quantity: qty, subtotal: si.price * qty,
                matched: true, matchedBy: "ai",
                originalInput: inputName,
                aiReasoning: aiResult.reasoning,
                candidates: candidates.length > 0 ? candidates : undefined,
              };
            }
          } else {
            console.log(`[quote/calculate] AI 매칭 거부: "${inputName}" → "${aiResult.suggestedName}" (유사도 부족, coreSimilarity=${coreSimilarity.toFixed(2)})`);
          }

          // category + ilike 폴백 (유사도 통과한 경우만)
          if (isSimilarEnough && coreSimilarity > 0.3 && aiResult.suggestedCategory) {
            const { data: aiCatSpot } = await supabase
              .from("spot_items")
              .select("*")
              .eq("active", true)
              .eq("category", aiResult.suggestedCategory)
              .order("price", { ascending: true })
              .limit(1)
              .single();

            if (aiCatSpot) {
              const si = toSpotItem(aiCatSpot);
              const candidates = await getCategoryCandidates(si.category, si.name);
              return {
                ...si, quantity: qty, subtotal: si.price * qty,
                matched: true, matchedBy: "ai",
                originalInput: inputName,
                aiReasoning: aiResult.reasoning,
                candidates: candidates.length > 0 ? candidates : undefined,
              };
            }
          }
        }

        // AI가 카탈로그에 없다고 판단하거나 유사도 부족 → 추정 가격 제시
        if (aiResult.estimatedPrice && aiResult.estimatedPrice > 0) {
          return {
            id: "", category: aiResult.suggestedCategory || "기타",
            name: inputName,
            displayName: `${inputName} (AI 추정)`,
            price: aiResult.estimatedPrice,
            loadingCube: aiResult.estimatedVolume || 0,
            quantity: qty,
            subtotal: aiResult.estimatedPrice * qty,
            matched: true, matchedBy: "ai",
            originalInput: inputName,
            aiReasoning: aiResult.reasoning,
            aiEstimated: true,
          };
        }
      }
    } catch (aiErr) {
      console.error("[quote/calculate] AI fallback error:", aiErr);
    }
  }

  // ── 완전 미매칭 ──
  return {
    id: "", category: item.category ?? "",
    name: inputName || item.id || "",
    displayName: "", price: 0, loadingCube: 0,
    quantity: qty, subtotal: 0,
    matched: false,
    error: `품목을 찾을 수 없습니다: "${inputName || item.id}"`,
  };
}

// [CS-ITM-008] 견적 계산
export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();

    // ── 입력 검증 ──
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "items 배열이 필요합니다", example: { items: [{ name: "장롱 - 3자", quantity: 1 }], district: "광진구" } },
        { status: 400 }
      );
    }
    if (!body.district) {
      return NextResponse.json(
        { error: "district(지역명)가 필요합니다", example: "광진구", availableDistricts: regionPricesData.map((r) => r.region) },
        { status: 400 }
      );
    }

    const crewSize = Math.min(Math.max(body.crewSize ?? 1, 1), 3);

    // ── 지역 확인 ── (PROMO cap 자동 적용)
    const regionRaw = regionPricesData.find((r) => r.region === body.district);
    const regionMatch = regionRaw ? applyPromoCap(regionRaw) : null;
    if (!regionMatch) {
      return NextResponse.json(
        { error: `지역 "${body.district}"을(를) 찾을 수 없습니다`, availableDistricts: regionPricesData.map((r) => r.region) },
        { status: 400 }
      );
    }

    // ── 품목 조회 (스마트 매칭) ──
    const resolvedItems: ResolvedItem[] = [];
    let itemsTotal = 0;
    let totalLoadingCube = 0;

    for (const item of body.items) {
      const qty = Math.max(item.quantity ?? 1, 1);
      const resolved = await resolveItem(item, qty);
      resolvedItems.push(resolved);

      if (resolved.matched) {
        itemsTotal += resolved.subtotal;
        totalLoadingCube += resolved.loadingCube * qty;
      }
    }

    // ── 출장비(인력비) ──
    const tripFee = getTripFee(body.district, crewSize);

    // ── 사다리차비 ──
    let ladderFee = 0;
    if (body.ladder) {
      ladderFee = getLadderFee(body.ladder.type, body.ladder.duration);
      if (ladderFee === 0 && body.ladder.type && body.ladder.duration) {
        return NextResponse.json({
          error: `사다리차 요금을 찾을 수 없습니다: type="${body.ladder.type}", duration="${body.ladder.duration}"`,
          availableLadder: {
            types: ["10층 미만", "10층 이상"],
            durations: Object.keys(LADDER_DURATION_MAP),
          },
        }, { status: 400 });
      }
    }

    // ── 견적 계산 ──
    const subtotal = itemsTotal + tripFee + ladderFee;
    const vatAmount = Math.round(subtotal * 0.1);
    const total = Math.ceil((subtotal + vatAmount) / 1000) * 1000;

    // estimate 범위 (1만원 단위)
    const estimateMin = Math.floor(total / 10000) * 10000;
    const estimateMax = Math.ceil(total / 10000) * 10000 + 10000;

    // 미매칭 품목 경고
    const unmatchedItems = resolvedItems.filter((i) => !i.matched);
    // 자동 매칭된 품목 안내
    const autoMatched = resolvedItems.filter((i) => i.matched && i.originalInput);

    return NextResponse.json({
      // ── 견적 결과 ──
      quote: {
        itemsTotal,
        tripFee,
        ladderFee,
        subtotal,
        vatAmount,
        total,
        estimateMin,
        estimateMax,
      },

      // ── 품목 상세 ──
      items: resolvedItems,
      totalLoadingCube: Math.round(totalLoadingCube * 1000) / 1000,

      // ── 인력 정보 ──
      crew: {
        size: crewSize,
        regionPrices: {
          price1: regionMatch.price1,
          price2: regionMatch.price2,
          price3: regionMatch.price3,
        },
      },

      // ── 사다리차 ──
      ladder: body.ladder ? { type: body.ladder.type, duration: body.ladder.duration, fee: ladderFee } : null,

      // ── 자동 매칭 안내 ──
      suggestions: autoMatched.length > 0
        ? autoMatched.map((i) => `"${i.originalInput}" → "${i.category} - ${i.name}" (${i.matchedBy})`)
        : undefined,

      // ── 경고 ──
      warnings: unmatchedItems.length > 0
        ? unmatchedItems.map((i) => i.error)
        : undefined,

      bookingFields: {
        items: resolvedItems.filter((i) => i.matched).map((i) => ({
          category: i.category,
          name: i.name,
          displayName: i.displayName,
          price: i.price,
          quantity: i.quantity,
          loadingCube: i.loadingCube,
        })),
        total_price: itemsTotal,
        estimate_min: estimateMin,
        estimate_max: estimateMax,
        crew_size: crewSize,
        total_loading_cube: Math.round(totalLoadingCube * 1000) / 1000,
      },
    });
  } catch (err) {
    console.error("[quote/calculate] error:", err);
    return NextResponse.json({ error: "견적 계산 중 오류가 발생했습니다" }, { status: 500 });
  }
}
