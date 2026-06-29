"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Phase } from "@/lib/ai/phases";
import { PHASE_GROUPS, JourneyMapData, PhaseColumnData, AssigneeRatio } from "@/lib/dashboard/types";
import { CellWithNote } from "./NoteCellButton";

interface JourneyMapSectionProps {
  data: JourneyMapData | null;
  loading?: boolean;
  /** phase별 이탈 사유 분류 로딩 (P2/P4/P5) */
  churnReasonsLoading?: Record<string, boolean>;
  /** 이탈 사유 뱃지 클릭 시 호출 — 모달 열기 */
  onChurnReasonClick?: (phase: string, reason: string) => void;
  /** 비교 기간의 daily funnel — 있으면 차트에 dashed 오버레이 */
  compareDailyFunnel?: JourneyMapData["dailyFunnel"] | null;
}

export function JourneyMapSection({ data, loading, churnReasonsLoading, onChurnReasonClick, compareDailyFunnel }: JourneyMapSectionProps) {
  return (
    <section style={sectionStyle}>
      <header>
        <h2 style={titleStyle}>Customer Journey Map</h2>
        <p style={subStyle}>
          {data ? `${data.totalStarted.toLocaleString()}명이 여정을 시작했습니다.` : "—"}
        </p>
      </header>

      {loading || !data ? (
        <div style={emptyStyle}>{loading ? "로딩 중…" : "데이터 없음"}</div>
      ) : (
        <>
          <JourneyTable
            columns={data.columns}
            churnReasonsLoading={churnReasonsLoading}
            onChurnReasonClick={onChurnReasonClick}
          />
          <DailyFunnelChart points={data.dailyFunnel} comparePoints={compareDailyFunnel ?? null} />
        </>
      )}
    </section>
  );
}

// ─── 메인 표 ──────────────────────────────────

