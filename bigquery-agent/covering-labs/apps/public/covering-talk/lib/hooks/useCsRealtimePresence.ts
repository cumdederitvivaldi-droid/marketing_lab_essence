"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useAuth } from "@/lib/auth/AuthContext";
import type { RealtimeChannel } from "@supabase/supabase-js";

// CS Realtime 통합 채널 — 3개 시스템 + 그 외 페이지의 상담사 위치/활동을 한 곳에서 관찰
//
// 기존 시스템별 채널 (presence:counselors / presence:lunch-counselors / presence:channeltalk)
// 은 "같은 세션 동시 viewer" 표시용으로 그대로 유지. 본 훅은 별도 통합 채널을 추가로 join.

export type CsSystem = "visit" | "lunch" | "channeltalk" | "admin" | "idle";

export interface CsRealtimePresence {
  name: string;          // 상담사 로그인 이름
  system: CsSystem;      // 현재 머무는 시스템
  page: string;          // 정확한 pathname
  lastActiveAt: number;  // mouse/keyboard 마지막 활동 시각 (epoch ms)
  joinedAt: number;      // 본 채널 join 시각 (epoch ms)
}

const CHANNEL = "presence:cs-realtime";
const HEARTBEAT_INTERVAL_MS = 30_000;       // 30초마다 track 재방송 + DB heartbeat (브라우저 throttle 대비 여유)
const ACTIVITY_THROTTLE_MS = 5_000;         // 활동 ref 갱신 throttle
const ACTIVITY_BUCKET_MS = 5_000;           // viewers 비교용 lastActiveAt 버킷 (5초 — 종전 30초가 stale 원인)

function deriveSystem(pathname: string): CsSystem {
  if (pathname.startsWith("/conversations")) return "visit";
  if (pathname.startsWith("/lunch")) return "lunch";
  if (pathname.startsWith("/channeltalk")) return "channeltalk";
  if (pathname.startsWith("/login")) return "idle";
  return "admin";
}

export function useCsRealtimePresence() {
  const { user } = useAuth();
  const pathname = usePathname();

  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);
  const lastActiveAtRef = useRef(Date.now());
  const joinedAtRef = useRef(Date.now());
  const pathnameRef = useRef(pathname || "");
  pathnameRef.current = pathname || "";

  const [viewers, setViewers] = useState<CsRealtimePresence[]>([]);

  const track = useCallback(async () => {
    const ch = channelRef.current;
    if (!ch || !user || !subscribedRef.current) return;
    await ch.track({
      name: user.name,
      system: deriveSystem(pathnameRef.current),
      page: pathnameRef.current,
      lastActiveAt: lastActiveAtRef.current,
      joinedAt: joinedAtRef.current,
    });
  }, [user]);

  // 채널 1회 생성 (user 로그인 후)
  useEffect(() => {
    if (!user) return;

    joinedAtRef.current = Date.now();
    const channel = supabaseBrowser.channel(CHANNEL, {
      config: { presence: { key: user.name } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<CsRealtimePresence>();
        const all: CsRealtimePresence[] = [];
        for (const [, presences] of Object.entries(state)) {
          for (const p of presences) all.push(p as unknown as CsRealtimePresence);
        }
        // 중복 이름 dedup (탭 여러 개 → 가장 최근 활동 채택)
        const dedupMap = new Map<string, CsRealtimePresence>();
        for (const v of all) {
          const existing = dedupMap.get(v.name);
          if (!existing || v.lastActiveAt > existing.lastActiveAt) dedupMap.set(v.name, v);
        }
        const deduped = [...dedupMap.values()];
        // 30초 버킷 단위 비교 — 매 mousemove 마다 setState 안 되도록
        setViewers((prev) => {
          const key = (vs: CsRealtimePresence[]) =>
            vs
              .map((p) => `${p.name}|${p.system}|${p.page}|${Math.floor(p.lastActiveAt / ACTIVITY_BUCKET_MS)}`)
              .sort()
              .join("§");
          return key(prev) === key(deduped) ? prev : deduped;
        });
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          subscribedRef.current = true;
          await track();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          subscribedRef.current = false;
          console.warn(`[cs-presence] channel ${status} — 자동 재연결 대기 (Supabase Realtime 내장)`);
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
  }, [user?.name]);

  // pathname 변경 시 즉시 track 재방송
  useEffect(() => {
    if (!subscribedRef.current) return;
    track();
  }, [pathname, track]);

  // Activity Heartbeat — mouse/keyboard 활동 감지 (throttle 5초)
  // lastActiveAtRef 갱신 + presence 채널 즉시 broadcast — 1분 timer 가 멈춰도 활동 시 갱신 보장
  useEffect(() => {
    let lastBump = 0;
    const bump = () => {
      const now = Date.now();
      if (now - lastBump < ACTIVITY_THROTTLE_MS) return;
      lastBump = now;
      lastActiveAtRef.current = now;
      track();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        lastActiveAtRef.current = Date.now();
        track();
      }
    };

    window.addEventListener("mousemove", bump, { passive: true });
    window.addEventListener("keydown", bump);
    window.addEventListener("click", bump);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("mousemove", bump);
      window.removeEventListener("keydown", bump);
      window.removeEventListener("click", bump);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [track]);

  // 1분 heartbeat — 다른 viewers 의 idle 판단을 위해 주기적으로 track 재방송 +
  // cs_presence_log 에 출석 INSERT (오늘 근무시간 집계 / KST 08–22 운영시간 + 활성 + visible 일 때만)
  useEffect(() => {
    if (!user) return;
    const tick = async () => {
      track();

      // 활성 + visible + 운영시간일 때만 DB 출석 기록
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const inactiveMs = Date.now() - lastActiveAtRef.current;
      if (inactiveMs > 5 * 60_000) return;
      const KST_OFFSET = 9 * 60 * 60 * 1000;
      const hourKst = new Date(Date.now() + KST_OFFSET).getUTCHours();
      if (hourKst < 8 || hourKst >= 22) return;

      try {
        await fetch("/api/cs-realtime/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            page: pathnameRef.current,
            system: deriveSystem(pathnameRef.current),
          }),
          cache: "no-store",
        });
      } catch { /* 네트워크 실패는 무시 */ }
    };
    // 즉시 1회 실행 — 로그인 직후도 +1분 카운트되게
    tick();
    const timer = setInterval(tick, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [user?.name, track]);

  return { viewers };
}

// CS Realtime 대시보드용 헬퍼 — lastActiveAt 기반 4단계 상태 산출
export type PresenceLevel = "online" | "idle" | "away" | "offline";

export function presenceLevelOf(p: CsRealtimePresence, now = Date.now()): PresenceLevel {
  const elapsed = now - p.lastActiveAt;
  if (elapsed < 5 * 60_000) return "online";
  if (elapsed < 15 * 60_000) return "idle";
  return "away";
  // "offline" 은 presence 채널에서 사라진 경우 (별도)
}
