import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { internalMentionsStore } from "@/lib/store/internal-mentions";

// [CS-CONV-092] 해당 세션의 내부 멘션 읽음 처리
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await internalMentionsStore.markRead(user.id, sessionId);
  return NextResponse.json({ ok: true });
}
