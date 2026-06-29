// [CS-DSH-043] 신규 대시보드 — 전환 인입 시간 분석
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "@/lib/dashboard/_paginate";

const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);
const ACTIVE_STATUSES = ["confirmed", "payment_requested", "completed"] as const;

interface OrderRow {
  created_at: string;
  total_price: number;
}

interface HourlyBucket {
  hour: number;
  count: number;
  totalRevenue: number;
  avgRevenue: number;
}

interface WeekdayHourlyBucket {
  weekday: number;
  hour: number;
  count: number;
}

interface DailyBucket {
  date: string;          // YYYY-MM-DD (KST)
  weekday: number;       // 0=Sun ~ 6=Sat
  count: number;
  totalRevenue: number;
  avgRevenue: number;
  avgHour: number;       // weighted-average created_at hour (KST)
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

    const orders = await paginate<OrderRow>(() =>
      supabase
        .from("orders")
        .select("created_at, total_price")
        .gte("created_at", fromIso)
        .lte("created_at", toEndIso)
        .in("status", [...ACTIVE_STATUSES]),
    );

    const hourlyMap = new Map<number, { count: number; totalRevenue: number }>();
    for (let h = 0; h < 24; h++) hourlyMap.set(h, { count: 0, totalRevenue: 0 });

    const weekdayHourlyMap = new Map<string, number>();
    const dailyMap = new Map<string, { weekday: number; count: number; totalRevenue: number; hourSum: number }>();

    for (const order of orders) {
      const utcMs = new Date(order.created_at).getTime();
      const kstMs = utcMs + 9 * 60 * 60 * 1000;
      const kstDate = new Date(kstMs);
      const hour = kstDate.getUTCHours();
      const weekday = kstDate.getUTCDay();
      const dateKey = kstDate.toISOString().slice(0, 10);
      const price = order.total_price ?? 0;

      const bucket = hourlyMap.get(hour)!;
      bucket.count++;
      bucket.totalRevenue += price;

      const wKey = `${weekday}:${hour}`;
      weekdayHourlyMap.set(wKey, (weekdayHourlyMap.get(wKey) ?? 0) + 1);

      const day = dailyMap.get(dateKey) ?? { weekday, count: 0, totalRevenue: 0, hourSum: 0 };
      day.count++;
      day.totalRevenue += price;
      day.hourSum += hour;
      dailyMap.set(dateKey, day);
    }

    const hourly: HourlyBucket[] = [];
    for (let h = 0; h < 24; h++) {
      const b = hourlyMap.get(h)!;
      hourly.push({
        hour: h,
        count: b.count,
        totalRevenue: b.totalRevenue,
        avgRevenue: b.count > 0 ? Math.round(b.totalRevenue / b.count) : 0,
      });
    }

    const weekdayHourly: WeekdayHourlyBucket[] = [];
    for (let w = 0; w < 7; w++) {
      for (let h = 0; h < 24; h++) {
        const count = weekdayHourlyMap.get(`${w}:${h}`) ?? 0;
        weekdayHourly.push({ weekday: w, hour: h, count });
      }
    }

    const daily: DailyBucket[] = [];
    for (const [date, d] of dailyMap.entries()) {
      daily.push({
        date,
        weekday: d.weekday,
        count: d.count,
        totalRevenue: d.totalRevenue,
        avgRevenue: d.count > 0 ? Math.round(d.totalRevenue / d.count) : 0,
        avgHour: d.count > 0 ? d.hourSum / d.count : 0,
      });
    }
    daily.sort((a, b) => (a.date < b.date ? -1 : 1));

    const totalConverted = orders.length;
    const peakHour = hourly.reduce((best, cur) => (cur.count > best.count ? cur : best), hourly[0]).hour;
    const lowHourCandidates = hourly.filter((h) => h.count > 0);
    const lowHour = lowHourCandidates.length > 0
      ? lowHourCandidates.reduce((best, cur) => (cur.count < best.count ? cur : best), lowHourCandidates[0]).hour
      : 0;
    const topRevenueHour = hourly.reduce((best, cur) => (cur.avgRevenue > best.avgRevenue ? cur : best), hourly[0]).hour;

    return NextResponse.json({
      hourly,
      weekdayHourly,
      daily,
      summary: { peakHour, lowHour, topRevenueHour, totalConverted },
    });
  } catch (err) {
    console.error("[conversion-time] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
