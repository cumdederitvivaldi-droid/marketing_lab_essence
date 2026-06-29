import { supabase } from "@/lib/supabase/client";

export interface DriverChat {
  id: number;
  sessionId: string;
  driverName: string;
  active: boolean;
  createdAt: string;
}

// 활성 세션 id 캐시 — 메인 conversations 목록 조회마다 driver 테이블 풀 fetch 방지.
//   30초 TTL. add/delete 시 invalidate.
let cachedActiveSessionIds: { ids: Set<string>; expires: number } | null = null;
const CACHE_TTL_MS = 30_000;

export const driverChats = {
  async getActiveSessionIds(): Promise<Set<string>> {
    const now = Date.now();
    if (cachedActiveSessionIds && cachedActiveSessionIds.expires > now) {
      return cachedActiveSessionIds.ids;
    }
    const { data } = await supabase.from("driver_chats").select("session_id").eq("active", true);
    const ids = new Set<string>((data ?? []).map((r: { session_id: string }) => r.session_id));
    cachedActiveSessionIds = { ids, expires: now + CACHE_TTL_MS };
    return ids;
  },

  invalidateCache() {
    cachedActiveSessionIds = null;
  },

  async list(): Promise<DriverChat[]> {
    const { data, error } = await supabase
      .from("driver_chats")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      driverName: r.driver_name,
      active: r.active,
      createdAt: r.created_at,
    }));
  },

  async add(sessionId: string, driverName: string): Promise<DriverChat> {
    const { data, error } = await supabase
      .from("driver_chats")
      .upsert(
        { session_id: sessionId, driver_name: driverName, active: true },
        { onConflict: "session_id" },
      )
      .select()
      .single();
    if (error) throw error;
    this.invalidateCache();
    return {
      id: data.id,
      sessionId: data.session_id,
      driverName: data.driver_name,
      active: data.active,
      createdAt: data.created_at,
    };
  },

  async remove(sessionId: string): Promise<void> {
    const { error } = await supabase.from("driver_chats").delete().eq("session_id", sessionId);
    if (error) throw error;
    this.invalidateCache();
  },
};
