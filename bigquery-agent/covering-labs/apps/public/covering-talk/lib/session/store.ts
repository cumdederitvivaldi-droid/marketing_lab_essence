import { supabase } from "@/lib/supabase/client";

interface SessionMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export async function getSessionHistory(
  _userKey: string,
  sessionId: string
): Promise<SessionMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("session_id", sessionId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("[SessionStore] getSessionHistory error:", error);
    return [];
  }

  return (data ?? []).map((row: { role: string; content: string; created_at: string }) => ({
    role: row.role as "user" | "assistant",
    content: row.content,
    timestamp: new Date(row.created_at).getTime(),
  }));
}

export async function saveSessionHistory(
  _userKey: string,
  _sessionId: string,
  _userMessage: string,
  _assistantMessage: string
): Promise<void> {
  // messages 테이블에 이미 저장되므로 별도 저장 불필요
}

export async function clearSession(
  _userKey: string,
  _sessionId: string
): Promise<void> {
  // DB에서는 삭제하지 않음 (히스토리 보존)
}
