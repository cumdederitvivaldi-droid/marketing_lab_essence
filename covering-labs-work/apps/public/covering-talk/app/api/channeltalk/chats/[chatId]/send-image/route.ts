import { NextRequest, NextResponse } from "next/server";
import { sendFileMessage } from "@/lib/channeltalk/client";

// [CS-CT-014] 채널톡 이미지 URL 직접 전송 (매크로 이미지 등)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
): Promise<NextResponse> {
  const { chatId } = await params;

  try {
    const { imageUrl, fileName, botName, isInternal } = await request.json();
    if (!imageUrl) {
      return NextResponse.json({ error: "imageUrl 필요" }, { status: 400 });
    }

    await sendFileMessage(chatId, imageUrl, fileName ?? "image.png", {
      botName: botName ?? "커버링",
      actAsManager: true,
      isImage: true,
      contentType: "image/png",
      isInternal: isInternal ?? false,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[CT] send-image error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "전송 실패" },
      { status: 500 }
    );
  }
}
