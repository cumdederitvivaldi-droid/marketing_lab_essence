"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, CheckCircle2, RotateCcw, Trash2, Send, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useNoteContext, DashboardNote } from "./NoteContext";

const POPOVER_WIDTH = 340;
const POPOVER_MAX_HEIGHT = 480;

export function NotePopover() {
  const { active, closePopover, notifyChange, changeTick } = useNoteContext();
  const { user } = useAuth();
  const [notes, setNotes] = useState<DashboardNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // active 변경 시 (다른 셀 열기) → 새 fetch + draft 초기화
  useEffect(() => {
    setNotes([]);
    setDraft("");
    setEditingId(null);
    if (!active) return;

    let cancelled = false;
    setLoading(true);
    fetch(`/api/new_dashboard/notes?section=${encodeURIComponent(active.section)}&cell_key=${encodeURIComponent(active.cellKey)}`,
      { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setNotes(d.notes ?? []); })
      .catch(() => { /* 무시 */ })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [active, changeTick]);

  // 외부 클릭 닫기
  useEffect(() => {
    if (!active) return;
    const onClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        closePopover();
      }
    };
    // 다음 tick 에 등록 (열린 직후 클릭과 충돌 방지)
    const id = setTimeout(() => document.addEventListener("mousedown", onClick), 0);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", onClick); };
  }, [active, closePopover]);

  const submitNew = useCallback(async () => {
    if (!active || !draft.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/new_dashboard/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: active.section, cell_key: active.cellKey, content: draft.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "메모 저장 실패");
        return;
      }
      setDraft("");
      notifyChange();
    } finally {
      setSubmitting(false);
    }
  }, [active, draft, submitting, notifyChange]);

  const submitEdit = useCallback(async (id: string) => {
    if (!editingContent.trim()) return;
    const res = await fetch(`/api/new_dashboard/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editingContent.trim() }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "수정 실패");
      return;
    }
    setEditingId(null);
    notifyChange();
  }, [editingContent, notifyChange]);

  const toggleResolved = useCallback(async (id: string, current: boolean) => {
    const res = await fetch(`/api/new_dashboard/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved: !current }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "상태 변경 실패");
      return;
    }
    notifyChange();
  }, [notifyChange]);

  const deleteNote = useCallback(async (id: string) => {
    if (!confirm("이 메모를 삭제할까요?")) return;
    const res = await fetch(`/api/new_dashboard/notes/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "삭제 실패");
      return;
    }
    notifyChange();
  }, [notifyChange]);

  if (!active) return null;

  // 위치 계산 — anchor 우측에 띄우되 viewport 넘으면 좌측, 하단 넘으면 위로
  const { anchorRect } = active;
  let left = anchorRect.right + 8;
  let top = anchorRect.top;
  if (typeof window !== "undefined") {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (left + POPOVER_WIDTH > vw - 16) left = Math.max(16, anchorRect.left - POPOVER_WIDTH - 8);
    if (top + POPOVER_MAX_HEIGHT > vh - 16) top = Math.max(16, vh - POPOVER_MAX_HEIGHT - 16);
  }

  return (
    <div
      ref={popoverRef}
      style={{
        position: "fixed", left, top,
        width: POPOVER_WIDTH, maxHeight: POPOVER_MAX_HEIGHT,
        backgroundColor: "var(--app-modal-bg)",
        border: "1px solid var(--app-border)",
        borderRadius: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        zIndex: 9999,
        display: "flex", flexDirection: "column",
      }}
    >
      <header style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--app-border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--app-text-secondary)" }}>
          💬 메모 — <span style={{ color: "var(--app-text-tertiary)", fontWeight: 500 }}>
            {labelForCell(active.section, active.cellKey)}
          </span>
        </div>
        <button
          onClick={closePopover}
          style={{
            background: "transparent", border: "none", cursor: "pointer", padding: 4,
            color: "var(--app-text-tertiary)",
          }}
          aria-label="닫기"
        >
          <X style={{ width: 14, height: 14 }} />
        </button>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px" }}>
        {loading ? (
          <div style={{ padding: 20, textAlign: "center", color: "var(--app-text-tertiary)" }}>
            <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
          </div>
        ) : notes.length === 0 ? (
          <div style={{ padding: "20px 8px", textAlign: "center", fontSize: 12, color: "var(--app-text-tertiary)" }}>
            아직 메모가 없습니다. 아래에서 첫 메모를 작성하세요.
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {notes.map((n) => (
              <li
                key={n.id}
                style={{
                  padding: "8px 10px",
                  backgroundColor: n.resolved ? "var(--app-surface-secondary)" : "var(--app-surface)",
                  border: "1px solid var(--app-border)",
                  borderRadius: 8,
                  opacity: n.resolved ? 0.7 : 1,
                }}
              >
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginBottom: 4,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--app-text-primary)" }}>
                    {n.author}
                    {n.resolved && (
                      <span style={{ marginLeft: 6, fontSize: 9, color: "#10B981" }}>● 해결</span>
                    )}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--app-text-tertiary)" }}>
                    {formatRelative(n.created_at)}
                  </span>
                </div>

                {editingId === n.id ? (
                  <>
                    <textarea
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      rows={3}
                      style={{
                        width: "100%", padding: 6, fontSize: 12, lineHeight: 1.5,
                        border: "1px solid var(--app-border)", borderRadius: 6,
                        resize: "vertical",
                        backgroundColor: "var(--app-input-bg)",
                        color: "var(--app-text-primary)",
                        boxSizing: "border-box",
                      }}
                    />
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4 }}>
                      <button onClick={() => setEditingId(null)} style={smallBtn("secondary")}>취소</button>
                      <button onClick={() => submitEdit(n.id)} style={smallBtn("primary")}>저장</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{
                      fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap",
                      color: "var(--app-text-primary)",
                    }}>
                      {n.content}
                    </div>
                    <div style={{ display: "flex", gap: 4, marginTop: 6, justifyContent: "flex-end" }}>
                      <button
                        onClick={() => toggleResolved(n.id, n.resolved)}
                        title={n.resolved ? "다시 열기" : "해결로 표시"}
                        style={iconBtn}
                      >
                        {n.resolved
                          ? <RotateCcw style={{ width: 11, height: 11, color: "var(--app-text-tertiary)" }} />
                          : <CheckCircle2 style={{ width: 11, height: 11, color: "#10B981" }} />}
                      </button>
                      {user?.name === n.author && (
                        <>
                          <button
                            onClick={() => { setEditingId(n.id); setEditingContent(n.content); }}
                            title="수정"
                            style={iconBtn}
                          >
                            <span style={{ fontSize: 10, color: "var(--app-text-tertiary)" }}>편집</span>
                          </button>
                          <button onClick={() => deleteNote(n.id)} title="삭제" style={iconBtn}>
                            <Trash2 style={{ width: 11, height: 11, color: "#EF4444" }} />
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer style={{
        padding: 10, borderTop: "1px solid var(--app-border)",
        display: "flex", flexDirection: "column", gap: 6,
      }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submitNew();
            }
          }}
          placeholder="메모를 작성하세요. ⌘Enter 로 등록"
          rows={2}
          style={{
            width: "100%", padding: 6, fontSize: 12, lineHeight: 1.5,
            border: "1px solid var(--app-border)", borderRadius: 6,
            resize: "vertical",
            backgroundColor: "var(--app-input-bg)",
            color: "var(--app-text-primary)",
            boxSizing: "border-box",
          }}
        />
        <button
          onClick={submitNew}
          disabled={!draft.trim() || submitting}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            padding: "6px 10px", fontSize: 12, fontWeight: 600,
            color: "white",
            backgroundColor: !draft.trim() || submitting ? "var(--app-disabled-bg)" : "var(--app-accent)",
            border: "none", borderRadius: 6,
            cursor: !draft.trim() || submitting ? "not-allowed" : "pointer",
            alignSelf: "flex-end",
          }}
        >
          {submitting ? <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" /> : <Send style={{ width: 11, height: 11 }} />}
          {submitting ? "등록 중…" : "등록"}
        </button>
      </footer>
    </div>
  );
}

function labelForCell(section: string, cellKey: string): string {
  // section + cellKey 를 사람이 읽을 수 있는 라벨로 (대시보드 셀 위치 표기)
  return `${section} · ${cellKey}`;
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return "방금";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}시간 전`;
  if (diff < 604800_000) return `${Math.floor(diff / 86400_000)}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

const iconBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  padding: 4, background: "transparent", border: "none", cursor: "pointer", borderRadius: 4,
};

function smallBtn(kind: "primary" | "secondary"): React.CSSProperties {
  return {
    padding: "4px 8px", fontSize: 11, fontWeight: 600,
    color: kind === "primary" ? "white" : "var(--app-text-secondary)",
    backgroundColor: kind === "primary" ? "var(--app-accent)" : "var(--app-surface-secondary)",
    border: "none", borderRadius: 4, cursor: "pointer",
  };
}
