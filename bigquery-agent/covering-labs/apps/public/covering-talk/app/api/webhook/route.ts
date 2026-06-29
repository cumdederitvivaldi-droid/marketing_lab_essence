import { NextRequest, NextResponse } from "next/server";

// [CS-EXT-001] 웹훅 메시지 라우팅 — /api/webhook 베이스에서 sender_key 로 방문수거/런치 분기 후 sub-route 위임
async function forward(target: string, body: unknown, request: NextRequest): Promise<NextResponse> {
  const baseUrl = request.nextUrl.origin;
  // 모든 sub-route 도 미들웨어의 HT-Client-* 검증을 통과해야 하므로 헤더 일관 forward
  const res = await fetch(`${baseUrl}${target}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "HT-Client-Id": request.headers.get("HT-Client-Id") ?? "",
      "HT-Client-Secret": request.headers.get("HT-Client-Secret") ?? "",
    },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid JSON" }, { status: 400 });
  }

  const type = body.type as string | undefined;
  const senderKey = body.sender_key as string | undefined;
  const lunchSenderKey = process.env.LUNCH_SENDER_KEY;
  const match = Boolean(lunchSenderKey && senderKey === lunchSenderKey);
  console.log(`[Webhook/base] sender_key_match_lunch=${match} | type=${type}`);

  if (match) {
    if (!type || type === "text" || type === "photo" || type === "image" || type === "file") {
      return forward("/api/webhook/lunch/message", body, request);
    }
    if (type === "session-end") {
      return forward("/api/webhook/lunch/session-end", body, request);
    }
    // 런치 채널의 그 외 이벤트는 무시
    return NextResponse.json({ status: "ok" });
  }

  // ── 방문수거 채널 ──────────────────────
  if (!type || type === "text" || type === "image" || type === "file") {
    return forward("/api/webhook/message", body, request);
  }
  if (type === "session-end") {
    return forward("/api/webhook/session-end", body, request);
  }
  return forward("/api/webhook/metadata", body, request);
}

// [CS-EXT-002] 웹훅 상태 확인
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: "ok", message: "Webhook endpoint active" });
}
