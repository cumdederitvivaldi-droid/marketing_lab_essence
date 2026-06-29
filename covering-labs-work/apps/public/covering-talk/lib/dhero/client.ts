/**
 * 두발히어로 배송 API 클라이언트
 * prod: https://partner-api.prod.dhero.kr (조회)
 * dev:  https://partner-api.dev.dhero.kr  (접수 테스트)
 */

const DHERO_API_URL = (process.env.DHERO_API_URL || "https://partner-api.prod.dhero.kr").trim();
const DHERO_TOKEN = (process.env.DHERO_TOKEN || "").trim();

// 배송 접수는 dev 환경 사용 (테스트 중)
const DHERO_DEV_API_URL = (process.env.DHERO_DEV_API_URL || "https://partner-api.dev.dhero.kr").trim();
const DHERO_DEV_TOKEN = (process.env.DHERO_DEV_TOKEN || "").trim();

async function dheroFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${DHERO_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${DHERO_TOKEN}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[dhero] API error:", { status: res.status, body, path, tokenLen: DHERO_TOKEN.length });
    throw new Error(body.message || `두발히어로 API ${res.status}`);
  }

  return res.json();
}

// dev 환경 전용 (배송 접수/취소 테스트)
async function dheroDevFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = DHERO_DEV_TOKEN || DHERO_TOKEN; // dev 토큰 없으면 prod 토큰 사용
  const url = DHERO_DEV_TOKEN ? DHERO_DEV_API_URL : DHERO_API_URL;
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `두발히어로 DEV API ${res.status}`);
  }

  return res.json();
}

// ─── 배송 상태 코드 → 한글 매핑 ───

export const DELIVERY_STATUS: Record<number, string> = {
  0: "예약",
  1: "수거배차",
  2: "수거완료",
  3: "입고완료",
  4: "출고완료",
  5: "배송완료",
  6: "반송완료",
  7: "분실완료",
  8: "배송대기",
  12: "배송연기",
};

// ─── 배송 조회 응답 타입 ───

export interface DheroDelivery {
  bookId: string;
  status: number;
  receivedDate: string | null;
  pickupScheduledDate: string | null;
  pickedupDate: string | null;
  warehousedDate: string | null;
  deliveryAllocatedDate: string | null;
  releasedDate: string | null;
  deliveredDate: string | null;
  canceledAt: string | null;
  canceledReason: string | null;
  accidentAt: string | null;
  accidentReason: string | null;
  senderName: string | null;
  senderAddress: string | null;
  senderMobile: string | null;
  receiverName: string | null;
  receiverAddress: string | null;
  receiverAddressDetail: string | null;
  receiverAddressBuilding: string | null;
  receiverMobile: string | null;
  orderIdFromCorp: string | null;
  etc1: string | null;
  etc2: string | null;
  etc3: string | null;
  deliveryRiderMobile: string | null;
  completedLocationInfo: string | null;
  notReceivedImageLocation: string | null;
  signImageLocation: string | null;
  checkPageUrl: string | null;
  delayedDeliveries: Array<{ reason: string; delayedDate: string }> | null;
  sentBackDate: string | null;
  sentBackReason: string | null;
  lostDate: string | null;
  lostReason: string | null;
}

// ─── 단건 조회 ───

export async function getDelivery(bookId: string): Promise<DheroDelivery> {
  return dheroFetch<DheroDelivery>(`/deliveries/${bookId}`);
}

// ─── 복수건 조회 ───

export interface DeliveryListParams {
  page?: number;
  pageSize?: number;
  dateFrom?: string; // YYYY-MM-DD
  canceled?: 0 | 1;
}

export async function listDeliveries(
  params: DeliveryListParams = {}
): Promise<DheroDelivery[]> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  if (params.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params.canceled !== undefined) query.set("canceled", String(params.canceled));

  const qs = query.toString();
  const raw = await dheroFetch<unknown>(`/deliveries${qs ? `?${qs}` : ""}`);

  // API가 배열 또는 paginated 객체({ content: [...] }, { data: [...] }) 반환 가능
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const arr = obj.rows ?? obj.content ?? obj.data ?? obj.items ?? obj.deliveries;
    if (Array.isArray(arr)) return arr;
  }
  console.error("[dhero] unexpected response format:", JSON.stringify(raw).slice(0, 200));
  return [];
}

