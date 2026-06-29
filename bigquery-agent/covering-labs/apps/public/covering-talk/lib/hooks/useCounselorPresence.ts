"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useAuth } from "@/lib/auth/AuthContext";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface PresenceState {
  name: string;
  sessionId: string;
  typing: boolean;
  viewedAt: number;
}

/**
 * Supabase Realtime Presence — 상담사가 어떤 채팅을 보고 있는지 추적
 *
 * 모든 상담사가 하나의 채널(presence:counselors)에 참가.
 * track 데이터에 현재 보고 있는 sessionId를 넣어서 필터링.
 */
export function useCounselorPresence(activeSessionId: string | null, channelName = "presence:counselors") {
  const { user } = useAuth();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);
  const activeSessionRef = useRef(activeSessionId);
  activeSessionRef.current = activeSessionId;

  const [viewers, setViewers] = useState<PresenceState[]>([]);

  // 채널 1회 생성 (user 로그인 후)
  useEffect(() => {
    if (!user) return;

    const channel = supabaseBrowser.channel(channelName, {
      config: { presence: { key: user.name } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceState>();
        const all: PresenceState[] = [];
        for (const [, presences] of Object.entries(state)) {
          for (const p of presences) {
            all.push(p as unknown as PresenceState);
          }
        }
        // 실제 변경이 있을 때만 state 업데이트 (깜빡임 방지)
        setViewers((prev) => {
          const key = (v: PresenceState[]) => v.map((p) => `${p.name}:${p.sessionId}:${p.typing}`).sort().join("|");
          return key(prev) === key(all) ? prev : all;
        });
      })
      .subscribe(async (status) => {
        console.log(`[presence:${channelName}] status: ${status}`);
        if (status === "SUBSCRIBED") {
          subscribedRef.current = true;
          // 현재 세션이 있으면 바로 track
          if (activeSessionRef.current) {
            await channel.track({
              name: user.name,
              sessionId: activeSessionRef.current,
              typing: false,
              viewedAt: Date.now(),
            });
            console.log(`[presence:${channelName}] tracked: ${user.name} → ${activeSessionRef.current}`);
          }
        }
      });

    channelRef.current = channel;

    return () => {
      subscribedRef.current = false;
      channel.untrack();
      supabaseBrowser.removeChannel(channel);
      channelRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.name, channelName]);

  // activeSessionId 변경 시 track 업데이트 (300ms 디바운스 — 빠른 세션 전환 대응)
  const trackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackSeqRef = useRef(0);

  useEffect(() => {
    const ch = channelRef.current;
    if (!ch || !user) return;

    // 이전 디바운스 타이머 취소
    if (trackTimerRef.current) {
      clearTimeout(trackTimerRef.current);
      trackTimerRef.current = null;
    }

    // 세션 없으면 즉시 untrack
    if (!activeSessionId) {
      trackSeqRef.current++;
      ch.untrack();
      return;
    }

    // 300ms 디바운스 — 빠르게 세션 전환 시 마지막 세션만 track
    const seq = ++trackSeqRef.current;
    const targetSession = activeSessionId;

    trackTimerRef.current = setTimeout(async () => {
      if (seq !== trackSeqRef.current) return; // 이미 다른 세션으로 전환됨
      if (!subscribedRef.current) {
        // 구독 대기 (최대 2초)
        for (let i = 0; i < 20; i++) {
          if (subscribedRef.current) break;
          await new Promise((r) => setTimeout(r, 100));
        }
        if (!subscribedRef.current || seq !== trackSeqRef.current) return;
      }
      await ch.track({
        name: user.name,
        sessionId: targetSession,
        typing: false,
        viewedAt: Date.now(),
      });
    }, 300);

    return () => {
      if (trackTimerRef.current) {
        clearTimeout(trackTimerRef.current);
        trackTimerRef.current = null;
      }
    };
  }, [activeSessionId, user]);

  // 타이핑 상태
  const setTyping = useCallback(async (typing: boolean) => {
    if (!channelRef.current || !user || !subscribedRef.current || !activeSessionRef.current) return;
    await channelRef.current.track({
      name: user.name,
      sessionId: activeSessionRef.current,
      typing,
      viewedAt: Date.now(),
    });
  }, [user]);

  // 같은 이름 중복 제거 (탭 여러 개 열어도 1명으로 표시, typing은 하나라도 true면 true)
  function dedup(list: PresenceState[]): PresenceState[] {
    const map = new Map<string, PresenceState>();
    for (const v of list) {
      const existing = map.get(v.name);
      if (!existing || v.typing || v.viewedAt > existing.viewedAt) {
        map.set(v.name, { ...v, typing: v.typing || (existing?.typing ?? false) });
      }
    }
    return [...map.values()];
  }

  // 내가 아닌 다른 상담사 중 같은 세션을 보고 있는 사람들
  const othersInSession = dedup(
    viewers.filter((v) => v.name !== user?.name && v.sessionId === activeSessionId)
  );

  // 세션별 뷰어 맵 (ConversationCard용)
  const viewersBySession = viewers.reduce<Record<string, PresenceState[]>>((acc, v) => {
    if (v.name === user?.name) return acc;
    if (!acc[v.sessionId]) acc[v.sessionId] = [];
    acc[v.sessionId].push(v);
    return acc;
  }, {});
  // 각 세션별로도 중복 제거
  for (const key of Object.keys(viewersBySession)) {
    viewersBySession[key] = dedup(viewersBySession[key]);
  }

  return {
    viewers,
    othersInSession,
    viewersBySession,
    setTyping,
  };
}
