import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { Booking } from "@/lib/store/conversations";

// 전환수에서 제외할 고객명
const EXCLUDE_BOOKING_NAMES = ["", "미등록", "미확인"];

// [CS-ADM-001] 일별 통계 조회
export async function GET(): Promise<NextResponse> {
  // KST 기준 날짜 계산
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  // KST 자정 → UTC
  const kstToday = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()));
  const todayUtc = new Date(kstToday.getTime() - 9 * 60 * 60 * 1000);
  const todayIso = todayUtc.toISOString();

  const yesterdayUtc = new Date(todayUtc.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayIso = yesterdayUtc.toISOString();

  const tomorrowUtc = new Date(todayUtc.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowIso = tomorrowUtc.toISOString();

  // 내일 날짜 문자열 (KST 기준)
  const kstTomorrow = new Date(kstToday.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = kstTomorrow.toISOString().split("T")[0];

  // 병렬로 모든 통계 쿼리 실행
  const [allRes, todayRes, nudgeRes, reminderRes, bookingsRes] = await Promise.all([
    supabase.from("conversations").select("status"),
    supabase.from("conversations").select("status, quote").gte("created_at", todayIso),
    // ★ 넛지 대상: 전일(어제) 생성분만 (오늘꺼 제외)
    supabase.from("conversations").select("session_id").eq("status", "quote_sent_nudge").gte("created_at", yesterdayIso).lt("created_at", todayIso),
    // 리마인드 대상: orders에서 내일 수거 예정 + 활성 상태
    supabase.from("orders").select("id, session_id").eq("date", tomorrowStr).in("status", ["confirmed", "payment_requested", "prepaid"]),
    // 전환수: orders 테이블 기준 (예약 생성일 기준)
    supabase.from("orders")
      .select("id, customer_name, status")
      .gte("created_at", todayIso)
      .lt("created_at", tomorrowIso)
      .neq("status", "cancelled"),
  ]);

  const all = allRes.data ?? [];
  const todayConvs = todayRes.data ?? [];

  // 리마인드 대상: orders 기준 내일 수거 예정 건 (이미 발송된 건 제외)
  const reminderOrders = reminderRes.data ?? [];
  let reminderCount = reminderOrders.length;
  if (reminderOrders.length > 0) {
    const sessionIds = reminderOrders.map(o => o.session_id).filter(Boolean);
    if (sessionIds.length > 0) {
      const { data: convs } = await supabase
        .from("conversations")
        .select("session_id, booking")
        .in("session_id", sessionIds);
      const sentSet = new Set(
        (convs ?? [])
          .filter(c => (c.booking as Booking | null)?.reminderSentAt)
          .map(c => c.session_id)
      );
      reminderCount = reminderOrders.filter(o => !o.session_id || !sentSet.has(o.session_id)).length;
    }
  }

  // 전환수: bookings 테이블에서 미등록/미확인 제외
  const todayBookings = (bookingsRes.data ?? []).filter(
    (b) => !EXCLUDE_BOOKING_NAMES.includes((b.customer_name || "").trim())
  );

  const stats = {
    total: todayConvs.length,
    pending: todayConvs.filter((c) => c.status === "pending").length,
    quoteSent: todayConvs.filter((c) => {
      const q = c.quote as { sentAt?: number | null } | null;
      // sentAt 우선, 없으면 기존 status 기반 폴백 (과거 데이터 호환)
      return q?.sentAt != null || (
        !q?.sentAt && (
          c.status === "quote_sent_nudge" || c.status === "quote_sent_no_nudge" ||
          c.status === "nudge_sent" || c.status === "booked"
        )
      );
    }).length,
    booked: todayBookings.length,
    completed: todayConvs.filter((c) => c.status === "completed").length,
    needsCheck: all.filter((c) => c.status === "needs_check").length,
    nudgeTarget: nudgeRes.data?.length ?? 0,
    reminderTarget: reminderCount,
  };

  return NextResponse.json(stats);
}
