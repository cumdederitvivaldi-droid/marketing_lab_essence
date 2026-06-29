/**
 * Voyage AI 임베딩 클라이언트
 *
 * 품목 키워드를 1024차원 벡터로 변환하여 Supabase pgvector 유사도 검색에 사용.
 */

import { supabase } from "@/lib/supabase/client";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3-large";
const BATCH_SIZE = 128;

function getApiKey(): string {
  const key = process.env.VOYAGE_AI_API_KEY;
  if (!key) throw new Error("VOYAGE_AI_API_KEY 환경변수가 설정되지 않았습니다");
  return key;
}

/** 단일 텍스트 → 1024차원 벡터. 실패 시 null 반환 */
export async function embedText(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getApiKey()}`,
      },
      body: JSON.stringify({
        input: [text],
        model: VOYAGE_MODEL,
      }),
    });

    if (!res.ok) {
      console.error(`[Voyage] API 오류 ${res.status}:`, await res.text());
      return null;
    }

    const data = await res.json();
    return data.data?.[0]?.embedding ?? null;
  } catch (err) {
    console.error("[Voyage] embedText 실패:", err);
    return null;
  }
}

/** 배치 임베딩 (자동 청크 분할) */
export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = new Array(texts.length).fill(null);

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const chunk = texts.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(VOYAGE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify({
          input: chunk,
          model: VOYAGE_MODEL,
        }),
      });

      if (!res.ok) {
        console.error(`[Voyage] 배치 오류 ${res.status}:`, await res.text());
        continue;
      }

      const data = await res.json();
      for (let j = 0; j < chunk.length; j++) {
        results[i + j] = data.data?.[j]?.embedding ?? null;
      }
    } catch (err) {
      console.error(`[Voyage] 배치 ${i}~${i + chunk.length} 실패:`, err);
    }
  }

  return results;
}

/** 제품 → 개별 임베딩 키워드 목록 생성 (품목명 1개 + alias 각 1개) */
export function buildProductKeywords(product: {
  item_group?: string | null;
  name: string;
  aliases?: string[] | null;
}): string[] {
  const keywords: string[] = [];
  // 1) 품목명: "item_group name" (예: "냉장고 중형")
  const primary = [product.item_group, product.name].filter(Boolean).join(" ");
  if (primary) keywords.push(primary);
  // 2) 각 alias 개별 (예: "소형냉장고", "미니냉장고")
  if (product.aliases?.length) {
    for (const alias of product.aliases) {
      if (alias && !keywords.includes(alias)) {
        keywords.push(alias);
      }
    }
  }
  return keywords;
}

/** 임베딩 생성 + product_embeddings 테이블에 저장 (기존 행 삭제 후 재생성) */
export async function generateAndSaveEmbedding(
  productId: number,
  product: {
    item_group?: string | null;
    name: string;
    category: string;
    aliases?: string[] | null;
  }
): Promise<boolean> {
  const keywords = buildProductKeywords(product);

  if (keywords.length === 0) {
    console.error(`[Voyage] 제품 ${productId} 키워드 없음`);
    return false;
  }

  const embeddings = await embedBatch(keywords);

  // 기존 임베딩 삭제
  const { error: deleteError } = await supabase
    .from("product_embeddings")
    .delete()
    .eq("product_id", productId);

  if (deleteError) {
    console.error(`[Voyage] 제품 ${productId} 기존 임베딩 삭제 실패:`, deleteError.message);
    return false;
  }

  // 새 임베딩 삽입
  const rows = keywords
    .map((keyword, i) => {
      const emb = embeddings[i];
      if (!emb) return null;
      return {
        product_id: productId,
        keyword,
        embedding: JSON.stringify(emb),
      };
    })
    .filter(Boolean);

  if (rows.length === 0) {
    console.error(`[Voyage] 제품 ${productId} 모든 임베딩 생성 실패`);
    return false;
  }

  const { error: insertError } = await supabase
    .from("product_embeddings")
    .insert(rows);

  if (insertError) {
    console.error(`[Voyage] 제품 ${productId} 임베딩 저장 실패:`, insertError.message);
    return false;
  }

  console.log(`[Voyage] 제품 ${productId} 임베딩 ${rows.length}/${keywords.length}건 저장 완료`);
  return true;
}
