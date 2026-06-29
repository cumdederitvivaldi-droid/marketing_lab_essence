import { NextRequest, NextResponse } from "next/server";
import { lunchConversationStore } from "@/lib/store/lunch-conversations";
import { sendLunchPlainMessage, sendLunchFileMessage } from "@/lib/happytalk/lunch-client";
import { getCurrentUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/client";

const API_HOST = process.env.LUNCH_HAPPYTALK_API_HOST || process.env.HAPPYTALK_API_HOST;

// [CS-ETC-049] 런치 채팅 파일 발송
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  // 세션 만료 처리에서도 sessionId 가 필요하므로 outer catch 외부에 선언
  const { sessionId } = await params;

  try {
    const conv = await lunchConversationStore.getById(sessionId);
    if (!conv) {
      return NextResponse.json({ error: "대화를 찾을 수 없습니다" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
    }

    const fileName = file.name;
    const fileSize = file.size;
    let fileUrl: string;
    let sentViaHappytalk = false;

    // 1차 시도: 해피톡 file upload API
    try {
      const htFormData = new FormData();
      htFormData.append("sender_key", (process.env.LUNCH_SENDER_KEY || "").trim());
      htFormData.append("file", file);

      const uploadRes = await fetch(
        `${API_HOST}/kakaoWebhook/v3/bzc/file/upload`,
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
      console.log("[lunch-send-file] 해피톡 업로드 결과:", uploadResult);

      if (uploadResult.code === "0000" && uploadResult.file) {
        fileUrl = uploadResult.file;
        // 해피톡 FILE 메시지 전송
        await sendLunchFileMessage({
          user_key: conv.userKey,
          fileUrl,
          fileName: uploadResult.name ?? fileName,
          fileSize: uploadResult.size ?? fileSize,
        });
        sentViaHappytalk = true;
      } else {
        throw new Error(uploadResult.message || "해피톡 업로드 실패");
      }
    } catch (htErr) {
      const htErrMsg = htErr instanceof Error ? htErr.message : String(htErr);

      // 세션 만료 → Supabase 우회도 무의미 (텍스트 링크 발송도 실패함). 즉시 상담종료 처리.
      if (htErrMsg.includes("InvalidSessionException") || htErrMsg.includes("-502")) {
        console.log("[lunch-send-file] 세션 만료 → 상담종료 처리:", sessionId);
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

      console.warn("[lunch-send-file] 해피톡 파일 업로드 실패, Supabase 우회:", htErr);

      // 2차: Supabase Storage 업로드 → 텍스트 링크로 전송
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = fileName.split(".").pop() || "file";
      const storagePath = `chat/${sessionId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const admin = supabaseAdmin ?? (await import("@/lib/supabase/client")).supabase;
      const { error: uploadErr } = await admin.storage
        .from("images")
        .upload(storagePath, buffer, { contentType: file.type || "application/octet-stream", upsert: false });

      if (uploadErr) {
        console.error("[lunch-send-file] Supabase 업로드 실패:", uploadErr);
        return NextResponse.json({ error: "파일 업로드 실패" }, { status: 500 });
      }

      const { data: urlData } = admin.storage.from("images").getPublicUrl(storagePath);
      fileUrl = urlData.publicUrl;

      // 텍스트 메시지로 파일 링크 전송
      await sendLunchPlainMessage({
        user_key: conv.userKey,
        message: `📎 파일: ${fileName}\n${fileUrl}`,
      });
    }

    // DB에 파일 메시지 저장
    const currentUser = await getCurrentUser();
    const senderName = currentUser?.name ?? "상담사";
    await lunchConversationStore.addOutgoingMessage(
      sessionId,
      `[파일] ${fileName}`,
      senderName,
      "file",
      fileUrl
    );

    return NextResponse.json({ success: true, fileUrl, fileName, sentViaHappytalk });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);

    // Supabase 우회 후의 plain text 발송이 -502 로 깨진 경우도 동일하게 상담종료 처리
    if (errMsg.includes("InvalidSessionException") || errMsg.includes("-502")) {
      console.log("[lunch-send-file] 세션 만료 (outer) → 상담종료 처리:", sessionId);
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

    console.error("[lunch-send-file] error:", err);
    return NextResponse.json({ error: "파일 전송 처리 실패" }, { status: 500 });
  }
}
