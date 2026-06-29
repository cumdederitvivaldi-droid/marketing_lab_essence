import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { lunchInternalMentionsStore } from "@/lib/store/lunch-internal-mentions";

// [CS-ETC-069] 런치 내부 멘션 읽음 처리
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await lunchInternalMentionsStore.markRead(user.id, sessionId);
  return NextResponse.json({ ok: true });
}
