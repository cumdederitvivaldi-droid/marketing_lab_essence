import { NextRequest, NextResponse } from "next/server";
import { lunchConversationStore } from "@/lib/store/lunch-conversations";
import { sendLunchImageMessage } from "@/lib/happytalk/lunch-client";
import { getCurrentUser } from "@/lib/auth/session";

const API_HOST = process.env.LUNCH_HAPPYTALK_API_HOST || process.env.HAPPYTALK_API_HOST;

// [CS-ETC-060] 런치 채팅 이미지 발송
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  try {
    const { sessionId } = await params;
    const conv = await lunchConversationStore.getById(sessionId);
    if (!conv) {
      return NextResponse.json({ error: "대화를 찾을 수 없습니다" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const message = (formData.get("message") as string) || undefined;

    if (!file) {
      return NextResponse.json({ error: "이미지 파일이 없습니다" }, { status: 400 });
    }

    // 1. HappyTalk 이미지 업로드
    let imageUrl: string;
    try {
      const htFormData = new FormData();
      htFormData.append("sender_key", (process.env.LUNCH_SENDER_KEY || "").trim());
      htFormData.append("image", file);

      const uploadRes = await fetch(
        `${API_HOST}/kakaoWebhook/v3/bzc/image/upload`,
        {
          method: "POST",
          headers: {
            "HT-Client-Id": (process.env.LUNCH_HT_CLIENT_ID || "").trim(),
            "HT-Client-Secret": (process.env.LUNCH_HT_CLIENT_SECRET || "").trim(),
          },
          body: htFormData,
        }
      );

      const uploadResult = await uploadRes.json();
      if (uploadResult.code !== "0000") {
        console.error("[lunch-send-image] HappyTalk 이미지 업로드 실패:", uploadResult);
        return NextResponse.json(
          { error: `업로드 실패: ${uploadResult.message ?? "알 수 없는 오류"}` },
          { status: 500 }
        );
      }
      imageUrl = uploadResult.image;
    } catch (err) {
      console.error("[lunch-send-image] 이미지 업로드 오류:", err);
      return NextResponse.json({ error: "이미지 업로드 실패" }, { status: 500 });
    }

    // 2. HappyTalk 이미지 메시지 전송
    try {
      await sendLunchImageMessage({
        user_key: conv.userKey,
        imageUrl,
        message,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // 고객이 채팅방을 나간 경우 (세션 만료) → 자동 상담종료 처리
      if (errMsg.includes("InvalidSessionException") || errMsg.includes("-502")) {
        console.log("[lunch-send-image] 세션 만료 → 상담종료 처리:", sessionId);
        await lunchConversationStore.update(sessionId, { status: "closed" });
        await lunchConversationStore.addOutgoingMessage(
          sessionId,
          "고객이 채팅방을 나가셨습니다. 상담이 종료됩니다.",
          "시스템",
        );
        return NextResponse.json({
          status: "session_expired",
          message: "고객이 채팅방을 나가셨습니다. 상담이 종료됩니다.",
        });
      }

      console.error("[lunch-send-image] 해피톡 이미지 발송 실패:", err);
      return NextResponse.json({ error: "이미지 전송 실패" }, { status: 500 });
    }

    // 3. DB에 이미지 메시지 저장 (상담사 이름 포함)
    const currentUser = await getCurrentUser();
    const senderName = currentUser?.name ?? "상담사";
    await lunchConversationStore.addOutgoingMessage(
      sessionId,
      message || "[이미지]",
      senderName,
      "image",
      imageUrl
    );

    return NextResponse.json({ success: true, imageUrl });
  } catch (err) {
    console.error("[lunch-send-image] error:", err);
    return NextResponse.json({ error: "이미지 전송 처리 실패" }, { status: 500 });
  }
}
