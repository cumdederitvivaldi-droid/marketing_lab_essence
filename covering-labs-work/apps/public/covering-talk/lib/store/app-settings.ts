import { supabase } from "@/lib/supabase/client";

const CACHE_TTL_MS = 60_000;
type CacheEntry = { value: unknown; at: number };
const cache = new Map<string, CacheEntry>();

async function readSetting<T = unknown>(key: string, fallback: T): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.value as T;
  }
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .single();
    if (error || !data) {
      cache.set(key, { value: fallback, at: Date.now() });
      return fallback;
    }
    const value = (data.value as T) ?? fallback;
    cache.set(key, { value, at: Date.now() });
    return value;
  } catch {
    cache.set(key, { value: fallback, at: Date.now() });
    return fallback;
  }
}

export function invalidateAppSettingCache(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

export async function getPrepaymentEnabled(): Promise<boolean> {
  const v = await readSetting<boolean | string>("prepayment_enabled", false);
  return v === true || v === "true";
}

// 선결제 정책 cutoff ISO 시각. payment-sync 가 결제완료 감지 시 사용:
//   order.created_at >= cutoff  → prepaid (신규 정책 흐름)
//   order.created_at <  cutoff  → completed (기존 데이터 그대로)
//   null  → cutoff 없음, 모든 주문이 prepaid 로 전이 (flag ON 시).
// 운영자가 정책 시행일 0시(KST) 또는 시행 시점의 ISO 를 setting 에 INSERT 해두면 됨.
export async function getPrepaymentCutoffIso(): Promise<string | null> {
  const v = await readSetting<string | null>("prepayment_cutoff_iso", null);
  if (typeof v === "string" && v.trim()) return v;
  return null;
}
