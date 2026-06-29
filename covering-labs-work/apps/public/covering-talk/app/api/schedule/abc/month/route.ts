import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import {
  type TimeBlock,
  timeSlotToBlock,
  resolveCapacity,
  isDateClosed,
  parseBoxCount,
  type ABCCapacitySettings,
} from "@/lib/dispatch/time-blocks";

// GET /api/schedule/abc/month?year=2026&month=4
// [CS-SLT-003] 월간 ABC 집계 — 달력 뷰용 (날짜 범위 1회 쿼리)
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const yearStr = request.nextUrl.searchParams.get("year");
    const monthStr = request.nextUrl.searchParams.get("month");
    if (!yearStr || !monthStr) {
      return NextResponse.json({ error: "year, month 필수" }, { status: 400 });
    }
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10); // 1-12
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: "invalid year/month" }, { status: 400 });
    }

    // 범위: 표시되는 달력 6주(42일) 커버 — 전월 말 ~ 다음월 초 포함
    const firstOfMonth = new Date(year, month - 1, 1);
    const startOffset = firstOfMonth.getDay(); // 0=일
    const rangeStart = new Date(year, month - 1, 1 - startOffset);
    const rangeEnd = new Date(year, month - 1, 1 - startOffset + 42 - 1);
    const toIso = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    const startIso = toIso(rangeStart);
    const endIso = toIso(rangeEnd);

    // 케파 설정
    const { data: settingRow } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "abc_capacity")
      .maybeSingle();
    const settings = (settingRow?.value as ABCCapacitySettings | null) ?? null;

    // orders + lunch_orders 범위 조회
    const [ordersRes, lunchRes] = await Promise.all([
      supabase
        .from("orders")
        .select("date, time_slot, status")
        .gte("date", startIso)
        .lte("date", endIso)
        .neq("status", "cancelled"),
      supabase
        .from("lunch_orders")
        .select("date, pickup_time, box_count, status")
        .gte("date", startIso)
        .lte("date", endIso)
        .neq("status", "cancelled"),
    ]);
    if (ordersRes.error) throw ordersRes.error;
    if (lunchRes.error) throw lunchRes.error;

    // 날짜 × 블록 카운트 집계
    const byDate: Record<string, Record<TimeBlock, number>> = {};
    const ensure = (d: string) => {
      if (!byDate[d]) byDate[d] = { A: 0, B: 0, C: 0 };
      return byDate[d];
    };

    for (const o of ordersRes.data || []) {
      const b = timeSlotToBlock(o.time_slot as string);
      if (b) ensure(o.date as string)[b] += 1;
    }
    for (const l of lunchRes.data || []) {
      const box = parseBoxCount(l.box_count as string);
      if (box < 100) continue;
      const b = timeSlotToBlock(l.pickup_time as string);
      if (b) ensure(l.date as string)[b] += 1;
    }

    // 날짜별 응답 조립 (42일 전체)
    const days: Record<string, {
      closed: boolean;
      capacity: Record<TimeBlock, number>;
      counts: Record<TimeBlock, number>;
    }> = {};

    for (let i = 0; i < 42; i++) {
      const d = new Date(rangeStart);
      d.setDate(rangeStart.getDate() + i);
      const iso = toIso(d);
      const cap = resolveCapacity(settings, iso);
      const cnt = byDate[iso] ?? { A: 0, B: 0, C: 0 };
      days[iso] = {
        closed: isDateClosed(settings, iso),
        capacity: cap,
        counts: cnt,
      };
    }

    return NextResponse.json({
      year,
      month,
      rangeStart: startIso,
      rangeEnd: endIso,
      days,
    });
  } catch (err) {
    console.error("[schedule/abc/month] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "집계 실패" },
      { status: 500 }
    );
  }
}