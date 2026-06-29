import { NextRequest, NextResponse } from "next/server";
import { orderStore, OrderStatus } from "@/lib/store/orders";

const VALID_STATUSES: OrderStatus[] = ["confirmed", "cancelled", "payment_requested", "completed"];

// [CS-ORD-007] 주문 일괄 상태 변경
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { ids, status } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids 배열이 필요합니다" }, { status: 400 });
    }
    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `status는 ${VALID_STATUSES.join(", ")} 중 하나여야 합니다` },
        { status: 400 }
      );
    }

    let successCount = 0;
    for (const id of ids) {
      const ok = await orderStore.update(id, { status });
      if (ok) successCount++;
    }

    return NextResponse.json({ ok: true, count: successCount });
  } catch (error) {
    console.error("[orders] 일괄 상태 변경 에러:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
