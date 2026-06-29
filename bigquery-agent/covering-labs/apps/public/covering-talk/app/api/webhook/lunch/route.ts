import { NextRequest, NextResponse } from "next/server";

/**
 * /api/webhook/lunch — 런치 전용 웹훅 엔드포인트
 * 해피톡 런치 채널 callback URL을 여기로 설정하면 됨
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid JSON" }, { status: 400 });
  }

  const type = body.type as string | undefined;
  const senderKey = body.sender_key as string | undefined;
  const baseUrl = request.nextUrl.origin;

  // 안전장치: 방문수거 sender_key면 방문수거 핸들러로 리다이렉트
  const pickupSenderKey = process.env.SENDER_KEY;
  if (pickupSenderKey && senderKey === pickupSenderKey) {
    console.log("[Webhook/lunch] 방문수거 메시지 감지 → 리다이렉트:", body.session_id);
    const res = await fetch(`${baseUrl}/api/webhook/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  }

  console.log("[Webhook/lunch] 수신:", body.session_id, body.type);

  // 메시지 이벤트
  if (!type || type === "text" || type === "photo" || type === "image" || type === "file") {
    const res = await fetch(`${baseUrl}/api/webhook/lunch/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  }

  // 세션 종료
  if (type === "session-end") {
    const res = await fetch(`${baseUrl}/api/webhook/lunch/session-end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  }

  return NextResponse.json({ status: "ok" });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: "ok", message: "Lunch webhook endpoint active" });
}
