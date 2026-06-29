import { NextRequest, NextResponse } from "next/server";
import { amendTerminationTaxInvoice } from "@/lib/bolta/client";
import { lunchInvoiceStore } from "@/lib/store/lunch-invoices";
import { supabase } from "@/lib/supabase/client";

// [CS-ETC-061] 세금계산서 취소 (수정발행 · 계약의 해제)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ issuanceKey: string }> }
): Promise<NextResponse> {
  try {
    const { issuanceKey } = await params;
    const body = await request.json().catch(() => ({}));
    const terminationDate: string = body.date || (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const reason: string | undefined = typeof body.reason === "string" ? body.reason.trim() : undefined;

    // 원본 invoice 조회
    const { data: invRow, error: invErr } = await supabase
      .from("lunch_invoices")
      .select("*")
      .eq("issuance_key", issuanceKey)
      .single();
    if (invErr || !invRow) {
      return NextResponse.json({ error: "원본 세금계산서를 찾을 수 없습니다" }, { status: 404 });
    }
    if (invRow.status === "cancelled") {
      return NextResponse.json({ error: "이미 취소된 세금계산서입니다" }, { status: 409 });
    }
    if (invRow.status !== "issued") {
      return NextResponse.json({ error: `현재 상태(${invRow.status})에서는 취소할 수 없습니다` }, { status: 400 });
    }

    // 원자적 클레임 — issued → cancelled 를 Bolta 호출 전에 선점.
    //   동시 재시도 방어. Bolta 실패 시 issued 로 revert.
    //   amend.issuanceKey 는 Bolta 응답 후에야 알 수 있으므로 description 은 2단계로 갱신.
    const claimDesc = `취소 처리중 (${terminationDate})${reason ? ` | 사유: ${reason}` : ""}`;
    const { data: claimed } = await supabase
      .from("lunch_invoices")
      .update({ status: "cancelled", description: claimDesc })
      .eq("id", invRow.id)
      .eq("status", "issued")
      .select("id")
      .maybeSingle();

    if (!claimed) {
      return NextResponse.json(
        { error: "이미 취소되었거나 다른 요청이 처리 중입니다" },
        { status: 409 }
      );
    }

    // Bolta 수정발행 · 계약의 해제 호출
    let amend: { issuanceKey: string };
    try {
      amend = await amendTerminationTaxInvoice(issuanceKey, terminationDate);
    } catch (err) {
      // Bolta 실패 — DB 클레임 revert
      await supabase
        .from("lunch_invoices")
        .update({ status: "issued", description: invRow.description ?? "" })
        .eq("id", invRow.id);
      throw err;
    }

    // 원본 invoice 의 description 을 amend 키 포함된 최종 텍스트로 갱신
    await lunchInvoiceStore.markCancelled(invRow.id, amend.issuanceKey, terminationDate, reason);

    // 연결된 주문들 상태 복원 (정산완료 → 일정확정 / invoice_issued=false)
    const { data: linkedOrders } = await supabase
      .from("lunch_orders")
      .select("id")
      .eq("invoice_id", invRow.id);

    const orderIds = (linkedOrders || []).map((o) => o.id);
    if (orderIds.length > 0) {
      await supabase
        .from("lunch_orders")
        .update({
          invoice_issued: false,
          status: "confirmed",
          invoice_id: null,
        })
        .in("id", orderIds);
    }

    return NextResponse.json({
      success: true,
      amendIssuanceKey: amend.issuanceKey,
      terminationDate,
      restoredOrderCount: orderIds.length,
    });
  } catch (err) {
    console.error("[lunch-invoices/cancel] error:", err);
    const msg = err instanceof Error ? err.message : "취소 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
