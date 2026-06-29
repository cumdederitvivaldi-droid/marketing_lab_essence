import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { deleteMessage } from "@/lib/channeltalk/desk-api";

// [CS-CT-020] 채널톡 메시지 삭제 (Desk API)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chatId } = await params;
  const { messageId } = (await request.json()) as { messageId: string };

  if (!messageId) {
    return NextResponse.json({ error: "messageId는 필수입니다" }, { status: 400 });
  }

  try {
    const result = await deleteMessage(chatId, messageId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "삭제 실패";
    console.error("[CT] delete-message error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
