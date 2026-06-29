/** 런치 내부대화 멘션 읽음 처리 + 미확인 멘션 조회.
 *   방문수거 internal-mentions.ts 와 동일 패턴 (lunch_* 테이블만 다름). */
import { supabase } from "@/lib/supabase/client";

export interface LunchUnreadMentionSession {
  sessionId: string;
  count: number;
  lastMessageAt: string;
  lastFromUser: string | null;
  snippet: string;
}

export const lunchInternalMentionsStore = {
  async markRead(userId: number, sessionId: string): Promise<void> {
    await supabase
      .from("lunch_internal_mention_reads")
      .upsert(
        { user_id: userId, session_id: sessionId, last_read_at: new Date().toISOString() },
        { onConflict: "user_id,session_id" },
      );
  },

  async getUnread(userId: number): Promise<LunchUnreadMentionSession[]> {
    const { data: reads } = await supabase
      .from("lunch_internal_mention_reads")
      .select("session_id, last_read_at")
      .eq("user_id", userId);
    const readMap = new Map<string, string>();
    for (const r of (reads ?? []) as Array<{ session_id: string; last_read_at: string }>) {
      readMap.set(r.session_id, r.last_read_at);
    }

    const since = new Date(Date.now() - 14 * 86400_000).toISOString();
    const { data: msgs } = await supabase
      .from("lunch_messages")
      .select("session_id, content, created_at, sent_by")
      .eq("is_internal", true)
      .overlaps("mentioned_user_ids", [userId])
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    if (!msgs) return [];

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
};
