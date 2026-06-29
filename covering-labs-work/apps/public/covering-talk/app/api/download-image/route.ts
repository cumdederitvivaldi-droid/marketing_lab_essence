import { NextRequest, NextResponse } from "next/server";

// [CS-ETC-021] 이미지 다운로드
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  try {
    // KakaoTalk CDN은 브라우저 헤더 없이 접근 시 차단 → 브라우저와 동일한 헤더 추가
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://talk.kakao.com/",
      },
    });

    if (!res.ok) {
      // 헤더 없이 재시도 (Supabase Storage 등)
      const retry = await fetch(url);
      if (!retry.ok) {
        return NextResponse.json(
          { error: "fetch failed", status: res.status },
          { status: 502 },
        );
      }
      return proxyResponse(retry);
    }

    return proxyResponse(res);
  } catch {
    return NextResponse.json({ error: "download failed" }, { status: 500 });
  }
}

function proxyResponse(res: Response): NextResponse {
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
      ? "webp"
      : "jpg";
  const filename = `image_${Date.now()}.${ext}`;

  return new NextResponse(res.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
