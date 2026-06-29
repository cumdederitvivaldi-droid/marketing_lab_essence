"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";

const POLL_INTERVAL = 15000;

export interface MentionSession {
  sessionId: string;
  count: number;
  lastMessageAt: string;
  lastFromUser: string | null;
  snippet: string;
}

interface UseMentionNotifierResult {
  /** session_id → unread mention count. ConversationCard 배지 노출용. */
  unreadBySession: Record<string, number>;
  /** 사용자가 세션 클릭 후 호출 — mark-read 트리거 + 로컬 상태 즉시 0. */
  markRead: (sessionId: string) => Promise<void>;
  /** 강제 refresh (멘션 메시지 전송 직후 등). */
  refresh: () => Promise<void>;
}

export interface MentionNotifierConfig {
  /** 미확인 멘션 조회 GET URL. 기본: /api/conversations/mentions (visit 도메인) */
  endpoint?: string;
  /** 읽음 처리 POST URL 빌더. 기본: /api/conversations/{sid}/internal-read */
  readEndpoint?: (sessionId: string) => string;
  /** 클릭 시 라우팅 콜백 */
  onSessionClick?: (sessionId: string) => void;
  /** toast 라벨 prefix (예: "런치" 멘션) */
  toastLabel?: string;
}

export function useMentionNotifier(config?: MentionNotifierConfig | ((sid: string) => void)): UseMentionNotifierResult {
  // 하위호환: 함수만 넘기면 visit 도메인 기본값으로 onSessionClick 만 적용
  const normalized: MentionNotifierConfig = typeof config === "function"
    ? { onSessionClick: config }
    : (config ?? {});
  const endpoint = normalized.endpoint ?? "/api/conversations/mentions";
  const readEndpoint = normalized.readEndpoint ?? ((sid: string) => `/api/conversations/${sid}/internal-read`);
  const onSessionClick = normalized.onSessionClick;
  const toastLabel = normalized.toastLabel;

  const [unreadBySession, setUnreadBySession] = useState<Record<string, number>>({});
  const seenSnippetsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(endpoint);
      if (!res.ok) return;
      const data: { sessions: MentionSession[] } = await res.json();
      const map: Record<string, number> = {};
      const newSnippets: MentionSession[] = [];
      for (const s of data.sessions ?? []) {
        map[s.sessionId] = s.count;
        const key = `${s.sessionId}:${s.lastMessageAt}`;
        if (!seenSnippetsRef.current.has(key)) {
          seenSnippetsRef.current.add(key);
          if (initializedRef.current) newSnippets.push(s);
        }
      }
      setUnreadBySession(map);
      // 첫 패치는 알림 없이 known 만 채움 (탭 진입 시 폭주 방지)
      if (!initializedRef.current) {
        initializedRef.current = true;
        return;
      }
      for (const s of newSnippets) {
        const title = toastLabel
          ? `📩 [${toastLabel}] ${s.lastFromUser ?? "동료"} 님이 멘션`
          : `📩 ${s.lastFromUser ?? "동료"} 님이 멘션했습니다`;
        toast.info(title, {
          description: s.snippet,
          duration: 6000,
          action: onSessionClick
            ? { label: "열기", onClick: () => onSessionClick(s.sessionId) }
            : undefined,
        });
      }
    } catch {
      /* 네트워크 오류는 무시 — 다음 폴링 cycle 에 재시도 */
    }
  }, [endpoint, onSessionClick, toastLabel]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [refresh]);

  const markRead = useCallback(async (sessionId: string) => {
    setUnreadBySession((prev) => {
      if (!prev[sessionId]) return prev;
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    try {
      await fetch(readEndpoint(sessionId), { method: "POST" });
    } catch { /* 다음 폴링에서 자동 복구 */ }
  }, [readEndpoint]);

  return { unreadBySession, markRead, refresh };
}
