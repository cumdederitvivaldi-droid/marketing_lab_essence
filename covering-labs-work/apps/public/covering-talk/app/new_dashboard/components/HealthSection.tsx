"use client";

import React from "react";
import { ShieldAlert } from "lucide-react";
import { HealthCardData } from "@/lib/dashboard/types";

interface HealthSectionProps {
  cards: HealthCardData[];
  loading?: boolean;
  onCardClick?: (cardId: string) => void;
}

const STATUS_COLOR: Record<HealthCardData["status"], string> = {
  ok: "#10B981",
  warn: "#F59E0B",
  alert: "#EF4444",
  tbd: "#94A3B8",
};

const STATUS_LABEL: Record<HealthCardData["status"], string> = {
  ok: "정상",
  warn: "주의",
  alert: "경고",
  tbd: "수집 예정",
};

export function HealthSection({ cards, loading, onCardClick }: HealthSectionProps) {
  const alertCount = cards.filter((c) => c.status === "warn" || c.status === "alert").length;

  return (
    <section style={sectionStyle}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={titleStyle}>Health Check</h2>
          <p style={subStyle}>서비스 품질 안전장치 · 임계값 초과 시 알림</p>
        </div>
        <div style={alertBadge(alertCount)}>
          <ShieldAlert style={{ width: 14, height: 14 }} />
          주의 지표 {alertCount}
        </div>
      </header>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 10,
      }}>
        {(loading || cards.length === 0)
          ? [0, 1, 2, 3, 4].map((i) => <HealthCardSkeleton key={i} />)
          : cards.map((c) => (
              <HealthCard
                key={c.id}
                card={c}
                onClick={onCardClick ? () => onCardClick(c.id) : undefined}
              />
            ))}
      </div>
    </section>
  );
}

function HealthCard({ card, onClick }: { card: HealthCardData; onClick?: () => void }) {
  const color = STATUS_COLOR[card.status];
  const clickable = !!onClick;

  // 게이지 폭 — 임계값 대비 비율
  const gaugePct = card.current == null
    ? 0
    : card.thresholdDirection === "lte"
      ? Math.min(100, (card.current / Math.max(card.threshold, 0.0001)) * 100)
      : Math.min(100, (card.current / Math.max(card.threshold, 0.0001)) * 100);

  return (
    <div
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      style={{
        ...cardStyle,
        borderColor: card.status === "alert" ? color : "var(--app-border)",
        borderWidth: card.status === "alert" ? 1.5 : 1,
        cursor: clickable ? "pointer" : "default",
      }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)" }}>
            {card.label}
          </div>
          <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginTop: 2 }}>
            {card.thresholdLabel}
          </div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700,
          color: "white", backgroundColor: color,
          padding: "2px 6px", borderRadius: 999,
        }}>
          {STATUS_LABEL[card.status]}
        </span>
      </div>

      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--app-text-primary)" }}>
        {card.currentDisplay}
      </div>

      <div style={gaugeBg}>
        <div style={{ ...gaugeFg, width: `${gaugePct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function HealthCardSkeleton() {
  return <div style={{ ...cardStyle, opacity: 0.4 }} />;
}

const sectionStyle: React.CSSProperties = {
  padding: 20,
  backgroundColor: "var(--app-surface)",
  border: "1px solid var(--app-border)",
  borderRadius: 12,
  display: "flex", flexDirection: "column", gap: 16,
};

const titleStyle: React.CSSProperties = {
  fontSize: 16, fontWeight: 700, margin: 0,
};

const subStyle: React.CSSProperties = {
  fontSize: 12, color: "var(--app-text-tertiary)", margin: "2px 0 0",
};

const cardStyle: React.CSSProperties = {
  padding: 14,
  backgroundColor: "var(--app-surface-secondary)",
  border: "1px solid var(--app-border)",
  borderRadius: 10,
  minHeight: 110,
  display: "flex", flexDirection: "column", gap: 8,
};

const gaugeBg: React.CSSProperties = {
  height: 5, width: "100%",
  backgroundColor: "var(--app-bg)",
  borderRadius: 3, overflow: "hidden",
};

const gaugeFg: React.CSSProperties = {
  height: "100%", borderRadius: 3, transition: "width 0.4s",
};

function alertBadge(count: number): React.CSSProperties {
  const danger = count > 0;
  return {
    display: "flex", alignItems: "center", gap: 4,
    padding: "4px 8px", fontSize: 11, fontWeight: 600,
    color: danger ? "#EF4444" : "var(--app-text-tertiary)",
    backgroundColor: danger ? "rgba(239,68,68,0.10)" : "var(--app-surface-secondary)",
    border: `1px solid ${danger ? "rgba(239,68,68,0.30)" : "var(--app-border)"}`,
    borderRadius: 999,
  };
}
