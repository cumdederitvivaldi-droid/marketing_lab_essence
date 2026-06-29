import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import {
  BLOCK_RANGES,
  parseBoxCount,
  parseStartHour,
  timeSlotToBlock,
  type TimeBlock,
} from "@/lib/dispatch/time-blocks";

// ─── 공통 유틸 ────────────────────────────────────

/** 시간 포맷: 14.5 → "오후 2:30" */
function fmtHour(h: number): string {
  const hour = Math.floor(h);
  const min = Math.round((h - hour) * 60);
  const period = hour < 12 ? "오전" : "오후";
  const display = hour <= 12 ? (hour === 0 ? 12 : hour) : hour - 12;
  return `${period} ${display}:${min.toString().padStart(2, "0")}`;
}

/** time_slot 문자열 → { start, end } 24h 범위.
 *  블록 포맷("오전 9:00~오후 12:00")은 BLOCK_RANGES 활용, 아니면 단일 시각은 +1h.
 *  파싱 실패 시 null (리스트 제외). */
function parseSlotRange(
  raw: string | null | undefined,
  block: TimeBlock | null
): { start: number; end: number } | null {
  if (block) {
    const r = BLOCK_RANGES[block];
    return { start: r.startH, end: r.endH };
  }
  const s = parseStartHour(raw ?? null);
  if (s === null) return null;
  return { start: s, end: s + 1 };
}

type UnifiedBooking = {
  type: "visit" | "lunch";
  name: string;
  time: string;
  address: string;
  volume: number;
  boxCount?: number;
  start: number;
  end: number;
  block: TimeBlock | null;
};

// GET /api/schedule?date=2026-04-22
// [CS-SLT-001] 스케줄 조회 — orders + lunch_orders 기반 (bookings 제거, Google Sheets 제거)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const dateParam = request.nextUrl.searchParams.get("date");
  if (!dateParam) {
    return NextResponse.json(
      { error: "date 파라미터가 필요합니다 (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  try {
    const [ordersRes, lunchRes] = await Promise.all([
      supabase
        .from("orders")
        .select("customer_name, address, time_slot, total_volume, status")
        .eq("date", dateParam)
        .neq("status", "cancelled"),
      supabase
        .from("lunch_orders")
        .select("vendor_name, pickup_address, pickup_time, box_count, status")
        .eq("date", dateParam)
        .neq("status", "cancelled"),
    ]);
    if (ordersRes.error) throw ordersRes.error;
    if (lunchRes.error) throw lunchRes.error;

    const unified: UnifiedBooking[] = [];

    for (const o of ordersRes.data ?? []) {
      const block = timeSlotToBlock(o.time_slot);
      const range = parseSlotRange(o.time_slot, block);
      if (!range) continue;
      unified.push({
        type: "visit",
        name: (o.customer_name || "").trim(),
        time: o.time_slot || "",
        address: o.address || "",
        volume: Number(o.total_volume) || 0,
        start: range.start,
        end: range.end,
        block,
      });
    }

    for (const l of lunchRes.data ?? []) {
      const block = timeSlotToBlock(l.pickup_time);
      const range = parseSlotRange(l.pickup_time, block);
      if (!range) continue;
      const boxCount = parseBoxCount(l.box_count);
      unified.push({
        type: "lunch",
        name: (l.vendor_name || "").trim(),
        time: l.pickup_time || "",
        address: l.pickup_address || "",
        volume: 0,
        boxCount,
        start: range.start,
        end: range.end,
        block,
      });
    }

    const sorted = unified.sort((a, b) => a.start - b.start);

    const visitCount = sorted.filter((b) => b.type === "visit").length;
    const lunchCount = sorted.filter((b) => b.type === "lunch").length;
    const totalVolume = sorted.reduce((sum, b) => sum + b.volume, 0);
    const totalBoxCount = sorted.reduce(
      (sum, b) => sum + (b.boxCount ?? 0),
      0
    );

    // 빈 시간대 계산 (운영시간 10:00~22:00)
    const OP_START = 10;
    const OP_END = 22;
    const opBookings = sorted.filter(
      (b) => b.end > OP_START && b.start < OP_END
    );
    const gaps: { start: number; end: number; label: string }[] = [];
    let cursor = OP_START;
    for (const b of opBookings) {
      const bStart = Math.max(b.start, OP_START);
      if (bStart > cursor) {
        gaps.push({
          start: cursor,
          end: bStart,
          label: `${fmtHour(cursor)}~${fmtHour(bStart)}`,
        });
      }
      cursor = Math.max(cursor, Math.min(b.end, OP_END));
    }
    if (cursor < OP_END) {
      gaps.push({
        start: cursor,
        end: OP_END,
        label: `${fmtHour(cursor)}~${fmtHour(OP_END)}`,
      });
    }

    return NextResponse.json({
      date: dateParam,
      count: sorted.length,
      visitCount,
      lunchCount,
      totalVolume: Math.round(totalVolume * 100) / 100,
      totalBoxCount,
      bookings: sorted,
      gaps,
    });
  } catch (err) {
    console.error("[schedule] Error:", err);
    return NextResponse.json(
      { error: "스케줄 데이터 조회 실패" },
      { status: 500 }
    );
  }
}
