"use client";

import React from "react";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import type { PhaseColumnData } from "@/lib/dashboard/types";
import { Phase } from "@/lib/ai/phases";
import type { PeriodRange } from "@/lib/dashboard/period";
import type { AnalyticsResponse } from "@/lib/dashboard/cache";

interface Props {
  current: AnalyticsResponse | null;
  compare: AnalyticsResponse | null;
  currentRange: PeriodRange;
  compareRange: PeriodRange | null;
  loading?: boolean;
}

// ─── 표시할 KPI 정의 ──────────────────────────────
//   id ↔ AnalyticsResponse 추출 함수 + 라벨 + unit
//   "good" 방향 (positive delta = 좋음 / 나쁨)

interface KpiDef {
  id: KpiId;
  label: string;
  hint: string;
  unit: "건" | "%" | "원";
  /** delta 가 양수일 때 좋은 지표인가 */
  goodDirection: "up" | "down";
  extract: (d: AnalyticsResponse) => number | null;
  /** 원 단위 표시 방식 — abbreviated: "1.2억" / full: "234,234" (객단가 등 정밀 비교용) */
  currencyMode?: "abbreviated" | "full";
}

const findCol = (cols: PhaseColumnData[], phase: Phase) => cols.find((c) => c.phase === phase) ?? null;

const KPI_DEFS: KpiDef[] = [
  {
    id: "started",
    label: "여정 시작",
    hint: "Phase 1 인입 unique 세션",
    unit: "건",
    goodDirection: "up",
    extract: (d) => d.journeyMap.totalStarted,
  },
  {
    id: "quote",
    label: "견적 도달률",
    hint: "Phase 4 (견적) 도달 / 인입",
    unit: "%",
    goodDirection: "up",
    extract: (d) => findCol(d.journeyMap.columns, Phase.PHASE_4_QUOTE)?.conversionRate ?? null,
  },
  {
    id: "booked",
    label: "예약 확정률",
    hint: "Phase 7 (일정확정) 도달 / 인입",
    unit: "%",
    goodDirection: "up",
    extract: (d) => findCol(d.journeyMap.columns, Phase.PHASE_7_CONFIRM)?.conversionRate ?? null,
  },
  {
    id: "completed",
    label: "수거 완료",
    hint: "Phase 8 도달 unique 세션",
    unit: "건",
    goodDirection: "up",
    extract: (d) => findCol(d.journeyMap.columns, Phase.PHASE_8_POST)?.reachedCount ?? null,
  },
  {
    id: "revenue",
    label: "수거완료 매출",
    hint: "KR1 — orders.status='completed' 의 total_price 합계 (KR1 카드와 동일)",
    unit: "원",
    goodDirection: "up",
    extract: (d) => d.krCards.find((k) => k.id === "kr1")?.current ?? null,
  },
  {
    id: "aov",
    label: "객단가",
    hint: "수거완료 매출 ÷ Phase 8 도달 건수",
    unit: "원",
    goodDirection: "up",
    currencyMode: "full",
    extract: (d) => {
      const revenue = d.krCards.find((k) => k.id === "kr1")?.current ?? null;
      const completed = findCol(d.journeyMap.columns, Phase.PHASE_8_POST)?.reachedCount ?? null;
      if (revenue == null || completed == null || completed === 0) return null;
      return Math.round(revenue / completed);
    },
  },
];

type KpiId = "started" | "quote" | "booked" | "completed" | "revenue" | "aov";

