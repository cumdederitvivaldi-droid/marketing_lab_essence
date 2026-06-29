/** 내부대화 멘션 읽음 처리 + 미확인 멘션 조회. */
import { supabase } from "@/lib/supabase/client";

export interface UnreadMentionSession {
  sessionId: string;
  count: number;
  lastMessageAt: string;
  lastFromUser: string | null;
  snippet: string;
}

export const internalMentionsStore = {
  /** 사용자가 해당 세션의 멘션을 모두 본 것으로 처리. upsert (user_id, session_id). */
  async markRead(userId: number, sessionId: string): Promise<void> {
    await supabase
      .from("internal_mention_reads")
      .upsert(
        { user_id: userId, session_id: sessionId, last_read_at: new Date().toISOString() },
        { onConflict: "user_id,session_id" },
      );
  },

  /** 현재 사용자에게 향한 미확인 internal 메시지 세션 목록.
   *   last_read_at 이후 도착한 mentioned_user_ids 포함 메시지를 session 별로 집계.
   */
  async getUnread(userId: number): Promise<UnreadMentionSession[]> {
    // 1) 사용자의 모든 read marker 가져오기
    const { data: reads } = await supabase
      .from("internal_mention_reads")
      .select("session_id, last_read_at")
      .eq("user_id", userId);
    const readMap = new Map<string, string>();
    for (const r of (reads ?? []) as Array<{ session_id: string; last_read_at: string }>) {
      readMap.set(r.session_id, r.last_read_at);
    }

    // 2) 본인이 멘션된 internal 메시지 — 최근 14일 (PostgreSQL `&&` 연산자 = overlaps)
    const since = new Date(Date.now() - 14 * 86400_000).toISOString();
    const { data: msgs } = await supabase
      .from("messages")
      .select("session_id, content, created_at, sent_by")
      .eq("is_internal", true)
      .overlaps("mentioned_user_ids", [userId])
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    if (!msgs) return [];

    // 3) session 별로 묶고 last_read_at 이후 메시지만 카운트
    const bySession = new Map<string, {
      count: number; lastMessageAt: string; lastFromUser: string | null; snippet: string;
    }>();
    for (const m of msgs as Array<{ session_id: string; content: string; created_at: string; sent_by: string | null }>) {
      const lastRead = readMap.get(m.session_id);
      if (lastRead && new Date(m.created_at) <= new Date(lastRead)) continue;
      const cur = bySession.get(m.session_id);
      if (!cur) {
        bySession.set(m.session_id, {
          count: 1,
          lastMessageAt: m.created_at,
          lastFromUser: m.sent_by,
          snippet: m.content.slice(0, 80),
        });
      } else {
        cur.count += 1;
      }
    }
    return Array.from(bySession.entries()).map(([sessionId, v]) => ({ sessionId, ...v }));
  },

  /** 미확인 멘션 총 개수 (사용자 단위). */
  async getUnreadCount(userId: number): Promise<number> {
    const list = await this.getUnread(userId);
    return list.reduce((sum, s) => sum + s.count, 0);
  },
};
