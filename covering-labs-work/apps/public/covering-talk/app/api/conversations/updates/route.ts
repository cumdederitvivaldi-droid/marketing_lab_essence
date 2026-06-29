import { NextRequest, NextResponse } from "next/server";
import { conversationStore } from "@/lib/store/conversations";

// [CS-ETC-003] 상담 업데이트 조회
export async function GET(req: NextRequest): Promise<NextResponse> {
  const since = req.nextUrl.searchParams.get("since") ?? new Date(Date.now() - 60_000).toISOString();

  const { sessionIds, timestamp } = await conversationStore.getUpdatedSince(since);

  return NextResponse.json({
    sessionIds,
    timestamp,
  });
}
