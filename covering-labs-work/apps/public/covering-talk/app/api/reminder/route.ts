import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { conversationStore, Booking } from "@/lib/store/conversations";
import { sendSplitMessage } from "@/lib/happytalk/send-message";

const REMINDER_MESSAGE = `[자동발송]
안녕하세요, 커버링입니다.
내일 방문수거 예약이 잡혀 있어 안내드립니다.
수거 방문 전 다시 한번 연락드리겠습니다.
감사합니다 😊`;

/** 내일 날짜를 YYYY-MM-DD (KST 기준) */
function getTomorrowStr(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setDate(kst.getDate() + 1);
  return kst.toISOString().split("T")[0];
}

// GET /api/reminder — 리마인드 대상 목록 조회
// orders 테이블 기준: 내일 날짜 + 활성 상태 + session_id로 대화 연결
// [CS-NTF-004] 리마인더 목록 조회
export async function GET(): Promise<NextResponse> {
  const tomorrowStr = getTomorrowStr();

  try {
    // 1. orders에서 내일 수거 예정 건 조회 (활성 상태만)
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, order_number, session_id, customer_name, phone, address, date, time_slot, status")
      .eq("date", tomorrowStr)
      .in("status", ["confirmed", "payment_requested", "prepaid"]);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!orders || orders.length === 0) {
      return NextResponse.json({ targets: [], count: 0, date: tomorrowStr });
    }

    // 2. session_id가 있는 건 → conversations에서 리마인드 발송 여부 + user_key 조회
    const sessionIds = orders.map(o => o.session_id).filter(Boolean);
    const { data: convData } = sessionIds.length > 0
      ? await supabase
          .from("conversations")
          .select("session_id, booking")
          .in("session_id", sessionIds)
      : { data: [] };

    const reminderSentMap = new Map<string, boolean>();
    for (const c of (convData ?? [])) {
      const booking = c.booking as Booking | null;
      reminderSentMap.set(c.session_id, !!booking?.reminderSentAt);
    }

    // 3. 리마인드 미발송 건만 필터
    const targets = orders
      .filter(o => {
        // session_id가 있으면 리마인드 발송 여부 체크
        if (o.session_id && reminderSentMap.get(o.session_id)) return false;
        return true;
      })
      .map(o => ({
        sessionId: o.session_id || "",
        orderId: o.id,
        orderNumber: o.order_number,
        name: o.customer_name || "미등록",
        phone: o.phone || "-",
        preferredDate: o.date,
        preferredTime: o.time_slot || "-",
        address: o.address || "-",
      }));

    return NextResponse.json({ targets, count: targets.length, date: tomorrowStr });
  } catch (e) {
    console.error("[reminder] 조회 오류:", e);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}

// POST /api/reminder — 일괄 리마인드 발송
// [CS-NTF-005] 리마인더 생성
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { sessionIds } = (await request.json()) as { sessionIds: string[] };

  if (!sessionIds?.length) {
    return NextResponse.json({ error: "발송 대상이 없습니다" }, { status: 400 });
  }

  let sent = 0;
  let failed = 0;
  const results: { sessionId: string; success: boolean; error?: string }[] = [];

  for (const sid of sessionIds) {
    try {
      const conv = await conversationStore.getById(sid);
      if (!conv) {
        results.push({ sessionId: sid, success: false, error: "대화 없음" });
        failed++;
        continue;
      }

      if (conv.booking?.reminderSentAt) {
        results.push({ sessionId: sid, success: false, error: "이미 리마인드 완료" });
        failed++;
        continue;
      }

      await sendSplitMessage({
        user_key: conv.userKey,
        sender_key: conv.senderKey,
        message: REMINDER_MESSAGE,
      });

      await conversationStore.addAssistantMessage(sid, REMINDER_MESSAGE, "리마인드봇", false);

      const updatedBooking: Booking = {
        ...(conv.booking ?? {
          customerName: "", phone: "", address: "", floor: 0,
          hasElevator: false, hasParking: false, ladderNeeded: false,
          preferredDate: "", preferredTime: "",
          confirmedAt: null, reminderSentAt: null, specialNotes: "",
        }),
        reminderSentAt: Date.now(),
      };
      await conversationStore.updateBooking(sid, updatedBooking);

      results.push({ sessionId: sid, success: true });
      sent++;
    } catch (err) {
      console.error(`[reminder] ${sid} 발송 실패:`, err);
      results.push({ sessionId: sid, success: false, error: "발송 실패" });
      failed++;
    }
  }

  return NextResponse.json({ ok: true, sent, failed, results });
}
