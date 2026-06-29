import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createPaymentLink, queryPaymentStatus } from "@/lib/nicepay/client";
import { lunchOrderStore } from "@/lib/store/lunch-orders";

interface PaymentTarget {
  id: string;           // lunch_orders UUID
  vendorName: string;
  ownerPhone: string;
  totalAmount: number;
}

// [CS-PAY-006] 런치 결제 링크 발송
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const rows: PaymentTarget[] = body.rows;
    const sendType = (body.sendType || "2") as "0" | "1" | "2" | "4";

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "결제 대상이 없습니다" }, { status: 400 });
    }

    const results: Array<{
      id: string;
      vendorName: string;
      success: boolean;
      message: string;
      reqId?: string;
    }> = [];

    for (const row of rows) {
      const amount = row.totalAmount;
      if (!amount || amount <= 0) {
        results.push({ id: row.id, vendorName: row.vendorName, success: false, message: "정산금액이 없습니다" });
        continue;
      }

      const phone = (row.ownerPhone || "").replace(/[^0-9]/g, "");
      if (!phone || phone.length < 10) {
        results.push({ id: row.id, vendorName: row.vendorName, success: false, message: "연락처가 유효하지 않습니다" });
        continue;
      }

      const orderId = `LUNCH${Date.now()}${crypto.randomBytes(3).toString("hex")}`;
      const limitDate = new Date();
      limitDate.setDate(limitDate.getDate() + 7);
      const payLimitDate = limitDate.toISOString().slice(0, 10).replace(/-/g, "");

      const payResult = await createPaymentLink({
        goodsName: "커버링 런치",
        amount,
        orderId,
        buyerName: row.vendorName,
        buyerPhone: phone,
        sendType,
        payLimitDate,
      });

      if (!payResult.success) {
        results.push({ id: row.id, vendorName: row.vendorName, success: false, message: payResult.errorMessage || "NicePay 발송 실패" });
        continue;
      }

      // DB 업데이트: payment_ids 추가 + 상태 변경
      await lunchOrderStore.addPaymentId(row.id, {
        reqId: payResult.reqId!,
        payUrl: payResult.payUrl || undefined,
        sentAt: new Date().toISOString(),
      });
      await lunchOrderStore.update(row.id, {
        status: "payment_requested",
        invoiceIssued: true,
      });

      results.push({ id: row.id, vendorName: row.vendorName, success: true, message: "결제 링크 발송 완료", reqId: payResult.reqId });
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return NextResponse.json({ ok: true, successCount, failCount, results });
  } catch (err) {
    console.error("[lunch-payment] POST error:", err);
    return NextResponse.json({ error: "결제 처리 중 오류가 발생했습니다" }, { status: 500 });
  }
}

// [CS-PAY-007] 런치 결제 상태 조회
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const reqId = request.nextUrl.searchParams.get("reqId");
    const orderId = request.nextUrl.searchParams.get("orderId");

    if (!reqId) {
      return NextResponse.json({ error: "reqId가 필요합니다" }, { status: 400 });
    }

    const result = await queryPaymentStatus(reqId);

    if (!result.success) {
      return NextResponse.json({ error: result.errorMessage || "조회 실패" }, { status: 502 });
    }

    // 결제완료 시 DB 자동 업데이트 — reqId 가 해당 order 의 paymentIds 에 실제로
    //   존재하는 경우에만 적용. 다른 주문의 reqId 가 들어와 임의의 주문이 완료
    //   처리되는 것을 방어.
    if (result.payStatus === "결제완료" && orderId) {
      const order = await lunchOrderStore.getById(orderId);
      if (!order) {
        // 의도된 노출 — 호출자가 잘못된 orderId 를 넘긴 경우 무시하고 조회 결과만 반환
      } else {
        const matchedPayment = order.paymentIds.find((p) => p.reqId === reqId);
        if (!matchedPayment) {
          return NextResponse.json(
            { error: "reqId 가 해당 주문의 결제 요청에 속해있지 않습니다" },
            { status: 403 }
          );
        }
        if (order.status !== "completed") {
          const updatedIds = order.paymentIds.map((p) =>
            p.reqId === reqId ? { ...p, tid: result.tid || "paid", paidAt: new Date().toISOString() } : p
          );
          await lunchOrderStore.update(orderId, { status: "completed" });
          const { supabase } = await import("@/lib/supabase/client");
          await supabase.from("lunch_orders").update({ payment_ids: updatedIds, updated_at: new Date().toISOString() }).eq("id", orderId);
        }
      }
    }

    return NextResponse.json({
      payStatus: result.payStatus,
      svcNm: result.svcNm,
      amt: result.amt,
      tid: result.tid,
      sentStatus: result.sentStatus,
      sendDt: result.sendDt,
      payDt: result.payDt,
    });
  } catch (err) {
    console.error("[lunch-payment] GET error:", err);
    return NextResponse.json({ error: "결제 상태 조회 중 오류가 발생했습니다" }, { status: 500 });
  }
}
