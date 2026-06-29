// [CS-ETC-069] §6.1 — 수거일 20시(KST)에 status=prepaid 인 주문을 completed 로 자동 전이.
//   당일 수거가 끝났다고 간주 (운영자가 수동으로 완료 처리 안 한 건 일괄 정리).
//   feature flag(prepayment_enabled) OFF 면 no-op.
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { orderStore } from "@/lib/store/orders";
import { auditStore } from "@/lib/store/audit-logs";
import { getPrepaymentEnabled } from "@/lib/store/app-settings";

export async function GET(): Promise<NextResponse> {
  const enabled = await getPrepaymentEnabled();
  if (!enabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: "prepayment_enabled=false" });
  }

  // KST 기준 오늘 날짜
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const todayKst = kst.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, customer_name, total_price")
    .eq("status", "prepaid")
    .eq("date", todayKst);
  if (error) {
    console.error("[prepaid-complete] 조회 오류:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const orders = data ?? [];
  if (orders.length === 0) {
    return NextResponse.json({ ok: true, total: 0, completed: 0, date: todayKst });
  }

  let completed = 0;
  const results: { id: string; name: string; status: "completed" | "failed"; reason?: string }[] = [];

  for (const o of orders) {
    try {
      await orderStore.update(o.id, { status: "completed" });
      await auditStore.log({
        entityType: "order",
        entityId: o.id,
        action: "status_change",
        changes: { status: { old: "prepaid", new: "completed" } },
        description: `자동 완료 처리 (수거일 20시): ${o.customer_name} ${o.order_number}`,
        userId: 0,
        userName: "system",
      });
      completed++;
      results.push({ id: o.id, name: o.customer_name, status: "completed" });
    } catch (e) {
      console.error(`[prepaid-complete] ${o.customer_name} 처리 실패:`, e);
      results.push({ id: o.id, name: o.customer_name, status: "failed", reason: e instanceof Error ? e.message : String(e) });
    }
  }

  console.log(`[prepaid-complete] ${todayKst}: prepaid ${orders.length}건 → completed ${completed}건`);
  return NextResponse.json({ ok: true, date: todayKst, total: orders.length, completed, results });
}
