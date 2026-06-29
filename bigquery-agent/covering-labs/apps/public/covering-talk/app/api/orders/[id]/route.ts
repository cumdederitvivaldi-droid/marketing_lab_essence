import { NextRequest, NextResponse } from "next/server";
import { orderStore } from "@/lib/store/orders";
import { auditStore, diffObjects } from "@/lib/store/audit-logs";
import { getCurrentUser } from "@/lib/auth/session";

// [CS-ORD-003] 주문 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = await request.json();

    const order = await orderStore.getById(id);
    if (!order) {
      return NextResponse.json({ error: "주문을 찾을 수 없습니다" }, { status: 404 });
    }

    const ok = await orderStore.update(id, body);
    if (!ok) {
      return NextResponse.json({ error: "업데이트 실패" }, { status: 500 });
    }

    const user = await getCurrentUser().catch(() => null);
    const changes = diffObjects(order as unknown as Record<string, unknown>, body);
    if (Object.keys(changes).length > 0) {
      await auditStore.log({
        entityType: "order", entityId: id, action: body.status && body.status !== order.status ? "status_change" : "update",
        changes, description: `주문 수정: ${order.customerName} ${order.orderNumber}`,
        userId: user?.id ?? 0, userName: user?.name ?? "system",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[orders] 수정 에러:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// [CS-ORD-004] 주문 삭제
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;

    const order = await orderStore.getById(id);
    if (!order) {
      return NextResponse.json({ error: "주문을 찾을 수 없습니다" }, { status: 404 });
    }

    const ok = await orderStore.delete(id);
    if (!ok) {
      return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
    }

    const user = await getCurrentUser().catch(() => null);
    await auditStore.log({
      entityType: "order", entityId: id, action: "delete",
      changes: { deleted: { old: { orderNumber: order.orderNumber, customerName: order.customerName, date: order.date }, new: null } },
      description: `주문 삭제: ${order.customerName} ${order.orderNumber}`,
      userId: user?.id ?? 0, userName: user?.name ?? "system",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[orders] 삭제 에러:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
