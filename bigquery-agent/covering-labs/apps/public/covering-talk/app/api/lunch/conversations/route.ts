import { NextRequest, NextResponse } from "next/server";
import { lunchConversationStore } from "@/lib/store/lunch-conversations";

// [CS-ETC-044] 런치 대화 목록 조회
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as "active" | "closed" | "needs_check" | undefined;
    const search = searchParams.get("search") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50");
    const cursor = searchParams.get("cursor") || undefined;

    const result = await lunchConversationStore.getAll({
      status: status || undefined,
      search,
      limit,
      cursor,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[lunch-conversations] GET error:", err);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}
