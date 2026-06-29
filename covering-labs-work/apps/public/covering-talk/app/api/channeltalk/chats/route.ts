import { NextRequest, NextResponse } from "next/server";
import { listAllUserChats } from "@/lib/channeltalk/client";

// [CS-CT-001] 채널톡 유저챗 목록 조회
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const state = (searchParams.get("state") ?? "opened") as "opened" | "closed" | "snoozed";

  try {
    // 종료 건은 최근 200건(4페이지)만 조회 — 전체 조회 시 타임아웃 발생
    const maxPages = state === "closed" ? 4 : undefined;
    const data = await listAllUserChats({ state, sortOrder: "desc", maxPages });

    // userChats + messages + users 조합하여 리스트용 데이터 구성
    const userMap = new Map<string, { name?: string; mobileNumber?: string; avatarUrl?: string }>();
    for (const u of data.users ?? []) {
      // avatarUrl: 최상위 필드 우선, 없으면 profile.avatarUrl
      const avatarUrl = u.avatarUrl || (u.profile as Record<string, unknown>)?.avatarUrl as string | undefined;
      userMap.set(u.id, { name: u.name, mobileNumber: u.mobileNumber, avatarUrl });
    }

    // messages에서 chatId별 최신 메시지 매핑 + 읽지않은 수 계산
    const lastMsgMap = new Map<string, { plainText: string; createdAt: number; personType: string }>();
    // chatId별 메시지를 시간순 정렬하여 읽지않은 수 계산
    const chatMsgsMap = new Map<string, Array<{ personType: string; createdAt: number }>>();
    for (const msg of data.messages ?? []) {
      const existing = lastMsgMap.get(msg.chatId);
      if (!existing || msg.createdAt > existing.createdAt) {
        lastMsgMap.set(msg.chatId, {
          plainText: msg.plainText ?? "",
          createdAt: msg.createdAt,
          personType: msg.personType,
        });
      }
      // log 메시지(시스템 로그)는 제외
      if (!msg.log) {
        if (!chatMsgsMap.has(msg.chatId)) chatMsgsMap.set(msg.chatId, []);
        chatMsgsMap.get(msg.chatId)!.push({ personType: msg.personType, createdAt: msg.createdAt });
      }
    }
    // 읽지않은 수: 마지막 매니저/봇 메시지 이후 연속된 user 메시지 수
    const unreadCountMap = new Map<string, number>();
    for (const [chatId, msgs] of chatMsgsMap) {
      const sorted = msgs.sort((a, b) => b.createdAt - a.createdAt); // 최신순
      let count = 0;
      for (const m of sorted) {
        if (m.personType === "user") count++;
        else break;
      }
      unreadCountMap.set(chatId, count);
    }

    // managers 매핑 (이름 + 아바타)
    const managerMap = new Map<string, { name: string; avatarUrl?: string }>();
    for (const m of data.managers ?? []) {
      managerMap.set(m.id, { name: m.name, avatarUrl: m.avatarUrl });
    }

    const chats = (data.userChats ?? []).map((chat) => {
      const user = userMap.get(chat.userId);
      const lastMsg = lastMsgMap.get(chat.id);

      return {
        id: chat.id,
        userId: chat.userId,
        userName: user?.name ?? chat.name ?? "알 수 없음",
        userPhone: user?.mobileNumber ?? "",
        userAvatarUrl: user?.avatarUrl ?? null,
        state: chat.state,
        tags: chat.tags ?? [],
        assignee: chat.assigneeId ? (managerMap.get(chat.assigneeId)?.name ?? chat.assigneeId) : null,
        assigneeAvatarUrl: chat.assigneeId ? (managerMap.get(chat.assigneeId)?.avatarUrl ?? null) : null,
        description: chat.description ?? "",
        lastMessage: lastMsg?.plainText ?? "",
        lastMessagePersonType: lastMsg?.personType ?? "",
        lastMessageAt: lastMsg?.createdAt ?? chat.createdAt,
        unreadCount: unreadCountMap.get(chat.id) ?? 0,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt ?? chat.createdAt,
      };
    });

    // 매니저 아바타 목록 (사이드바용)
    const managers = [...managerMap.entries()].map(([id, m]) => ({
      id, name: m.name, avatarUrl: m.avatarUrl ?? null,
    }));

    return NextResponse.json({ chats, managers });
  } catch (err) {
    console.error("[CT] chats list error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
