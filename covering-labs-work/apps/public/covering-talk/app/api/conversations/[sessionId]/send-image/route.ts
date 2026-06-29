import { NextRequest, NextResponse } from "next/server";
import { conversationStore } from "@/lib/store/conversations";
import { sendImageMessage } from "@/lib/happytalk/client";
import { saveSessionHistory } from "@/lib/session/store";
import { getCurrentUser } from "@/lib/auth/session";

const API_HOST = process.env.HAPPYTALK_API_HOST;

// [CS-EXT-012] 고객에게 이미지 발송
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params;
  const conv = await conversationStore.getById(sessionId);

  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
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
      console.error("[send-image] HappyTalk 이미지 업로드 실패:", uploadResult);
      return NextResponse.json(
        { error: `업로드 실패: ${uploadResult.message ?? "알 수 없는 오류"}` },
        { status: 500 }
      );
    }

    imageUrl = uploadResult.image;
  } catch (err) {
    console.error("[send-image] 이미지 업로드 오류:", err);
    return NextResponse.json({ error: "이미지 업로드 실패" }, { status: 500 });
  }

  // 2. HappyTalk 이미지 메시지 전송
  try {
    await sendImageMessage({
      user_key: conv.userKey,
      sender_key: conv.senderKey,
      imageUrl,
      message,
    });
  } catch (err) {
    console.error("[send-image] 해피톡 이미지 발송 실패:", err);
    return NextResponse.json({ error: "이미지 전송 실패" }, { status: 500 });
  }

  // 이 시점부터는 해피톡 발송이 이미 성공한 상태 — 후처리 실패가 클라이언트
  // 재시도를 유발해 중복 발송이 일어나면 안 됨. 모두 try/catch 로 격리하고
  // 실패는 로깅만, 응답은 200 OK 유지.

  const currentUser = await getCurrentUser().catch(() => null);
  const senderName = currentUser?.name ?? "상담사";

  // 3. 대화 기록에 이미지 메시지 추가
  try {
    await conversationStore.addAssistantMessage(
      sessionId,
      message || "[이미지]",
      senderName,
      false,
      "image",
      imageUrl
    );
  } catch (err) {
    console.error("[send-image] addAssistantMessage 실패 (발송은 성공):", err);
  }

  // 미배정 대화면 자동 배정
  if (!conv.assignee && currentUser) {
    try {
      await conversationStore.updateAssignee(sessionId, currentUser.name);
    } catch (err) {
      console.error("[send-image] updateAssignee 실패 (발송은 성공):", err);
    }
  }

  // 4. 세션 히스토리 저장
  try {
    const userMessage = conv.messages.filter((m: { role: string }) => m.role === "user").at(-1)?.content ?? "";
    await saveSessionHistory(conv.userKey, sessionId, userMessage, message || "[이미지]");
  } catch (err) {
    console.error("[send-image] saveSessionHistory 실패 (발송은 성공):", err);
  }

  return NextResponse.json({ status: "ok", imageUrl });
}
