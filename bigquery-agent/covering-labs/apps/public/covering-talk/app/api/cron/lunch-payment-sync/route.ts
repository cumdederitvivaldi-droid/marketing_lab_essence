import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { queryPaymentStatus } from "@/lib/nicepay/client";
import { lunchOrderStore } from "@/lib/store/lunch-orders";
import type { PaymentEntry } from "@/lib/store/orders";

/**
 * [CS-ETC-056] 런치 결제 상태 자동 동기화
 *
 * 10분마다 실행:
 * 1. lunch_orders에서 status = payment_requested & settlement_type = link_pay 조회
 *    (날짜 조건 없음 — 결제요청 후 미완료 상태인 모든 건)
 * 2. 각 order의 payment_ids에 누적된 모든 reqId에 대해 NicePay 상태 확인
 *    (고객이 재발송된 링크 중 어느 것으로 결제했을지 모름)
 * 3. 하나라도 결제완료 → 해당 entry에 tid/paidAt 기록, order status "completed"
 *    (lunch_conversations 상태는 건드리지 않음 — 상담 종료는 상담사 판단 영역)
 *
 * Vercel Cron: "*\/10 * * * *"
 */
export async function GET(): Promise<NextResponse> {
  const results: {
    vendor: string;
    orderNumber: string;
    updated: boolean;
    payStatus?: string;
  }[] = [];

  try {
    const { data: orders, error } = await supabase
      .from("lunch_orders")
      .select("id, order_number, vendor_name, payment_ids")
      .eq("status", "payment_requested")
      .eq("settlement_type", "link_pay");

    if (error) throw error;
    if (!orders || orders.length === 0) {
      return NextResponse.json({ ok: true, synced: 0, total: 0, results: [] });
    }

    console.log(`[lunch-payment-sync] 미결제 건: ${orders.length}건`);

    for (const order of orders) {
      const vendorName = order.vendor_name as string;
      const paymentIds = (order.payment_ids ?? []) as PaymentEntry[];

      // 이미 완료 기록이 있으면 status만 맞춰서 보정
      if (paymentIds.some((p) => p.tid && p.paidAt)) {
        await lunchOrderStore.update(order.id, { status: "completed" });
        results.push({ vendor: vendorName, orderNumber: order.order_number, updated: true, payStatus: "이미결제완료" });
        continue;
      }

      // 아직 tid가 없는 모든 reqId 검사 (누적된 재발송 링크 포함)
      const pendingPayments = paymentIds.filter((p) => p.reqId && !p.tid);
      if (pendingPayments.length === 0) {
        results.push({ vendor: vendorName, orderNumber: order.order_number, updated: false, payStatus: "reqId없음" });
        continue;
      }

      try {
        let paid = false;
        const updatedPaymentIds: PaymentEntry[] = [...paymentIds];

        for (const payment of pendingPayments) {
          const result = await queryPaymentStatus(payment.reqId);
          console.log(`[lunch-payment-sync] ${vendorName} (${payment.reqId}): ${result.payStatus}`);

          if (result.success && result.payStatus === "결제완료" && result.tid) {
            const idx = updatedPaymentIds.findIndex((p) => p.reqId === payment.reqId);
            if (idx >= 0) {
              updatedPaymentIds[idx] = {
                ...updatedPaymentIds[idx],
                tid: result.tid,
                paidAt: new Date().toISOString(),
              };
            }
            paid = true;
            // 하나라도 결제완료면 중단 — 나머지 링크는 자동으로 무효(고객이 결제한 링크만 유효)
            break;
          }
        }

        if (paid) {
          await supabase
            .from("lunch_orders")
            .update({
              status: "completed",
              payment_ids: updatedPaymentIds,
              updated_at: new Date().toISOString(),
            })
            .eq("id", order.id);

          results.push({ vendor: vendorName, orderNumber: order.order_number, updated: true, payStatus: "결제완료" });
          console.log(`[lunch-payment-sync] ${vendorName}: 결제확인 완료`);
        } else {
          results.push({ vendor: vendorName, orderNumber: order.order_number, updated: false, payStatus: "미완료" });
        }
      } catch (err) {
        console.error(`[lunch-payment-sync] ${vendorName} NicePay 조회 실패:`, err);
        results.push({ vendor: vendorName, orderNumber: order.order_number, updated: false, payStatus: "조회실패" });
      }
    }
  } catch (err) {
    console.error("[lunch-payment-sync] error:", err);
  }

  const synced = results.filter((r) => r.updated).length;
  console.log(`[lunch-payment-sync] 완료: ${synced}건 결제확인`);

  return NextResponse.json({ ok: true, synced, total: results.length, results });
}
