// [CS-DSH-045] 지역별 전환률·객단가 — 구별 인입/전환/매출 분석
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "@/lib/dashboard/_paginate";

const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);
const ACTIVE_STATUSES = ["confirmed", "payment_requested", "completed"] as const;

interface ConvRow {
  session_id: string;
  collected_info: { district?: string; address?: string } | null;
}

interface OrderRow {
  session_id: string;
  status: string;
  total_price: number;
}

interface RegionBucket {
  district: string;
  inflow: number;
  converted: number;
  conversionRate: number;
  totalRevenue: number;
  avgRevenue: number;
}

// "구" 추출 — collected_info.district 우선, address 정규식 fallback (다양한 패턴 대응).
// 추출 실패 시 null 반환 → 지역 통계에서 제외 (정보수집 미도달 conversation).
function extractDistrict(conv: ConvRow): string | null {
  const info = conv.collected_info;
  if (!info) return null;
  if (info.district && info.district.trim()) return info.district.trim();
  const addr = info.address?.trim();
  if (!addr) return null;

  // 1. "OO구" (가장 흔함: 강동구, 송파구, 마포구 ...)
  const m1 = addr.match(/([가-힣]+구)(?=\s|$|\d|[-,])/);
  if (m1) return m1[1];

  // 2. 광역시·도 (서울 외 지역) — "OO시" 또는 "OO군" fallback
  const m2 = addr.match(/([가-힣]+시)(?=\s|$|\d|[-,])/);
  if (m2 && !m2[1].includes("특별") && !m2[1].includes("광역")) return m2[1];
  const m3 = addr.match(/([가-힣]+군)(?=\s|$|\d|[-,])/);
  if (m3) return m3[1];

  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_DASHBOARD_ALLOWED_USERS.has(user.name)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const params = new URL(request.url).searchParams;
    const fromDate = params.get("fromDate");
    const toDate = params.get("toDate");
    if (!fromDate || !toDate) {
      return NextResponse.json({ error: "fromDate and toDate required (YYYY-MM-DD)" }, { status: 400 });
    }

    const fromIso = new Date(`${fromDate}T00:00:00+09:00`).toISOString();
    const toEndIso = new Date(`${toDate}T23:59:59.999+09:00`).toISOString();

    const convRows = await paginate<ConvRow>(() =>
      supabase
        .from("conversations")
        .select("session_id, collected_info")
        .gte("created_at", fromIso)
        .lte("created_at", toEndIso),
    );

    if (convRows.length === 0) {
      return NextResponse.json({
        regions: [],
        summary: { topDistrict: "—", topConvRateDistrict: "—", topAvgPriceDistrict: "—", totalDistricts: 0 },
      });
    }

    const sessionIds = [...new Set(convRows.map((c) => c.session_id))];
    const CHUNK = 500;
    const orderRows: OrderRow[] = [];
    for (let i = 0; i < sessionIds.length; i += CHUNK) {
      const chunk = sessionIds.slice(i, i + CHUNK);
      const rows = await paginate<OrderRow>(() =>
        supabase
          .from("orders")
          .select("session_id, status, total_price")
          .in("session_id", chunk)
          .in("status", [...ACTIVE_STATUSES]),
      );
      orderRows.push(...rows);
    }

    const ordersBySession = new Map<string, OrderRow[]>();
    for (const o of orderRows) {
      const arr = ordersBySession.get(o.session_id) ?? [];
      arr.push(o);
      ordersBySession.set(o.session_id, arr);
    }

    const buckets = new Map<string, { inflow: number; converted: number; totalRevenue: number }>();

    for (const conv of convRows) {
      const district = extractDistrict(conv);
      if (!district) continue;
      const b = buckets.get(district) ?? { inflow: 0, converted: 0, totalRevenue: 0 };
      b.inflow++;
      const orders = ordersBySession.get(conv.session_id) ?? [];
      if (orders.length > 0) {
        b.converted++;
        b.totalRevenue += orders.reduce((s, o) => s + (o.total_price ?? 0), 0);
      }
      buckets.set(district, b);
    }

    const allRegions: RegionBucket[] = [];
    for (const [district, b] of buckets.entries()) {
      allRegions.push({
        district,
        inflow: b.inflow,
        converted: b.converted,
        conversionRate: b.inflow > 0 ? Math.round((b.converted / b.inflow) * 1000) / 10 : 0,
        totalRevenue: b.totalRevenue,
        avgRevenue: b.converted > 0 ? Math.round(b.totalRevenue / b.converted) : 0,
      });
    }

    allRegions.sort((a, b) => b.inflow - a.inflow);
    const regions = allRegions;

    const topDistrict = allRegions[0]?.district ?? "—";
    const topConvRateDistrict = [...allRegions].filter((r) => r.inflow >= 3).sort((a, b) => b.conversionRate - a.conversionRate)[0]?.district ?? "—";
    const topAvgPriceDistrict = [...allRegions].filter((r) => r.converted >= 2).sort((a, b) => b.avgRevenue - a.avgRevenue)[0]?.district ?? "—";

    return NextResponse.json({
      regions,
      summary: {
        topDistrict,
        topConvRateDistrict,
        topAvgPriceDistrict,
        totalDistricts: buckets.size,
      },
    });
  } catch (err) {
    console.error("[region-conversion] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
