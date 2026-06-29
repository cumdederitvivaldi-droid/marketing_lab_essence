import { NextRequest, NextResponse } from "next/server";
import { orderStore } from "@/lib/store/orders";
import { lunchOrderStore } from "@/lib/store/lunch-orders";
import { driverStore } from "@/lib/store/drivers";
import { vehicleStore } from "@/lib/store/vehicles";
import { supabase } from "@/lib/supabase/client";

// [CS-ETC-030] 배차 통합 조회
export async function GET(request: NextRequest): Promise<NextResponse> {
  const date = request.nextUrl.searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "date 파라미터가 필요합니다" }, { status: 400 });
  }

  try {
    // 병렬 조회
    const [orders, lunchOrders, drivers, vehicles, capacityRow] = await Promise.all([
      orderStore.getAll({ date }),
      lunchOrderStore.getAll({ date }),
      driverStore.getAll({ activeOnly: true }),
      vehicleStore.getAll({ activeOnly: true }),
      supabase.from("app_settings").select("value").eq("key", "dispatch_capacity").maybeSingle(),
    ]);

    // 취소 건 제외
    const activeOrders = orders.filter((o) => o.status !== "cancelled");
    const activeLunch = lunchOrders.filter((o) => o.status !== "cancelled");

    // 케파 설정
    const defaultCapacity = { truck1t: 7, truck1tLow: 7, truck25t: 10, maxPerSlot: 3 };
    const capacity = capacityRow.data?.value && typeof capacityRow.data.value === "object"
      ? { ...defaultCapacity, ...(capacityRow.data.value as Record<string, number>) }
      : defaultCapacity;

    return NextResponse.json({
      date,
      orders: activeOrders,
      lunchOrders: activeLunch,
      drivers,
      vehicles,
      capacity,
    });
  } catch (err) {
    console.error("[dispatch] GET error:", err);
    return NextResponse.json({ error: "배차 데이터 조회 실패" }, { status: 500 });
  }
}
