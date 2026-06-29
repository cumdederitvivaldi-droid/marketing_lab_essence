import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

const QUOTE_SENT_STATUSES = [
  "quote_sent_nudge",
  "quote_sent_no_nudge",
  "nudge_sent",
  "booked",
];

// 전환수에서 제외할 고객명
const EXCLUDE_BOOKING_NAMES = ["", "미등록", "미확인"];

const PAGE_SIZE = 1000;

async function fetchAllConversations(startDate: Date, endDate: Date) {
  const allRows: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("conversations")
      .select("status, created_at, quote")
      .gte("created_at", startDate.toISOString())
      .lt("created_at", endDate.toISOString())
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    allRows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allRows;
}

// [CS-ADM-002] 월별 통계 조회
export async function GET(request: NextRequest): Promise<NextResponse> {
  const month = request.nextUrl.searchParams.get("month"); // "2026-03"
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month param required (YYYY-MM)" }, { status: 400 });
  }

  const [year, mon] = month.split("-").map(Number);
  // KST 기준으로 월 범위 설정
  const startDate = new Date(`${month}-01T00:00:00+09:00`);
  const endMon = mon === 12 ? 1 : mon + 1;
  const endYear = mon === 12 ? year + 1 : year;
  const endDate = new Date(`${endYear}-${String(endMon).padStart(2, "0")}-01T00:00:00+09:00`);

  // 전환 수 + 전환 총액 모두 created_at(예약 발생일) 기준 — cancelled 제외
  // 수거일(date) 기준 매출은 new_dashboard 가 별도 제공
  const [rows, bookingsRes] = await Promise.all([
    fetchAllConversations(startDate, endDate),
    supabase
      .from("orders")
      .select("id, customer_name, session_id, status, created_at, total_price")
      .gte("created_at", startDate.toISOString())
      .lt("created_at", endDate.toISOString())
      .neq("status", "cancelled"),
  ]);

  // 유효 필터 (미등록/미확인/테스트 제외)
  const isValid = (name: string | null | undefined) => {
    const n = (name || "").trim();
    if (EXCLUDE_BOOKING_NAMES.includes(n)) return false;
    if (n.includes("테스트")) return false;
    return true;
  };
  const validBookings = (bookingsRes.data ?? []).filter((b) => isValid(b.customer_name));

  // Build daily map
  const daily: Record<string, { total: number; quoteSent: number; booked: number }> = {};

  // Initialize all days of the month
  const daysInMonth = new Date(year, mon, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${month}-${d.toString().padStart(2, "0")}`;
    daily[key] = { total: 0, quoteSent: 0, booked: 0 };
  }

  // Aggregate conversations (total, quoteSent)
  let monthTotal = 0;
  let monthQuoteSent = 0;

  for (const row of rows) {
    // KST 기준 날짜 키
    const utc = new Date(row.created_at);
    const kst = new Date(utc.getTime() + 9 * 60 * 60 * 1000);
    const dayKey = kst.toISOString().split("T")[0];
    if (!daily[dayKey]) continue;

    daily[dayKey].total++;
    monthTotal++;

    // 견적발송: sentAt 우선, 없으면 기존 status 기반 폴백 (sentAt 도입 전 과거 데이터 호환)
    const quote = row.quote as { totalPrice?: number; items?: unknown[]; sentAt?: number | null } | null;
    const hasSentAt = quote?.sentAt != null;
    const legacyQuoteSent = !hasSentAt && QUOTE_SENT_STATUSES.includes(row.status);
    if (hasSentAt || legacyQuoteSent) {
      daily[dayKey].quoteSent++;
      monthQuoteSent++;
    }
  }

  // Aggregate bookings (booked count + revenue)
  let monthBooked = 0;
  let monthBookedRevenue = 0;

  // 전환 수(booked) + 일별 카운트 + 전환 총액 — created_at 기준 (예약 발생일)
  for (const b of validBookings) {
    const bUtc = new Date(b.created_at);
    const bKst = new Date(bUtc.getTime() + 9 * 60 * 60 * 1000);
    const dayKey = bKst.toISOString().split("T")[0];
    monthBooked++;
    if (daily[dayKey]) daily[dayKey].booked++;
    if (b.total_price) monthBookedRevenue += b.total_price;
  }

  return NextResponse.json({
    month,
    summary: {
      total: monthTotal,
      quoteSent: monthQuoteSent,
      booked: monthBooked,
      bookedRevenue: monthBookedRevenue,
      bookedAvg: monthBooked > 0 ? Math.round(monthBookedRevenue / monthBooked) : 0,
    },
    daily,
  });
}