// ─── 전화번호 정규화 ───

function normalizePhone(p: string): string {
  return p.replace(/[-\s]/g, "").replace(/^\+82/, "0");
}

// ─── Supabase 1차 + API 당일분 하이브리드 검색 ───
// Supabase dhero_deliveries에 과거 데이터 적재 → 전화번호 인덱스로 즉시 조회
// 당일분만 두발히어로 API 1페이지로 보충 (API 부하 최소화)

import { supabaseAdmin } from "@/lib/supabase/client";

// API 보충분 캐시 (5분 TTL) — Supabase 최신일 이후 ~ 오늘
let recentCache: { key: string; data: DheroDelivery[]; at: number } | null = null;
const RECENT_CACHE_TTL = 5 * 60 * 1000;

/** Supabase에 없는 최근분을 API에서 보충 */
async function fetchRecentDeliveries(): Promise<DheroDelivery[]> {
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Supabase에서 가장 최신 데이터 날짜 조회
  let dateFrom = today;
  try {
    const { data: latest } = await supabaseAdmin
      .from("dhero_deliveries")
      .select("received_date")
      .order("received_date", { ascending: false })
      .limit(1)
      .single();
    if (latest?.received_date) {
      // 최신 데이터 날짜의 다음날부터 API 조회
      const lastDate = new Date(latest.received_date);
      lastDate.setDate(lastDate.getDate() + 1);
      dateFrom = lastDate.toISOString().slice(0, 10);
    }
  } catch { /* Supabase 조회 실패 시 오늘부터 */ }

  // 오늘보다 미래면 조회 불필요
  if (dateFrom > today) {
    return recentCache?.data ?? [];
  }

  const cacheKey = `${dateFrom}~${today}`;
  if (recentCache && recentCache.key === cacheKey && Date.now() - recentCache.at < RECENT_CACHE_TTL) {
    return recentCache.data;
  }

  try {
    const first = await dheroFetch<Record<string, unknown>>(
      `/deliveries?pageSize=500&dateFrom=${dateFrom}&page=1`
    ).catch(() => ({ rows: [], totalCount: 0 }));

    const allRows: DheroDelivery[] = [...((first.rows as DheroDelivery[]) || [])];
    const totalCount = (first.totalCount as number) || 0;

    // 추가 페이지 (최대 3페이지 = 1,500건)
    const totalPages = Math.min(Math.ceil(totalCount / 500), 3);
    if (totalPages > 1) {
      const extras = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, i) => i + 2).map((p) =>
          dheroFetch<Record<string, unknown>>(
            `/deliveries?pageSize=500&dateFrom=${dateFrom}&page=${p}`
          ).catch(() => ({ rows: [] }))
        )
      );
      for (const raw of extras) {
        allRows.push(...((raw.rows as DheroDelivery[]) || []));
      }
    }

    recentCache = { key: cacheKey, data: allRows, at: Date.now() };
    console.log(`[dhero] recent API: ${allRows.length} deliveries (${dateFrom}~${today}, ${totalPages}p)`);
    return allRows;
  } catch (err) {
    console.error("[dhero] recent API error:", err);
    return recentCache?.data ?? [];
  }
}

