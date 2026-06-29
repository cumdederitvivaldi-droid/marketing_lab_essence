/**
 * 제품 인메모리 캐시
 *
 * products 테이블은 거의 변경되지 않으므로 5분 TTL로 메모리에 캐시.
 * 메시지당 20~25회 Supabase 쿼리 → 0~1회로 감소.
 */

import { supabase } from "@/lib/supabase/client";

export interface CachedProduct {
  id: number;
  name: string;
  category: string;
  display_name: string | null;
  item_group: string | null;
  aliases: string[] | null;
  width: number;
  depth: number;
  height: number;
  volume: number;
  unit_price: number;
  weight: number;
  is_active: boolean;
}

let cachedProducts: CachedProduct[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5분

export async function getAllProducts(): Promise<CachedProduct[]> {
  if (cachedProducts && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedProducts;
  }
  const { data, error } = await supabase.from("products").select("*");
  if (error) {
    console.error("[ProductCache] 로드 실패:", error.message);
    // 기존 캐시가 있으면 만료되어도 반환 (graceful degradation)
    return cachedProducts ?? [];
  }
  cachedProducts = (data ?? []) as CachedProduct[];
  cacheTimestamp = Date.now();
  console.log(`[ProductCache] ${cachedProducts.length}개 제품 캐시 갱신`);
  return cachedProducts;
}

/** 캐시 강제 무효화 (관리자가 제품 수정 시 호출) */
export function invalidateProductCache(): void {
  cachedProducts = null;
  cacheTimestamp = 0;
}
