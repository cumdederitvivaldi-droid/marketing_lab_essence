import { NextRequest, NextResponse } from "next/server";
import { lookupProductSpecs } from "@/lib/ai/product-lookup";

// [CS-ITM-007] AI 품목 조회
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { keyword } = await request.json();
    if (!keyword || typeof keyword !== "string") {
      return NextResponse.json({ error: "keyword 필수" }, { status: 400 });
    }

    const suggestion = await lookupProductSpecs(keyword.trim());
    if (!suggestion) {
      return NextResponse.json({ error: "AI 제안 실패" }, { status: 404 });
    }

    return NextResponse.json({ suggestion });
  } catch (err) {
    console.error("[ai-lookup] error:", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
