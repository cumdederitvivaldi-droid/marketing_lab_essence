"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export interface DashboardNote {
  id: string;
  section: string;
  cell_key: string;
  content: string;
  author: string;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteCount {
  total: number;
  unresolved: number;
}

interface ActiveCell {
  section: string;
  cellKey: string;
  anchorRect: DOMRect;
}

interface NoteContextValue {
  /** 셀별 카운트 — `${section}::${cellKey}` 키 */
  counts: Record<string, NoteCount>;
  refreshSummary: () => Promise<void>;
  active: ActiveCell | null;
  openPopover: (section: string, cellKey: string, anchor: HTMLElement) => void;
  closePopover: () => void;
  /** 메모 변경 후 (등록/삭제/해결) — 카운트 재조회 + popover 강제 갱신 */
  notifyChange: () => void;
  changeTick: number;
}

const NoteCtx = createContext<NoteContextValue | null>(null);

export function NoteProvider({ children }: { children: React.ReactNode }) {
  const [counts, setCounts] = useState<Record<string, NoteCount>>({});
  const [active, setActive] = useState<ActiveCell | null>(null);
  const [changeTick, setChangeTick] = useState(0);
  const fetchingRef = useRef(false);

  const refreshSummary = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const res = await fetch("/api/new_dashboard/notes?summary=true", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setCounts(json.counts ?? {});
    } catch {
      // ignore — 카운트는 부가정보, 실패해도 셀 동작에 영향 없음
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    refreshSummary();
  }, [refreshSummary]);

  const openPopover = useCallback((section: string, cellKey: string, anchor: HTMLElement) => {
    setActive({ section, cellKey, anchorRect: anchor.getBoundingClientRect() });
  }, []);

  const closePopover = useCallback(() => setActive(null), []);

  const notifyChange = useCallback(() => {
    setChangeTick((t) => t + 1);
    refreshSummary();
  }, [refreshSummary]);

  // 외부 클릭/Esc 로 popover 닫기
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closePopover(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, closePopover]);

  const value = useMemo<NoteContextValue>(() => ({
    counts, refreshSummary, active, openPopover, closePopover, notifyChange, changeTick,
  }), [counts, refreshSummary, active, openPopover, closePopover, notifyChange, changeTick]);

  return <NoteCtx.Provider value={value}>{children}</NoteCtx.Provider>;
}

export function useNoteContext(): NoteContextValue {
  const ctx = useContext(NoteCtx);
  if (!ctx) throw new Error("NoteContext provider missing");
  return ctx;
}
