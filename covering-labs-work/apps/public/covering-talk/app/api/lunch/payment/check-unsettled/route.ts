import { NextResponse } from "next/server";
import { lunchOrderStore } from "@/lib/store/lunch-orders";
import { queryPaymentStatus } from "@/lib/nicepay/client";

// [CS-ETC-020] 미정산 런치 결제 확인
export async function POST(): Promise<NextResponse> {
  try {
    // payment_requested 상태 주문 조회
    const orders = await lunchOrderStore.getAll({ status: "payment_requested" });

    // payment_ids에 reqId가 있지만 tid가 없는 건만 필터
    const unsettled = orders.filter((o) =>
      o.paymentIds.some((p) => p.reqId && !p.tid)
    );

    if (unsettled.length === 0) {
      return NextResponse.json({ ok: true, checked: 0, updated: 0 });
    }

    let updated = 0;

    for (const order of unsettled) {
      const pendingPayment = order.paymentIds.find((p) => p.reqId && !p.tid);
      if (!pendingPayment) continue;

      try {
        const result = await queryPaymentStatus(pendingPayment.reqId);
        if (result.success && result.payStatus === "결제완료") {
          // payment_ids 업데이트
          const updatedIds = order.paymentIds.map((p) =>
            p.reqId === pendingPayment.reqId
              ? { ...p, tid: result.tid || "paid", paidAt: new Date().toISOString() }
              : p
          );
          const { supabase } = await import("@/lib/supabase/client");
          await supabase
            .from("lunch_orders")
            .update({
              status: "completed",
              payment_ids: updatedIds,
              updated_at: new Date().toISOString(),
            })
            .eq("id", order.id);
          updated++;
        }
      } catch (e) {
        console.error(`[check-unsettled] ${order.vendorName} 조회 실패:`, e);
      }
    }

    return NextResponse.json({ ok: true, checked: unsettled.length, updated });
  } catch (err) {
    console.error("[check-unsettled] error:", err);
    return NextResponse.json({ error: "미정산 일괄 조회 중 오류 발생" }, { status: 500 });
  }
}
