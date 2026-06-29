import { NextRequest, NextResponse } from "next/server";
import { IncomingSessionEnd } from "@/lib/happytalk/types";
import { clearSession } from "@/lib/session/store";

// [CS-EXT-005] 채팅 세션 종료 처리
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: IncomingSessionEnd;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid JSON" }, { status: 400 });
  }

  // 런치 채널이면 런치 핸들러로 리다이렉트
  const lunchSenderKey = process.env.LUNCH_SENDER_KEY;
  if (lunchSenderKey && body.sender_key === lunchSenderKey) {
    const baseUrl = request.nextUrl.origin;
    const res = await fetch(`${baseUrl}/api/webhook/lunch/session-end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  }

  console.log("[Webhook/session-end] 수신:", JSON.stringify(body));

  // 세션 종료 시 대화 히스토리 정리
  try {
    await clearSession(body.user_key, body.session_id);
    console.log(
      `[Webhook/session-end] 세션 정리 완료: user=${body.user_key}, session=${body.session_id}`
    );
  } catch (err) {
    console.error("[Webhook/session-end] 세션 정리 실패:", err);
  }

  return NextResponse.json({ status: "ok" });
}
