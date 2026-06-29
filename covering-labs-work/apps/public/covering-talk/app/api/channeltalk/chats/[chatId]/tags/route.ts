import { NextRequest, NextResponse } from "next/server";
import { updateChatTags } from "@/lib/channeltalk/client";

// [CS-CT-022] 채팅 태그 추가/삭제
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
): Promise<NextResponse> {
  try {
    const { chatId } = await params;
    const { tags } = await request.json() as { tags: string[] };

    if (!Array.isArray(tags)) {
      return NextResponse.json({ error: "tags는 배열이어야 합니다" }, { status: 400 });
    }

    // 최대 8개 제한
    if (tags.length > 8) {
      return NextResponse.json({ error: "태그는 최대 8개까지 가능합니다" }, { status: 400 });
    }

    await updateChatTags(chatId, tags);
    return NextResponse.json({ success: true, tags });
  } catch (err) {
    console.error("[CT] tags update error:", err);
    return NextResponse.json({ error: "태그 수정 실패" }, { status: 500 });
  }
}
