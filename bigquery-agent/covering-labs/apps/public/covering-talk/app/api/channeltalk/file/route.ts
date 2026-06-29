import { NextRequest, NextResponse } from "next/server";

const ACCESS_KEY = process.env.CHANNELTALK_ACCESS_KEY!;
const ACCESS_SECRET = process.env.CHANNELTALK_ACCESS_SECRET!;
const CT_CDN = "https://cf.channel.io";

// [CS-CT-021] 채널톡 파일 프록시 (CDN 서명 필요 파일)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const key = request.nextUrl.searchParams.get("key");
  const chatId = request.nextUrl.searchParams.get("chatId");

  if (!key) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }

  const attempts: string[] = [];

  try {
    // 1차: Channel Talk signed URL API (chatId가 있을 때)
    if (chatId) {
      try {
        const apiUrl = `https://api.channel.io/open/v4/user-chats/${chatId}/messages/file?key=${encodeURIComponent(key)}`;
        const signedRes = await fetch(apiUrl, {
          headers: {
            "x-access-key": ACCESS_KEY,
            "x-access-secret": ACCESS_SECRET,
          },
        });

        if (signedRes.ok) {
          const contentType = signedRes.headers.get("content-type") ?? "application/octet-stream";

          // JSON 응답 → signed URL
          if (contentType.includes("application/json")) {
            const data = await signedRes.json();
            // StringView: { string: "https://..." }
            const signedUrl = data.result || data.string || data.url || data.signedUrl;
            if (signedUrl) {
              // signed URL로 실제 파일을 가져와서 프록시
              const fileRes = await fetch(signedUrl);
              if (fileRes.ok) {
                const fileContentType = fileRes.headers.get("content-type") ?? "application/octet-stream";
                const buffer = await fileRes.arrayBuffer();
                return new NextResponse(buffer, {
                  headers: {
                    "Content-Type": fileContentType,
                    "Cache-Control": "public, max-age=3600",
                  },
                });
              }
              attempts.push(`signed-url-fetch: ${fileRes.status}`);
            } else {
              attempts.push(`signed-api-json-no-url: ${JSON.stringify(data).substring(0, 200)}`);
            }
          } else {
            // 바이너리 파일 응답
            const buffer = await signedRes.arrayBuffer();
            return new NextResponse(buffer, {
              headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=3600",
              },
            });
          }
        } else {
          const errText = await signedRes.text().catch(() => "");
          attempts.push(`signed-api: ${signedRes.status} ${errText.substring(0, 200)}`);
        }
      } catch (e) {
        attempts.push(`signed-api-error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // 2차: CDN 직접 접근 (key를 인코딩하지 않고 그대로 사용)
    try {
      const cdnUrl = `${CT_CDN}/${key}`;
      const cdnRes = await fetch(cdnUrl);
      if (cdnRes.ok) {
        const contentType = cdnRes.headers.get("content-type") ?? "application/octet-stream";
        // XML 에러 응답 체크 (CloudFront가 XML 에러를 200으로 반환하는 경우)
        if (contentType.includes("xml") || contentType.includes("text/html")) {
          const text = await cdnRes.text();
          if (text.includes("MissingKey") || text.includes("AccessDenied")) {
            attempts.push(`cdn-public: 200 but error XML`);
          } else {
            attempts.push(`cdn-public: unexpected content type ${contentType}`);
          }
        } else {
          const buffer = await cdnRes.arrayBuffer();
          return new NextResponse(buffer, {
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=86400, immutable",
            },
          });
        }
      } else {
        attempts.push(`cdn-public: ${cdnRes.status}`);
      }
    } catch (e) {
      attempts.push(`cdn-error: ${e instanceof Error ? e.message : String(e)}`);
    }

    console.error(`[CT File Proxy] All failed | key=${key} | chatId=${chatId} | attempts=${JSON.stringify(attempts)}`);
    return NextResponse.json({ error: "File not accessible", attempts }, { status: 404 });
  } catch (err) {
    console.error("[CT File Proxy] unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to fetch file", detail: err instanceof Error ? err.message : String(err), attempts },
      { status: 500 }
    );
  }
}
