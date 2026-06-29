// [CS-DSH-050] PROMO 출장비 cap 적용 전후 — 지역별 전환률·객단가 변화 분석
//   가설: price1 ≥ 50,000 지역(인천/시흥/안산 등)은 출장비가 높아 전환이 저조했고,
//         5만원 cap 적용 이후 전환률이 개선되었을 것.
//   기본 cap 활성 시각: 2026-05-07 17:00 KST (NEXT_PUBLIC env fix 배포 시점)
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "@/lib/dashboard/_paginate";
import regionPricesData from "@/lib/data/region-prices.json";

const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);
const ACTIVE_STATUSES = ["confirmed", "payment_requested", "completed"] as const;
const PROMO_CAP_THRESHOLD = 50_000;
const DEFAULT_CAP_ACTIVATED_AT = "2026-05-07T17:00:00+09:00";

interface ConvRow {
  session_id: string;
  collected_info: { district?: string; address?: string } | null;
}

interface OrderRow {
  session_id: string;
  status: string;
  total_price: number;
}

interface RegionStat {
  district: string;
  inflow: number;
  converted: number;
  conversionRate: number;
  totalRevenue: number;
  avgRevenue: number;
  isCapTarget: boolean;
  rawPrice1: number;
}

interface PeriodSegment {
  from: string;
  to: string;
  durationDays: number;
  totalInflow: number;
  totalConverted: number;
  totalRevenue: number;
  avgConversionRate: number;
  avgRevenue: number;
  regions: RegionStat[];
}

function extractDistrict(conv: ConvRow): string | null {
  const info = conv.collected_info;
  if (!info) return null;
  if (info.district && info.district.trim()) return info.district.trim();
  const addr = info.address?.trim();
  if (!addr) return null;
  const m1 = addr.match(/([가-힣]+구)(?=\s|$|\d|[-,])/);
  if (m1) return m1[1];
  const m2 = addr.match(/([가-힣]+시)(?=\s|$|\d|[-,])/);
  if (m2 && !m2[1].includes("특별") && !m2[1].includes("광역")) return m2[1];
  const m3 = addr.match(/([가-힣]+군)(?=\s|$|\d|[-,])/);
  if (m3) return m3[1];
  return null;
}

const regionPriceMap = new Map<string, number>(
  (regionPricesData as Array<{ region: string; price1: number }>).map((r) => [r.region, r.price1]),
);

