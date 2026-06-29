import { NextRequest, NextResponse } from "next/server";
import { conversationStore } from "@/lib/store/conversations";

// [CS-ETC-012] AI 초안 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params;
  const { draft } = await request.json();

  if (typeof draft !== "string") {
    return NextResponse.json({ error: "draft is required" }, { status: 400 });
  }

  await conversationStore.updateDraft(sessionId, draft);
  return NextResponse.json({ status: "ok" });
}
