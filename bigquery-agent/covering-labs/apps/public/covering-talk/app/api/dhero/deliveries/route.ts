import { NextRequest, NextResponse } from "next/server";
import { getDelivery, searchDeliveriesByPhone } from "@/lib/dhero/client";

// [CS-DH-001] 두발히어로 배송 조회 (bookId 또는 전화번호)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const bookId = searchParams.get("bookId");
  const phone = searchParams.get("phone");

  if (!bookId && !phone) {
    return NextResponse.json(
      { error: "bookId 또는 phone 파라미터가 필요합니다" },
      { status: 400 }
    );
  }

  try {
    if (bookId) {
      const delivery = await getDelivery(bookId);
      return NextResponse.json({ deliveries: [delivery] });
    }

    // 전화번호로 검색 (기본 7일, 최대 30일)
    const daysParam = searchParams.get("days");
    const days = Math.min(Math.max(parseInt(daysParam || "7", 10) || 7, 1), 30);
    const deliveries = await searchDeliveriesByPhone(phone!, days);
    return NextResponse.json({ deliveries });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DH-001] 배송 조회 오류:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
