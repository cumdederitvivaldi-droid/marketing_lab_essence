"use client";

import React from "react";
import { DollarSign, BarChart3, Globe2 } from "lucide-react";
import { KrCardData } from "@/lib/dashboard/types";

interface KrSectionProps {
  cards: KrCardData[];
  loading?: boolean;
}

const KR_ICONS = {
  kr1: DollarSign,
  kr2: BarChart3,
  kr3: Globe2,
} as const;

export function KrSection({ cards, loading }: KrSectionProps) {
  return (
    <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
      {(loading || cards.length === 0)
        ? [0, 1, 2].map((i) => <KrCardSkeleton key={i} />)
        : cards.map((c) => <KrCard key={c.id} card={c} />)}
    </section>
  );
}

function KrCard({ card }: { card: KrCardData }) {
  const Icon = KR_ICONS[card.id];
  const ach = card.achievementPct;
  const achColor = ach == null ? "var(--app-text-tertiary)" : ach >= 100 ? "#10B981" : ach >= 60 ? "#F59E0B" : "#EF4444";
  const achWidth = ach == null ? 0 : Math.min(100, ach);

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={krBadge}>{card.id.toUpperCase()}</span>
        <Icon style={{ width: 18, height: 18, color: "var(--app-text-tertiary)" }} />
      </div>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-secondary)", margin: 0, lineHeight: 1.4 }}>
        {card.label}
      </h3>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: "var(--app-text-primary)" }}>
          {card.currentDisplay}
        </span>
        <span style={{ fontSize: 13, color: "var(--app-text-tertiary)" }}>
          / {card.targetDisplay}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: "auto" }}>
        <div style={progressBarBg}>
          <div style={{ ...progressBarFg, width: `${achWidth}%`, backgroundColor: achColor }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--app-text-tertiary)" }}>
          <span>달성률 {ach == null ? "—" : `${ach.toFixed(1)}%`}</span>
          {card.isHardcoded && <span style={{ color: "#F59E0B" }}>임시값</span>}
        </div>
      </div>
    </div>
  );
}

function KrCardSkeleton() {
  return <div style={{ ...cardStyle, opacity: 0.4 }} />;
}

const cardStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 10,
  padding: 18,
  backgroundColor: "var(--app-surface)",
  border: "1px solid var(--app-border)",
  borderRadius: 12,
  minHeight: 160,
};

const krBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 8px", fontSize: 10, fontWeight: 700,
  letterSpacing: "0.06em",
  color: "var(--app-accent)",
  backgroundColor: "rgba(59,130,246,0.10)",
  borderRadius: 999,
};

const progressBarBg: React.CSSProperties = {
  height: 6, width: "100%",
  backgroundColor: "var(--app-surface-secondary)",
  borderRadius: 3, overflow: "hidden",
};

const progressBarFg: React.CSSProperties = {
  height: "100%", borderRadius: 3, transition: "width 0.4s",
};
