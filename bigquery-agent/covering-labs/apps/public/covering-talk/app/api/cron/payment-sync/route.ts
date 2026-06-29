import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { queryPaymentStatus } from "@/lib/nicepay/client";
import { orderStore } from "@/lib/store/orders";
import { getPrepaymentEnabled, getPrepaymentCutoffIso } from "@/lib/store/app-settings";
import { conversationStore } from "@/lib/store/conversations";
import { sendPlainMessage } from "@/lib/happytalk/client";

/**
 * [CS-ETC-025] 결제 상태 자동 동기화 크론 (orders 테이블 기준)
 *
 * 10분마다 실행:
 * 1. orders에서 status = "payment_requested" 조회
 * 2. 각 order의 payment_ids에서 NicePay 상태 확인
 * 3. 결제완료 → order status "completed" + conversation status "completed"
 */
export async function GET(): Promise<NextResponse> {
  const results: { name: string; orderNumber: string; updated: boolean; payStatus?: string }[] = [];
  // §6.1 100% 선결제 — 결제완료 시 prepaid(수거 대기) 로. OFF 면 기존대로 completed.
  //   cutoff: 정책 시행 시각 이전 주문(기존 데이터)은 completed 로 유지.
  const prepaymentEnabled = await getPrepaymentEnabled();
  const cutoffIso = prepaymentEnabled ? await getPrepaymentCutoffIso() : null;
  const cutoffMs = cutoffIso ? new Date(cutoffIso).getTime() : null;
  const decidePaidStatus = (createdAt: string): "prepaid" | "completed" => {
    if (!prepaymentEnabled) return "completed";
    if (cutoffMs === null) return "prepaid";
    return new Date(createdAt).getTime() >= cutoffMs ? "prepaid" : "completed";
  };

  try {
    // payment_requested 상태 주문 조회 (created_at 도 필요 — cutoff 비교용)
    //   date, time_slot 은 입금확인 안내 메시지에 사용.
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, order_number, session_id, customer_name, payment_ids, created_at, date, time_slot")
      .eq("status", "payment_requested");

    if (error) throw error;
    if (!orders || orders.length === 0) {
      return NextResponse.json({ ok: true, synced: 0, total: 0, results: [] });
    }

    console.log(`[payment-sync] 미결제 건: ${orders.length}건`);

    for (const order of orders) {
      const paymentIds = (order.payment_ids ?? []) as Array<{
        reqId: string; payUrl?: string; sentAt?: string; tid?: string; paidAt?: string;
      }>;

      const paidStatusForOrder = decidePaidStatus(order.created_at as string);

      // 이미 결제 완료된 건 스킵
      if (paymentIds.some(p => p.tid && p.paidAt)) {
        await orderStore.update(order.id, { status: paidStatusForOrder });
        results.push({ name: order.customer_name, orderNumber: order.order_number, updated: true, payStatus: "이미결제완료" });
        continue;
      }

      // reqId가 있는 모든 결제 요청을 확인 (어느 하나라도 결제완료면 OK)
      const pendingPayments = paymentIds.filter(p => p.reqId && !p.tid);
      if (pendingPayments.length === 0) {
        results.push({ name: order.customer_name, orderNumber: order.order_number, updated: false, payStatus: "reqId없음" });
        continue;
      }

      try {
        let paid = false;
        const updatedPaymentIds = [...paymentIds];

        for (const payment of pendingPayments) {
          const result = await queryPaymentStatus(payment.reqId);
          console.log(`[payment-sync] ${order.customer_name} (${payment.reqId}): ${result.payStatus}`);

          if (result.success && result.payStatus === "결제완료" && result.tid) {
            // 해당 payment entry에 tid/paidAt 기록
            const idx = updatedPaymentIds.findIndex(p => p.reqId === payment.reqId);
            if (idx >= 0) {
              updatedPaymentIds[idx] = { ...updatedPaymentIds[idx], tid: result.tid, paidAt: new Date().toISOString() };
            }
            paid = true;
            break; // 하나라도 결제완료면 충분
          }
        }

        if (paid) {
          await supabase
            .from("orders")
            .update({
              status: paidStatusForOrder,
              payment_ids: updatedPaymentIds,
              updated_at: new Date().toISOString(),
            })
            .eq("id", order.id);

          // 신규 정책(prepaid) 흐름이면 수거 전이므로 conversation 종료하지 않음. completed 흐름만 종료.
          if (order.session_id && paidStatusForOrder === "completed") {
            await supabase
              .from("conversations")
              .update({ status: "completed", updated_at: new Date().toISOString() })
              .eq("session_id", order.session_id);
          }

          // §6.1 입금 확인 자동 안내 — 신규 정책(prepaid) 흐름 + session 존재 시.
          //   다중 가드: prepayment_enabled / 신규 paid / 이 cron 에서 set 한 entry / dedup.
          //   안전망: 1건이라도 발송 실패해도 다음 cycle 에 재시도 안 함 (이미 status=prepaid).
          if (paidStatusForOrder === "prepaid" && order.session_id) {
            try {
              const conv = await conversationStore.getById(order.session_id);
              if (conv?.userKey && conv?.senderKey) {
                // 본 cron 에서 새로 tid 가 set 된 entry 만 — 이미 안내 보낸 건 dedup
                const newlyConfirmed = updatedPaymentIds.find(
                  (p) => p.tid && p.paidAt && !(p as { depositNoticeSentAt?: string }).depositNoticeSentAt,
                );
                if (newlyConfirmed && order.date) {
                  const timeSlotStr = order.time_slot ? ` ${order.time_slot}` : "";
                  const msg = `선결제 입금 확인되었습니다 :)\n${order.date}${timeSlotStr} 에 안전한 수거로 찾아뵙겠습니다.\n감사합니다!`;
                  await sendPlainMessage({ user_key: conv.userKey, sender_key: conv.senderKey, message: msg });
                  await conversationStore.addAssistantMessage(order.session_id, msg, "자동안내(입금확인)", false);
                  // 마커 기록 — 같은 entry 에 dedup. payment_ids 재업데이트.
                  const idx = updatedPaymentIds.findIndex((p) => p.reqId === newlyConfirmed.reqId);
                  if (idx >= 0) {
                    (updatedPaymentIds[idx] as { depositNoticeSentAt?: string }).depositNoticeSentAt = new Date().toISOString();
                    await supabase
                      .from("orders")
                      .update({ payment_ids: updatedPaymentIds })
                      .eq("id", order.id);
                  }
                  console.log(`[payment-sync] 입금확인 안내 발송: ${order.customer_name}`);
                }
              }
            } catch (notifyErr) {
              console.error(`[payment-sync] 입금확인 안내 발송 실패 (${order.customer_name}):`, notifyErr);
            }
          }

          const label = paidStatusForOrder === "prepaid" ? "선결제완료" : "결제완료";
          results.push({ name: order.customer_name, orderNumber: order.order_number, updated: true, payStatus: label });
          console.log(`[payment-sync] ${order.customer_name}: ${label}`);
        } else {
          results.push({ name: order.customer_name, orderNumber: order.order_number, updated: false, payStatus: "미완료" });
        }
      } catch (err) {
        console.error(`[payment-sync] ${order.customer_name} NicePay 조회 실패:`, err);
        results.push({ name: order.customer_name, orderNumber: order.order_number, updated: false, payStatus: "조회실패" });
      }
    }
  } catch (err) {
    console.error("[payment-sync] error:", err);
  }

  const synced = results.filter(r => r.updated).length;
  console.log(`[payment-sync] 완료: ${synced}건 결제확인`);

  return NextResponse.json({ ok: true, synced, total: results.length, results });
}
