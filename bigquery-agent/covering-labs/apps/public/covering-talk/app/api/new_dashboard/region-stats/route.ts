import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "@/lib/dashboard/_paginate";
import { periodFromSearchParams } from "@/lib/dashboard/period";

const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);

interface OrderRow {
  order_number: string | null;
  customer_name: string | null;
  address: string;
  date: string | null;
  total_price: number;
  items: Array<{ category?: string; displayName?: string; name?: string }> | null;
}

interface ConvRow {
  collected_info: { address?: string } | null;
}

const SIDO_MAP: Record<string, string> = {
  "서울": "서울특별시",
  "경기": "경기도",
  "인천": "인천광역시",
};

// 비서비스 시도 — address 첫 토큰 매칭. 약칭/정식 모두 커버.
const NON_SERVICE_SIDO_KEYS: Array<{ match: string; canonical: string }> = [
  { match: "부산", canonical: "부산광역시" },
  { match: "대구", canonical: "대구광역시" },
  { match: "광주", canonical: "광주광역시" },
  { match: "대전", canonical: "대전광역시" },
  { match: "울산", canonical: "울산광역시" },
  { match: "세종", canonical: "세종특별자치시" },
  { match: "강원", canonical: "강원도" },
  { match: "충북", canonical: "충청북도" },
  { match: "충청북", canonical: "충청북도" },
  { match: "충남", canonical: "충청남도" },
  { match: "충청남", canonical: "충청남도" },
  { match: "전북", canonical: "전라북도" },
  { match: "전라북", canonical: "전라북도" },
  { match: "전남", canonical: "전라남도" },
  { match: "전라남", canonical: "전라남도" },
  { match: "경북", canonical: "경상북도" },
  { match: "경상북", canonical: "경상북도" },
  { match: "경남", canonical: "경상남도" },
  { match: "경상남", canonical: "경상남도" },
  { match: "제주", canonical: "제주특별자치도" },
];

function detectNonServiceSido(address: string | undefined): string | null {
  if (!address) return null;
  const trimmed = address.trim();
  for (const { match, canonical } of NON_SERVICE_SIDO_KEYS) {
    if (trimmed.startsWith(match)) return canonical;
  }
  return null;
}

/**
 * orders.address / collected_info.address 에서 (시도, 시군구) 추출.
 * 서울/경기/인천만 매칭.
 *   "서울시 성동구 ..." → { sido: "서울특별시", sigungu: "성동구" }
 *   "경기 수원시 영통구 ..." → { sido: "경기도", sigungu: "수원시영통구" } (GeoJSON 명칭과 일치)
 *   "경기 김포시 ..." → { sido: "경기도", sigungu: "김포시" }
 *   "경기 화성시 동탄2동 ..." → 화성시 (GeoJSON 에 동탄구 없음 → 시 단위 fallback)
 */
// GeoJSON 에 시+구 결합으로 존재하는 경기도 시 (4개 일반시). 그 외 시는 시 단위만.
const GYEONGGI_SI_WITH_GU = new Set([
  "수원시장안구", "수원시권선구", "수원시팔달구", "수원시영통구",
  "성남시수정구", "성남시중원구", "성남시분당구",
  "안양시만안구", "안양시동안구",
  "안산시상록구", "안산시단원구",
  "고양시덕양구", "고양시일산동구", "고양시일산서구",
  "용인시처인구", "용인시기흥구", "용인시수지구",
]);

function parseRegion(address: string): { sido: string; sigungu: string } | null {
  if (!address) return null;
  const m = address.match(
    /^(서울|경기|인천)(?:특별시|광역시|도|시)?\s+([가-힣]+(?:시|구|군))(?:\s+([가-힣]+구))?/,
  );
  if (!m) return null;
  const sido = SIDO_MAP[m[1]];
  if (!sido) return null;
  let sigungu = m[2];
  if (sido === "경기도" && m[3]) {
    const candidate = m[2] + m[3];
    sigungu = GYEONGGI_SI_WITH_GU.has(candidate) ? candidate : m[2];
  }
  return { sido, sigungu };
}

