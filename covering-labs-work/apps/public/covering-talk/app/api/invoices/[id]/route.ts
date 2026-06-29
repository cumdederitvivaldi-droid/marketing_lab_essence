import { NextRequest, NextResponse } from "next/server";
import { pickupInvoiceStore } from "@/lib/store/pickup-invoices";
import { getTaxInvoice } from "@/lib/bolta/client";
import { getCurrentUser } from "@/lib/auth/session";

// [CS-ETC-066] 방문수거 세금계산서 상세 (Bolta detail 포함)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  // 세금계산서 데이터는 사업자 정보를 포함 — 인증된 상담사만 조회 가능.
  //   middleware 가 JWT 차단하지만, 라우트 레벨 명시적 가드를 1단 더 둠.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const invoice = await pickupInvoiceStore.getById(id);
    if (!invoice) {
      return NextResponse.json({ error: "발행 이력을 찾을 수 없습니다" }, { status: 404 });
    }

    let bolta = null;
    if (invoice.issuanceKey) {
      try {
        bolta = await getTaxInvoice(invoice.issuanceKey);
      } catch (err) {
        console.error("[invoices/detail] bolta 조회 실패:", err);
      }
    }

    return NextResponse.json({ invoice, bolta });
  } catch (err) {
    console.error("[invoices/detail] error:", err);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}
