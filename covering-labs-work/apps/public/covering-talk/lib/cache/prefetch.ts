/**
 * 클라이언트 데이터 프리페치 캐시
 * 레이아웃 레벨에서 백그라운드로 데이터를 미리 로딩하여
 * 탭 이동 시 즉시 표시
 */

type CacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

const MAX_AGE_MS = 10_000; // 10초간 캐시 유지

/** 캐시에서 데이터 가져오기 (만료되었으면 null) */
export function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > MAX_AGE_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

/** 캐시에 데이터 저장 */
export function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, fetchedAt: Date.now() });
}

/** 백그라운드 프리페치 (중복 요청 방지) */
export async function prefetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  // 캐시에 유효한 데이터가 있으면 즉시 반환
  const cached = getCached<T>(key);
  if (cached !== null) return cached;

  // 이미 진행 중인 요청이 있으면 대기
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  // 새 요청 시작
  const promise = fetcher().then((data) => {
    setCache(key, data);
    inflight.delete(key);
    return data;
  }).catch((err) => {
    inflight.delete(key);
    throw err;
  });

  inflight.set(key, promise);
  return promise;
}

/** 캐시 무효화 */
export function invalidateCache(key: string): void {
  cache.delete(key);
}

// 프리페치 키 상수
export const CACHE_KEYS = {
  CONVERSATIONS: "conversations",
  DASHBOARD_STATS: "dashboard_stats",
  PRODUCTS: "products",
  LADDER_FEES: "ladder_fees",
  REGION_PRICES: "region_prices",
} as const;
