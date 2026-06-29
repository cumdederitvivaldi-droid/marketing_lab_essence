import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { internalMentionsStore } from "@/lib/store/internal-mentions";

// [CS-CONV-093] 현재 사용자 미확인 내부 멘션 목록 (폴링)
export async function GET(_request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessions = await internalMentionsStore.getUnread(user.id);
  const total = sessions.reduce((sum, s) => sum + s.count, 0);
  return NextResponse.json({ sessions, total });
}
