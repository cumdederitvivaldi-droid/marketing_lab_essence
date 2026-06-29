import { NextRequest, NextResponse } from "next/server";
import { createSessionToken } from "@/lib/auth/jwt";

interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  name: string;
  picture: string;
  hd?: string; // hosted domain
}

/**
 * GET /api/auth/google/callback — Google OAuth 콜백
 * 인가 코드 → 토큰 교환 → 사용자 정보 → 세션 생성
 */
// [CS-AUTH-006] Google OAuth 콜백 처리
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const origin = request.nextUrl.origin;

  // 에러 처리
  if (error) {
    return NextResponse.redirect(new URL(`/covering-talk/login?error=${encodeURIComponent("Google 로그인이 취소되었습니다")}`, origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL(`/covering-talk/login?error=${encodeURIComponent("인가 코드가 없습니다")}`, origin));
  }

  // CSRF state 검증
  const savedState = request.cookies.get("oauth_state")?.value;
  if (!savedState || savedState !== state) {
    return NextResponse.redirect(new URL(`/covering-talk/login?error=${encodeURIComponent("잘못된 요청입니다")}`, origin));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = `${origin}/covering-talk/api/auth/google/callback`;

  try {
    // 1. 인가 코드 → 액세스 토큰 교환
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("[Google OAuth] 토큰 교환 실패:", errBody);
      return NextResponse.redirect(new URL(`/covering-talk/login?error=${encodeURIComponent("토큰 교환 실패")}`, origin));
    }

    const tokenData: GoogleTokenResponse = await tokenRes.json();

    // 2. 액세스 토큰으로 사용자 정보 조회
    const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      console.error("[Google OAuth] 사용자 정보 조회 실패");
      return NextResponse.redirect(new URL(`/covering-talk/login?error=${encodeURIComponent("사용자 정보 조회 실패")}`, origin));
    }

    const userInfo: GoogleUserInfo = await userRes.json();

    // 3. @covering.app 도메인 검증
    if (!userInfo.email.endsWith("@covering.app")) {
      console.warn(`[Google OAuth] 도메인 거부: ${userInfo.email}`);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent("@covering.app 계정만 로그인할 수 있습니다")}`, origin)
      );
    }

    // 4. 세션 생성
    // 이름에서 이메일의 로컬 부분 또는 Google 프로필 이름 사용
    const displayName = userInfo.name || userInfo.email.split("@")[0];
    // 고유 ID: 이메일 해시
    const userId = hashEmail(userInfo.email);

    const session = {
      id: userId,
      name: displayName,
      role: "admin", // @covering.app 직원은 관리자 권한
    };

    const token = await createSessionToken(session);

    // 5. 세션 쿠키 설정 + 리다이렉트
    const response = NextResponse.redirect(new URL("/covering-talk/", origin));
    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 86400, // 24시간
    });
    // oauth_state 쿠키 삭제
    response.cookies.delete("oauth_state");

    console.log(`[Google OAuth] 로그인 성공: ${userInfo.email} (${displayName})`);
    return response;
  } catch (err) {
    console.error("[Google OAuth] 처리 오류:", err);
    return NextResponse.redirect(new URL(`/covering-talk/login?error=${encodeURIComponent("서버 오류가 발생했습니다")}`, origin));
  }
}

/** 이메일을 안정적인 숫자 ID로 변환 */
function hashEmail(email: string): number {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    const char = email.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash) + 100000; // 기존 상담사 ID와 충돌 방지
}
