import { NextRequest, NextResponse } from "next/server";
import { orderStore, OrderStatus } from "@/lib/store/orders";
import { auditStore } from "@/lib/store/audit-logs";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrepaymentEnabled } from "@/lib/store/app-settings";
import { issuePrepaymentLink } from "@/lib/payments/issue-prepayment-link";

// [CS-ORD-001] 주문 목록 조회
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId") || undefined;
    const date = searchParams.get("date") || undefined;
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;
    const status = (searchParams.get("status") as OrderStatus) || undefined;
    const search = searchParams.get("search") || undefined;

    // sessionId 필터: 해당 세션의 주문만 조회
    if (sessionId) {
      const orders = await orderStore.getAll({ date, dateFrom, dateTo, status, search });
      const filtered = orders.filter((o) => o.sessionId === sessionId);
      return NextResponse.json({ orders: filtered });
    }

    const orders = await orderStore.getAll({ date, dateFrom, dateTo, status, search });

    return NextResponse.json({ orders });
  } catch (error) {
    console.error("[orders] 목록 조회 에러:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// [CS-ORD-002] 주문 생성
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();

    if (!body.customerName || !body.phone || !body.date) {
      return NextResponse.json(
        { error: "customerName, phone, date는 필수입니다" },
        { status: 400 }
      );
    }

    const order = await orderStore.create({
      sessionId: body.sessionId || null,
      status: body.status || "confirmed",
      customerName: body.customerName,
      phone: body.phone,
      address: body.address || "",
      date: body.date,
      timeSlot: body.timeSlot || "",
      floor: body.floor ?? null,
      hasElevator: body.hasElevator ?? false,
      hasParking: body.hasParking ?? false,
      hasGroundAccess: body.hasGroundAccess ?? true,
      needLadder: body.needLadder ?? false,
      ladderFee: body.ladderFee || 0,
      crewSize: body.crewSize || 1,
      items: body.items || [],
      totalVolume: body.totalVolume || 0,
      totalPrice: body.totalPrice || 0,
      memo: body.memo || "",
      photos: body.photos || [],
    });

    if (!order) {
      return NextResponse.json({ error: "주문 생성 실패" }, { status: 500 });
    }

    const user = await getCurrentUser().catch(() => null);
    await auditStore.log({
      entityType: "order", entityId: order.id, action: "create",
      changes: { created: { old: null, new: { orderNumber: order.orderNumber, customerName: body.customerName, phone: body.phone, date: body.date, address: body.address } } },
      description: `주문 생성 (수동): ${body.customerName} ${body.date}`,
      userId: user?.id ?? 0, userName: user?.name ?? "system",
    });

    // §6.1 100% 선결제 — feature flag ON 이고 confirmed 신규 주문이면 즉시 NicePay 링크 발송.
    //   실패해도 주문 생성은 성공으로 응답 (cron auto-payment 가 fallback).
    let prepaymentResult: { success: boolean; reason?: string } | null = null;
    if (order.status === "confirmed") {
      try {
        const enabled = await getPrepaymentEnabled();
        if (enabled) {
          prepaymentResult = await issuePrepaymentLink(order);
        }
      } catch (e) {
        console.warn("[orders] 선결제 발송 예외:", e);
        prepaymentResult = { success: false, reason: e instanceof Error ? e.message : String(e) };
      }
    }

    return NextResponse.json({
      ok: true,
      id: order.id,
      orderNumber: order.orderNumber,
      prepayment: prepaymentResult,
    });
  } catch (error) {
    console.error("[orders] 생성 에러:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
