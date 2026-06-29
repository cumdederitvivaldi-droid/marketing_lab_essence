"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, GripHorizontal, Loader2, RefreshCw } from "lucide-react";

const INITIAL_W = 920;
const INITIAL_H = 720; // 실제 height 는 maxHeight CSS 로 viewport 에 맞춰 줄임

type ScoreBucket = "1~2점" | "3점" | "4점" | "5점";

const BUCKET_COLOR: Record<ScoreBucket, string> = {
  "1~2점": "#EF4444",
  "3점": "#F97316",
  "4점": "#EAB308",
  "5점": "#10B981",
};

interface NpsResponseItem {
  id: string;
  customerName: string | null;
  phoneMasked: string;
  scoreBucket: ScoreBucket | null;
  feedbackText: string | null;
  sentAt: string;
  respondedAt: string | null;
}

interface NpsSummary {
  totalSent: number;
  totalResponded: number;
  responseRate: number;
  avgScore: number;
  bucketCounts: Record<ScoreBucket, number>;
}

interface ApiResp {
  summary: NpsSummary;
  responses: NpsResponseItem[];
}

interface Props {
  open: boolean;
  fromDateKst: string;
  toDateKst: string;
  onClose: () => void;
}

export function NpsModal({ open, fromDateKst, toDateKst, onClose }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 중앙 배치
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

  const fetchData = useCallback(async () => {
    if (!fromDateKst || !toDateKst) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/new_dashboard/nps?fromDate=${encodeURIComponent(fromDateKst)}&toDate=${encodeURIComponent(toDateKst)}`,
        { cache: "no-store" },
      );
      const j = (await res.json()) as ApiResp;
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터 로드 실패");
    } finally {
      setLoading(false);
    }
  }, [fromDateKst, toDateKst]);

  useEffect(() => {
    if (!open) return;
    fetchData();
  }, [open, fetchData]);

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

  const [sortKey, setSortKey] = useState<"feedback" | "score" | "name" | "responded">("feedback");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  if (!open) return null;

  const summary = data?.summary;
  const SCORE_RANK: Record<ScoreBucket, number> = { "1~2점": 1, "3점": 2, "4점": 3, "5점": 4 };
  const rawResponses = data?.responses ?? [];
  const responses = [...rawResponses].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "feedback") {
      const al = a.feedbackText?.length ?? 0;
      const bl = b.feedbackText?.length ?? 0;
      cmp = al - bl;
    } else if (sortKey === "score") {
      const ar = a.scoreBucket ? SCORE_RANK[a.scoreBucket] : 0;
      const br = b.scoreBucket ? SCORE_RANK[b.scoreBucket] : 0;
      cmp = ar - br;
    } else if (sortKey === "name") {
      cmp = (a.customerName ?? "").localeCompare(b.customerName ?? "");
    } else {
      const at = a.respondedAt ? new Date(a.respondedAt).getTime() : 0;
      const bt = b.respondedAt ? new Date(b.respondedAt).getTime() : 0;
      cmp = at - bt;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });
  const onSort = (key: "feedback" | "score" | "name" | "responded") => {
    if (sortKey === key) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  return (
    <div
      role="dialog"
      aria-label="NPS 응답"
      style={{
        position: "fixed", left: pos.x, top: pos.y,
        width: INITIAL_W,
        height: INITIAL_H,
        maxHeight: "calc(100vh - 60px)",
        zIndex: 9999,
        backgroundColor: "var(--app-modal-bg)",
        border: "1px solid var(--app-border)",
        borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}
    >
      {/* 헤더 */}
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
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          NPS 응답 — {fromDateKst} ~ {toDateKst}
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={fetchData}
          aria-label="새로고침"
          disabled={loading}
          title="새로고침"
          style={{
            background: "transparent", border: "none", cursor: loading ? "not-allowed" : "pointer", padding: 4,
            color: "var(--app-text-tertiary)", display: "flex", alignItems: "center",
          }}
        >
          <RefreshCw style={{
            width: 16, height: 16,
            animation: loading ? "spin 1s linear infinite" : undefined,
          }} />
        </button>
        <button
          onClick={onClose}
          aria-label="닫기"
          style={{
            background: "transparent", border: "none", cursor: "pointer", padding: 4,
            color: "var(--app-text-tertiary)", display: "flex", alignItems: "center",
          }}
        >
          <X style={{ width: 16, height: 16 }} />
        </button>
      </header>

      {/* 본문 */}
      <div style={{ flex: 1, minHeight: 0, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <Loader2 style={{ width: 24, height: 24, color: "var(--app-accent)" }} className="animate-spin" />
          </div>
        )}

        {error && (
          <div style={{
            padding: "10px 14px",
            backgroundColor: "rgba(239,68,68,0.10)",
            border: "1px solid rgba(239,68,68,0.30)",
            borderRadius: 8, fontSize: 13, color: "#9F1239",
          }}>
            {error}
          </div>
        )}

        {!loading && summary && (
          <>
            {/* 상단 통계 카드 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              <StatCard label="총 발송" value={`${summary.totalSent}건`} />
              <StatCard label="응답률" value={`${summary.responseRate}%`} />
              <StatCard
                label="평균 점수"
                value={summary.totalResponded > 0 ? `${summary.avgScore.toFixed(1)} / 5점` : "응답 대기"}
              />
              <div style={{
                padding: "10px 12px",
                backgroundColor: "var(--app-surface-secondary)",
                border: "1px solid var(--app-border)",
                borderRadius: 8,
              }}>
                <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginBottom: 6 }}>점수 분포</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {(["1~2점", "3점", "4점", "5점"] as ScoreBucket[]).map((b) => (
                    <div key={b} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                      <span style={{
                        display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                        backgroundColor: BUCKET_COLOR[b], flexShrink: 0,
                      }} />
                      <span style={{ color: "var(--app-text-secondary)", width: 36 }}>{b}</span>
                      <span style={{ fontWeight: 600, color: "var(--app-text-primary)" }}>
                        {summary.bucketCounts[b]}건
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 응답 목록 */}
            {responses.length === 0 ? (
              <div style={{ padding: "32px 0", textAlign: "center", color: "var(--app-text-tertiary)", fontSize: 13 }}>
                응답 없음
              </div>
            ) : (
              <div style={{
                border: "1px solid var(--app-border)", borderRadius: 8,
                flex: 1, minHeight: 200, overflowY: "auto",
              }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ backgroundColor: "var(--app-surface-secondary)", position: "sticky", top: 0, zIndex: 1 }}>
                      {([
                        { label: "성함", key: "name" as const },
                        { label: "점수", key: "score" as const },
                        { label: "피드백", key: "feedback" as const },
                        { label: "응답시각", key: "responded" as const },
                      ]).map(({ label, key }) => {
                        const active = sortKey === key;
                        return (
                          <th
                            key={key}
                            onClick={() => onSort(key)}
                            style={{
                              padding: "8px 12px", textAlign: "left", fontWeight: 700,
                              color: active ? "var(--app-accent)" : "var(--app-text-secondary)",
                              borderBottom: "1px solid var(--app-border)",
                              fontSize: 11, cursor: "pointer", userSelect: "none",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {label}
                            <span style={{ marginLeft: 4, fontSize: 9, opacity: active ? 1 : 0.3 }}>
                              {active ? (sortDir === "desc" ? "▼" : "▲") : "▽"}
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {responses.map((r, i) => (
                      <tr
                        key={r.id}
                        style={{
                          borderBottom: i < responses.length - 1 ? "1px solid var(--app-border)" : undefined,
                          backgroundColor: i % 2 === 0 ? "transparent" : "var(--app-surface-secondary)",
                        }}
                      >
                        <td style={{ padding: "8px 12px", color: "var(--app-text-primary)" }}>
                          {r.customerName ?? "—"}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          {r.scoreBucket ? (
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 5,
                              padding: "2px 8px", borderRadius: 999,
                              backgroundColor: `${BUCKET_COLOR[r.scoreBucket]}20`,
                              color: BUCKET_COLOR[r.scoreBucket],
                              fontWeight: 700, fontSize: 11,
                            }}>
                              {r.scoreBucket}
                            </span>
                          ) : "—"}
                        </td>
                        <td style={{
                          padding: "8px 12px",
                          color: r.feedbackText ? "var(--app-text-primary)" : "var(--app-text-tertiary)",
                          maxWidth: 380,
                          verticalAlign: "top",
                        }}>
                          <span style={{
                            display: "block",
                            wordBreak: "break-word",
                            whiteSpace: "pre-wrap",
                            lineHeight: 1.45,
                          }}>
                            {r.feedbackText ?? "—"}
                          </span>
                        </td>
                        <td style={{ padding: "8px 12px", color: "var(--app-text-tertiary)", whiteSpace: "nowrap" }}>
                          {r.respondedAt ? formatKst(r.respondedAt) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: "10px 12px",
      backgroundColor: "var(--app-surface-secondary)",
      border: "1px solid var(--app-border)",
      borderRadius: 8,
    }}>
      <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text-primary)" }}>{value}</div>
    </div>
  );
}

function formatKst(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
