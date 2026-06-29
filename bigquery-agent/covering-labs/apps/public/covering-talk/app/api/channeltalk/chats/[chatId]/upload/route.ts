import { NextRequest, NextResponse } from "next/server";
import { sendFileMessage } from "@/lib/channeltalk/client";
import { getCurrentUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/client";

const BUCKET = "images";

// [CS-CT-005] 채널톡 이미지/파일 업로드 전송
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
): Promise<NextResponse> {
  const { chatId } = await params;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const isInternal = formData.get("isInternal") === "true";
    if (!file) {
      return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
    }

    // 채널톡 닉네임 우선 → 없으면 로그인 이름 → 없으면 "커버링"
    const user = await getCurrentUser();
    let botName = user?.name ?? "커버링";

    if (user) {
      const { supabase } = await import("@/lib/supabase/client");
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", `counselor:${user.name}`)
        .single();
      const nickname = (data?.value as Record<string, unknown>)?.channeltalk_nickname as string | undefined;
      if (nickname?.trim()) botName = nickname.trim();
    }

    // 1) Supabase Storage에 파일 업로드
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop() ?? "bin";
    const filename = `channeltalk/${chatId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("[CT] Supabase storage upload error:", uploadError);
      return NextResponse.json({ error: "파일 업로드 실패" }, { status: 500 });
    }

    const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(filename);
    const fileUrl = urlData.publicUrl;

    // 2) 채널톡 메시지로 전송 (이미지 → files 배열 인라인, 파일 → 텍스트 링크)
    const isImage = file.type.startsWith("image/");
    const result = await sendFileMessage(chatId, fileUrl, file.name, {
      botName,
      actAsManager: true,
      isImage,
      isInternal,
      contentType: file.type,
      fileSize: buffer.length,
    });

    return NextResponse.json({ ok: true, messageId: result.id, fileUrl });
  } catch (err) {
    console.error("[CT] upload error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
