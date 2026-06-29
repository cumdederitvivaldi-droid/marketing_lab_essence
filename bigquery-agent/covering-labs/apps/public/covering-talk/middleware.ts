import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth/jwt";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /api/cron/*: covering-labs public 외부 노출 보호 — CRON_SECRET 헤더 검증
  if (pathname.startsWith("/api/cron/")) {
    const expected = process.env.CRON_SECRET;
    const provided = request.headers.get("x-cron-secret");
    if (!expected || !provided || expected !== provided) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // /api/webhook/*: 해피톡 webhook 인증 — HT-Client-Id/HT-Client-Secret 헤더 검증
  // (방문수거·런치 자격증명 값 동일, 한 쌍 비교로 양쪽 webhook 통과)
  if (pathname === "/api/webhook" || pathname.startsWith("/api/webhook/")) {
    const expectedId = process.env.HT_CLIENT_ID;
    const expectedSecret = process.env.HT_CLIENT_SECRET;
    const providedId = request.headers.get("HT-Client-Id");
    const providedSecret = request.headers.get("HT-Client-Secret");
    if (
      !expectedId || !expectedSecret ||
      providedId !== expectedId || providedSecret !== expectedSecret
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Public: 로그인, 인증 API, 정적파일
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".svg")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("session")?.value;
  if (!token) {
    // API 요청은 401, 페이지 요청은 로그인 리다이렉트
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  const user = await verifySessionToken(token);
  if (!user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    const response = pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : NextResponse.redirect(redirectUrl);
    response.cookies.delete("session");
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
