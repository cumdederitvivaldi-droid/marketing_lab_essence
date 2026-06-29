import { NextRequest, NextResponse } from "next/server";
import { updateChatDescription } from "@/lib/channeltalk/client";

// [CS-CT-023] 채널톡 상담 설명 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
): Promise<NextResponse> {
  const { chatId } = await params;
  const { description } = (await request.json()) as { description: string };

  if (typeof description !== "string") {
    return NextResponse.json({ error: "description은 필수입니다" }, { status: 400 });
  }

  try {
    await updateChatDescription(chatId, description);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[CT] description update error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "설명 수정 실패" },
      { status: 500 }
    );
  }
}
