"use client";

import React from "react";
import { RefreshCw, GitCompare } from "lucide-react";
import {
  PeriodPreset,
  PERIOD_PRESET_LABELS,
  PeriodRange,
} from "@/lib/dashboard/period";

interface PeriodFilterProps {
  range: PeriodRange;
  onPresetChange: (preset: PeriodPreset) => void;
  onCustomChange: (from: string, to: string) => void;
  onRefresh: () => void;
  refreshedAt: Date | null;
  loading?: boolean;

  // 비교 모드 (선택)
  compareEnabled?: boolean;
  onCompareToggle?: (enabled: boolean) => void;
  compareRange?: PeriodRange | null;       // 자동 또는 직접
  compareManual?: boolean;                  // true = 직접 입력, false = 자동 (직전 동일 기간)
  onCompareModeChange?: (manual: boolean) => void;
  onCompareCustomChange?: (from: string, to: string) => void;
}

const PRESET_ORDER: PeriodPreset[] = ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last12Weeks", "custom"];

export function PeriodFilter({
  range, onPresetChange, onCustomChange, onRefresh, refreshedAt, loading,
  compareEnabled, onCompareToggle, compareRange, compareManual, onCompareModeChange, onCompareCustomChange,
}: PeriodFilterProps) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 8,
      padding: "12px 16px",
      backgroundColor: "var(--app-surface-secondary)",
      borderRadius: 12,
      border: "1px solid var(--app-border)",
    }}>
      {/* 1행: 현재 기간 + 새로고침 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {PRESET_ORDER.map((preset) => {
            const active = range.preset === preset;
            return (
              <button
                key={preset}
                onClick={() => onPresetChange(preset)}
                style={{
                  padding: "6px 12px", fontSize: 13, fontWeight: 600,
                  borderRadius: 8, border: "1px solid",
                  cursor: "pointer", transition: "all 0.15s",
                  backgroundColor: active ? "var(--app-accent)" : "transparent",
                  color: active ? "white" : "var(--app-text-secondary)",
                  borderColor: active ? "var(--app-accent)" : "var(--app-border)",
                }}
              >
                {PERIOD_PRESET_LABELS[preset]}
              </button>
            );
          })}
        </div>

        {range.preset === "custom" && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="date"
              value={range.fromDateKst}
              onChange={(e) => onCustomChange(e.target.value, range.toDateKst)}
              style={dateInputStyle}
            />
            <span style={{ color: "var(--app-text-tertiary)", fontSize: 13 }}>~</span>
            <input
              type="date"
              value={range.toDateKst}
              onChange={(e) => onCustomChange(range.fromDateKst, e.target.value)}
              style={dateInputStyle}
            />
          </div>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>
            {range.preset === "custom"
              ? `${range.fromDateKst} ~ ${range.toDateKst}`
              : `${range.label} (${range.fromDateKst} ~ ${range.toDateKst})`}
          </span>
          {refreshedAt && (
            <span style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>
              기준: {formatRefreshedAt(refreshedAt)}
            </span>
          )}
          <button
            onClick={onRefresh}
            disabled={loading}
            title="새로고침"
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "6px 10px", fontSize: 12, fontWeight: 600,
              backgroundColor: "var(--app-surface)",
              color: "var(--app-text-secondary)",
              border: "1px solid var(--app-border)",
              borderRadius: 8,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            <RefreshCw style={{ width: 12, height: 12 }} className={loading ? "animate-spin" : ""} />
            새로고침
          </button>
        </div>
      </div>

      {/* 2행: 비교 모드 (선택적) */}
      {onCompareToggle && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
          paddingTop: 8, borderTop: "1px dashed var(--app-border)",
        }}>
          <button
            onClick={() => onCompareToggle(!compareEnabled)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", fontSize: 13, fontWeight: 600,
              borderRadius: 8, border: "1px solid",
              cursor: "pointer",
              backgroundColor: compareEnabled ? "var(--app-tag-purple-bg)" : "transparent",
              color: compareEnabled ? "var(--app-tag-purple-text)" : "var(--app-text-secondary)",
              borderColor: compareEnabled ? "var(--app-tag-purple-text)" : "var(--app-border)",
            }}
          >
            <GitCompare style={{ width: 13, height: 13 }} />
            기간 비교 {compareEnabled ? "ON" : "OFF"}
          </button>

          {compareEnabled && (
            <>
              <div style={{ display: "flex", gap: 4 }}>
                {([{ k: false, label: "자동 (직전 동일 기간)" }, { k: true, label: "직접 지정" }]).map(({ k, label }) => {
                  const active = (compareManual ?? false) === k;
                  return (
                    <button
                      key={String(k)}
                      onClick={() => onCompareModeChange?.(k)}
                      style={{
                        padding: "5px 10px", fontSize: 12, fontWeight: 500,
                        borderRadius: 6, border: "1px solid",
                        cursor: "pointer",
                        backgroundColor: active ? "var(--app-accent)" : "transparent",
                        color: active ? "white" : "var(--app-text-secondary)",
                        borderColor: active ? "var(--app-accent)" : "var(--app-border)",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {compareManual && compareRange && (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="date"
                    value={compareRange.fromDateKst}
                    onChange={(e) => onCompareCustomChange?.(e.target.value, compareRange.toDateKst)}
                    style={dateInputStyle}
                  />
                  <span style={{ color: "var(--app-text-tertiary)", fontSize: 13 }}>~</span>
                  <input
                    type="date"
                    value={compareRange.toDateKst}
                    onChange={(e) => onCompareCustomChange?.(compareRange.fromDateKst, e.target.value)}
                    style={dateInputStyle}
                  />
                </div>
              )}

              {compareRange && (
                <span style={{ fontSize: 12, color: "var(--app-text-tertiary)", marginLeft: "auto" }}>
                  비교: {compareRange.fromDateKst} ~ {compareRange.toDateKst}
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const dateInputStyle: React.CSSProperties = {
  padding: "5px 8px", fontSize: 13,
  border: "1px solid var(--app-border)",
  borderRadius: 6,
  backgroundColor: "var(--app-input-bg)",
  color: "var(--app-text-primary)",
};

function formatRefreshedAt(d: Date): string {
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "방금";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`;
  return d.toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}
