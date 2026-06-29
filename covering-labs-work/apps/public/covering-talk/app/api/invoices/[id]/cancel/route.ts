import { NextRequest, NextResponse } from "next/server";
import { pickupInvoiceStore } from "@/lib/store/pickup-invoices";
import { amendTerminationTaxInvoice } from "@/lib/bolta/client";
import { supabase } from "@/lib/supabase/client";

// Vercel 함수 타임아웃 60초 (볼타 수정발행 호출)
export const maxDuration = 60;

// [CS-ETC-067] 방문수거 세금계산서 취소 (수정발행 · 계약의 해제)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const reason: string = (body?.reason ?? "").trim() || "상담사 취소 요청";
    const dateInput: string | undefined = body?.date;

    const invoice = await pickupInvoiceStore.getById(id);
    if (!invoice) {
      return NextResponse.json({ error: "발행 이력을 찾을 수 없습니다" }, { status: 404 });
    }
    if (invoice.status !== "issued") {
      return NextResponse.json(
        { error: `발행된 상태(issued)만 취소 가능합니다 (현재: ${invoice.status})` },
        { status: 400 }
      );
    }
    if (!invoice.issuanceKey) {
      return NextResponse.json({ error: "issuanceKey 없음 — 볼타 발행 미연동" }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const cancelDate = dateInput && /^\d{4}-\d{2}-\d{2}$/.test(dateInput) ? dateInput : today;

    // 원자적 클레임 — issued → cancelled 트랜지션을 Bolta 호출 전에 선점.
    //   동시 재시도 시 두 번째 요청은 status='issued' 조건이 깨져 0건 반환 → 409.
    //   Bolta 실패 시 아래 catch 에서 issued 로 revert.
    const { data: claimed } = await supabase
      .from("pickup_invoices")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        error_message: reason,
      })
      .eq("id", id)
      .eq("status", "issued")
      .select("id")
      .maybeSingle();

    if (!claimed) {
      return NextResponse.json(
        { error: "이미 취소되었거나 다른 요청이 처리 중입니다" },
        { status: 409 }
      );
    }

    try {
      await amendTerminationTaxInvoice(invoice.issuanceKey, cancelDate);
    } catch (err) {
      // Bolta 실패 — DB 클레임 revert
      await supabase
        .from("pickup_invoices")
        .update({ status: "issued", cancelled_at: null, error_message: null })
        .eq("id", id);
      const msg = err instanceof Error ? err.message : "볼타 수정발행 실패";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[invoices/cancel] error:", err);
    return NextResponse.json({ error: "취소 처리 실패" }, { status: 500 });
  }
}
