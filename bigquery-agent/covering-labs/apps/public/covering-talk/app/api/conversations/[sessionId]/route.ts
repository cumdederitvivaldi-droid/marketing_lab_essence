import { NextRequest, NextResponse } from "next/server";
import { conversationStore } from "@/lib/store/conversations";

// [CS-ETC-002] 상담 상세 조회
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  try {
    const { sessionId } = await params;
    const conv = await conversationStore.getById(sessionId);

    if (!conv) {
      console.warn(`[API] getById: conversation not found (${sessionId})`);
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(conv);
  } catch (err) {
    console.error("[API] getById error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
