import { NextRequest, NextResponse } from "next/server";
import { getTaxInvoice } from "@/lib/bolta/client";

// [CS-ETC-042] 세금계산서 상세 조회 (볼타 API 프록시)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ issuanceKey: string }> }
): Promise<NextResponse> {
  try {
    const { issuanceKey } = await params;
    const detail = await getTaxInvoice(issuanceKey);
    return NextResponse.json(detail);
  } catch (err) {
    console.error("[lunch-invoices/detail] error:", err);
    const msg = err instanceof Error ? err.message : "조회 실패";
    // Bolta 발행 직후 NTS 전송 처리 중일 때 조회가 잠김 — 사용자 친화 메시지
    if (msg.includes("TAX_INVOICE_RETRIEVE_NOT_AVAILABLE")) {
      return NextResponse.json(
        { error: "발행 처리 중입니다 (국세청 전송 중). 1~2분 후 다시 조회해주세요.", code: "PROCESSING" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
