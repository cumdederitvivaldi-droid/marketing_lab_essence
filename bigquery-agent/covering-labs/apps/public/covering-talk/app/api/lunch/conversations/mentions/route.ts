import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { lunchInternalMentionsStore } from "@/lib/store/lunch-internal-mentions";

// [CS-LUNCH-092] 현재 사용자의 미확인 런치 멘션 목록 (폴링)
export async function GET(_request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessions = await lunchInternalMentionsStore.getUnread(user.id);
  const total = sessions.reduce((sum, s) => sum + s.count, 0);
  return NextResponse.json({ sessions, total });
}
