"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, GripHorizontal, Loader2, ExternalLink } from "lucide-react";

interface OrderOut {
  id: string;
  sessionId: string | null;
  customerName: string;
  phone: string;
  address: string;
  date: string | null;
  timeSlot: string | null;
  totalPrice: number;
  status: string;
  createdAt: string;
  messages: Array<{ id: string; role: string; content: string; createdAt: string; sentBy: string | null }>;
}

interface ApiResp { status: string; orders: OrderOut[] }

interface Props {
  open: boolean;
  status: "cancelled" | "payment_requested" | "prepaid" | null;
  fromIso: string;
  toIso: string;
  onClose: () => void;
}

const TITLE: Record<NonNullable<Props["status"]>, string> = {
  cancelled: "취소된 주문",
  payment_requested: "미결제 주문 (수거 완료 후 미결제)",
  prepaid: "선결제완료 주문 (수거 대기)",
};

const INITIAL_W = 1080;
const INITIAL_H = 680;

export function OrdersDetailModal({ open, status, fromIso, toIso, onClose }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  const [orders, setOrders] = useState<OrderOut[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 첫 렌더 시 가운데
  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    const cx = (window.innerWidth - INITIAL_W) / 2;
    const cy = (window.innerHeight - INITIAL_H) / 2;
    setPos({ x: Math.max(16, cx), y: Math.max(16, cy) });
  }, [open]);

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // status 변경 시 데이터 reset + fetch
  useEffect(() => {
    if (!open || !status) return;
    let cancelled = false;
    setLoading(true);
    setOrders(null);
    setSelectedId(null);
    fetch("/api/new_dashboard/orders-detail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, fromIso, toIso }),
    })
      .then((r) => r.json())
      .then((j: ApiResp) => {
        if (cancelled) return;
        const list = j.orders ?? [];
        setOrders(list);
        setSelectedId(list[0]?.id ?? null);
      })
      .catch(() => { if (!cancelled) setOrders([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, status, fromIso, toIso]);

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

  if (!open || !status) return null;

  const selected = orders?.find((o) => o.id === selectedId) ?? null;

  return (
    <div
      role="dialog"
      aria-label={TITLE[status]}
      style={{
        position: "fixed", left: pos.x, top: pos.y,
        width: INITIAL_W, height: INITIAL_H, zIndex: 9999,
        backgroundColor: "var(--app-modal-bg)",
        border: "1px solid var(--app-border)",
        borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}
    >
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
        <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>
          {TITLE[status]}
          <span style={{ marginLeft: 8, fontSize: 11, color: "var(--app-text-tertiary)", fontWeight: 500 }}>
            · {orders?.length ?? 0}건
          </span>
        </div>
        <button onClick={onClose} aria-label="닫기" style={{
          background: "transparent", border: "none", cursor: "pointer", padding: 4,
          color: "var(--app-text-tertiary)", display: "flex", alignItems: "center",
        }}>
          <X style={{ width: 16, height: 16 }} />
        </button>
      </header>

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "320px 1fr", overflow: "hidden" }}>
        {/* 좌: order 리스트 */}
        <aside style={{ borderRight: "1px solid var(--app-border)", overflowY: "auto" }}>
          {loading ? (
            <div style={{ padding: 30, textAlign: "center", color: "var(--app-text-tertiary)" }}>
              <Loader2 style={{ width: 18, height: 18 }} className="animate-spin" />
            </div>
          ) : !orders || orders.length === 0 ? (
            <div style={{ padding: 20, color: "var(--app-text-tertiary)", fontSize: 12 }}>
              해당 기간 주문이 없습니다
            </div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {orders.map((o) => {
                const isSel = o.id === selectedId;
                return (
                  <li key={o.id}>
                    <button
                      onClick={() => setSelectedId(o.id)}
                      style={{
                        width: "100%", padding: "10px 14px", textAlign: "left",
                        background: isSel ? "var(--app-surface-secondary)" : "transparent",
                        border: "none",
                        borderBottom: "1px solid var(--app-border-light, var(--app-border))",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{o.customerName || "—"}</span>
                        <span style={{ fontSize: 11, color: "var(--app-accent)", fontWeight: 600 }}>
                          {o.totalPrice.toLocaleString()}원
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginBottom: 2 }}>
                        {o.phone || "—"} · {o.date ?? "—"} {o.timeSlot ?? ""}
                      </div>
                      <div style={{
                        fontSize: 11, color: "var(--app-text-secondary)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {o.address || "—"}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* 우: 선택 주문의 채팅 */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {!selected ? (
            <div style={{ padding: 20, color: "var(--app-text-tertiary)", fontSize: 12 }}>
              주문을 선택하세요
            </div>
          ) : (
            <>
              <div style={{
                padding: "8px 14px", borderBottom: "1px solid var(--app-border)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: "var(--app-surface-secondary)",
              }}>
                <div style={{ fontSize: 12 }}>
                  <strong>{selected.customerName || "—"}</strong>
                  <span style={{ marginLeft: 8, color: "var(--app-text-tertiary)" }}>
                    {selected.phone}
                  </span>
                  <span style={{ marginLeft: 8, color: "var(--app-text-tertiary)" }}>
                    {selected.totalPrice.toLocaleString()}원
                  </span>
                </div>
                {selected.sessionId && (
                  <a
                    href={`/conversations?id=${encodeURIComponent(selected.sessionId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      fontSize: 11, color: "var(--app-accent)", textDecoration: "none",
                    }}
                  >
                    원본 열기 <ExternalLink style={{ width: 11, height: 11 }} />
                  </a>
                )}
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                {selected.messages.length === 0 ? (
                  <div style={{ padding: 20, color: "var(--app-text-tertiary)", fontSize: 12, textAlign: "center" }}>
                    {selected.sessionId ? "메시지 없음" : "연결된 세션 없음"}
                  </div>
                ) : (
                  selected.messages.map((m) => <MessageBubble key={m.id} m={m} />)
                )}
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
}: {
  m: { id: string; role: string; content: string; createdAt: string; sentBy: string | null };
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
        background: isUser
          ? "var(--app-surface-secondary)"
          : isAssistant
            ? "var(--app-accent-soft, rgba(59,130,246,0.12))"
            : "transparent",
        color: "var(--app-text-primary)",
        whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>
        {m.content}
      </div>
      <div style={{ fontSize: 10, color: "var(--app-text-tertiary)", marginTop: 2 }}>
        {m.role}
        {m.sentBy ? ` · ${m.sentBy}` : ""}
        {" · "}
        {formatTime(m.createdAt)}
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
