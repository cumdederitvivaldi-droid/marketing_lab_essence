import { NextRequest, NextResponse } from "next/server";
import { sendMessage } from "@/lib/channeltalk/client";

// [CS-CAI-002] 추천 답변 채널톡 전송
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { chatId, answerText, suggestionId } = body as {
      chatId: string;
      answerText: string;
      suggestionId?: number;
    };

    if (!chatId || !answerText) {
      return NextResponse.json(
        { error: "chatId와 answerText는 필수입니다" },
        { status: 400 }
      );
    }

    await sendMessage(chatId, answerText);

    return NextResponse.json({ success: true, suggestionId });
  } catch (err) {
    console.error("[CAI-002] 전송 API 오류:", err);
    return NextResponse.json(
      { error: "메시지 전송 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
