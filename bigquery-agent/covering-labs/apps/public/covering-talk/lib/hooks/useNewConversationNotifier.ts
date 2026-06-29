"use client";

import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useConversationUpdates } from "@/lib/hooks/ConversationUpdatesContext";

// 자체 폴링 제거 — ConversationUpdatesProvider 의 단일 15s 폴링 결과를 Context 로 구독.
//   이전엔 conversations/page.tsx 5s 폴링 + 본 훅 10s 폴링 두 곳에서 같은 endpoint 호출.
const TITLE_BLINK_INTERVAL = 1000;
const ORIGINAL_TITLE = "커버링톡";

/** Web Audio API로 간단한 알림음 생성 (별도 파일 불필요) */
function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    // 밝은 2음 알림 (도-미)
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5
    oscillator.frequency.setValueAtTime(1108, ctx.currentTime + 0.12); // C#6

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  } catch {
    // AudioContext 미지원 환경 무시
  }
}

export function useNewConversationNotifier() {
  const update = useConversationUpdates();
  const knownSessionsRef = useRef<Set<string> | null>(null); // null = 아직 초기화 안됨
  const titleBlinkRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isBlinkingRef = useRef(false);

  // 탭 타이틀 깜빡임 시작
  const startTitleBlink = useCallback(() => {
    if (isBlinkingRef.current) return;
    isBlinkingRef.current = true;
    let show = true;
    titleBlinkRef.current = setInterval(() => {
      document.title = show ? "🔔 새 상담!" : ORIGINAL_TITLE;
      show = !show;
    }, TITLE_BLINK_INTERVAL);
  }, []);

  // 탭 타이틀 깜빡임 정지
  const stopTitleBlink = useCallback(() => {
    if (titleBlinkRef.current) {
      clearInterval(titleBlinkRef.current);
      titleBlinkRef.current = null;
    }
    isBlinkingRef.current = false;
    document.title = ORIGINAL_TITLE;
  }, []);

  // 알림 권한 요청
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then((perm) => {
        console.log("[Notifier] 알림 권한:", perm);
      });
    }
  }, []);

  // 탭 포커스 시 타이틀 깜빡임 정지
  useEffect(() => {
    const handleFocus = () => stopTitleBlink();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [stopTitleBlink]);

  // 초기: 기존 상담 목록 로드 (알림 중복 방지)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/conversations");
        if (res.ok) {
          const data = await res.json();
          const sessions = (data.conversations ?? []).map(
            (c: { sessionId: string }) => c.sessionId
          );
          knownSessionsRef.current = new Set(sessions);
          console.log(`[Notifier] 기존 상담 ${sessions.length}건 로드`);
        } else {
          knownSessionsRef.current = new Set();
        }
      } catch {
        knownSessionsRef.current = new Set();
      }
    })();
  }, []);

  // Context 의 sessionIds 변경 감지 → 새 상담 알림
  useEffect(() => {
    if (!update) return;
    // 초기화 완료 전에는 처리 스킵 (알림 폭주 방지)
    if (!knownSessionsRef.current) return;

    // 새 상담만 필터 (기존에 알고 있던 sessionId가 아닌 것)
    const newSessions = update.sessionIds.filter(
      (id) => !knownSessionsRef.current!.has(id)
    );

    // 모든 sessionId를 known에 추가 (다음번에 중복 알림 방지)
    for (const id of update.sessionIds) {
      knownSessionsRef.current!.add(id);
    }

    if (newSessions.length === 0) return;

    const count = newSessions.length;
    console.log(`[Notifier] 새 상담 ${count}건 감지:`, newSessions);

    // 1. 알림음
    playNotificationSound();

    // 2. 앱 내 토스트 (항상 표시)
    toast.info(`새 상담 ${count}건이 도착했습니다`, {
      description: "상담관리에서 확인하세요",
      action: {
        label: "확인",
        onClick: () => {
          window.location.href = "/covering-talk/conversations";
        },
      },
      duration: 8000,
    });

    // 3. 브라우저 데스크톱 알림 (항상 표시 — 탭 활성/비활성 무관)
    if ("Notification" in window && Notification.permission === "granted") {
      const notif = new Notification("새 상담이 도착했습니다", {
        body: `${count}건의 새로운 상담이 있습니다.`,
        icon: "/favicon.ico",
        tag: "new-conversation", // 중복 알림 방지
      });
      notif.onclick = () => {
        window.focus();
        window.location.href = "/covering-talk/conversations";
      };
    }

    // 4. 탭 비활성이면 타이틀 깜빡임
    if (document.hidden) {
      startTitleBlink();
    }
  }, [update, startTitleBlink]);

  // 클린업
  useEffect(() => {
    return () => stopTitleBlink();
  }, [stopTitleBlink]);
}