function formatCurrency(v: number): string {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(2)}억`;
  if (v >= 10_000) return `${(v / 10_000).toFixed(0)}만`;
  return v.toLocaleString();
}

export function HeadlineKpis({ current, compare, currentRange, compareRange, loading }: Props) {
  return (
    <section style={sectionStyle}>
      <header style={headerStyle}>
        <h3 style={titleStyle}>핵심 지표 비교</h3>
        <span style={subStyle}>
          {compareRange
            ? `${currentRange.label} vs ${compareRange.label}`
            : `${currentRange.label} (비교 모드 OFF)`}
        </span>
      </header>

      <div style={gridStyle}>
        {KPI_DEFS.map((def) => {
          const cur = current ? def.extract(current) : null;
          const prev = compare ? def.extract(compare) : null;
          return <KpiCard key={def.id} def={def} cur={cur} prev={prev} loading={loading} compareEnabled={!!compareRange} />;
        })}
      </div>
    </section>
  );
}

function KpiCard({
  def, cur, prev, loading, compareEnabled,
}: {
  def: KpiDef; cur: number | null; prev: number | null; loading?: boolean; compareEnabled: boolean;
}) {
  const formatValue = (v: number | null) => {
    if (v == null) return "—";
    if (def.unit === "%") return `${v.toFixed(1)}%`;
    if (def.unit === "원") {
      return def.currencyMode === "full" ? `${v.toLocaleString()}원` : `${formatCurrency(v)}원`;
    }
    return `${v.toLocaleString()}건`;
  };

  // delta 계산
  let deltaText: string | null = null;
  let deltaTone: "good" | "bad" | "flat" = "flat";
  if (compareEnabled && cur != null && prev != null) {
    if (def.unit === "%") {
      const diff = cur - prev;
      if (Math.abs(diff) < 0.05) {
        deltaText = "변화 없음";
      } else {
        deltaText = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}pp`;
        const goes = diff > 0 ? "up" : "down";
        deltaTone = goes === def.goodDirection ? "good" : "bad";
      }
    } else if (def.unit === "원") {
      const diff = cur - prev;
      const pct = prev === 0 ? null : (diff / prev) * 100;
      const fmtAbsDiff = def.currencyMode === "full"
        ? Math.abs(diff).toLocaleString()
        : formatCurrency(Math.abs(diff));
      if (diff === 0) {
        deltaText = "변화 없음";
      } else {
        deltaText = pct != null
          ? `${diff >= 0 ? "+" : "-"}${fmtAbsDiff}원 (${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%)`
          : `${diff >= 0 ? "+" : "-"}${fmtAbsDiff}원`;
        const goes = diff > 0 ? "up" : "down";
        deltaTone = goes === def.goodDirection ? "good" : "bad";
      }
    } else {
      const diff = cur - prev;
      const pct = prev === 0 ? null : (diff / prev) * 100;
      if (diff === 0) {
        deltaText = "변화 없음";
      } else {
        deltaText = pct != null ? `${diff >= 0 ? "+" : ""}${diff.toLocaleString()}건 (${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%)` : `${diff >= 0 ? "+" : ""}${diff.toLocaleString()}건`;
        const goes = diff > 0 ? "up" : "down";
        deltaTone = goes === def.goodDirection ? "good" : "bad";
      }
    }
  }

  const toneColor = deltaTone === "good" ? "#10B981" : deltaTone === "bad" ? "#EF4444" : "var(--app-text-tertiary)";
  const Icon = deltaTone === "good" ? ArrowUpRight : deltaTone === "bad" ? ArrowDownRight : Minus;

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)" }}>{def.label}</span>
        <span title={def.hint} style={{ fontSize: 10, color: "var(--app-text-placeholder)", cursor: "help" }}>ⓘ</span>
      </div>

      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--app-text-primary)", marginBottom: compareEnabled ? 8 : 0 }}>
        {loading ? "…" : formatValue(cur)}
      </div>

      {compareEnabled && (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Icon style={{ width: 13, height: 13, color: toneColor }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: toneColor }}>{deltaText ?? "—"}</span>
          {prev != null && (
            <span style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginLeft: 4 }}>
              vs {formatValue(prev)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  background: "var(--app-surface)",
  border: "1px solid var(--app-border-light)",
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
};

const headerStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "baseline",
  marginBottom: 12,
};

const titleStyle: React.CSSProperties = { fontSize: 14, fontWeight: 700, margin: 0, color: "var(--app-text-primary)" };
const subStyle: React.CSSProperties = { fontSize: 12, color: "var(--app-text-tertiary)" };

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const cardStyle: React.CSSProperties = {
  background: "var(--app-bg)",
  border: "1px solid var(--app-border-light)",
  borderRadius: 10,
  padding: "12px 14px",
};