// [CS-ADM-024] 방문수거 지역 통계 — 시군구별 건수/객단가 + 서비스 불가 + Top 카테고리
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_DASHBOARD_ALLOWED_USERS.has(user.name)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const params = new URL(request.url).searchParams;
    const range = periodFromSearchParams(params);

    // 1. 서비스 가능 — 수거 완료된 건만 (analytics route P8 정의와 일치).
    //   기준: orders.date (수거 예정/실제 일자). created_at(예약 생성일) 아님.
    //   countOrdersByDateRange + KR1 매출 모두 date 기준이라 통일.
    const orders = await paginate<OrderRow>(() =>
      supabase
        .from("orders")
        .select("order_number, customer_name, address, date, total_price, items")
        .gte("date", range.fromDateKst)
        .lte("date", range.toDateKst)
        .in("status", ["payment_requested", "completed"]),
    );

    const serviceableMap = new Map<string, { count: number; revenue: number }>();
    // 카테고리별 합계 + 품목별 세부 집계 (호버 detail 표시용)
    const categoryMap = new Map<string, { count: number; items: Map<string, number> }>();
    // 디버그 — 매칭 실패 주문 list (응답 _debug.unmatched 로 포함)
    const unmatched: Array<{ orderNumber: string | null; customerName: string | null; address: string; date: string | null }> = [];

    for (const o of orders) {
      const r = parseRegion(o.address);
      if (r) {
        const key = `${r.sido} ${r.sigungu}`;
        const cur = serviceableMap.get(key) ?? { count: 0, revenue: 0 };
        cur.count++;
        cur.revenue += o.total_price || 0;
        serviceableMap.set(key, cur);
      } else if (o.address) {
        unmatched.push({
          orderNumber: o.order_number,
          customerName: o.customer_name,
          address: o.address,
          date: o.date,
        });
      }
      if (Array.isArray(o.items)) {
        for (const item of o.items) {
          // displayName 은 "카테고리 - 품목명" 형식. category / name 분리
          const cat = item.category || (item.displayName?.split(" - ")[0] ?? "").trim();
          const name = (item.name || item.displayName?.split(" - ")[1] || "").trim();
          if (!cat) continue;
          const bucket = categoryMap.get(cat) ?? { count: 0, items: new Map<string, number>() };
          bucket.count++;
          if (name) bucket.items.set(name, (bucket.items.get(name) ?? 0) + 1);
          categoryMap.set(cat, bucket);
        }
      }
    }

    // 2. 서비스 불가 — 기간 내 conversations 중 collected_info.address 가 명시적 비서비스 시도인 경우만.
    //   wrong_inbound status 만으로는 분류 부정확 (오인입·단순문의·다른채널 안내도 wrong_inbound)
    //   → address 기반 명시적 비서비스 시도 매칭만 카운트.
    const convs = await paginate<ConvRow>(() =>
      supabase
        .from("conversations")
        .select("collected_info")
        .gte("created_at", range.fromIso)
        .lte("created_at", range.toIso),
    );
    const unserviceableSidoMap = new Map<string, number>();
    for (const c of convs) {
      const detected = detectNonServiceSido(c.collected_info?.address);
      if (detected) {
        unserviceableSidoMap.set(detected, (unserviceableSidoMap.get(detected) ?? 0) + 1);
      }
    }

    return NextResponse.json({
      serviceableRegions: [...serviceableMap].map(([key, v]) => ({
        sigungu: key,
        count: v.count,
        totalRevenue: v.revenue,
        avgPrice: v.count > 0 ? Math.round(v.revenue / v.count) : 0,
      })).sort((a, b) => b.count - a.count),
      unserviceableSidos: [...unserviceableSidoMap]
        .map(([sido, count]) => ({ sido, count }))
        .sort((a, b) => b.count - a.count),
      topCategories: [...categoryMap]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([category, b]) => ({
          category,
          count: b.count,
          // 품목 detail Top 6 (호버 표시용)
          details: [...b.items]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([name, count]) => ({ name, count })),
        })),
      // 디버그 — parseRegion 매칭 실패 list (운영자가 직접 정정/규칙 추가용)
      _debug: {
        totalOrders: orders.length,
        matchedOrders: [...serviceableMap.values()].reduce((a, v) => a + v.count, 0),
        unmatchedCount: unmatched.length,
        unmatched,
      },
    });
  } catch (err) {
    console.error("[region-stats] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
