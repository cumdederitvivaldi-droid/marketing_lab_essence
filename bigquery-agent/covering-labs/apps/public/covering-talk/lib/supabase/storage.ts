import { supabaseAdmin } from "./client";

const BUCKET = "images";

/**
 * KakaoTalk CDN 이미지를 다운로드하여 Supabase Storage에 영구 저장
 * @returns 영구 public URL (실패 시 원본 URL 반환)
 */
export async function persistImage(
  sessionId: string,
  originalUrl: string,
): Promise<string> {
  try {
    // 이미 Supabase Storage URL이면 그대로 반환
    if (originalUrl.includes("supabase.co/storage")) return originalUrl;

    const res = await fetch(originalUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      console.error(`[Storage] fetch failed: ${res.status} ${originalUrl.slice(0, 80)}`);
      return originalUrl;
    }

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const ext = contentType.includes("png") ? "png"
      : contentType.includes("webp") ? "webp"
      : contentType.includes("gif") ? "gif"
      : "jpg";

    const buffer = Buffer.from(await res.arrayBuffer());
    const filename = `chat/${sessionId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(filename, buffer, {
        contentType,
        upsert: false,
      });

    if (error) {
      console.error("[Storage] upload error:", error.message);
      return originalUrl;
    }

    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(filename);
    console.log(`[Storage] persisted: ${sessionId} → ${data.publicUrl.slice(-40)}`);
    return data.publicUrl;
  } catch (err) {
    console.error("[Storage] persistImage error:", err);
    return originalUrl;
  }
}
