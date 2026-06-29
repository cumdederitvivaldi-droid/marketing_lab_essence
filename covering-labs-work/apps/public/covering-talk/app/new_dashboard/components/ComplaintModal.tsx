"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, GripHorizontal, Loader2, ExternalLink, ShieldOff } from "lucide-react";
import { complaintsCache } from "@/lib/dashboard/cache";

const CATEGORIES = [
  "파손훼손", "일정변경", "누락실수", "가격추가비용", "응대태도", "결제문제", "기타",
] as const;
type Cat = (typeof CATEGORIES)[number];

const CATEGORY_COLOR: Record<Cat, string> = {
  파손훼손: "#EF4444",
  일정변경: "#F59E0B",
  누락실수: "#F97316",
  가격추가비용: "#A855F7",
  응대태도: "#EC4899",
  결제문제: "#3B82F6",
  기타: "#94A3B8",
};

interface ConversationOut {
  sessionId: string;
  customerName: string | null;
  phone: string | null;
  firstComplaintAt: string;
  complaintMessageIds: string[];
  messages: Array<{ id: string; role: string; content: string; createdAt: string; sentBy: string | null }>;
}

interface ApiResp { category: Cat; mode: "pre" | "post"; conversations: ConversationOut[] }

interface Props {
  open: boolean;
  initialMode?: "pre" | "post";
  countsPost: Record<Cat, number> | null;
  countsPre: Record<Cat, number> | null;
  fromIso: string;
  toIso: string;
  initialCategory?: Cat | null;
  onClose: () => void;
  /** unmark 후 부모가 카운트를 -1 갱신하도록 콜백 (sessionRemoved=true 일 때만 카운트 감소) */
  onUnmarked?: (mode: "pre" | "post", category: Cat, sessionRemoved: boolean) => void;
}

const INITIAL_W = 1080;
const INITIAL_H = 680;

