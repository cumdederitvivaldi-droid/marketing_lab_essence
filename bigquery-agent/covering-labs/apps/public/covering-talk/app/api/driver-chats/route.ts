import { NextRequest, NextResponse } from "next/server";
import { driverChats } from "@/lib/store/driver-chats";

// [CS-DSH-049] 기사님 채팅 세션 관리 (목록 조회 / 등록 / 삭제)
export async function GET(): Promise<NextResponse> {
  try {
    const list = await driverChats.list();
    return NextResponse.json({ drivers: list });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const sessionId = String(body.sessionId ?? "").trim();
    const driverName = String(body.driverName ?? "").trim();
    if (!sessionId || !driverName) {
      return NextResponse.json({ error: "sessionId, driverName 필수" }, { status: 400 });
    }
    const created = await driverChats.add(sessionId, driverName);
    return NextResponse.json({ driver: created });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const sessionId = req.nextUrl.searchParams.get("session_id");
    if (!sessionId) {
      return NextResponse.json({ error: "session_id 쿼리 필수" }, { status: 400 });
    }
    await driverChats.remove(sessionId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
