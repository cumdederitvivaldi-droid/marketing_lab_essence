"use client";

import { useEffect, useState, useMemo } from "react";
import { Loader2, ArrowLeft, Calendar } from "lucide-react";
import Link from "next/link";

interface TimeStat { avg: number; median: number; count: number }
interface DistBucket { label: string; count: number; pct: number }
interface DistSet { firstResponse: DistBucket[]; avgReply: DistBucket[]; resolution: DistBucket[] }
interface Stats {
  period: { days: number; from: string; to: string };
  total: number;
  stateCount: { opened: number; closed: number; snoozed: number };
  responseTime: {
    total: { firstResponse: TimeStat; avgReply: TimeStat; resolution: TimeStat };
    operation: { firstResponse: TimeStat; avgReply: TimeStat; resolution: TimeStat };
  };
  distribution: { total: DistSet; operation: DistSet };
  reassignRate: number;
  operatorLeaderboard: Array<{
    name: string; avatarUrl: string | null; count: number;
    resolved: number; replyCount: number;
    repliesPerCase: number;
    activeHours: number;
    repliesPerHour: number | null;
    closuresPerHour: number | null;
    avgFirstResponseTotal: number; avgFirstResponseOp: number;
    medianFirstResponseTotal: number; medianFirstResponseOp: number;
    avgReplyTotal: number; avgReplyOp: number;
    medianReplyTotal: number; medianReplyOp: number;
    avgResolutionTotal: number; avgResolutionOp: number;
    medianResolutionTotal: number; medianResolutionOp: number;
  }>;
  tagCounts: Array<{ tag: string; count: number }>;
  tagCategoryCounts: Array<{ category: string; count: number }>;
  dailyTrend: Array<{ date: string; total: number; closed: number; opened: number }>;
  hourlyDist: number[];
  dayOfWeekDist: number[];
  heatmap: number[][];
}

type ValueMode = "median" | "avg";
type TimeMode = "total" | "operation";
type ChartMode = "daily" | "distribution";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
const DAY_MAP = [1, 2, 3, 4, 5, 6, 0];

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}초`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  if (min < 60) return s > 0 ? `${min}분 ${s}초` : `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

function splitDuration(ms: number): { num: string; unit: string; sub: string } {
  if (ms <= 0) return { num: "—", unit: "", sub: "" };
  const sec = Math.round(ms / 1000);
  if (sec < 60) return { num: String(sec), unit: "초", sub: "" };
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  if (min < 60) return { num: String(min), unit: "분", sub: s > 0 ? `${s}초` : "" };
  const h = Math.floor(min / 60);
  const m = min % 60;
  return { num: String(h), unit: "시간", sub: m > 0 ? `${m}분` : "" };
}

