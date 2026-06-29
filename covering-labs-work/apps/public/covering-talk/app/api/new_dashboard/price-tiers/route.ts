// [CS-DSH-044] 견적 가격대별 전환률 — 구간별 전환/취소/매출
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "@/lib/dashboard/_paginate";

const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);
const ACTIVE_STATUSES = ["confirmed", "payment_requested", "completed"] as const;

interface ConvRow {
  session_id: string;
  status: string;
  quote: { totalPrice?: number; sentAt?: string } | null;
}

interface OrderRow {
  session_id: string;
  status: string;
  total_price: number;
}

interface PriceTier {
  tier: string;
  minPrice: number;
  maxPrice: number | null;
  quoteCount: number;
  convertedCount: number;
  conversionRate: number;
  avgRevenue: number;
  cancelledCount: number;
}

const TIERS: { tier: string; minPrice: number; maxPrice: number | null }[] = [
  { tier: "10만 미만", minPrice: 0, maxPrice: 100000 },
  { tier: "10–20만", minPrice: 100000, maxPrice: 200000 },
  { tier: "20–40만", minPrice: 200000, maxPrice: 400000 },
  { tier: "40–60만", minPrice: 400000, maxPrice: 600000 },
  { tier: "60만+", minPrice: 600000, maxPrice: null },
];

function getTierIndex(price: number): number {
  for (let i = 0; i < TIERS.length; i++) {
    const t = TIERS[i];
    if (t.maxPrice === null || price < t.maxPrice) return i;
  }
  return TIERS.length - 1;
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
        .select("session_id, status, quote")
        .gte("created_at", fromIso)
        .lte("created_at", toEndIso)
        .not("quote", "is", null),
    );

    const quotedConvs = convRows.filter(
      (c) => c.quote && c.quote.sentAt != null,
    );

    if (quotedConvs.length === 0) {
      return NextResponse.json({
        tiers: TIERS.map((t) => ({ ...t, quoteCount: 0, convertedCount: 0, conversionRate: 0, avgRevenue: 0, cancelledCount: 0 })),
        summary: { totalQuotes: 0, totalConverted: 0, overallRate: 0, avgQuotePrice: 0 },
      });
    }

    const sessionIds = [...new Set(quotedConvs.map((c) => c.session_id))];

    const CHUNK = 500;
    const orderRows: OrderRow[] = [];
    for (let i = 0; i < sessionIds.length; i += CHUNK) {
      const chunk = sessionIds.slice(i, i + CHUNK);
      const rows = await paginate<OrderRow>(() =>
        supabase
          .from("orders")
          .select("session_id, status, total_price")
          .in("session_id", chunk),
      );
      orderRows.push(...rows);
    }

    const ordersBySession = new Map<string, OrderRow[]>();
    for (const o of orderRows) {
      const arr = ordersBySession.get(o.session_id) ?? [];
      arr.push(o);
      ordersBySession.set(o.session_id, arr);
    }

    const tierBuckets = TIERS.map((t) => ({
      ...t,
      quoteCount: 0,
      convertedCount: 0,
      totalRevenue: 0,
      cancelledCount: 0,
    }));

    let totalQuotePriceSum = 0;

    for (const conv of quotedConvs) {
      const price = conv.quote?.totalPrice ?? 0;
      const idx = getTierIndex(price);
      totalQuotePriceSum += price;
      tierBuckets[idx].quoteCount++;

      const orders = ordersBySession.get(conv.session_id) ?? [];
      const hasActive = orders.some((o) => (ACTIVE_STATUSES as readonly string[]).includes(o.status));
      const hasCancelled = orders.some((o) => o.status === "cancelled");

      if (hasActive) {
        tierBuckets[idx].convertedCount++;
        const activeRevenue = orders
          .filter((o) => (ACTIVE_STATUSES as readonly string[]).includes(o.status))
          .reduce((s, o) => s + (o.total_price ?? 0), 0);
        tierBuckets[idx].totalRevenue += activeRevenue;
      } else if (hasCancelled) {
        tierBuckets[idx].cancelledCount++;
      }
    }

    const tiers: PriceTier[] = tierBuckets.map((b) => ({
      tier: b.tier,
      minPrice: b.minPrice,
      maxPrice: b.maxPrice,
      quoteCount: b.quoteCount,
      convertedCount: b.convertedCount,
      conversionRate: b.quoteCount > 0 ? Math.round((b.convertedCount / b.quoteCount) * 1000) / 10 : 0,
      avgRevenue: b.convertedCount > 0 ? Math.round(b.totalRevenue / b.convertedCount) : 0,
      cancelledCount: b.cancelledCount,
    }));

    const totalQuotes = quotedConvs.length;
    const totalConverted = tiers.reduce((s, t) => s + t.convertedCount, 0);

    return NextResponse.json({
      tiers,
      summary: {
        totalQuotes,
        totalConverted,
        overallRate: totalQuotes > 0 ? Math.round((totalConverted / totalQuotes) * 1000) / 10 : 0,
        avgQuotePrice: totalQuotes > 0 ? Math.round(totalQuotePriceSum / totalQuotes) : 0,
      },
    });
  } catch (err) {
    console.error("[price-tiers] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
