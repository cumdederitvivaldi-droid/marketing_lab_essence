import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { orderStore } from "@/lib/store/orders";
import { supabase } from "@/lib/supabase/client";
import { getPrepaymentEnabled, getPrepaymentCutoffIso } from "@/lib/store/app-settings";
import {
  createPaymentLink,
  queryPaymentStatus,
  deactivatePaymentLink,
} from "@/lib/nicepay/client";

// ─── POST: 결제 링크 발송 (신규 + 재발송) ─────────────

// [CS-ORD-005] 주문 결제 링크 생성
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const sendType = (body.sendType === "0" ? "0" : "2") as "0" | "2";
    const isResend = body.resend === true;

    const order = await orderStore.getById(id);
    if (!order) {
      return NextResponse.json({ error: "주문을 찾을 수 없습니다" }, { status: 404 });
    }

    const amount = order.totalPrice;
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "결제 금액이 설정되지 않았습니다" }, { status: 400 });
    }

    const phone = order.phone.replace(/[^0-9]/g, "");
    if (!phone || phone.length < 10) {
      return NextResponse.json({ error: "고객 전화번호가 유효하지 않습니다" }, { status: 400 });
    }

    // 재발송: 가장 최근 reqId 비활성화
    if (isResend && order.paymentIds.length > 0) {
      const lastEntry = order.paymentIds[order.paymentIds.length - 1];
      if (lastEntry.reqId) {
        const deactivated = await deactivatePaymentLink(lastEntry.reqId);
        console.log("[order-payment] 기존 링크 비활성화:", deactivated.success);
      }
    }

    // 이미 발송된 경우 (재발송이 아닌 경우) 중복 방지
    if (!isResend && order.paymentIds.length > 0) {
      const last = order.paymentIds[order.paymentIds.length - 1];
      if (last.reqId && !last.tid) {
        return NextResponse.json(
          { error: "이미 결제 요청이 발송되었습니다", reqId: last.reqId },
          { status: 409 }
        );
      }
    }

    // 결제 유효기간: +7일
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
      console.error("[order-payment] NICEPAY 등록 실패:", result.errorCode, result.errorMessage);
      return NextResponse.json(
        { error: result.errorMessage || "결제 링크 등록 실패", code: result.errorCode },
        { status: 502 }
      );
    }

    // payment_ids에 새 항목 추가
    await orderStore.addPaymentId(id, {
      reqId: result.reqId!,
      payUrl: result.payUrl,
      sentAt: new Date().toISOString(),
    });

    // 상태를 payment_requested로 변경
    await orderStore.update(id, { status: "payment_requested" });

    console.log(`[order-payment] 발송 완료: ${id} → reqId=${result.reqId}`);

    return NextResponse.json({
      ok: true,
      reqId: result.reqId,
      payUrl: result.payUrl,
    });
  } catch (error) {
    console.error("[order-payment] 발송 에러:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// ─── GET: 결제 상태 조회 ──────────────────────────

// [CS-ORD-006] 주문 결제 상태 조회
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;

    const order = await orderStore.getById(id);
    if (!order) {
      return NextResponse.json({ error: "주문을 찾을 수 없습니다" }, { status: 404 });
    }

    if (order.paymentIds.length === 0) {
      return NextResponse.json({ payStatus: "미발송", history: [] });
    }

    // 모든 payment entry 상태 조회
    const history: Array<{
      reqId: string;
      payStatus: string;
      svcNm?: string;
      amt?: number;
      tid?: string;
      sendDt?: string;
      payDt?: string;
      sentAt?: string;
    }> = [];

    let needsDbUpdate = false;
    const updatedPaymentIds = [...order.paymentIds];

    for (let i = 0; i < order.paymentIds.length; i++) {
      const entry = order.paymentIds[i];
      if (!entry.reqId) continue;

      // 이미 결제 완료 확인된 entry
      if (entry.tid && entry.paidAt) {
        history.push({
          reqId: entry.reqId, payStatus: "결제완료",
          tid: entry.tid, payDt: entry.paidAt, sentAt: entry.sentAt,
        });
        continue;
      }

      const result = await queryPaymentStatus(entry.reqId);
      if (!result.success) {
        history.push({ reqId: entry.reqId, payStatus: "조회실패", sentAt: entry.sentAt });
        continue;
      }

      history.push({
        reqId: entry.reqId, payStatus: result.payStatus ?? "미완료",
        svcNm: result.svcNm, amt: result.amt, tid: result.tid,
        sendDt: result.sendDt, payDt: result.payDt, sentAt: entry.sentAt,
      });

      if (result.payStatus === "결제완료") {
        updatedPaymentIds[i] = { ...entry, tid: result.tid, paidAt: result.payDt || new Date().toISOString() };
        needsDbUpdate = true;
      }
    }

    // DB 업데이트 (결제 완료 건이 있으면) — 결과 검증 필수.
    //   업데이트 실패 시에도 success 응답을 주면 주문이 stale 한 상태로 남는다.
    // §6.1 선결제 정책: cutoff 이후 신규 주문은 prepaid (수거 대기), 이전 주문은 completed.
    //   payment-sync cron 의 decidePaidStatus 와 동일 로직.
    let dbUpdateError: string | null = null;
    let paidStatus: "prepaid" | "completed" = "completed";
    if (needsDbUpdate) {
      const prepaymentEnabled = await getPrepaymentEnabled();
      const cutoffIso = prepaymentEnabled ? await getPrepaymentCutoffIso() : null;
      const cutoffMs = cutoffIso ? new Date(cutoffIso).getTime() : null;
      if (prepaymentEnabled) {
        const createdMs = new Date(order.createdAt).getTime();
        paidStatus = cutoffMs === null || createdMs >= cutoffMs ? "prepaid" : "completed";
      }
      const { error: updErr } = await supabase
        .from("orders")
        .update({
          payment_ids: updatedPaymentIds,
          status: paidStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (updErr) {
        console.error("[order-payment] DB 업데이트 실패:", updErr);
        dbUpdateError = updErr.message;
      }
    }

    // 최신 건 기준으로 대표 상태 결정
    const paid = history.find((h) => h.payStatus === "결제완료");
    const latest = paid || history[history.length - 1];

    if (dbUpdateError) {
      return NextResponse.json({
        ...latest,
        totalSent: history.length,
        history,
        warning: "db_update_failed",
        dbError: dbUpdateError,
      }, { status: 500 });
    }

    return NextResponse.json({
      ...latest,
      totalSent: history.length,
      history,
    });
  } catch (error) {
    console.error("[order-payment] 조회 에러:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
