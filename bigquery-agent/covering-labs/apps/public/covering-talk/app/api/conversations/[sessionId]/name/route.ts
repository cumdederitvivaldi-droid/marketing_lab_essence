import { NextRequest, NextResponse } from "next/server";
import { conversationStore } from "@/lib/store/conversations";

// [CS-ETC-005] 고객 이름/연락처 수정
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params;
  const body = await request.json() as { name?: string; phone?: string };

  const conv = await conversationStore.getById(sessionId);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.name !== undefined) {
    await conversationStore.updateName(sessionId, body.name);
  }
  if (body.phone !== undefined) {
    await conversationStore.updatePhone(sessionId, body.phone);
  }

  return NextResponse.json({ ok: true });
}
