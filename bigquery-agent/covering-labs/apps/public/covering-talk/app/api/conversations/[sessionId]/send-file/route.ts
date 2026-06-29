import { NextRequest, NextResponse } from "next/server";
import { conversationStore } from "@/lib/store/conversations";
import { sendPlainMessage, sendFileMessage } from "@/lib/happytalk/client";
import { saveSessionHistory } from "@/lib/session/store";
import { getCurrentUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/client";

const API_HOST = process.env.HAPPYTALK_API_HOST;

// [CS-EXT-013] 고객에게 파일 발송
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

  if (!file) {
    return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
  }

  const fileName = file.name;
  const fileSize = file.size;
  let fileUrl: string;

  // 1차: 해피톡 file upload API
  try {
    const htFormData = new FormData();
    htFormData.append("sender_key", conv.senderKey);
    htFormData.append("file", file);

    const uploadRes = await fetch(
      `${API_HOST}/kakaoWebhook/v3/bzc/file/upload`,
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

    if (uploadResult.code === "0000" && uploadResult.file) {
      fileUrl = uploadResult.file;
      // FILE 메시지 전송
      await sendFileMessage({
        user_key: conv.userKey,
        sender_key: conv.senderKey,
        fileUrl,
        fileName: uploadResult.name ?? fileName,
        fileSize: uploadResult.size ?? fileSize,
      });
    } else {
      throw new Error(uploadResult.message || "해피톡 업로드 실패");
    }
  } catch (htErr) {
    console.warn("[send-file] 해피톡 파일 업로드 실패, Supabase 우회:", htErr);

    // 2차: Supabase Storage → 텍스트 링크
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = fileName.split(".").pop() || "file";
    const storagePath = `chat/${sessionId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const admin = supabaseAdmin ?? (await import("@/lib/supabase/client")).supabase;
    const { error: uploadErr } = await admin.storage
      .from("images")
      .upload(storagePath, buffer, { contentType: file.type || "application/octet-stream", upsert: false });

    if (uploadErr) {
      console.error("[send-file] Supabase 업로드 실패:", uploadErr);
      return NextResponse.json({ error: "파일 업로드 실패" }, { status: 500 });
    }

    const { data: urlData } = admin.storage.from("images").getPublicUrl(storagePath);
    fileUrl = urlData.publicUrl;

    await sendPlainMessage({
      user_key: conv.userKey,
      sender_key: conv.senderKey,
      message: `📎 파일: ${fileName}\n${fileUrl}`,
    });
  }

  // 3. 대화 기록에 파일 메시지 추가
  const currentUser = await getCurrentUser();
  const senderName = currentUser?.name ?? "상담사";
  await conversationStore.addAssistantMessage(
    sessionId,
    `[파일] ${fileName}`,
    senderName,
    false,
    "file",
    fileUrl
  );

  // 미배정 대화면 자동 배정
  if (!conv.assignee && currentUser) {
    await conversationStore.updateAssignee(sessionId, currentUser.name);
  }

  // 4. 세션 히스토리 저장
  const userMessage = conv.messages.filter((m: { role: string }) => m.role === "user").at(-1)?.content ?? "";
  await saveSessionHistory(conv.userKey, sessionId, userMessage, `[파일] ${fileName}`);

  return NextResponse.json({ status: "ok", fileUrl, fileName });
}
