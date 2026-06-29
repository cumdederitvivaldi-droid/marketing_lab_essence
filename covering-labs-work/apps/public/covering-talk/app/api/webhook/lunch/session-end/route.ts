import { NextRequest, NextResponse } from "next/server";
import { IncomingSessionEnd } from "@/lib/happytalk/types";
import { lunchConversationStore } from "@/lib/store/lunch-conversations";

// [CS-EXT-019] 런치 웹훅 — 세션 종료
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: IncomingSessionEnd;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid JSON" }, { status: 400 });
  }

  console.log("[Webhook/lunch/session-end] 수신:", body.session_id);

  try {
    await lunchConversationStore.update(body.session_id, { status: "closed" });
    console.log(`[Webhook/lunch/session-end] 종료 처리: session=${body.session_id}`);
  } catch (err) {
    console.error("[Webhook/lunch/session-end] 처리 실패:", err);
  }

  return NextResponse.json({ status: "ok" });
}
