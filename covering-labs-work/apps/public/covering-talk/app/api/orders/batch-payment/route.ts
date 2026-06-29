import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { orderStore } from "@/lib/store/orders";
import { createPaymentLink } from "@/lib/nicepay/client";

// [CS-ORD-008] 주문 일괄 결제 발송
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const ids: string[] = body.ids;
    const sendType = (body.sendType === "0" ? "0" : "2") as "0" | "2";

    if (!ids || ids.length === 0) {
      return NextResponse.json({ error: "발송 대상이 없습니다" }, { status: 400 });
    }

    const results: Array<{
      id: string;
      customerName: string;
      success: boolean;
      message: string;
      reqId?: string;
    }> = [];

    for (const id of ids) {
      try {
        const order = await orderStore.getById(id);
        if (!order) {
          results.push({ id, customerName: "?", success: false, message: "주문을 찾을 수 없음" });
          continue;
        }

        const amount = order.totalPrice;
        if (!amount || amount <= 0) {
          results.push({ id, customerName: order.customerName, success: false, message: "금액 없음" });
          continue;
        }

        const phone = order.phone.replace(/[^0-9]/g, "");
        if (!phone || phone.length < 10) {
          results.push({ id, customerName: order.customerName, success: false, message: "연락처 없음" });
          continue;
        }

        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() + 7);
        const payLimitDate = limitDate.toISOString().slice(0, 10).replace(/-/g, "");
        const orderId = `ORD${Date.now()}${crypto.randomBytes(4).toString("hex")}`;

        const result = await createPaymentLink({
          goodsName: "커버링 방문수거",
          amount,
          orderId,
          buyerName: order.customerName,
          buyerPhone: phone,
          sendType,
          payLimitDate,
        });

        if (!result.success) {
          results.push({
            id,
            customerName: order.customerName,
            success: false,
            message: result.errorMessage || "NicePay 발송 실패",
          });
          continue;
        }

        // payment_ids에 추가
        await orderStore.addPaymentId(id, {
          reqId: result.reqId!,
          payUrl: result.payUrl,
          sentAt: new Date().toISOString(),
        });

        // 상태 변경
        await orderStore.update(id, { status: "payment_requested" });

        results.push({
          id,
          customerName: order.customerName,
          success: true,
          message: "발송 완료",
          reqId: result.reqId,
        });
      } catch (err) {
        results.push({
          id,
          customerName: "?",
          success: false,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return NextResponse.json({ ok: true, successCount, failCount, results });
  } catch (err) {
    console.error("[orders/batch-payment] error:", err);
    return NextResponse.json(
      { error: "일괄 결제 발송 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
