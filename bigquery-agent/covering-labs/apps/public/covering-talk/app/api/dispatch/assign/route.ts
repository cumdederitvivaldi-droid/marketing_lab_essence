import { NextRequest, NextResponse } from "next/server";
import { orderStore } from "@/lib/store/orders";
import { lunchOrderStore } from "@/lib/store/lunch-orders";

interface Assignment {
  type: "order" | "lunch";
  id: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  vehicleId?: string;
  routeOrder?: number;
}

// [CS-ETC-031] 배차 배정/순서 변경
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { assignments } = (await request.json()) as { assignments: Assignment[] };

    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
      return NextResponse.json({ error: "assignments 배열이 필요합니다" }, { status: 400 });
    }

    const now = new Date().toISOString();
    let updated = 0;

    await Promise.all(
      assignments.map(async (a) => {
        if (a.type === "order") {
          const success = await orderStore.update(a.id, {
            driverId: a.driverId ?? "",
            driverName: a.driverName ?? "",
            driverPhone: a.driverPhone ?? "",
            vehicleId: a.vehicleId ?? "",
            routeOrder: a.routeOrder ?? 0,
            isDispatched: !!(a.driverName),
            dispatchedAt: a.driverName ? now : null,
          });
          if (success) updated++;
        } else if (a.type === "lunch") {
          const success = await lunchOrderStore.update(a.id, {
            driverName: a.driverName ?? "",
            driverPhone: a.driverPhone ?? "",
            vehicleId: a.vehicleId ?? "",
            isDispatched: !!(a.driverName),
            dispatchedAt: a.driverName ? now : null,
          });
          if (success) updated++;
        }
      })
    );

    return NextResponse.json({ success: true, updated });
  } catch (err) {
    console.error("[dispatch/assign] POST error:", err);
    return NextResponse.json({ error: "배차 배정 실패" }, { status: 500 });
  }
}
