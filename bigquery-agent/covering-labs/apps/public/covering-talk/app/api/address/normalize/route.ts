import { NextRequest, NextResponse } from "next/server";
import { normalizeAddress } from "@/lib/kakao/local";

// [CS-ETC-050] 주소 정규화 (Kakao Local API 프록시)
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { address } = await request.json();
    if (typeof address !== "string" || !address.trim()) {
      return NextResponse.json({ error: "address 필수" }, { status: 400 });
    }

    const result = await normalizeAddress(address);
    if (!result) {
      return NextResponse.json({ matched: false });
    }

    return NextResponse.json({ matched: true, ...result });
  } catch (err) {
    console.error("[address/normalize] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "정규화 실패" },
      { status: 500 }
    );
  }
}
