import { NextRequest, NextResponse } from "next/server";
import { listUserChatsByUserId, listManagers } from "@/lib/channeltalk/client";

// 매니저 캐시
let managerMap: Map<string, string> | null = null;
let managerCacheAt = 0;

// [CS-CT-024] 채널톡 고객별 상담 목록 조회
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
): Promise<NextResponse> {
  const { userId } = await params;

  try {
    // 매니저 이름 매핑 캐시
    if (!managerMap || Date.now() - managerCacheAt > 30 * 60 * 1000) {
      const managers = await listManagers();
      managerMap = new Map(managers.map((m) => [m.id, m.name]));
      managerCacheAt = Date.now();
    }

    const data = await listUserChatsByUserId(userId, { limit: 20 });

    const chats = (data.userChats ?? []).map((chat) => ({
      id: chat.id,
      state: chat.state,
      assignee: chat.assigneeId ? managerMap?.get(chat.assigneeId) ?? null : null,
      tags: chat.tags ?? [],
      lastMessage: "",
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    }));

    // 마지막 메시지 텍스트 매핑
    const msgMap = new Map<string, string>();
    for (const msg of data.messages ?? []) {
      const existing = msgMap.get(msg.chatId);
      if (!existing) {
        msgMap.set(msg.chatId, (msg.plainText ?? "").substring(0, 100));
      }
    }
    for (const c of chats) {
      c.lastMessage = msgMap.get(c.id) ?? "";
    }

    return NextResponse.json({ chats });
  } catch (err) {
    console.error("[CT] user chats error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "조회 실패" },
      { status: 500 }
    );
  }
}
