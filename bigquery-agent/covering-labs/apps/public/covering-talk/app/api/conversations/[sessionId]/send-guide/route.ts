import { NextRequest, NextResponse } from "next/server";
import { conversationStore } from "@/lib/store/conversations";
import { sendImageMessage, sendPlainMessage } from "@/lib/happytalk/client";
import { saveSessionHistory } from "@/lib/session/store";
import { getCurrentUser } from "@/lib/auth/session";

const API_HOST = process.env.HAPPYTALK_API_HOST;
const GUIDE_IMAGE_URL =
  "https://nnxaqmeavmcvyqhehuvn.supabase.co/storage/v1/object/public/images/guide/guide.png";

// [CS-EXT-018] 방문수거 가이드 이미지 발송
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params;
  const conv = await conversationStore.getById(sessionId);

  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // 1. 가이드 이미지를 다운로드하여 해피톡에 업로드
  let imageUrl: string;
  try {
    const imgRes = await fetch(GUIDE_IMAGE_URL);
    if (!imgRes.ok) throw new Error("가이드 이미지 다운로드 실패");
    const blob = await imgRes.blob();
    const file = new File([blob], "guide.png", { type: "image/png" });

    const htFormData = new FormData();
    htFormData.append("sender_key", conv.senderKey);
    htFormData.append("image", file);

    const uploadRes = await fetch(
      `${API_HOST}/kakaoWebhook/v3/bzc/image/upload`,
      {
        method: "POST",
        headers: {
          "HT-Client-Id": process.env.HT_CLIENT_ID!,
          "HT-Client-Secret": process.env.HT_CLIENT_SECRET!,
        },
        body: htFormData,
      }
    );

    const uploadResult = await uploadRes.json();

    if (uploadResult.code !== "0000") {
      console.error("[send-guide] HappyTalk 이미지 업로드 실패:", uploadResult);
      return NextResponse.json(
        { error: `업로드 실패: ${uploadResult.message ?? "알 수 없는 오류"}` },
        { status: 500 }
      );
    }

    imageUrl = uploadResult.image;
  } catch (err) {
    console.error("[send-guide] 가이드 이미지 업로드 오류:", err);
    return NextResponse.json({ error: "가이드 이미지 업로드 실패" }, { status: 500 });
  }

  // 2. 해피톡 이미지 메시지 전송
  try {
    await sendImageMessage({
      user_key: conv.userKey,
      sender_key: conv.senderKey,
      imageUrl,
    });
  } catch (err) {
    console.error("[send-guide] 해피톡 가이드 발송 실패:", err);
    return NextResponse.json({ error: "가이드 전송 실패" }, { status: 500 });
  }

  // 3. 안내 텍스트 전송
  const guideText = "안녕하세요 커버링입니다\n해당 이미지 가이드 참고 부탁드리겠습니다.";
  try {
    await sendPlainMessage({
      user_key: conv.userKey,
      sender_key: conv.senderKey,
      message: guideText,
    });
  } catch (err) {
    console.error("[send-guide] 안내 텍스트 발송 실패:", err);
  }

  // 4. 대화 기록에 추가
  const currentUser = await getCurrentUser();
  const senderName = currentUser?.name ?? "상담사";
  await conversationStore.addAssistantMessage(
    sessionId,
    "[가이드 이미지]",
    senderName,
    false,
    "image",
    imageUrl
  );
  await conversationStore.addAssistantMessage(
    sessionId,
    guideText,
    senderName,
    false
  );

  // 미배정 대화면 자동 배정
  if (!conv.assignee && currentUser) {
    await conversationStore.updateAssignee(sessionId, currentUser.name);
  }

  // 가이드 발송 시 야간수거(night_pickup) 상태로 변경
  await conversationStore.updateStatus(sessionId, "night_pickup");

  // 5. 세션 히스토리 저장
  const userMessage = conv.messages.filter((m: { role: string }) => m.role === "user").at(-1)?.content ?? "";
  await saveSessionHistory(conv.userKey, sessionId, userMessage, "[가이드 이미지]");

  return NextResponse.json({ status: "ok", imageUrl });
}