/** Supabase DB row → DheroDelivery 변환 */
function dbRowToDelivery(row: Record<string, unknown>): DheroDelivery {
  return {
    bookId: row.book_id as string,
    status: DELIVERY_STATUS_REVERSE[row.status as string] ?? 0,
    receivedDate: row.received_date as string | null,
    pickupScheduledDate: null,
    pickedupDate: row.pickup_date as string | null,
    warehousedDate: null,
    deliveryAllocatedDate: null,
    releasedDate: row.release_date as string | null,
    deliveredDate: row.delivered_date as string | null,
    canceledAt: row.cancel_date as string | null,
    canceledReason: row.cancel_reason as string | null,
    accidentAt: row.accident_date as string | null,
    accidentReason: row.accident_reason as string | null,
    senderName: null,
    senderAddress: null,
    senderMobile: null,
    receiverName: row.receiver_name as string | null,
    receiverAddress: row.receiver_address as string | null,
    receiverAddressDetail: null,
    receiverAddressBuilding: null,
    receiverMobile: row.receiver_phone as string | null,
    orderIdFromCorp: row.order_id as string | null,
    etc1: null, etc2: null, etc3: null,
    deliveryRiderMobile: null,
    completedLocationInfo: null,
    notReceivedImageLocation: null,
    signImageLocation: null,
    checkPageUrl: null,
    delayedDeliveries: null,
    sentBackDate: null,
    sentBackReason: row.return_reason as string | null,
    lostDate: null,
    lostReason: null,
  };
}

// 한글 상태 → 숫자 역매핑
const DELIVERY_STATUS_REVERSE: Record<string, number> = {};
for (const [k, v] of Object.entries(DELIVERY_STATUS)) {
  DELIVERY_STATUS_REVERSE[v] = Number(k);
}

// ─── 전화번호로 최근 배송 검색 (Supabase + API 하이브리드) ───

export async function searchDeliveriesByPhone(
  phone: string,
  days = 7
): Promise<DheroDelivery[]> {
  const target = normalizePhone(phone);
  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // 1) Supabase(과거) + API(Supabase 이후~오늘) 병렬 조회
  const [dbResults, recentAll] = await Promise.all([
    supabaseAdmin
      .from("dhero_deliveries")
      .select("*")
      .eq("receiver_phone", target)
      .gte("received_date", fromDate)
      .order("received_date", { ascending: false })
      .limit(50)
      .then(({ data, error: err }) => {
        if (err) console.error("[dhero] Supabase query error:", err.message);
        return (data ?? []).map(dbRowToDelivery);
      }),
    fetchRecentDeliveries(),
  ]);

  // 2) API 결과에서 전화번호 필터링
  const recentMatches = recentAll.filter(
    (d) => normalizePhone(d.receiverMobile || "") === target ||
           normalizePhone(d.senderMobile || "") === target
  );

  // 3) 합치기 (bookId 기준 중복 제거, API 데이터 우선)
  const seenBookIds = new Set(recentMatches.map((d) => d.bookId));
  const merged = [
    ...recentMatches,
    ...dbResults.filter((d) => !seenBookIds.has(d.bookId)),
  ];

  // 최신순 정렬
  merged.sort((a, b) => (b.receivedDate || "").localeCompare(a.receivedDate || ""));
  return merged;
}

// ─── 배송 접수 ───

const DHERO_SPOT_CODE = (process.env.DHERO_SPOT_CODE || "10558").trim();

export interface CreateDeliveryParams {
  receiverName: string;
  receiverMobile: string;
  receiverAddress: string;
  receiverAddressDetail?: string;
  productName?: string;        // 제품명 (운송장 표기, 500자)
  productCount?: number;       // 상품수량 (운송장 상품명에 표기)
  memoFromCustomer?: string;   // 배송요청메시지 (운송장 표기, 100자)
  frontdoorPassword?: string;  // 공동현관 비밀번호 (라이더앱에만 노출, 50자)
  orderIdFromCorp?: string;    // 고객사 주문번호 (50자)
}

export interface CreateDeliveryResult {
  bookId: string;
  addressNotSupported: boolean;
  receiverAddress: string;
  receiverAddressDetail: string;
  placePageUrl: string;
}

export async function createDelivery(params: CreateDeliveryParams): Promise<CreateDeliveryResult> {
  return dheroFetch<CreateDeliveryResult>("/deliveries", {
    method: "POST",
    body: JSON.stringify({ ...params, spotCode: DHERO_SPOT_CODE }),
  });
}

// ─── 배송 취소 ───

export async function cancelDelivery(bookId: string, reason = "접수 취소"): Promise<void> {
  await dheroFetch(`/deliveries/${bookId}/cancel`, {
    method: "PUT",
    body: JSON.stringify({ reason }),
  });
}
