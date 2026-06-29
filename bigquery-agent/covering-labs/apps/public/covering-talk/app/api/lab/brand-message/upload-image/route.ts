// [CS-LAB-010] 브랜드메시지 이미지 업로드 — 비즈엠 콘솔 거치지 않고 즉석 업로드 (실험실 — 김원빈/강성진 전용)
//
// multipart/form-data 로 이미지 받아서 스윗트래커 이미지 관리 API 로 forward.
// kind=wide 면 FW 용 (800x600 권장, 비율 2:1~1:1), default 면 FI/FM/FP 용 (800x400 권장, 비율 2:1~3:4).
// 둘 다 jpg/png · 최대 5MB · 가로 500px 이상.
import { NextRequest, NextResponse } from "next/server";
import { requireLabAccess, LabForbiddenError } from "@/lib/auth/lab-permission";
import { uploadImage } from "@/lib/sweettracker/client";

export const maxDuration = 30;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await requireLabAccess();
  } catch (e) {
    if (e instanceof LabForbiddenError) {
      return NextResponse.json({ error: (e as Error).message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart/form-data 가 필요합니다." }, { status: 400 });
  }

  const file = form.get("image");
  const kindRaw = form.get("kind");
  const nickname = form.get("nickname");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "image 파일이 누락되었습니다." }, { status: 400 });
  }
  const kind = kindRaw === "wide" ? "wide" : "default";

  // 5MB 제한
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "이미지 크기는 5MB 이하여야 합니다." }, { status: 400 });
  }
  if (!["image/jpeg", "image/jpg", "image/png"].includes(file.type)) {
    return NextResponse.json({ error: "jpg / png 만 지원합니다." }, { status: 400 });
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const result = await uploadImage(buf, kind, file.name, typeof nickname === "string" ? nickname : undefined);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
