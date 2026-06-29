import regionPricesData from "@/lib/data/region-prices.json";

interface RegionPrice {
  region: string;
  price1: number;
  price2: number;
  price3: number;
}

const regionPrices: RegionPrice[] = regionPricesData;

// 한시적 프로모션 cap — 1명 단가가 5만원 이상인 지역의 출장비를 일괄 cap.
//   env NEXT_PUBLIC_PROMO_TRIP_FEE_CAP=1 일 때만 활성. 끄면 즉시 원래 가격.
//   NEXT_PUBLIC_ prefix 필수 — client component(QuoteEditor)에서도 동일 값 참조.
const PROMO_CAP_ENABLED =
  process.env.NEXT_PUBLIC_PROMO_TRIP_FEE_CAP?.trim() === "1" ||
  process.env.PROMO_TRIP_FEE_CAP?.trim() === "1";
const PROMO_CAP_BY_WORKERS: Record<number, number> = { 1: 50_000, 2: 75_000, 3: 113_000 };
const PROMO_CAP_THRESHOLD = 50_000; // region.price1 이 이 값 이상이면 cap 적용

/**
 * 지역명과 인원 수로 출장비 조회
 * @param district 지역명 (예: "강남구", "수원")
 * @param workerCount 인원 수 (1, 2, 3)
 * @returns 출장비 (원) — 지역 미매칭 시 0
 */
export function getTripFee(district: string | null, workerCount: number = 1): number {
  if (!district) return 0;

  const region = regionPrices.find((r) => r.region === district);
  if (!region) return 0;

  // PROMO cap 우선 적용 — region.price1 >= 50,000 인 지역만 1/2/3명 단가 일괄 cap
  if (PROMO_CAP_ENABLED && region.price1 >= PROMO_CAP_THRESHOLD) {
    const capped = PROMO_CAP_BY_WORKERS[workerCount];
    if (capped !== undefined) return capped;
  }

  switch (workerCount) {
    case 1: return region.price1;
    case 2: return region.price2;
    case 3: return region.price3;
    default: return region.price1;
  }
}

/** PROMO cap 적용 헬퍼 — region.price1 ≥ 5만이면 1/2/3명 단가 일괄 cap */
export function applyPromoCap(r: RegionPrice): RegionPrice {
  if (!PROMO_CAP_ENABLED) return r;
  if (r.price1 < PROMO_CAP_THRESHOLD) return r;
  return { ...r, price1: PROMO_CAP_BY_WORKERS[1], price2: PROMO_CAP_BY_WORKERS[2], price3: PROMO_CAP_BY_WORKERS[3] };
}

/**
 * 지역별 인원별 출장비 전체 조회 (UI 표시용) — PROMO cap 자동 적용
 */
export function getRegionPrices(district: string | null): RegionPrice | null {
  if (!district) return null;
  const found = regionPrices.find((r) => r.region === district);
  return found ? applyPromoCap(found) : null;
}

/** 전체 지역 리스트 반환 (모달 선택용) — PROMO cap 자동 적용 */
export function getAllRegions(): RegionPrice[] {
  return regionPrices.map(applyPromoCap);
}

/** 부가세(10%) 계산 */
export function calcVat(subtotal: number): number {
  return Math.round(subtotal * 0.1);
}

/** 백원 단위 올림 (예: 263,450 → 264,000) */
export function ceilTo1000(amount: number): number {
  return Math.ceil(amount / 1000) * 1000;
}
