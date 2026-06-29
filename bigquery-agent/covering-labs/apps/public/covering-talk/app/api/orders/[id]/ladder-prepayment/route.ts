import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { orderStore } from "@/lib/store/orders";
import { createPaymentLink } from "@/lib/nicepay/client";
import { auditStore } from "@/lib/store/audit-logs";
import { getCurrentUser } from "@/lib/auth/session";

// [CS-ORD-010] 사다리차 선결제 — 별도 Order 생성 + NicePay 링크 발송
//
// 정책: 사다리차 비용은 본 수거 전 선결제. 본 견적 안에 포함되어 있었다면
// 부모 Order 의 totalPrice 를 차감하여 본 결제와의 중복 청구 방지.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const amount = Number(body.amount);
    const includedInQuote = body.includedInQuote === true;
    const sendType = (body.sendType === "0" ? "0" : "2") as "0" | "2";

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "사다리차 금액이 유효하지 않습니다" }, { status: 400 });
    }

    const parent = await orderStore.getById(id);
    if (!parent) {
      return NextResponse.json({ error: "원본 주문을 찾을 수 없습니다" }, { status: 404 });
    }

    const phone = parent.phone.replace(/[^0-9]/g, "");
    if (!phone || phone.length < 10) {
      return NextResponse.json({ error: "고객 전화번호가 유효하지 않습니다" }, { status: 400 });
    }

    if (includedInQuote && parent.totalPrice < amount) {
      return NextResponse.json(
        { error: `원본 견적(${parent.totalPrice.toLocaleString()}원)이 사다리차 금액보다 작습니다` },
        { status: 400 }
      );
    }

    // 사다리차 선결제용 신규 Order 생성 (sessionId 로 부모와 연결)
    const newOrder = await orderStore.create({
      sessionId: parent.sessionId,
      status: "payment_requested",
      customerName: parent.customerName,
      phone: parent.phone,
      address: parent.address,
      date: parent.date,
      timeSlot: parent.timeSlot,
      floor: parent.floor,
      hasElevator: parent.hasElevator,
      hasParking: parent.hasParking,
      hasGroundAccess: parent.hasGroundAccess,
      needLadder: true,
      ladderFee: amount,
      crewSize: parent.crewSize,
      items: [],
      totalVolume: 0,
      totalPrice: amount,
      memo: `[사다리차선결제] 원본 #${parent.orderNumber}`,
      photos: [],
    });

    if (!newOrder) {
      return NextResponse.json({ error: "사다리차 선결제 주문 생성 실패" }, { status: 500 });
    }

    // 본 견적에 포함되어 있던 경우 부모 totalPrice 차감
    if (includedInQuote) {
      await orderStore.update(parent.id, { totalPrice: parent.totalPrice - amount });
    }

    // NicePay 링크 발송
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() + 7);
    const payLimitDate = limitDate.toISOString().slice(0, 10).replace(/-/g, "");
    const orderIdStr = `LDR${Date.now()}${crypto.randomBytes(4).toString("hex")}`;

    const result = await createPaymentLink({
      goodsName: "커버링 방문수거 - 사다리차",
      amount,
      orderId: orderIdStr,
      buyerName: parent.customerName,
      buyerPhone: phone,
      sendType,
      payLimitDate,
    });

    if (!result.success) {
      // 결제 링크 실패 시 신규 Order 는 남겨두되 (수동 재발송 가능) 부모 차감은 롤백
      if (includedInQuote) {
        await orderStore.update(parent.id, { totalPrice: parent.totalPrice });
      }
      return NextResponse.json(
        { error: result.errorMessage || "결제 링크 등록 실패", code: result.errorCode },
        { status: 502 }
      );
    }

    await orderStore.addPaymentId(newOrder.id, {
      reqId: result.reqId!,
      payUrl: result.payUrl,
      sentAt: new Date().toISOString(),
    });

    const user = await getCurrentUser().catch(() => null);
    await auditStore.log({
      entityType: "order",
      entityId: newOrder.id,
      action: "create",
      changes: {
        ladder_prepayment: {
          old: null,
          new: {
            parentOrderId: parent.id,
            parentOrderNumber: parent.orderNumber,
            amount,
            includedInQuote,
            adjustedParentTotal: includedInQuote ? parent.totalPrice - amount : parent.totalPrice,
          },
        },
      },
      description: `사다리차 선결제 발송: ${parent.customerName} ${amount.toLocaleString()}원 (원본 #${parent.orderNumber}${includedInQuote ? ", 견적 차감" : ""})`,
      userId: user?.id ?? 0,
      userName: user?.name ?? "system",
    });

    return NextResponse.json({
      ok: true,
      orderId: newOrder.id,
      orderNumber: newOrder.orderNumber,
      reqId: result.reqId,
      payUrl: result.payUrl,
      parentTotalAdjusted: includedInQuote ? parent.totalPrice - amount : parent.totalPrice,
    });
  } catch (error) {
    console.error("[ladder-prepayment] 발송 에러:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
