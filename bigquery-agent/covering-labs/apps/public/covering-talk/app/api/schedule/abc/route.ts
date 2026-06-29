import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import {
  BLOCK_ORDER,
  type TimeBlock,
  timeSlotToBlock,
  resolveCapacity,
  isDateClosed,
  parseBoxCount,
  getWeekdayKey,
  type ABCCapacitySettings,
} from "@/lib/dispatch/time-blocks";

// [CS-SLT-002] ABC 블록별 예약 현황 (orders + lunch_orders 기반, 런치 100인분 미만 제외)
// 2026-04-21: bookings 참조 제거 — 진본은 orders (bookings는 제거 예정 레거시)
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const date = request.nextUrl.searchParams.get("date");
    if (!date) return NextResponse.json({ error: "date 필수" }, { status: 400 });

    // 1. 케파 설정 조회
    const { data: settingRow } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "abc_capacity")
      .maybeSingle();
    const settings = (settingRow?.value as ABCCapacitySettings | null) ?? null;
    const capacity = resolveCapacity(settings, date);
    const closed = isDateClosed(settings, date);

    // 2. 방문수거(orders) + 런치 병렬 조회
    const [ordersRes, lunchRes] = await Promise.all([
      supabase
        .from("orders")
        .select("id, customer_name, time_slot, status")
        .eq("date", date)
        .neq("status", "cancelled"),
      supabase
        .from("lunch_orders")
        .select("id, pickup_time, box_count, status")
        .eq("date", date)
        .neq("status", "cancelled"),
    ]);
    if (ordersRes.error) throw ordersRes.error;
    if (lunchRes.error) throw lunchRes.error;

    // 3. 블록별 카운트 초기화
    const counts: Record<TimeBlock, { orders: number; lunch: number }> = {
      A: { orders: 0, lunch: 0 },
      B: { orders: 0, lunch: 0 },
      C: { orders: 0, lunch: 0 },
    };

    for (const o of ordersRes.data || []) {
      const b = timeSlotToBlock(o.time_slot as string);
      if (b) counts[b].orders += 1;
    }

    for (const l of lunchRes.data || []) {
      const box = parseBoxCount(l.box_count as string);
      // 런치 100인분 미만은 케파 카운트 제외 (야간도 timeSlotToBlock null)
      if (box < 100) continue;
      const b = timeSlotToBlock(l.pickup_time as string);
      if (b) counts[b].lunch += 1;
    }

    // 5. 응답 조립
    const blocks: Record<TimeBlock, {
      count: number;
      ordersCount: number;
      lunchCount: number;
      capacity: number;
      remaining: number;
      available: boolean;
    }> = {} as Record<TimeBlock, {
      count: number;
      ordersCount: number;
      lunchCount: number;
      capacity: number;
      remaining: number;
      available: boolean;
    }>;

    for (const b of BLOCK_ORDER) {
      const total = counts[b].orders + counts[b].lunch;
      const cap = capacity[b];
      const rem = Math.max(0, cap - total);
      blocks[b] = {
        count: total,
        ordersCount: counts[b].orders,
        lunchCount: counts[b].lunch,
        capacity: cap,
        remaining: rem,
        available: !closed && rem > 0,
      };
    }

    const availableBlocks = closed ? [] : BLOCK_ORDER.filter((b) => blocks[b].available);

    return NextResponse.json({
      date,
      weekday: getWeekdayKey(date),
      closed,
      blocks,
      availableBlocks,
    });
  } catch (err) {
    console.error("[schedule/abc] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "집계 실패" },
      { status: 500 }
    );
  }
}
