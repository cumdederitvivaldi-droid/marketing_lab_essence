"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth/AuthContext";

// 단일 폴링 — 방문수거 conversations.updated_at 변경 감지.
// 이전엔 useNewConversationNotifier(10s) + conversations/page.tsx(5s) 두 곳에서 동일 endpoint 를 따로 폴링했음.
// 통합 후 Provider 한 곳만 15초 폴링, 구독자(useNewConversationNotifier / conversations 페이지) 가 결과를 공유.
export interface ConversationUpdate {
  sessionIds: string[];
  timestamp: string;
}

const Ctx = createContext<ConversationUpdate | null>(null);
const POLL_INTERVAL_MS = 15_000;

export function ConversationUpdatesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [update, setUpdate] = useState<ConversationUpdate | null>(null);
  const lastFetchRef = useRef(new Date().toISOString());

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/conversations/updates?since=${encodeURIComponent(lastFetchRef.current)}`,
        );
        if (!res.ok) return;
        const data: { sessionIds?: string[]; timestamp?: string } = await res.json();
        lastFetchRef.current = data.timestamp ?? new Date().toISOString();
        if (data.sessionIds && data.sessionIds.length > 0) {
          setUpdate({ sessionIds: data.sessionIds, timestamp: lastFetchRef.current });
        }
      } catch { /* 네트워크 오류 무시 — 다음 cycle 에 재시도 */ }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user]);

  return <Ctx.Provider value={update}>{children}</Ctx.Provider>;
}

export function useConversationUpdates(): ConversationUpdate | null {
  return useContext(Ctx);
}
