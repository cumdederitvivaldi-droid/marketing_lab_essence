"use client";

import { useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Loader2, Sparkles } from "lucide-react";
import {
  csReportCache,
  csReportKey,
  CS_REPORT_CACHE_MS,
  fetchCsReportDedup,
} from "@/lib/dashboard/cache";

interface ReportMessage {
  role: string;
  content: string;
  sentBy: string | null;
  createdAt: string;
  isEdited: boolean;
}

interface ReportConversation {
  sessionId: string;
  customerName: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  messages: ReportMessage[];
}

interface CsReportResponse {
  counselor: string;
  conversations: ReportConversation[];
  aiReport: {
    summary: string;
    strengths: string[];
    improvements: string[];
  } | null;
  cachedAt: string | null;
}

interface CounselorMetrics {
  total: number | null;
  quoteSent: number | null;
  booked: number | null;
  totalReplies: number;
  aiAsIs: number;
  aiEdited: number;
  aiAsIsRate: number | null;
  repliesPerHour: number | null;
  closuresPerHour: number | null;
  medianResponseTimeMin: number | null;
}

interface Props {
  counselor: string;
  metrics: CounselorMetrics;
  fromDateKst: string;
  toDateKst: string;
  onClose: () => void;
}

export function CounselorReportModal({ counselor, metrics, fromDateKst, toDateKst, onClose }: Props) {
  // 백그라운드 prefetch (lib/dashboard/cache.ts)가 미리 채워둔 캐시가 있으면 즉시 표시 — 로딩 0초.
  // 캐시는 layout 의 4분 주기 prefetch + 모달이 이전에 한번이라도 열렸을 때 채워진다.
  const cachedHit = (() => {
    const c = csReportCache.get(csReportKey(counselor, fromDateKst, toDateKst));
    if (!c) return null;
    return Date.now() - c.ts < CS_REPORT_CACHE_MS ? c.data : null;
  })();

  const [data, setData] = useState<CsReportResponse | null>(cachedHit);
  const [loading, setLoading] = useState(!cachedHit);
  const [error, setError] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);

  // Drag — position
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    const cached = csReportCache.get(csReportKey(counselor, fromDateKst, toDateKst));
    const isFresh = cached && Date.now() - cached.ts < CS_REPORT_CACHE_MS;

    if (isFresh && cached) {
      // 캐시 hit — 즉시 표시, 네트워크 호출 생략
      setData(cached.data);
      setLoading(false);
      setError(null);
      setCurrentIdx(0);
      return;
    }

    // stale 캐시는 화면에 그대로 둔 채 백그라운드로 새로 받기 (overlay 깜빡임 방지)
    if (cached) {
      setData(cached.data);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);

    let cancelled = false;
    fetchCsReportDedup(counselor, metrics, fromDateKst, toDateKst)
      .then((res) => {
        if (cancelled) return;
        if (!res) {
          if (!cached) setError("리포트를 가져오지 못했습니다");
          return;
        }
        setData(res);
        setCurrentIdx(0);
      })
      .catch((err) => {
        if (cancelled) return;
        if (!cached) setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [counselor, fromDateKst, toDateKst, metrics]);

  // ESC 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setCurrentIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setCurrentIdx((i) => Math.min((data?.conversations.length ?? 1) - 1, i + 1));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, data?.conversations.length]);

  function handleDragStart(e: React.MouseEvent) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    document.addEventListener("mousemove", handleDragMove);
    document.addEventListener("mouseup", handleDragEnd);
  }
  function handleDragMove(e: MouseEvent) {
    if (!dragRef.current) return;
    setPos({
      x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.origY + (e.clientY - dragRef.current.startY),
    });
  }
  function handleDragEnd() {
    dragRef.current = null;
    document.removeEventListener("mousemove", handleDragMove);
    document.removeEventListener("mouseup", handleDragEnd);
  }

  const conv = data?.conversations[currentIdx] ?? null;
  const total = data?.conversations.length ?? 0;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.4)", zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--app-card-bg, #fff)", borderRadius: 12,
          width: "min(900px, 90vw)", height: "min(700px, 85vh)",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
          transform: `translate(${pos.x}px, ${pos.y}px)`,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header — drag handle */}
        <div
          onMouseDown={handleDragStart}
          style={{
            padding: "14px 18px", borderBottom: "1px solid var(--app-border)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            cursor: "move", userSelect: "none",
            background: "linear-gradient(180deg, #f8fafc 0%, #fff 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles style={{ width: 16, height: 16, color: "#3b82f6" }} />
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{counselor} CS Report</h3>
            <span style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginLeft: 8 }}>
              최근 {total}건 채팅 + AI 분석
            </span>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", cursor: "pointer", padding: 4,
            display: "flex", alignItems: "center",
          }}>
            <X style={{ width: 18, height: 18, color: "var(--app-text-tertiary)" }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          {loading && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, color: "var(--app-text-tertiary)" }}>
              <Loader2 className="animate-spin" style={{ width: 24, height: 24 }} />
              <div style={{ fontSize: 13 }}>리포트 생성 중...</div>
            </div>
          )}
          {error && <div style={{ color: "#ef4444", fontSize: 13 }}>오류: {error}</div>}

          {data && data.conversations.length === 0 && (
            <div style={{ color: "var(--app-text-tertiary)", fontSize: 13, textAlign: "center", padding: 40 }}>
              해당 기간 응답 채팅 없음
            </div>
          )}

          {data && data.conversations.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, height: "100%" }}>
              {/* 좌측: 채팅 carousel */}
              <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <button
                    onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                    disabled={currentIdx === 0}
                    style={{
                      padding: 6, borderRadius: 6, border: "1px solid var(--app-border)",
                      background: "var(--app-card-bg)", cursor: currentIdx === 0 ? "default" : "pointer",
                      opacity: currentIdx === 0 ? 0.4 : 1,
                    }}
                  >
                    <ChevronLeft style={{ width: 16, height: 16 }} />
                  </button>
                  <div style={{ fontSize: 12, color: "var(--app-text-secondary)" }}>
                    <strong style={{ color: "#3b82f6" }}>#{currentIdx + 1}</strong>
                    <span style={{ color: "var(--app-text-tertiary)" }}> / {total} · </span>
                    <strong>{conv?.customerName ?? "이름미상"}</strong>
                    <span style={{ color: "var(--app-text-tertiary)" }}> · </span>
                    <code style={{
                      fontSize: 11, color: "var(--app-text-secondary)",
                      background: "var(--app-bg-subtle, #f1f5f9)", padding: "1px 5px", borderRadius: 3,
                      fontFamily: "ui-monospace, SF Mono, monospace",
                    }}>{conv?.sessionId ?? ""}</code>
                    <span style={{ color: "var(--app-text-tertiary)" }}> · {conv ? new Date(conv.createdAt).toLocaleDateString("ko-KR") : ""}</span>
                  </div>
                  <button
                    onClick={() => setCurrentIdx((i) => Math.min(total - 1, i + 1))}
                    disabled={currentIdx >= total - 1}
                    style={{
                      padding: 6, borderRadius: 6, border: "1px solid var(--app-border)",
                      background: "var(--app-card-bg)", cursor: currentIdx >= total - 1 ? "default" : "pointer",
                      opacity: currentIdx >= total - 1 ? 0.4 : 1,
                    }}
                  >
                    <ChevronRight style={{ width: 16, height: 16 }} />
                  </button>
                </div>

                <div style={{
                  flex: 1, overflowY: "auto",
                  border: "1px solid var(--app-border)", borderRadius: 8, padding: 12,
                  background: "var(--app-bg-subtle, #fafafa)",
                  display: "flex", flexDirection: "column", gap: 6,
                }}>
                  {conv?.messages.map((m, i) => (
                    <ChatBubble key={i} msg={m} counselorName={counselor} />
                  ))}
                </div>
              </div>

              {/* 우측: AI 분석 */}
              <div style={{
                background: "var(--app-bg-subtle, #f8fafc)", borderRadius: 8,
                border: "1px solid var(--app-border)", padding: 14,
                display: "flex", flexDirection: "column", gap: 12,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                  <Sparkles style={{ width: 14, height: 14, color: "#3b82f6" }} />
                  AI 분석
                </div>
                {data.aiReport ? (
                  <>
                    <ReportBlock title="총평" body={data.aiReport.summary} />
                    <ReportBlock title="잘하는 점" items={data.aiReport.strengths} color="#16a34a" />
                    <ReportBlock title="개선 포인트" items={data.aiReport.improvements} color="#dc2626" />
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>
                    AI 리포트 없음 (다음 호출 시 생성)
                  </div>
                )}
                {data.cachedAt && (
                  <div style={{ fontSize: 10, color: "var(--app-text-tertiary)", marginTop: "auto" }}>
                    분석 시각: {new Date(data.cachedAt).toLocaleString("ko-KR")}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ msg, counselorName }: { msg: ReportMessage; counselorName: string }) {
  const isUser = msg.role === "user";
  const isCounselor = msg.role === "assistant" && msg.sentBy === counselorName;
  const isAi = msg.role === "assistant" && (msg.sentBy === "AI" || msg.sentBy === null) && !msg.isEdited;
  const isOtherAssistant = msg.role === "assistant" && !isCounselor && !isAi;
  const align = isUser ? "flex-start" : "flex-end";
  const bg = isUser ? "#fff" : isCounselor ? "#dbeafe" : isAi ? "#ddd6fe" : "#f1f5f9";
  const label = isUser ? "고객" : isCounselor ? counselorName : isAi ? "AI" : msg.sentBy ?? "시스템";
  const labelColor = isUser ? "#64748b" : isCounselor ? "#1e40af" : isAi ? "#7c3aed" : "#475569";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: align, maxWidth: "85%", alignSelf: align }}>
      <div style={{ fontSize: 10, color: labelColor, marginBottom: 2, fontWeight: 600 }}>
        {label}{isOtherAssistant && msg.sentBy ? "" : ""}
        <span style={{ color: "var(--app-text-tertiary)", fontWeight: 400, marginLeft: 6 }}>
          {new Date(msg.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      <div style={{
        padding: "8px 12px", borderRadius: 8, background: bg, fontSize: 12,
        whiteSpace: "pre-wrap", wordBreak: "break-word",
        border: "1px solid var(--app-border)",
      }}>
        {msg.content}
      </div>
    </div>
  );
}

function ReportBlock({ title, body, items, color }: { title: string; body?: string; items?: string[]; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: color ?? "var(--app-text-secondary)", marginBottom: 4 }}>{title}</div>
      {body && <div style={{ fontSize: 12, color: "var(--app-text-primary)", lineHeight: 1.5 }}>{body}</div>}
      {items && items.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "var(--app-text-primary)", lineHeight: 1.5 }}>
          {items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      )}
      {items && items.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>없음</div>
      )}
    </div>
  );
}
