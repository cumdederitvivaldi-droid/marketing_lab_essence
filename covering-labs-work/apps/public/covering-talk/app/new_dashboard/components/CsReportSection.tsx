"use client";

import { useEffect, useState } from "react";
import { CounselorReportModal } from "./CounselorReportModal";

interface AssigneeMetrics {
  name: string;
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

interface AnalyticsResponse {
  assignees: AssigneeMetrics[];
  total: number;
}

interface Props {
  fromDateKst: string;   // "2026-04-01"
  toDateKst: string;     // "2026-04-30"
}

export function CsReportSection({ fromDateKst, toDateKst }: Props) {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<AssigneeMetrics | null>(null);

  useEffect(() => {
    if (!fromDateKst || !toDateKst) return;
    setLoading(true);
    setError(null);
    fetch(`/api/dashboard/analytics?startDate=${fromDateKst}&endDate=${toDateKst}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res: AnalyticsResponse & { error?: string }) => {
        if (res.error) { setError(res.error); setData(null); return; }
        setData(res);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unknown error"))
      .finally(() => setLoading(false));
  }, [fromDateKst, toDateKst]);

  const visibleAssignees = (data?.assignees ?? []).filter((a) => a.name !== "미배정");
  const totalReplies = visibleAssignees.reduce((s, a) => s + a.totalReplies, 0);
  const botReplies = visibleAssignees.filter((a) => a.name === "AI").reduce((s, a) => s + a.totalReplies, 0);
  const counselorAiAsIs = visibleAssignees.filter((a) => a.name !== "AI").reduce((s, a) => s + a.aiAsIs, 0);
  const aiReplies = botReplies + counselorAiAsIs;
  const humanReplies = visibleAssignees.filter((a) => a.name !== "AI").reduce((s, a) => s + a.aiEdited, 0);
  const aiPct = totalReplies > 0 ? ((aiReplies / totalReplies) * 100).toFixed(1) : "0";
  const humanPct = totalReplies > 0 ? ((humanReplies / totalReplies) * 100).toFixed(1) : "0";
  const fmt = (v: number | null) => v === null ? "—" : String(v);

  return (
    <>
      <div style={{
        background: "var(--app-card-bg)", borderRadius: 12, padding: 16,
        border: "1px solid var(--app-border)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>CS Report — 상담사별 퍼포먼스</h3>
          <span style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>
            리포트 버튼 클릭 시 최근 10건 채팅 + AI 분석
          </span>
        </div>

        {error && <div style={{ color: "#ef4444", fontSize: 13, padding: 8 }}>오류: {error}</div>}
        {loading && !data && <div style={{ color: "var(--app-text-tertiary)", fontSize: 13, padding: 12 }}>로딩 중...</div>}
        {data && visibleAssignees.length === 0 && (
          <div style={{ textAlign: "center", padding: 24, color: "var(--app-text-tertiary)", fontSize: 14 }}>데이터 없음</div>
        )}

        {data && visibleAssignees.length > 0 && (
          <>
            {/* 요약 카드 */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16,
            }}>
              <SummaryCard label="총답변" value={totalReplies.toLocaleString()} sub={`상담 ${data.total.toLocaleString()}건`} color="var(--app-text-primary)" />
              <SummaryCard label="AI 자동 답변" value={aiReplies.toLocaleString()} sub={`${aiPct}%`} color="#1AA3FF" />
              <SummaryCard label="상담사 답변" value={humanReplies.toLocaleString()} sub={`${humanPct}%`} color="#20C997" />
            </div>

            {/* 컴팩트 테이블 */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--app-border)" }}>
                    <Th align="left">담당자</Th>
                    <Th>상담</Th>
                    <Th>견적</Th>
                    <Th>예약 (전환율)</Th>
                    <Th>총답변</Th>
                    <Th>AI 답변</Th>
                    <Th>시간당 (답·종)</Th>
                    <Th>응답중위(분)</Th>
                    <Th>리포트</Th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAssignees.map((a, i) => {
                    const quoteRate = (a.total !== null && a.quoteSent !== null && a.total > 0)
                      ? `${((a.quoteSent / a.total) * 100).toFixed(0)}%` : null;
                    const bookedRate = (a.total !== null && a.booked !== null && a.total > 0)
                      ? `${((a.booked / a.total) * 100).toFixed(0)}%` : null;
                    return (
                      <tr key={a.name} style={{ borderBottom: "1px solid var(--app-border)" }}>
                        <td style={{ padding: "10px 8px", fontSize: 14 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                              width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                              backgroundColor: a.name === "AI" ? "var(--app-tag-blue-bg)"
                                : i === 0 ? "#F59E0B" : i === 1 ? "#94A3B8" : i === 2 ? "#CD7F32" : "var(--app-surface-secondary)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 11, fontWeight: 700,
                              color: a.name === "AI" ? "#1AA3FF" : i < 3 ? "#fff" : "var(--app-text-tertiary)",
                            }}>{a.name === "AI" ? "AI" : i + 1}</div>
                            <span style={{ fontWeight: 600, color: "var(--app-text-primary)", whiteSpace: "nowrap" }}>{a.name}</span>
                          </div>
                        </td>
                        <Td>{fmt(a.total)}</Td>
                        <Td primary={fmt(a.quoteSent)} sub={quoteRate ?? undefined} subColor="#20C997" />
                        <Td primary={fmt(a.booked)} sub={bookedRate ?? undefined} subColor="var(--app-tag-purple-text)" />
                        <Td>{a.totalReplies.toLocaleString()}</Td>
                        <Td primary={a.aiAsIs.toLocaleString()} sub={a.aiAsIsRate === null ? undefined : `${a.aiAsIsRate}%`} subColor="#1AA3FF" />
                        <Td primary={fmt(a.repliesPerHour)} sub={a.closuresPerHour === null ? undefined : `종 ${a.closuresPerHour}`} subColor="var(--app-text-tertiary)" />
                        <Td>{fmt(a.medianResponseTimeMin)}</Td>
                        <td style={{ padding: "10px 8px", textAlign: "center" }}>
                          {a.name === "AI" ? (
                            <span style={{ color: "var(--app-text-tertiary)", fontSize: 12 }}>—</span>
                          ) : (
                            <button
                              onClick={() => setReportTarget(a)}
                              style={{
                                padding: "5px 10px", borderRadius: 6, border: "1px solid var(--app-border)",
                                background: "var(--app-card-bg)", fontSize: 12, fontWeight: 500,
                                color: "var(--app-text-primary)", cursor: "pointer",
                              }}
                            >
                              리포트
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {reportTarget && (
        <CounselorReportModal
          counselor={reportTarget.name}
          metrics={{
            total: reportTarget.total,
            quoteSent: reportTarget.quoteSent,
            booked: reportTarget.booked,
            totalReplies: reportTarget.totalReplies,
            aiAsIs: reportTarget.aiAsIs,
            aiEdited: reportTarget.aiEdited,
            aiAsIsRate: reportTarget.aiAsIsRate,
            repliesPerHour: reportTarget.repliesPerHour,
            closuresPerHour: reportTarget.closuresPerHour,
            medianResponseTimeMin: reportTarget.medianResponseTimeMin,
          }}
          fromDateKst={fromDateKst}
          toDateKst={toDateKst}
          onClose={() => setReportTarget(null)}
        />
      )}
    </>
  );
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{
      padding: 14, borderRadius: 8, background: "var(--app-bg-subtle, #f8fafc)",
      border: "1px solid var(--app-border)",
    }}>
      <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function Th({ children, align = "center" }: { children: React.ReactNode; align?: "left" | "center" }) {
  return (
    <th style={{
      padding: "10px 8px", fontSize: 11, fontWeight: 600,
      color: "var(--app-text-tertiary)", textAlign: align as "left" | "center",
      textTransform: "uppercase", letterSpacing: 0.3,
    }}>{children}</th>
  );
}

function Td({ children, primary, sub, subColor }: {
  children?: React.ReactNode; primary?: string; sub?: string; subColor?: string;
}) {
  return (
    <td style={{ padding: "10px 8px", fontSize: 14, color: "var(--app-text-primary)", textAlign: "center" }}>
      {primary !== undefined ? (
        <>
          <div>{primary}</div>
          {sub && <div style={{ fontSize: 11, color: subColor ?? "var(--app-text-tertiary)", marginTop: 2 }}>{sub}</div>}
        </>
      ) : children}
    </td>
  );
}
