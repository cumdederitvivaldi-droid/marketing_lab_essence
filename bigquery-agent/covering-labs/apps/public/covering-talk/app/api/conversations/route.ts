import { NextRequest, NextResponse } from "next/server";
import { conversationStore } from "@/lib/store/conversations";

// [CS-ETC-001] 상담 목록 조회 (cursor 기반 페이지네이션 + 검색)
export async function GET(req: NextRequest): Promise<NextResponse> {
  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50), 200);
  const search = req.nextUrl.searchParams.get("search") ?? undefined;
  const statusParam = req.nextUrl.searchParams.get("statuses");
  const statuses = statusParam ? statusParam.split(",").filter(Boolean) : undefined;
  const { conversations, nextCursor } = await conversationStore.getAllForList({ cursor, limit, search, statuses });
  return NextResponse.json({ conversations, nextCursor });
}
