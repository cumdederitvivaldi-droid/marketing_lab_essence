"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, GripHorizontal, Loader2, ExternalLink } from "lucide-react";

interface ConversationListItem {
  sessionId: string;
  customerName: string | null;
  lastUserMessage: string | null;
  status: string;
  createdAt: string;
}

interface Props {
  open: boolean;
  phase: string | null;
  reason: string | null;
  fromIso: string;
  toIso: string;
  onClose: () => void;
}

const PHASE_LABELS: Record<string, string> = {
  phase_2: "정보 수집",
  phase_4: "견적 안내",
  phase_5: "넛지",
};

const INITIAL_WIDTH = 480;
const INITIAL_HEIGHT = 560;

export function ChurnReasonModal({ open, phase, reason, fromIso, toIso, onClose }: Props) {
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  // 첫 렌더링 시 화면 가운데로 위치
  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    const cx = (window.innerWidth - INITIAL_WIDTH) / 2;
    const cy = (window.innerHeight - INITIAL_HEIGHT) / 2;
    setPos({ x: Math.max(16, cx), y: Math.max(16, cy) });
  }, [open]);

  // 데이터 fetch
  useEffect(() => {
    if (!open || !phase || !reason) { setItems([]); return; }
    let cancelled = false;
    setLoading(true);
    setItems([]);
    const params = new URLSearchParams({ phase, reason, fromIso, toIso });
    fetch(`/api/new_dashboard/churn-reasons/conversations?${params.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setItems(j.items ?? []); })
      .catch(() => { /* 무시 */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, phase, reason, fromIso, toIso]);

  // ESC로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 드래그 처리
  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragState.current = { startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y };
    document.body.style.userSelect = "none";
  }, [pos]);

  useEffect(() => {
    if (!open) return;
    const onMove = (e: MouseEvent) => {
      const s = dragState.current;
      if (!s) return;
      const newX = s.baseX + (e.clientX - s.startX);
      const newY = s.baseY + (e.clientY - s.startY);
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 80, newX)),
        y: Math.max(0, Math.min(window.innerHeight - 60, newY)),
      });
    };
    const onUp = () => {
      dragState.current = null;
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [open]);

  if (!open || !phase || !reason) return null;

  const phaseLabel = PHASE_LABELS[phase] ?? phase;

  return (
    <div
      role="dialog"
      aria-label={`${phaseLabel} - ${reason} 대화 list`}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        width: INITIAL_WIDTH,
        height: INITIAL_HEIGHT,
        zIndex: 9999,
        backgroundColor: "var(--app-modal-bg)",
        border: "1px solid var(--app-border)",
        borderRadius: 12,
        boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <header
        onMouseDown={onDragStart}
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--app-border)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "move",
          backgroundColor: "var(--app-surface-secondary)",
          userSelect: "none",
        }}
      >
        <GripHorizontal style={{ width: 14, height: 14, color: "var(--app-text-tertiary)" }} />
        <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "var(--app-text-primary)" }}>
          {phaseLabel}
          <span style={{ marginLeft: 8, fontSize: 11, color: "var(--app-text-tertiary)", fontWeight: 500 }}>
            · {reason} · {items.length}건
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 4,
            color: "var(--app-text-tertiary)",
            display: "flex",
            alignItems: "center",
          }}
          aria-label="닫기"
        >
          <X style={{ width: 16, height: 16 }} />
        </button>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--app-text-tertiary)" }}>
            <Loader2 style={{ width: 18, height: 18 }} className="animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--app-text-tertiary)", fontSize: 12 }}>
            해당 분류의 대화가 없습니다
          </div>
        ) : (
          <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {items.map((it, idx) => (
              <li
                key={it.sessionId}
                style={{
                  padding: "8px 14px",
                  borderBottom: "1px solid var(--app-border-light, var(--app-border))",
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                }}
              >
                <span style={{
                  flexShrink: 0,
                  minWidth: 24,
                  textAlign: "right",
                  fontSize: 11,
                  color: "var(--app-text-tertiary)",
                  fontVariantNumeric: "tabular-nums",
                  marginTop: 2,
                }}>
                  {idx + 1}.
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 6,
                    fontSize: 11,
                    color: "var(--app-text-tertiary)",
                    marginBottom: 2,
                  }}>
                    <span style={{ fontWeight: 600, color: "var(--app-text-secondary)" }}>
                      {it.customerName ?? "—"}
                    </span>
                    <span>·</span>
                    <span>{formatDate(it.createdAt)}</span>
                  </div>
                  <div
                    title={it.lastUserMessage ?? ""}
                    style={{
                      fontSize: 12,
                      color: "var(--app-text-primary)",
                      lineHeight: 1.4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {it.lastUserMessage ?? "(메시지 없음)"}
                  </div>
                </div>
                <a
                  href={`/conversations?id=${encodeURIComponent(it.sessionId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="해당 세션 새 탭으로 열기"
                  style={{
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 22,
                    height: 22,
                    borderRadius: 4,
                    color: "var(--app-text-tertiary)",
                    textDecoration: "none",
                    transition: "color 0.15s, background-color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--app-accent)";
                    e.currentTarget.style.backgroundColor = "var(--app-surface-secondary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--app-text-tertiary)";
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <ExternalLink style={{ width: 12, height: 12 }} />
                </a>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
