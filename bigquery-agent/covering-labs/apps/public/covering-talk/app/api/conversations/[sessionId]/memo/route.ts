import { NextRequest, NextResponse } from "next/server";
import { conversationStore } from "@/lib/store/conversations";

// [CS-ETC-004] 상담 메모 저장
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params;
  const { memo } = await request.json() as { memo: string };

  const conv = await conversationStore.getById(sessionId);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await conversationStore.updateMemo(sessionId, memo);
  return NextResponse.json({ ok: true });
}