function JourneyTable({
  columns,
  churnReasonsLoading,
  onChurnReasonClick,
}: {
  columns: PhaseColumnData[];
  churnReasonsLoading?: Record<string, boolean>;
  onChurnReasonClick?: (phase: string, reason: string) => void;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={{ ...thHeaderStyle, width: 110, textAlign: "left" }}>지표</th>
            {PHASE_GROUPS.map((g) => (
              <th key={g.label} colSpan={g.phases.length} style={groupHeaderCellStyle}>
                <div
                  style={{
                    ...groupHeaderInnerStyle,
                    backgroundColor: g.bg,
                    color: g.fg,
                    border: `1px solid ${g.border}`,
                  }}
                >
                  {g.label}
                </div>
              </th>
            ))}
          </tr>
          <tr>
            <th style={subHeaderStyle}></th>
            {columns.map((c) => (
              <th key={c.phase} style={subHeaderStyle}>
                <div style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>
                  {phaseShortLabel(c.phase)}
                </div>
                <div style={{ fontSize: 13, color: "var(--app-text-primary)" }}>{c.shortName}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <Row
            label="소요 시간"
            hint="해당 Phase 진입 → 다음 Phase 전이까지 평균. 24시간 안에 전이 못 한 이탈 세션은 제외."
            cells={columns.map((c) => (
              <CellWithNote key={c.phase} section="journey" cellKey={`${c.phase}:duration`}>
                <span style={{ color: c.durationIsAlert ? "#EF4444" : "var(--app-text-primary)", fontWeight: 600 }}>
                  {c.durationLabel}
                </span>
              </CellWithNote>
            ))}
          />
          <Row
            label="전환율"
            hint="전체 P1 시작자 대비 이 Phase 도달률 (Funnel). 후반으로 갈수록 단조 감소가 정상. P8 수거완료는 orders.status='completed' 기준."
            cells={columns.map((c) => (
              <CellWithNote key={c.phase} section="journey" cellKey={`${c.phase}:conversion`}>
                <ConversionCell col={c} />
              </CellWithNote>
            ))}
          />
          <Row
            label="이탈 상태"
            hint="이탈자의 status 분류 — P2: 오인입/야간수거/무응답 (= P1-P2). P4: 오인입/야간수거/상담완료/기타 (= P2-P4). 그 외 phase 는 비워둠."
            cells={columns.map((c) => (
              <CellWithNote key={c.phase} section="journey" cellKey={`${c.phase}:churn_status`}>
                <KeywordCell items={c.churnStatuses} />
              </CellWithNote>
            ))}
          />
          <Row
            label="이탈 사유"
            hint="이탈 세션의 마지막 고객 발화를 AI(Haiku)가 카테고리(비싸다/일정안맞음/무응답/변심/다른견적/서비스문의/검토중/종료/기타)로 분류. P2/P4/P5 + P8(예약취소) 적용. 뱃지 클릭 시 대화 list 모달."
            cells={columns.map((c) => {
              const isClassifiedPhase = c.phase === "phase_2" || c.phase === "phase_4" || c.phase === "phase_5" || c.phase === "phase_8";
              const isLoading = isClassifiedPhase && churnReasonsLoading?.[c.phase];
              return (
                <CellWithNote key={c.phase} section="journey" cellKey={`${c.phase}:churn_reason`}>
                  {isLoading ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--app-text-tertiary)" }}>
                      <Loader2 className="animate-spin" style={{ width: 11, height: 11 }} />
                      분류 중…
                    </span>
                  ) : (
                    <KeywordCell
                      items={c.churnReasons}
                      onClick={isClassifiedPhase && onChurnReasonClick
                        ? (kw) => onChurnReasonClick(c.phase, kw)
                        : undefined}
                    />
                  )}
                </CellWithNote>
              );
            })}
          />
          <Row
            label="상담 건수"
            hint="해당 Phase 도달 상담 건수 (unique 세션). 보조 표기는 직전 메인 phase 대비 절대 증감."
            cells={columns.map((c) => (
              <CellWithNote key={c.phase} section="journey" cellKey={`${c.phase}:count`}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    {c.reachedCount.toLocaleString()}건
                  </span>
                  {c.reachedDelta != null && (
                    <span style={{
                      fontSize: 10, fontWeight: 600,
                      color: c.reachedDelta < 0 ? "#EF4444" : "#10B981",
                    }}>
                      {c.reachedDelta > 0 ? "+" : ""}{c.reachedDelta.toLocaleString()}
                    </span>
                  )}
                </div>
              </CellWithNote>
            ))}
          />
        </tbody>
      </table>
    </div>
  );
}

function Row({ label, cells, hint }: { label: string; cells: React.ReactNode[]; hint?: string }) {
  return (
    <tr>
      <td style={{
        ...tdStyle, textAlign: "left", fontWeight: 600,
        color: "var(--app-text-secondary)", fontSize: 12,
      }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {label}
          {hint && <HintIcon text={hint} />}
        </span>
      </td>
      {cells.map((c, i) => (
        <td key={i} style={tdStyle}>
          {c}
        </td>
      ))}
    </tr>
  );
}

function HintIcon({ text }: { text: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <span
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      style={{ position: "relative", display: "inline-block", cursor: "help" }}
    >
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 14, height: 14, borderRadius: "50%",
        fontSize: 9, fontWeight: 700,
        backgroundColor: "var(--app-surface-secondary)",
        color: "var(--app-text-tertiary)",
        border: "1px solid var(--app-border)",
      }}>
        ?
      </span>
      {open && (
        <span
          role="tooltip"
          style={{
            position: "absolute", left: "100%", top: "50%",
            transform: "translateY(-50%)",
            marginLeft: 8, padding: "6px 10px",
            backgroundColor: "var(--app-text-primary)",
            color: "var(--app-bg)",
            fontSize: 11, lineHeight: 1.5,
            borderRadius: 6, whiteSpace: "normal",
            minWidth: 200, maxWidth: 280,
            boxShadow: "var(--app-shadow-lg, 0 4px 12px rgba(0,0,0,0.15))",
            zIndex: 50,
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

function ConversionCell({ col }: { col: PhaseColumnData }) {
  // rate = 전체 P1 시작자 대비 이 Phase 도달률 (Funnel) — 후반으로 갈수록 감소가 정상
  const rate = col.conversionRate;
  const delta = col.conversionDelta;
  const color = "var(--app-accent)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, fontSize: 13, fontWeight: 700 }}>
        <span style={{ color: "var(--app-text-primary)" }}>{rate.toFixed(1)}%</span>
        {delta != null && (
          <span style={{ fontSize: 10, color: delta < 0 ? "#EF4444" : "#10B981" }}>
            {delta > 0 ? "+" : ""}{delta.toFixed(1)}p
          </span>
        )}
      </div>
      <div style={{ fontSize: 10, color: "var(--app-text-tertiary)", fontWeight: 500 }}>
        {col.reachedCount.toLocaleString()}건
      </div>
      <div style={{
        width: "100%", height: 4, borderRadius: 2,
        backgroundColor: "var(--app-surface-secondary)", overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: `${Math.min(100, rate)}%`,
          backgroundColor: color, borderRadius: 2,
        }} />
      </div>
    </div>
  );
}

function KeywordCell({
  items,
  onClick,
}: {
  items: { keyword: string; count: number }[];
  onClick?: (keyword: string) => void;
}) {
  if (!items || items.length === 0) {
    return <span style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>—</span>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center" }}>
      {items.map((k) => {
        const clickable = !!onClick;
        return (
          <button
            key={k.keyword}
            type="button"
            onClick={clickable ? () => onClick!(k.keyword) : undefined}
            disabled={!clickable}
            style={{
              ...kwBadge,
              border: "none",
              cursor: clickable ? "pointer" : "default",
              transition: "transform 0.1s, box-shadow 0.1s",
            }}
            onMouseEnter={(e) => {
              if (clickable) {
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.boxShadow = "0 1px 4px rgba(159,18,57,0.20)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {k.keyword} <span style={{ color: "#9F1239", fontWeight: 700 }}>{k.count}</span>
          </button>
        );
      })}
    </div>
  );
}

function AssigneeRatioCell({ ratio }: { ratio: AssigneeRatio | null }) {
  if (!ratio || ratio.total === 0) {
    return <span style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>—</span>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "stretch", minWidth: 80 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700 }}>
        <span style={{ color: "#6366F1" }}>AI {ratio.aiPct.toFixed(0)}%</span>
        <span style={{ color: "#10B981" }}>사람 {ratio.humanPct.toFixed(0)}%</span>
      </div>
      <div
        title={`AI ${ratio.aiCount.toLocaleString()} · 사람 ${ratio.humanCount.toLocaleString()} (총 ${ratio.total.toLocaleString()}회)`}
        style={{
          display: "flex", height: 6, borderRadius: 3, overflow: "hidden",
          backgroundColor: "var(--app-surface-secondary)",
        }}
      >
        <div style={{ width: `${ratio.aiPct}%`, backgroundColor: "#6366F1" }} />
        <div style={{ width: `${ratio.humanPct}%`, backgroundColor: "#10B981" }} />
      </div>
      <div style={{ fontSize: 10, color: "var(--app-text-tertiary)", textAlign: "center" }}>
        총 {ratio.total.toLocaleString()}회
      </div>
    </div>
  );
}

// ─── 일별 funnel 시계열 그래프 ──────────────────────────────────

interface DailyFunnelPoint {
  date: string;
  intake: number;
  quote: number;
  booked: number;
}

// Bar+Line 같은 dataKey 라 중복 표시되는 걸 막기 위한 커스텀 Tooltip
// — payload 중 dataKey 별 첫 항목만 (Bar 가 먼저 등록되니 자연스럽게 Bar 만 살음)
interface TooltipPayload {
  dataKey?: string | number;
  name?: string;
  value?: number | string;
  color?: string;
}
interface TooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string | number;
}
function CustomTooltip({ active, payload, label }: TooltipProps): React.ReactElement | null {
  if (!active || !payload || payload.length === 0) return null;
  const seen = new Set<string>();
  const items: TooltipPayload[] = [];
  for (const p of payload) {
    const k = String(p.dataKey ?? "");
    if (seen.has(k)) continue;
    seen.add(k);
    if (p.name) items.push(p);
  }
  return (
    <div style={{
      padding: "6px 10px",
      backgroundColor: "var(--app-modal-bg)",
      border: "1px solid var(--app-border)",
      borderRadius: 6, fontSize: 12,
      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
    }}>
      <div style={{ fontWeight: 700, color: "var(--app-text-primary)", marginBottom: 4 }}>{label}</div>
      {items.map((p) => (
        <div key={String(p.dataKey)} style={{ color: p.color, lineHeight: 1.6 }}>
          {p.name} : <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
}

function DailyFunnelChart({ points, comparePoints }: { points: DailyFunnelPoint[]; comparePoints: DailyFunnelPoint[] | null }) {
  if (!points || points.length === 0) {
    return null;
  }

  const compareMode = !!comparePoints && comparePoints.length > 0;

  // 비교 모드: Day index 정렬 — D1, D2, D3... 길이가 다르면 짧은 쪽까지만 매칭, 긴 쪽 나머지는 단독 표기
  // 비교 OFF: 기존 "M/D" 날짜 라벨
  type ChartRow = {
    label: string;
    intake: number; quote: number; booked: number;
    compare_intake?: number; compare_quote?: number; compare_booked?: number;
    currentDate?: string; compareDate?: string;
  };
  const data: ChartRow[] = compareMode
    ? (() => {
        const maxLen = Math.max(points.length, comparePoints!.length);
        const rows: ChartRow[] = [];
        for (let i = 0; i < maxLen; i++) {
          const cur = points[i];
          const cmp = comparePoints![i];
          rows.push({
            label: `D${i + 1}`,
            intake: cur?.intake ?? 0,
            quote: cur?.quote ?? 0,
            booked: cur?.booked ?? 0,
            compare_intake: cmp?.intake,
            compare_quote: cmp?.quote,
            compare_booked: cmp?.booked,
            currentDate: cur?.date,
            compareDate: cmp?.date,
          });
        }
        return rows;
      })()
    : points.map((p) => ({
        label: p.date.slice(5).replace("-", "/"),
        intake: p.intake, quote: p.quote, booked: p.booked,
        currentDate: p.date,
      }));

  return (
    <div style={{
      padding: 14,
      backgroundColor: "var(--app-surface)",
      borderRadius: 10,
      border: "1px solid var(--app-border)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          일별 funnel — 인입 · 견적 · 전환
          {compareMode && <span style={{ fontSize: 11, fontWeight: 400, color: "var(--app-text-tertiary)", marginLeft: 8 }}>(현재 = bar / 비교 = 점선)</span>}
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--app-text-tertiary)" }}>
          <Legend color="#3B82F6" label="인입" />
          <Legend color="#F59E0B" label="견적" />
          <Legend color="#10B981" label="전환" />
        </div>
      </div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -8 }} barCategoryGap="20%" barGap={2}>
            <XAxis dataKey="label" stroke="var(--app-text-tertiary)" tick={{ fontSize: 10 }} />
            <YAxis stroke="var(--app-text-tertiary)" tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} content={CustomTooltip as never} />
            <Bar dataKey="intake" name="인입" fill="#3B82F6" radius={[3, 3, 0, 0]} />
            <Bar dataKey="quote" name="견적" fill="#F59E0B" radius={[3, 3, 0, 0]} />
            <Bar dataKey="booked" name="전환" fill="#10B981" radius={[3, 3, 0, 0]} />
            <Line type="monotone" dataKey="intake" name="" stroke="#3B82F6" strokeOpacity={0.45} strokeWidth={1.5} dot={false} legendType="none" isAnimationActive={false} />
            <Line type="monotone" dataKey="quote"  name="" stroke="#F59E0B" strokeOpacity={0.45} strokeWidth={1.5} dot={false} legendType="none" isAnimationActive={false} />
            <Line type="monotone" dataKey="booked" name="" stroke="#10B981" strokeOpacity={0.45} strokeWidth={1.5} dot={false} legendType="none" isAnimationActive={false} />
            {compareMode && (
              <>
                <Line type="monotone" dataKey="compare_intake" name="인입(비교)" stroke="#3B82F6" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="compare_quote"  name="견적(비교)" stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="compare_booked" name="전환(비교)" stroke="#10B981" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 8, height: 2, backgroundColor: color, borderRadius: 1 }} />
      {label}
    </span>
  );
}

// ─── 인사이트 + 메타 ──────────────────────────────────

function InsightBar({ text, loading }: { text: string | null; loading?: boolean }) {
  if (!text && !loading) return null;
  const isLoading = loading && !text;
  return (
    <div style={{
      padding: "10px 14px",
      backgroundColor: isLoading ? "var(--app-surface-secondary)" : "rgba(239,68,68,0.08)",
      border: `1px solid ${isLoading ? "var(--app-border)" : "rgba(239,68,68,0.20)"}`,
      borderRadius: 10,
      fontSize: 13, color: "var(--app-text-primary)",
      display: "flex", alignItems: "center", gap: 8,
    }}>
      {isLoading ? (
        <>
          <Loader2 className="animate-spin" style={{ width: 14, height: 14, color: "var(--app-text-tertiary)" }} />
          <span style={{ color: "var(--app-text-tertiary)" }}>AI 인사이트 생성 중…</span>
        </>
      ) : (
        <>
          <span style={{ color: "#EF4444", fontSize: 16 }}>●</span>
          <span>{text}</span>
        </>
      )}
    </div>
  );
}

function SkipTransitions({
  skipTransitions,
}: {
  skipTransitions: Array<{ from: Phase; to: Phase; count: number }>;
}) {
  return (
    <div style={metaCardStyle}>
      <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginBottom: 6 }}>
        스킵 전이 현황 (Phase 건너뛰기)
      </div>
      {skipTransitions.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>없음</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {skipTransitions.slice(0, 12).map((s) => (
            <span key={`${s.from}-${s.to}`} style={skipBadge}>
              {phaseShortLabel(s.from)} → {phaseShortLabel(s.to)}{" "}
              <span style={{ color: "var(--app-accent)", fontWeight: 700 }}>{s.count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function phaseShortLabel(p: Phase): string {
  // 메인 흐름 (P1~P8)은 인덱스 기반 번호로 표시, P3.1 은 "3.1" 로 명시
  const mainOrder: Phase[] = [
    Phase.PHASE_1_INITIAL, Phase.PHASE_2_COLLECT, Phase.PHASE_3_SPEC, Phase.PHASE_4_QUOTE,
    Phase.PHASE_5_NUDGE, Phase.PHASE_6_BOOKING, Phase.PHASE_7_CONFIRM, Phase.PHASE_8_POST,
  ];
  const idx = mainOrder.indexOf(p);
  if (idx >= 0) return String(idx + 1).padStart(2, "0");
  if (p === Phase.PHASE_3_1_MODIFY) return "3.1";
  return p;
}

// ─── 스타일 ──────────────────────────────────

const sectionStyle: React.CSSProperties = {
  padding: 20,
  backgroundColor: "var(--app-surface)",
  border: "1px solid var(--app-border)",
  borderRadius: 12,
  display: "flex", flexDirection: "column", gap: 16,
};

const titleStyle: React.CSSProperties = { fontSize: 16, fontWeight: 700, margin: 0 };
const subStyle: React.CSSProperties = { fontSize: 12, color: "var(--app-text-tertiary)", margin: "2px 0 0" };
const emptyStyle: React.CSSProperties = {
  padding: 40, textAlign: "center", color: "var(--app-text-tertiary)", fontSize: 13,
};

const tableStyle: React.CSSProperties = {
  width: "100%", borderCollapse: "separate", borderSpacing: 0,
  minWidth: 720,
  // 컬럼 너비를 데이터 행 기준으로 균등 분배 — 그룹 헤더 colspan 정렬 어긋남 방지
  tableLayout: "fixed",
};

const thHeaderStyle: React.CSSProperties = {
  padding: "8px 6px", fontSize: 12, fontWeight: 600,
  color: "var(--app-text-tertiary)", textTransform: "uppercase",
  letterSpacing: "0.04em", textAlign: "center",
};

// 그룹 헤더 — th 자체는 padding 0 으로 컬럼 너비 그대로 유지하고
// 안쪽 div 의 margin 으로 그룹 사이 간격을 만든다 (정렬 어긋남 방지)
const groupHeaderCellStyle: React.CSSProperties = {
  padding: "0 0 8px", verticalAlign: "bottom",
};

// 색상은 PHASE_GROUPS.bg/fg/border 로 그룹별 주입 — 이 base 는 레이아웃만 담당.
// 좌우 margin 으로 그룹 박스 사이 간격을 시각적으로 만들되 cell 너비는 변하지 않음.
const groupHeaderInnerStyle: React.CSSProperties = {
  padding: "8px 14px", fontSize: 11, fontWeight: 700,
  textAlign: "center", letterSpacing: "0.06em",
  borderRadius: 10,
  margin: "0 4px",
};

const subHeaderStyle: React.CSSProperties = {
  // td 와 padding 좌우 동일 (6px) — 그룹 헤더 colspan 와 sub header 정렬 맞추기
  padding: "6px 6px", textAlign: "center",
  borderBottom: "1px solid var(--app-border)",
  verticalAlign: "bottom",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 6px", textAlign: "center", verticalAlign: "middle",
  borderBottom: "1px solid var(--app-border-light)",
  fontSize: 12,
};

const kwBadge: React.CSSProperties = {
  fontSize: 11, padding: "2px 6px",
  backgroundColor: "rgba(239,68,68,0.08)",
  color: "#9F1239", borderRadius: 6,
  whiteSpace: "nowrap", textAlign: "center",
};

const metaCardStyle: React.CSSProperties = {
  padding: 14,
  backgroundColor: "var(--app-surface-secondary)",
  border: "1px solid var(--app-border)",
  borderRadius: 10,
};

const skipBadge: React.CSSProperties = {
  fontSize: 11, padding: "3px 8px",
  backgroundColor: "var(--app-surface)",
  border: "1px solid var(--app-border)",
  borderRadius: 6,
};