export function ComplaintModal({ open, initialMode, countsPost, countsPre, fromIso, toIso, initialCategory, onClose, onUnmarked }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  const [mode, setMode] = useState<"pre" | "post">(initialMode ?? "post");
  const [selectedCat, setSelectedCat] = useState<Cat | null>(initialCategory ?? null);
  const [convCache, setConvCache] = useState<Partial<Record<Cat, ConversationOut[]>>>({});
  const [loadingCat, setLoadingCat] = useState<Cat | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [unmarkingId, setUnmarkingId] = useState<string | null>(null);

  const counts = mode === "post" ? countsPost : countsPre;

  // "불만 아님" 버튼 클릭 — 해당 메시지를 dashboard_complaints.category = 'none' 으로 update.
  // 성공 시: 로컬 conversations 에서 complaintMessageIds 제거 → 0개면 세션 자체 제거 →
  //         부모에 onUnmarked(sessionRemoved) 통지 → 카운트 -1.
  const handleUnmark = useCallback(async (sessionId: string, messageId: string) => {
    if (!selectedCat || unmarkingId) return;
    setUnmarkingId(messageId);
    try {
      const res = await fetch("/api/new_dashboard/complaints/unmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, messageId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        console.error("[unmark] 실패:", j);
        alert(`처리 실패: ${j.error ?? res.status}`);
        return;
      }

      let sessionRemoved = false;
      setConvCache((prev) => {
        const list = prev[selectedCat];
        if (!list) return prev;
        const next: ConversationOut[] = [];
        for (const conv of list) {
          if (conv.sessionId !== sessionId) { next.push(conv); continue; }
          const remaining = conv.complaintMessageIds.filter((id) => id !== messageId);
          if (remaining.length === 0) {
            sessionRemoved = true;
            // 세션 자체 제거 (해당 카테고리에 더 이상 컴플레인 메시지 없음)
            continue;
          }
          next.push({ ...conv, complaintMessageIds: remaining });
        }
        return { ...prev, [selectedCat]: next };
      });

      if (sessionRemoved && selectedSessionId === sessionId) {
        setSelectedSessionId(null);
      }

      // 부모 카운트 동기화 + complaintsCache 무효화 (다음 fetch 시 서버에서 정확히 재계산)
      complaintsCache.delete(`${fromIso}|${toIso}`);
      onUnmarked?.(mode, selectedCat, sessionRemoved);
    } catch (err) {
      console.error("[unmark] error:", err);
      alert("처리 실패");
    } finally {
      setUnmarkingId(null);
    }
  }, [selectedCat, unmarkingId, mode, fromIso, toIso, selectedSessionId, onUnmarked]);

  // 모달 열릴 때 initialMode 동기화
  useEffect(() => { if (open && initialMode) setMode(initialMode); }, [open, initialMode]);

  // 첫 렌더 시 가운데
  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    const cx = (window.innerWidth - INITIAL_W) / 2;
    const cy = (window.innerHeight - INITIAL_H) / 2;
    setPos({ x: Math.max(16, cx), y: Math.max(16, cy) });
  }, [open]);

  // initialCategory 동기화
  useEffect(() => {
    if (open && initialCategory) setSelectedCat(initialCategory);
  }, [open, initialCategory]);

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // mode 변경 시 캐시 초기화 (다른 모집단)
  useEffect(() => {
    setConvCache({});
    setSelectedSessionId(null);
  }, [mode]);

  // 카테고리 선택 시 fetch (캐시 hit 안 하면)
  useEffect(() => {
    if (!open || !selectedCat) return;
    if (convCache[selectedCat] !== undefined) {
      const list = convCache[selectedCat]!;
      setSelectedSessionId(list[0]?.sessionId ?? null);
      return;
    }
    let cancelled = false;
    setLoadingCat(selectedCat);
    fetch("/api/new_dashboard/complaints/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromIso, toIso, category: selectedCat, mode }),
    })
      .then((r) => r.json())
      .then((j: ApiResp) => {
        if (cancelled) return;
        setConvCache((prev) => ({ ...prev, [selectedCat]: j.conversations ?? [] }));
        setSelectedSessionId((j.conversations ?? [])[0]?.sessionId ?? null);
      })
      .catch(() => { if (!cancelled) setConvCache((prev) => ({ ...prev, [selectedCat]: [] })); })
      .finally(() => { if (!cancelled) setLoadingCat(null); });
    return () => { cancelled = true; };
  }, [open, selectedCat, fromIso, toIso, mode, convCache]);

  // 드래그
  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragState.current = { startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y };
    document.body.style.userSelect = "none";
  }, [pos]);

  useEffect(() => {
    if (!open) return;
    const onMove = (e: MouseEvent) => {
      const s = dragState.current;
      if (!s) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 80, s.baseX + (e.clientX - s.startX))),
        y: Math.max(0, Math.min(window.innerHeight - 60, s.baseY + (e.clientY - s.startY))),
      });
    };
    const onUp = () => { dragState.current = null; document.body.style.userSelect = ""; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [open]);

  if (!open) return null;

  const totalPost = countsPost ? Object.values(countsPost).reduce((a, b) => a + b, 0) : 0;
  const totalPre = countsPre ? Object.values(countsPre).reduce((a, b) => a + b, 0) : 0;
  const conversations = selectedCat ? (convCache[selectedCat] ?? []) : [];
  const selectedConv = conversations.find((c) => c.sessionId === selectedSessionId) ?? null;

  return (
    <div
      role="dialog"
      aria-label="고객 불만 분류"
      style={{
        position: "fixed", left: pos.x, top: pos.y,
        width: INITIAL_W, height: INITIAL_H, zIndex: 9999,
        backgroundColor: "var(--app-modal-bg)",
        border: "1px solid var(--app-border)",
        borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}
    >
      {/* 헤더 (drag handle) */}
      <header
        onMouseDown={onDragStart}
        style={{
          padding: "10px 14px", borderBottom: "1px solid var(--app-border)",
          display: "flex", alignItems: "center", gap: 10,
          cursor: "move", backgroundColor: "var(--app-surface-secondary)",
          userSelect: "none",
        }}
      >
        <GripHorizontal style={{ width: 14, height: 14, color: "var(--app-text-tertiary)" }} />
        <div style={{ fontSize: 13, fontWeight: 700 }}>고객 불만</div>
        {/* 모드 토글 탭 */}
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{ display: "flex", borderRadius: 8, border: "1px solid var(--app-border)", overflow: "hidden" }}
        >
          {([
            { m: "pre" as const, label: "예약 확정 전", n: totalPre },
            { m: "post" as const, label: "예약 확정 후", n: totalPost },
          ]).map((t, i) => {
            const active = mode === t.m;
            return (
              <button
                key={t.m}
                onClick={() => setMode(t.m)}
                style={{
                  padding: "4px 10px", fontSize: 11, fontWeight: 600,
                  background: active ? "var(--app-accent)" : "var(--app-surface)",
                  color: active ? "#fff" : "var(--app-text-secondary)",
                  border: "none",
                  borderLeft: i > 0 ? "1px solid var(--app-border)" : "none",
                  cursor: "pointer",
                }}
              >
                {t.label} <span style={{ opacity: 0.85 }}>{t.n}</span>
              </button>
            );
          })}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} aria-label="닫기" style={{
          background: "transparent", border: "none", cursor: "pointer", padding: 4,
          color: "var(--app-text-tertiary)", display: "flex", alignItems: "center",
        }}>
          <X style={{ width: 16, height: 16 }} />
        </button>
      </header>

      {/* 본문 — 3 컬럼 */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "180px 280px 1fr", overflow: "hidden" }}>
        {/* 좌: 카테고리 리스트 */}
        <aside style={{ borderRight: "1px solid var(--app-border)", overflowY: "auto", padding: "8px 0" }}>
          {CATEGORIES.map((c) => {
            const cnt = counts?.[c] ?? 0;
            const isSel = selectedCat === c;
            const disabled = cnt === 0;
            return (
              <button
                key={c}
                onClick={() => !disabled && setSelectedCat(c)}
                disabled={disabled}
                style={{
                  width: "100%", padding: "8px 14px", textAlign: "left",
                  background: isSel ? "var(--app-surface-secondary)" : "transparent",
                  border: "none", cursor: disabled ? "default" : "pointer",
                  borderLeft: `3px solid ${isSel ? CATEGORY_COLOR[c] : "transparent"}`,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 8, opacity: disabled ? 0.4 : 1,
                  fontSize: 12, color: "var(--app-text-primary)",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: CATEGORY_COLOR[c], flexShrink: 0 }} />
                  {c}
                </span>
                <span style={{ fontSize: 11, color: "var(--app-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                  {cnt}
                </span>
              </button>
            );
          })}
        </aside>

        {/* 중: 세션 리스트 */}
        <div style={{ borderRight: "1px solid var(--app-border)", overflowY: "auto" }}>
          {!selectedCat ? (
            <div style={{ padding: 20, color: "var(--app-text-tertiary)", fontSize: 12 }}>
              좌측에서 카테고리를 선택하세요
            </div>
          ) : loadingCat === selectedCat ? (
            <div style={{ padding: 30, textAlign: "center", color: "var(--app-text-tertiary)" }}>
              <Loader2 style={{ width: 18, height: 18 }} className="animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: 20, color: "var(--app-text-tertiary)", fontSize: 12 }}>
              해당 카테고리에 컴플레인이 없습니다
            </div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {conversations.map((c) => {
                const isSel = c.sessionId === selectedSessionId;
                const previewMsg = c.messages.find((m) => c.complaintMessageIds.includes(m.id));
                return (
                  <li key={c.sessionId}>
                    <button
                      onClick={() => setSelectedSessionId(c.sessionId)}
                      style={{
                        width: "100%", padding: "10px 14px", textAlign: "left",
                        background: isSel ? "var(--app-surface-secondary)" : "transparent",
                        border: "none", borderBottom: "1px solid var(--app-border-light, var(--app-border))",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{c.customerName ?? "—"}</span>
                        <span style={{ fontSize: 10, color: "var(--app-text-tertiary)" }}>
                          {formatTime(c.firstComplaintAt)}
                        </span>
                      </div>
                      {previewMsg && (
                        <div style={{
                          fontSize: 11, color: "var(--app-text-secondary)",
                          overflow: "hidden", textOverflow: "ellipsis",
                          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                        }}>
                          {previewMsg.content}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 우: 선택 세션 채팅 */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {!selectedConv ? (
            <div style={{ padding: 20, color: "var(--app-text-tertiary)", fontSize: 12 }}>
              세션을 선택하세요
            </div>
          ) : (
            <>
              <div style={{
                padding: "8px 14px", borderBottom: "1px solid var(--app-border)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: "var(--app-surface-secondary)",
              }}>
                <div style={{ fontSize: 12 }}>
                  <strong>{selectedConv.customerName ?? "—"}</strong>
                  <span style={{ marginLeft: 8, color: "var(--app-text-tertiary)" }}>
                    {selectedConv.phone ?? ""}
                  </span>
                </div>
                <a
                  href={`/conversations?id=${encodeURIComponent(selectedConv.sessionId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    fontSize: 11, color: "var(--app-accent)", textDecoration: "none",
                  }}
                >
                  원본 열기 <ExternalLink style={{ width: 11, height: 11 }} />
                </a>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                {selectedConv.messages.map((m) => {
                  const isComplaint = selectedConv.complaintMessageIds.includes(m.id);
                  return (
                    <MessageBubble
                      key={m.id}
                      m={m}
                      isComplaint={isComplaint}
                      unmarking={unmarkingId === m.id}
                      onUnmark={isComplaint ? () => handleUnmark(selectedConv.sessionId, m.id) : undefined}
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  m,
  isComplaint,
  unmarking,
  onUnmark,
}: {
  m: { id: string; role: string; content: string; createdAt: string; sentBy: string | null };
  isComplaint: boolean;
  unmarking?: boolean;
  onUnmark?: () => void;
}) {
  const isUser = m.role === "user";
  const isAssistant = m.role === "assistant";
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: isUser ? "flex-start" : isAssistant ? "flex-end" : "center",
    }}>
      <div style={{
        maxWidth: "78%",
        padding: "7px 11px", borderRadius: 10,
        fontSize: 12, lineHeight: 1.5,
        background: isComplaint
          ? "rgba(239,68,68,0.12)"
          : isUser
            ? "var(--app-surface-secondary)"
            : isAssistant
              ? "var(--app-accent-soft, rgba(59,130,246,0.12))"
              : "transparent",
        border: isComplaint ? "1px solid rgba(239,68,68,0.45)" : undefined,
        color: "var(--app-text-primary)",
        whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>
        {m.content}
      </div>
      <div style={{ fontSize: 10, color: "var(--app-text-tertiary)", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
        <span>
          {m.role}
          {m.sentBy ? ` · ${m.sentBy}` : ""}
          {" · "}
          {formatTime(m.createdAt)}
        </span>
        {onUnmark && (
          <button
            onClick={onUnmark}
            disabled={unmarking}
            title="이 메시지를 불만으로 분류한 것을 취소합니다 (해당 카테고리에서 제외)"
            style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              padding: "2px 6px", borderRadius: 4,
              border: "1px solid rgba(239,68,68,0.35)",
              background: unmarking ? "rgba(239,68,68,0.08)" : "transparent",
              color: "#dc2626", fontSize: 10, fontWeight: 500,
              cursor: unmarking ? "wait" : "pointer",
              opacity: unmarking ? 0.6 : 1,
            }}
          >
            {unmarking ? (
              <Loader2 style={{ width: 10, height: 10 }} className="animate-spin" />
            ) : (
              <ShieldOff style={{ width: 10, height: 10 }} />
            )}
            불만 아님
          </button>
        )}
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
