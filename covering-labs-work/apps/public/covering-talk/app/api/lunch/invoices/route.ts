import { NextRequest, NextResponse } from "next/server";
import { lunchInvoiceStore } from "@/lib/store/lunch-invoices";

// [CS-ETC-040] 세금계산서 발행 이력 조회
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || undefined;
    const vendorId = searchParams.get("vendorId") || undefined;

    const invoices = await lunchInvoiceStore.getAll({ period, vendorId });
    return NextResponse.json({ invoices });
  } catch (err) {
    console.error("[lunch-invoices] GET error:", err);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}
