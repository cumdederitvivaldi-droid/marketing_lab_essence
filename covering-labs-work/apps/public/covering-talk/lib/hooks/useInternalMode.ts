"use client";

import { useCallback, useEffect, useState } from "react";

/** 채팅창 내부대화 모드 상태 — per-session localStorage + 같은 탭 내 컴포넌트간 동기화.
 *   MessageInput, ChatArea 등에서 같은 sessionId 로 호출하면 한 쪽 변경이 즉시 다른 쪽 반영. */
const EVT = "covspot:internal-mode-change";
const KEY = (sid: string) => `chatbot-internal-${sid}`;

export function useInternalMode(sessionId: string): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  const [value, setValue] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(KEY(sessionId)) === "1";
  });

  // 다른 컴포넌트에서 set 했을 때 동기화
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ sessionId: string; value: boolean }>).detail;
      if (detail?.sessionId !== sessionId) return;
      setValue(detail.value);
    };
    window.addEventListener(EVT, onChange);
    return () => window.removeEventListener(EVT, onChange);
  }, [sessionId]);

  // 세션 전환 시 다시 읽기
  useEffect(() => {
    if (typeof window === "undefined") return;
    setValue(localStorage.getItem(KEY(sessionId)) === "1");
  }, [sessionId]);

  const update = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setValue((prev) => {
      const resolved = typeof next === "function" ? (next as (p: boolean) => boolean)(prev) : next;
      if (typeof window !== "undefined") {
        if (resolved) localStorage.setItem(KEY(sessionId), "1");
        else localStorage.removeItem(KEY(sessionId));
        window.dispatchEvent(new CustomEvent(EVT, { detail: { sessionId, value: resolved } }));
      }
      return resolved;
    });
  }, [sessionId]);

  return [value, update];
}
