import { NextRequest, NextResponse } from "next/server";
import { pickupInvoiceStore, PickupInvoiceStatus } from "@/lib/store/pickup-invoices";

// [CS-ETC-065] 방문수거 세금계산서 발행 이력 목록
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const status = request.nextUrl.searchParams.get("status") as PickupInvoiceStatus | null;
    const sessionId = request.nextUrl.searchParams.get("sessionId");
    const limitStr = request.nextUrl.searchParams.get("limit");
    const limit = limitStr ? Math.max(1, Math.min(500, Number(limitStr))) : undefined;

    const list = await pickupInvoiceStore.getAll({
      status: status ?? undefined,
      sessionId: sessionId ?? undefined,
      limit,
    });

    return NextResponse.json({ items: list });
  } catch (err) {
    console.error("[invoices/list] error:", err);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}
