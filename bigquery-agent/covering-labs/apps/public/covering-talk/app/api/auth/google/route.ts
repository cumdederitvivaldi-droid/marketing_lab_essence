import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/auth/google — Google OAuth 시작
 * Google 로그인 페이지로 리다이렉트
 */
// [CS-AUTH-005] Google OAuth 인증 시작
export async function GET(request: NextRequest): Promise<NextResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google OAuth not configured" }, { status: 500 });
  }

  // 동적으로 redirect URI 생성 (dev/prod 모두 호환)
  const origin = request.nextUrl.origin;
  const redirectUri = `${origin}/covering-talk/api/auth/google/callback`;

  // CSRF 방지용 state
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    state,
    prompt: "select_account",
    // @covering.app 도메인만 허용 (hd = hosted domain)
    hd: "covering.app",
  });

  const url = `https://accounts.google.com/o/oauth2/auth?${params.toString()}`;

  const response = NextResponse.redirect(url);
  // state를 쿠키에 저장 (콜백에서 검증)
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10분
  });

  return response;
}
