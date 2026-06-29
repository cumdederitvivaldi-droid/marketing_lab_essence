import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";
import { lunchVendorStore } from "@/lib/store/lunch-vendors";

const BUCKET = "images";

// [CS-ETC-043] 사업자등록증 업로드
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
    }

    // 파일 타입 검증 (이미지 + PDF)
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: "이미지 또는 PDF만 업로드 가능합니다" }, { status: 400 });
    }

    // 파일 크기 제한 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "파일 크기는 10MB 이하만 가능합니다" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || (file.type === "application/pdf" ? "pdf" : "jpg");
    const filename = `lunch/cert/${id}_${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(filename, buffer, { contentType: file.type, upsert: true });

    if (uploadErr) {
      console.error("[cert-upload] storage error:", uploadErr);
      return NextResponse.json({ error: "업로드 실패" }, { status: 500 });
    }

    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(filename);
    const url = data.publicUrl;

    // 벤더에 URL 저장
    await lunchVendorStore.update(id, { businessCertUrl: url });

    return NextResponse.json({ success: true, url });
  } catch (err) {
    console.error("[cert-upload] error:", err);
    return NextResponse.json({ error: "업로드 처리 실패" }, { status: 500 });
  }
}