async function computeSegment(fromIso: string, toEndIso: string): Promise<{
  totalInflow: number;
  totalConverted: number;
  totalRevenue: number;
  regions: RegionStat[];
}> {
  const convRows = await paginate<ConvRow>(() =>
    supabase
      .from("conversations")
      .select("session_id, collected_info")
      .gte("created_at", fromIso)
      .lte("created_at", toEndIso),
  );

  if (convRows.length === 0) {
    return { totalInflow: 0, totalConverted: 0, totalRevenue: 0, regions: [] };
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

  const regions: RegionStat[] = [];
  let totalInflow = 0;
  let totalConverted = 0;
  let totalRevenue = 0;
  for (const [district, b] of buckets) {
    const rawPrice1 = regionPriceMap.get(district) ?? 0;
    regions.push({
      district,
      inflow: b.inflow,
      converted: b.converted,
      conversionRate: b.inflow > 0 ? (b.converted / b.inflow) * 100 : 0,
      totalRevenue: b.totalRevenue,
      avgRevenue: b.converted > 0 ? Math.round(b.totalRevenue / b.converted) : 0,
      isCapTarget: rawPrice1 >= PROMO_CAP_THRESHOLD,
      rawPrice1,
    });
    totalInflow += b.inflow;
    totalConverted += b.converted;
    totalRevenue += b.totalRevenue;
  }

  regions.sort((a, b) => b.inflow - a.inflow);

  return { totalInflow, totalConverted, totalRevenue, regions };
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
    const capActivatedAtRaw = params.get("capActivatedAt") ?? DEFAULT_CAP_ACTIVATED_AT;
    if (!fromDate || !toDate) {
      return NextResponse.json({ error: "fromDate and toDate required (YYYY-MM-DD)" }, { status: 400 });
    }

    const fromIso = new Date(`${fromDate}T00:00:00+09:00`).toISOString();
    const toEndIso = new Date(`${toDate}T23:59:59.999+09:00`).toISOString();
    const capActivatedAtIso = new Date(capActivatedAtRaw).toISOString();

    // 두 segment 정의 — cap 활성 시각이 in-range 외부면 한 쪽만 0건이 됨.
    const beforeFromIso = fromIso;
    const beforeToIso = capActivatedAtIso < toEndIso ? capActivatedAtIso : toEndIso;
    const afterFromIso = capActivatedAtIso > fromIso ? capActivatedAtIso : fromIso;
    const afterToIso = toEndIso;

    const [beforeRaw, afterRaw] = await Promise.all([
      beforeFromIso < beforeToIso
        ? computeSegment(beforeFromIso, beforeToIso)
        : Promise.resolve({ totalInflow: 0, totalConverted: 0, totalRevenue: 0, regions: [] as RegionStat[] }),
      afterFromIso < afterToIso
        ? computeSegment(afterFromIso, afterToIso)
        : Promise.resolve({ totalInflow: 0, totalConverted: 0, totalRevenue: 0, regions: [] as RegionStat[] }),
    ]);

    const dayMs = 24 * 60 * 60 * 1000;
    const beforeDuration = (new Date(beforeToIso).getTime() - new Date(beforeFromIso).getTime()) / dayMs;
    const afterDuration = (new Date(afterToIso).getTime() - new Date(afterFromIso).getTime()) / dayMs;

    const before: PeriodSegment = {
      from: beforeFromIso,
      to: beforeToIso,
      durationDays: Math.max(0, +beforeDuration.toFixed(2)),
      totalInflow: beforeRaw.totalInflow,
      totalConverted: beforeRaw.totalConverted,
      totalRevenue: beforeRaw.totalRevenue,
      avgConversionRate: beforeRaw.totalInflow > 0 ? (beforeRaw.totalConverted / beforeRaw.totalInflow) * 100 : 0,
      avgRevenue: beforeRaw.totalConverted > 0 ? Math.round(beforeRaw.totalRevenue / beforeRaw.totalConverted) : 0,
      regions: beforeRaw.regions,
    };
    const after: PeriodSegment = {
      from: afterFromIso,
      to: afterToIso,
      durationDays: Math.max(0, +afterDuration.toFixed(2)),
      totalInflow: afterRaw.totalInflow,
      totalConverted: afterRaw.totalConverted,
      totalRevenue: afterRaw.totalRevenue,
      avgConversionRate: afterRaw.totalInflow > 0 ? (afterRaw.totalConverted / afterRaw.totalInflow) * 100 : 0,
      avgRevenue: afterRaw.totalConverted > 0 ? Math.round(afterRaw.totalRevenue / afterRaw.totalConverted) : 0,
      regions: afterRaw.regions,
    };

    // cap target 지역만 별도 집계 — 인천·시흥·안산 등 5만원 이상 지역의 인입·전환률 변화 강조용
    const capTargetCompare: Array<{
      district: string;
      rawPrice1: number;
      before: { inflow: number; converted: number; conversionRate: number; avgRevenue: number };
      after: { inflow: number; converted: number; conversionRate: number; avgRevenue: number };
      conversionRateDelta: number;
    }> = [];

    const capDistricts = new Set([
      ...before.regions.filter((r) => r.isCapTarget).map((r) => r.district),
      ...after.regions.filter((r) => r.isCapTarget).map((r) => r.district),
    ]);

    for (const district of capDistricts) {
      const b = before.regions.find((r) => r.district === district);
      const a = after.regions.find((r) => r.district === district);
      const rawPrice1 = b?.rawPrice1 ?? a?.rawPrice1 ?? 0;
      const bRate = b?.conversionRate ?? 0;
      const aRate = a?.conversionRate ?? 0;
      capTargetCompare.push({
        district,
        rawPrice1,
        before: {
          inflow: b?.inflow ?? 0,
          converted: b?.converted ?? 0,
          conversionRate: bRate,
          avgRevenue: b?.avgRevenue ?? 0,
        },
        after: {
          inflow: a?.inflow ?? 0,
          converted: a?.converted ?? 0,
          conversionRate: aRate,
          avgRevenue: a?.avgRevenue ?? 0,
        },
        conversionRateDelta: aRate - bRate,
      });
    }

    capTargetCompare.sort((a, b) => (b.before.inflow + b.after.inflow) - (a.before.inflow + a.after.inflow));

    return NextResponse.json({
      capActivatedAt: capActivatedAtIso,
      before,
      after,
      capTargetCompare,
    });
  } catch (e) {
    console.error("[promo-cap-impact] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
