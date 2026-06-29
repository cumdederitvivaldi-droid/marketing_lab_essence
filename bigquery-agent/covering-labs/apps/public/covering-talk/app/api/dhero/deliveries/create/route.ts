import { NextRequest, NextResponse } from "next/server";
import { createDelivery } from "@/lib/dhero/client";

// [CS-DH-002] 두발히어로 배송 접수
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { receiverName, receiverMobile, receiverAddress, receiverAddressDetail,
            productName, productCount, memoFromCustomer, frontdoorPassword } = body;

    if (!receiverName || !receiverMobile || !receiverAddress) {
      return NextResponse.json(
        { error: "수하인명, 연락처, 주소는 필수입니다" },
        { status: 400 }
      );
    }

    const result = await createDelivery({
      receiverName,
      receiverMobile: receiverMobile.replace(/[-\s]/g, ""),
      receiverAddress,
      receiverAddressDetail: receiverAddressDetail || "",
      productName: productName || "커버링 봉투",
      productCount: productCount || undefined,
      memoFromCustomer: memoFromCustomer || undefined,
      frontdoorPassword: frontdoorPassword || undefined,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DH-002] 배송 접수 오류:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
