/**
 * 임베딩 기반 품목 검색
 *
 * Voyage AI 임베딩 → Supabase pgvector 코사인 유사도 → Top 3 반환.
 * 임베딩 실패 시 문자열 폴백 (item_group 정확일치 → 부분일치).
 */

import { supabase } from "@/lib/supabase/client";
import { embedText } from "@/lib/ai/voyage";
import { normalizeKeyword } from "@/lib/utils/item-normalizer";
import { getAllProducts, CachedProduct } from "@/lib/utils/product-cache";

export interface EmbeddingCandidate {
  product: CachedProduct;
  similarity: number;
}

export interface EmbeddingSearchResult {
  product: CachedProduct;
  similarity: number;
  candidates: EmbeddingCandidate[];
  matchMethod: "embedding" | "string_fallback";
}

const EMBEDDING_THRESHOLD = 0.82;   // 자동 매칭 최소 유사도 (0.7→0.82 상향: 발마사지기→안마의자 같은 오매칭 방지)
const SEARCH_THRESHOLD = 0.7;       // pgvector 검색 최소 유사도 (후보 반환용, 저확신 로그 포함)

/** 임베딩 기반 품목 검색 (Top 3 후보 포함) */
export async function searchProductByEmbedding(
  keyword: string
): Promise<EmbeddingSearchResult | null> {
  const effectiveKeyword = normalizeKeyword(keyword);
  const kw = effectiveKeyword.toLowerCase();

  // 0. 문자열 정확 매칭 우선 (category/item_group 일치 시 임베딩보다 신뢰도 높음)
  const stringFirst = await stringFallbackSearch(effectiveKeyword, kw);
  if (stringFirst) {
    console.log(
      `[ProductSearch] 문자열 우선 매칭: "${keyword}" → "${stringFirst.display_name}"`
    );
    return {
      product: stringFirst,
      similarity: 1.0,
      candidates: [],
      matchMethod: "string_fallback",
    };
  }

  // 1. 임베딩 검색 시도 (공백 포함 + 공백 제거 두 가지로 검색, 더 높은 스코어 채택)
  const noSpaceKeyword = effectiveKeyword.replace(/\s/g, "");
  const searchVariants = [effectiveKeyword];
  if (noSpaceKeyword !== effectiveKeyword) searchVariants.push(noSpaceKeyword);

  const embeddings = await Promise.all(searchVariants.map(v => embedText(v)));
  const hasAnyEmbedding = embeddings.some(e => e !== null);

  if (hasAnyEmbedding) {
    // 각 변형에 대해 RPC 검색 실행
    const allRpcResults = await Promise.all(
      embeddings.map(async (emb, i) => {
        if (!emb) return null;
        const { data, error } = await supabase.rpc("match_products", {
          query_embedding: JSON.stringify(emb),
          match_threshold: SEARCH_THRESHOLD,
          match_count: 3,
        });
        if (error || !data?.length) return null;
        return { variant: searchVariants[i], matches: data };
      })
    );

    // 모든 결과 중 1위 스코어가 가장 높은 것을 채택
    const allProducts = await getAllProducts();
    const productMap = new Map(allProducts.map((p) => [p.id, p]));

    let bestCandidates: EmbeddingCandidate[] = [];
    let bestVariant = effectiveKeyword;

    for (const result of allRpcResults) {
      if (!result) continue;
      const candidates: EmbeddingCandidate[] = [];
      for (const m of result.matches) {
        const product = productMap.get(m.id);
        if (product) candidates.push({ product, similarity: m.similarity });
      }
      if (candidates.length > 0 && (bestCandidates.length === 0 || candidates[0].similarity > bestCandidates[0].similarity)) {
        bestCandidates = candidates;
        bestVariant = result.variant;
      }
    }

    if (bestCandidates.length > 0 && bestCandidates[0].similarity >= EMBEDDING_THRESHOLD) {
      if (bestVariant !== effectiveKeyword) {
        console.log(`[ProductSearch] 공백제거 변형이 더 높은 스코어: "${effectiveKeyword}" → "${bestVariant}"`);
      }
      console.log(
        `[ProductSearch] 임베딩 매칭: "${keyword}" → "${bestCandidates[0].product.display_name}" (score: ${bestCandidates[0].similarity.toFixed(3)})`
      );
      return {
        product: bestCandidates[0].product,
        similarity: bestCandidates[0].similarity,
        candidates: bestCandidates.slice(1),
        matchMethod: "embedding",
      };
    }

    if (bestCandidates.length > 0) {
      console.log(
        `[ProductSearch] 임베딩 저확신: "${keyword}" → 최고 "${bestCandidates[0].product.display_name}" (score: ${bestCandidates[0].similarity.toFixed(3)}) — 자동 매핑 안 함`
      );
    }
  } else {
    console.warn(`[ProductSearch] 임베딩 실패, 문자열 폴백: "${keyword}"`);
  }

  // 2. 문자열 폴백 (aliases 매칭 제거, item_group 정확일치 + 부분일치만)
  const product = await stringFallbackSearch(effectiveKeyword, kw);
  if (product) {
    console.log(
      `[ProductSearch] 문자열 폴백 매칭: "${keyword}" → "${product.display_name}"`
    );
    return {
      product,
      similarity: 0,
      candidates: [],
      matchMethod: "string_fallback",
    };
  }

  return null;
}

/** 문자열 폴백: item_group 정확일치 → 부분일치 (aliases 제거) */
async function stringFallbackSearch(
  effectiveKeyword: string,
  kw: string
): Promise<CachedProduct | null> {
  const products = await getAllProducts();

  // 1차: item_group 정확 매칭
  const groupMatches = products.filter((p) => p.item_group === effectiveKeyword);
  if (groupMatches.length > 0) {
    if (groupMatches.length === 1) return groupMatches[0];
    const best = groupMatches.find(
      (p) => kw.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(kw)
    );
    return best ?? groupMatches[0];
  }

  // 2차: name/category/display_name/item_group 부분 일치
  const ilikeMatches = products.filter(
    (p) =>
      p.name.toLowerCase().includes(kw) ||
      p.category.toLowerCase().includes(kw) ||
      p.display_name?.toLowerCase().includes(kw) ||
      p.item_group?.toLowerCase().includes(kw)
  );
  if (ilikeMatches.length > 0) return ilikeMatches[0];

  // 3차: 복합 키워드 분할 매칭
  const parts = effectiveKeyword.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    const candidates = products.filter((p) => {
      const searchStr =
        `${p.name} ${p.category} ${p.display_name ?? ""} ${p.item_group ?? ""}`.toLowerCase();
      return parts.some((part) => searchStr.includes(part.toLowerCase()));
    });

    if (candidates.length > 0) {
      let bestProduct = candidates[0];
      let bestScore = 0;
      for (const p of candidates) {
        const searchStr =
          `${p.name} ${p.category} ${p.display_name ?? ""} ${p.item_group ?? ""}`.toLowerCase();
        const score = parts.filter((part) =>
          searchStr.includes(part.toLowerCase())
        ).length;
        if (score > bestScore) {
          bestScore = score;
          bestProduct = p;
        }
      }
      return bestProduct;
    }
  }

  return null;
}