function fmtDate(d: Date) {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [valueMode, setValueMode] = useState<ValueMode>("median");
  const [timeMode, setTimeMode] = useState<TimeMode>("total");
  const [chartMode, setChartMode] = useState<ChartMode>("daily");
  const [showViewOptions, setShowViewOptions] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/channeltalk/stats?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) {
          setStats(d);
          setDateFrom(fmtDate(new Date(d.period.from)));
          setDateTo(fmtDate(new Date(d.period.to)));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  const maxDaily = stats ? Math.max(...stats.dailyTrend.map((d) => d.total), 1) : 1;
  const heatmapMax = stats ? Math.max(...stats.heatmap.flat(), 1) : 1;

  // 시간별 합계 (히트맵 상단 바)
  const hourlyTotals = useMemo(() => {
    if (!stats) return new Array(24).fill(0);
    const totals = new Array(24).fill(0);
    for (const row of stats.heatmap) row.forEach((v, h) => { totals[h] += v; });
    return totals;
  }, [stats]);
  const maxHourlyTotal = Math.max(...hourlyTotals, 1);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", backgroundColor: "var(--app-bg)" }}>
      {/* ─── 헤더 ─── */}
      <div style={{
        padding: "14px 32px", borderBottom: "1px solid var(--app-border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        backgroundColor: "var(--app-surface)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/settings" style={{ color: "var(--app-text-tertiary)", display: "flex" }}>
            <ArrowLeft style={{ width: 20, height: 20 }} />
          </Link>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>상담</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* 날짜 범위 */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 8,
            border: "1px solid var(--app-border)", fontSize: 13,
            color: "var(--app-text-secondary)", backgroundColor: "var(--app-surface)",
          }}>
            <Calendar style={{ width: 14, height: 14 }} />
            <span>{dateFrom} - {dateTo}</span>
          </div>
          {/* 기간 선택 */}
          <div style={{ display: "flex", border: "1px solid var(--app-border)", borderRadius: 8, overflow: "hidden" }}>
            {[7, 14, 30].map((d, i) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                style={{
                  padding: "6px 16px", fontSize: 13, fontWeight: 600,
                  backgroundColor: days === d ? "var(--app-accent)" : "var(--app-surface)",
                  color: days === d ? "#fff" : "var(--app-text-secondary)",
                  border: "none", cursor: "pointer",
                  borderLeft: i > 0 ? "1px solid var(--app-border)" : "none",
                }}
              >
                {d}일
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── 본문 ─── */}
      <div style={{ flex: 1, overflow: "auto", padding: "24px 32px" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 80 }}>
            <Loader2 style={{ width: 32, height: 32, color: "var(--app-accent)", animation: "spin 1s linear infinite" }} />
          </div>
        ) : !stats ? (
          <div style={{ textAlign: "center", padding: 80, color: "var(--app-text-tertiary)" }}>데이터를 불러올 수 없습니다</div>
        ) : (
          <>
            {/* ═══ 응답 ═══ */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>응답</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>
                  {valueMode === "median" ? "중앙값" : "평균값"} · {timeMode === "total" ? "전체 시간" : "운영 시간"} · {chartMode === "daily" ? "일별" : "분포별"}
                </span>
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => setShowViewOptions(!showViewOptions)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                      backgroundColor: "var(--app-surface)", color: "var(--app-text-primary)",
                      border: "1px solid var(--app-border)", cursor: "pointer",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
                    보기 옵션
                  </button>
                  {showViewOptions && (
                    <div style={{
                      position: "absolute", top: "100%", right: 0, marginTop: 6, zIndex: 50,
                      backgroundColor: "var(--app-surface)", border: "1px solid var(--app-border)",
                      borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                      padding: 16, width: 220,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--app-text-primary)", marginBottom: 12 }}>보기 옵션</div>
                      <ViewOption label="값 기준" value={valueMode} options={[{ value: "median", label: "중앙값" }, { value: "avg", label: "평균값" }]} onChange={(v) => setValueMode(v as ValueMode)} />
                      <ViewOption label="시간 기준" value={timeMode} options={[{ value: "total", label: "전체 시간" }, { value: "operation", label: "운영 시간" }]} onChange={(v) => setTimeMode(v as TimeMode)} />
                      <ViewOption label="차트" value={chartMode} options={[{ value: "daily", label: "일별 차트" }, { value: "distribution", label: "분포별 차트" }]} onChange={(v) => setChartMode(v as ChartMode)} />
                      <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginTop: 8, lineHeight: 1.4 }}>
                        담당자 이관율은 분포별 차트를 지원하지 않아요.
                      </div>
                      <button
                        onClick={() => setShowViewOptions(false)}
                        style={{
                          width: "100%", padding: "8px 0", marginTop: 12, borderRadius: 8,
                          backgroundColor: "#8B5CF6", color: "#fff", border: "none",
                          fontSize: 13, fontWeight: 700, cursor: "pointer",
                        }}
                      >
                        적용하기
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {(() => {
              const rt = stats.responseTime[timeMode];
              const dist = stats.distribution[timeMode];
              const val = (s: TimeStat) => valueMode === "median" ? s.median : s.avg;
              const subTxt = (s: TimeStat) => valueMode === "median" ? `평균 ${formatDuration(s.avg)}` : `중앙값 ${formatDuration(s.median)}`;
              const showDist = chartMode === "distribution";
              return (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 }}>
                  <ResponseCard label="상담 요청 후 첫 응답까지의 시간" ms={val(rt.firstResponse)} subText={subTxt(rt.firstResponse)} trend={stats.dailyTrend.map(d => d.total)} dist={showDist ? dist.firstResponse : undefined} />
                  <ResponseCard label="평균 응답 시간" ms={val(rt.avgReply)} subText={subTxt(rt.avgReply)} trend={stats.dailyTrend.map(d => d.total)} dist={showDist ? dist.avgReply : undefined} />
                  <ResponseCard label="상담 요청 후 상담 종료까지의 시간" ms={val(rt.resolution)} subText={subTxt(rt.resolution)} trend={stats.dailyTrend.map(d => d.total)} dist={showDist ? dist.resolution : undefined} />
                  <div style={{ backgroundColor: "var(--app-surface)", borderRadius: 16, border: "1px solid var(--app-border)", padding: "24px 28px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 160 }}>
                    <div style={{ fontSize: 13, color: "var(--app-text-secondary)" }}>담당자 이관율</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                      <span style={{ fontSize: 40, fontWeight: 800, color: "var(--app-text-primary)", lineHeight: 1 }}>{stats.reassignRate}</span>
                      <span style={{ fontSize: 20, fontWeight: 700, color: "var(--app-text-primary)" }}>%</span>
                    </div>
                    <div style={{ height: 1 }} />
                  </div>
                </div>
              );
            })()}

            {/* ═══ 유입 ═══ */}
            <SectionTitle>유입</SectionTitle>

            {/* 히트맵 */}
            <div style={{
              backgroundColor: "var(--app-surface)", borderRadius: 16,
              border: "1px solid var(--app-border)", padding: "24px 20px", marginBottom: 16,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>시간 및 요일</h3>
              </div>

              <div style={{ overflowX: "auto" }}>
                {/* 상단: 시간대별 합계 미니바 */}
                <div style={{ display: "grid", gridTemplateColumns: "28px repeat(24, 1fr)", gap: 2, marginBottom: 2 }}>
                  <div />
                  {hourlyTotals.map((v, h) => (
                    <div key={h} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: 28 }}>
                      <div style={{
                        width: "70%", borderRadius: 2,
                        height: Math.max(1, (v / maxHourlyTotal) * 22),
                        backgroundColor: v > 0 ? "rgba(139, 92, 246, 0.35)" : "transparent",
                      }} />
                    </div>
                  ))}
                </div>

                {/* 시간 헤더 */}
                <div style={{ display: "grid", gridTemplateColumns: "28px repeat(24, 1fr)", gap: 2, marginBottom: 4 }}>
                  <div />
                  {Array.from({ length: 24 }, (_, i) => (
                    <div key={i} style={{ textAlign: "center", fontSize: 10, color: "var(--app-text-tertiary)" }}>{i}</div>
                  ))}
                </div>

                {/* 요일 행 */}
                {DAY_MAP.map((jsDay, rowIdx) => (
                  <div key={rowIdx} style={{ display: "grid", gridTemplateColumns: "28px repeat(24, 1fr)", gap: 2, marginBottom: 2 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-secondary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {DAY_LABELS[rowIdx]}
                    </div>
                    {stats.heatmap[jsDay].map((count, h) => {
                      const intensity = heatmapMax > 0 ? count / heatmapMax : 0;
                      const bg = count === 0
                        ? "rgba(139, 92, 246, 0.06)"
                        : `rgba(139, 92, 246, ${0.12 + intensity * 0.88})`;
                      return (
                        <div
                          key={h}
                          title={`${DAY_LABELS[rowIdx]} ${h}시: ${count}건`}
                          style={{
                            borderRadius: 12, backgroundColor: bg,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: count > 0 ? 11 : 0, fontWeight: intensity > 0.4 ? 700 : 500,
                            color: intensity > 0.45 ? "#fff" : "rgba(139, 92, 246, 0.7)",
                            height: 30, minWidth: 0,
                          }}
                        >
                          {count > 0 ? count : ""}
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* 범례 */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 14 }}>
                  <span style={{ fontSize: 10, color: "var(--app-text-tertiary)" }}>0</span>
                  <div style={{ display: "flex", gap: 2 }}>
                    {[0.06, 0.25, 0.45, 0.65, 0.85].map((v, i) => (
                      <div key={i} style={{ width: 20, height: 10, borderRadius: 5, backgroundColor: `rgba(139, 92, 246, ${0.12 + v * 0.88})` }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 10, color: "var(--app-text-tertiary)" }}>{heatmapMax}</span>
                </div>
              </div>
            </div>

            {/* 상태 카운트 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
              <MiniCard label="전체 상담" value={stats.total} color="var(--app-text-primary)" />
              <MiniCard label="진행중" value={stats.stateCount.opened} color="#3B82F6" />
              <MiniCard label="종료" value={stats.stateCount.closed} color="#10B981" />
              <MiniCard label="보류" value={stats.stateCount.snoozed} color="#F59E0B" />
            </div>

            {/* 일별 추이 */}
            <div style={{
              backgroundColor: "var(--app-surface)", borderRadius: 16,
              border: "1px solid var(--app-border)", padding: 24, marginBottom: 32,
            }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--app-text-primary)", margin: "0 0 20px" }}>일별 상담 추이</h3>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 200 }}>
                {stats.dailyTrend.map((d) => {
                  const cH = (d.closed / maxDaily) * 160;
                  const oH = (d.opened / maxDaily) * 160;
                  return (
                    <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      {d.total > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--app-text-primary)" }}>{d.total}</span>}
                      <div style={{ width: "70%", display: "flex", flexDirection: "column" }}>
                        {d.closed > 0 && <div style={{ height: cH, backgroundColor: "#10B981", borderRadius: d.opened > 0 ? "6px 6px 0 0" : 6 }} />}
                        {d.opened > 0 && <div style={{ height: oH, backgroundColor: "#3B82F6", borderRadius: d.closed > 0 ? "0 0 6px 6px" : 6 }} />}
                        {d.total === 0 && <div style={{ height: 2, backgroundColor: "var(--app-border)" }} />}
                      </div>
                      <span style={{ fontSize: 10, color: "var(--app-text-tertiary)" }}>{d.date.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 14, justifyContent: "center" }}>
                <Leg color="#10B981" label="종료" />
                <Leg color="#3B82F6" label="진행중" />
              </div>
            </div>

            {/* ═══ 퍼포먼스 ═══ */}
            <SectionTitle>퍼포먼스</SectionTitle>

            {/* 오퍼레이터 리더보드 */}
            <div style={{ backgroundColor: "var(--app-surface)", borderRadius: 16, border: "1px solid var(--app-border)", marginBottom: 24, overflow: "hidden" }}>
              <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--app-border)" }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>오퍼레이터 리더보드</h3>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--app-border-light)" }}>
                    <TH align="left">담당자</TH>
                    <TH align="right">담당</TH>
                    <TH align="right">종결</TH>
                    <TH align="right">답변</TH>
                    <TH align="right">case당 답변</TH>
                    <TH align="right">첫응답 ({valueMode === "median" ? "중위" : "평균"})</TH>
                    <TH align="right">평균답변 ({valueMode === "median" ? "중위" : "평균"})</TH>
                    <TH align="right">종결시간 ({valueMode === "median" ? "중위" : "평균"})</TH>
                  </tr>
                </thead>
                <tbody>
                  {stats.operatorLeaderboard.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: "var(--app-text-tertiary)" }}>데이터 없음</td></tr>
                  ) : stats.operatorLeaderboard.map((op) => {
                    const pickResp = timeMode === "operation"
                      ? (valueMode === "median" ? op.medianFirstResponseOp : op.avgFirstResponseOp)
                      : (valueMode === "median" ? op.medianFirstResponseTotal : op.avgFirstResponseTotal);
                    const pickReply = timeMode === "operation"
                      ? (valueMode === "median" ? op.medianReplyOp : op.avgReplyOp)
                      : (valueMode === "median" ? op.medianReplyTotal : op.avgReplyTotal);
                    const pickResolution = timeMode === "operation"
                      ? (valueMode === "median" ? op.medianResolutionOp : op.avgResolutionOp)
                      : (valueMode === "median" ? op.medianResolutionTotal : op.avgResolutionTotal);
                    return (
                      <tr key={op.name} style={{ borderBottom: "1px solid var(--app-border-light)" }}>
                        <TD bold>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            {op.avatarUrl ? (
                              <img src={op.avatarUrl} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: 28, height: 28, borderRadius: "50%", backgroundColor: "#8B5CF6", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                                {op.name.charAt(0)}
                              </div>
                            )}
                            {op.name}
                          </div>
                        </TD>
                        <TD align="right">{op.count.toLocaleString()}</TD>
                        <TD align="right">{op.resolved.toLocaleString()}</TD>
                        <TD align="right">{op.replyCount.toLocaleString()}</TD>
                        <TD align="right">{op.repliesPerCase.toFixed(2)}</TD>
                        <TD align="right">{pickResp > 0 ? formatDuration(pickResp) : "—"}</TD>
                        <TD align="right">{pickReply > 0 ? formatDuration(pickReply) : "—"}</TD>
                        <TD align="right">{pickResolution > 0 ? formatDuration(pickResolution) : "—"}</TD>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 상담 태그 */}
            <div style={{ backgroundColor: "var(--app-surface)", borderRadius: 16, border: "1px solid var(--app-border)", marginBottom: 24, overflow: "hidden" }}>
              <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--app-border)" }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>상담 태그</h3>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--app-border-light)" }}>
                    <TH align="left">이름</TH>
                    <TH align="right">상담 인입량</TH>
                    <TH align="right" w={80}>비율</TH>
                  </tr>
                </thead>
                <tbody>
                  {stats.tagCategoryCounts.length === 0 ? (
                    <tr><td colSpan={3} style={{ padding: 24, textAlign: "center", color: "var(--app-text-tertiary)" }}>데이터 없음</td></tr>
                  ) : stats.tagCategoryCounts.map((tc) => {
                    const total = stats.tagCategoryCounts.reduce((s, t) => s + t.count, 0);
                    const pct = total > 0 ? ((tc.count / total) * 100).toFixed(1) : "0";
                    const children = stats.tagCounts.filter((t) => {
                      const cat = t.tag.includes("/") ? t.tag.split("/")[0] : t.tag;
                      return cat === tc.category;
                    });
                    return [
                      <tr key={tc.category} style={{ borderBottom: "1px solid var(--app-border-light)" }}>
                        <TD bold>
                          {children.length > 0 && <span style={{ marginRight: 6, color: "var(--app-text-tertiary)" }}>▸</span>}
                          {tc.category}
                        </TD>
                        <TD align="right">{tc.count.toLocaleString()}</TD>
                        <TD align="right" muted>{pct}%</TD>
                      </tr>,
                      ...children.filter(c => c.tag !== tc.category).map((ct) => (
                        <tr key={ct.tag} style={{ borderBottom: "1px solid var(--app-border-light)", backgroundColor: "var(--app-bg)" }}>
                          <td style={{ padding: "8px 24px 8px 48px", fontSize: 13, color: "var(--app-text-secondary)" }}>{ct.tag}</td>
                          <td style={{ padding: "8px 24px", textAlign: "right", fontSize: 13, color: "var(--app-text-secondary)" }}>{ct.count.toLocaleString()}</td>
                          <td style={{ padding: "8px 24px", textAlign: "right", fontSize: 13, color: "var(--app-text-tertiary)" }}>{total > 0 ? ((ct.count / total) * 100).toFixed(1) : "0"}%</td>
                        </tr>
                      )),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── 공통 컴포넌트 ───

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--app-text-primary)", margin: "0 0 16px" }}>{children}</h2>;
}

function TH({ children, align = "left", w }: { children: React.ReactNode; align?: string; w?: number }) {
  return <th style={{ padding: "10px 24px", textAlign: align as never, fontWeight: 600, color: "var(--app-text-tertiary)", fontSize: 12, ...(w ? { width: w } : {}) }}>{children}</th>;
}

function TD({ children, align, bold, muted }: { children: React.ReactNode; align?: string; bold?: boolean; muted?: boolean }) {
  return (
    <td style={{
      padding: "12px 24px",
      textAlign: (align ?? "left") as never,
      fontWeight: bold ? 600 : 400,
      color: muted ? "var(--app-text-secondary)" : "var(--app-text-primary)",
    }}>
      {children}
    </td>
  );
}

function ResponseCard({ label, ms, subText, trend, dist }: {
  label: string; ms: number; subText: string; trend: number[]; dist?: DistBucket[];
}) {
  const { num, unit, sub } = splitDuration(ms);

  // SVG 곡선
  const max = Math.max(...trend, 1);
  const w = 240;
  const h = 50;
  const pts = trend.map((v, i) => ({
    x: (i / Math.max(trend.length - 1, 1)) * w,
    y: h - (v / max) * h * 0.85 - h * 0.05,
  }));

  let path = `M ${pts[0]?.x ?? 0} ${pts[0]?.y ?? h}`;
  for (let i = 1; i < pts.length; i++) {
    const cp1x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * 0.4;
    const cp2x = pts[i].x - (pts[i].x - pts[i - 1].x) * 0.4;
    path += ` C ${cp1x} ${pts[i - 1].y} ${cp2x} ${pts[i].y} ${pts[i].x} ${pts[i].y}`;
  }

  const maxPct = dist ? Math.max(...dist.map((d) => d.pct), 1) : 1;

  return (
    <div style={{
      backgroundColor: "var(--app-surface)", borderRadius: 16,
      border: "1px solid var(--app-border)", padding: "24px 28px 16px",
      display: "flex", flexDirection: "column", minHeight: 160,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ fontSize: 13, color: "var(--app-text-secondary)", marginBottom: 10 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginBottom: 4 }}>
        <span style={{ fontSize: 38, fontWeight: 800, color: "var(--app-text-primary)", lineHeight: 1 }}>{num}</span>
        <span style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text-primary)" }}>{unit}</span>
        {sub && <span style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text-primary)", marginLeft: 1 }}>{sub}</span>}
      </div>
      <div style={{ fontSize: 12, color: "var(--app-text-tertiary)", marginBottom: 4 }}>{subText}</div>

      {/* 분포별 바 차트 */}
      {dist ? (
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 5, paddingTop: 8 }}>
          {dist.map((d) => (
            <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--app-text-tertiary)", width: 70, flexShrink: 0, textAlign: "right" }}>{d.label}</span>
              <div style={{ flex: 1, height: 16, backgroundColor: "rgba(139,92,246,0.08)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 4,
                  width: `${(d.pct / maxPct) * 100}%`,
                  backgroundColor: "#8B5CF6",
                  minWidth: d.pct > 0 ? 2 : 0,
                }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-secondary)", width: 42, textAlign: "right" }}>{d.pct}%</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: "auto", marginLeft: -28, marginRight: -28, marginBottom: -16, height: 56 }}>
          <svg width="100%" height="56" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
            <defs>
              <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(139,92,246,0.15)" />
                <stop offset="100%" stopColor="rgba(139,92,246,0)" />
              </linearGradient>
            </defs>
            <path d={`${path} L ${pts[pts.length - 1]?.x ?? w} ${h} L 0 ${h} Z`} fill="url(#lineGrad)" />
            <path d={path} fill="none" stroke="#8B5CF6" strokeWidth="2" />
          </svg>
        </div>
      )}
    </div>
  );
}

function MiniCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      backgroundColor: "var(--app-surface)", borderRadius: 12,
      border: "1px solid var(--app-border)", padding: "14px 18px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
    }}>
      <span style={{ fontSize: 13, color: "var(--app-text-secondary)" }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 800, color }}>{value.toLocaleString()}</span>
    </div>
  );
}

function Leg({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ fontSize: 12, color: "var(--app-text-tertiary)", display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color, display: "inline-block" }} /> {label}
    </span>
  );
}

function ViewOption({ label, value, options, onChange }: {
  label: string; value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <div style={{ display: "flex", gap: 4 }}>
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1, padding: "6px 8px", fontSize: 12, fontWeight: 600, borderRadius: 6,
              border: value === opt.value ? "1px solid #8B5CF6" : "1px solid var(--app-border)",
              backgroundColor: value === opt.value ? "rgba(139,92,246,0.1)" : "transparent",
              color: value === opt.value ? "#8B5CF6" : "var(--app-text-secondary)",
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
