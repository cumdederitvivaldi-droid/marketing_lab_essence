"use client";

import React, { useState } from "react";
import { TrafficChannel } from "@/lib/dashboard/types";

interface TrafficSectionProps {
  channels: TrafficChannel[];
  channelsConverted?: TrafficChannel[];
  loading?: boolean;
}

type Tab = "inflow" | "converted";

export function TrafficSection({ channels, channelsConverted, loading }: TrafficSectionProps) {
  const [tab, setTab] = useState<Tab>("inflow");
  const data = tab === "inflow" ? channels : (channelsConverted ?? []);

  return (
    <section style={sectionStyle}>
      <header>
        <h2 style={titleStyle}>Traffic</h2>
      </header>

      <div style={tabBarStyle}>
        <TabButton active={tab === "inflow"} onClick={() => setTab("inflow")}>
          인입
          <span style={countStyle(tab === "inflow")}>{channels.reduce((s, c) => s + c.count, 0).toLocaleString()}</span>
        </TabButton>
        <TabButton active={tab === "converted"} onClick={() => setTab("converted")}>
          전환
          <span style={countStyle(tab === "converted")}>{(channelsConverted ?? []).reduce((s, c) => s + c.count, 0).toLocaleString()}</span>
        </TabButton>
      </div>

      {loading ? (
        <div style={emptyStyle}>로딩 중…</div>
      ) : data.length === 0 ? (
        <div style={emptyStyle}>{tab === "inflow" ? "유입 데이터 없음" : "전환 데이터 없음"}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.map((c) => (
            <ChannelRow key={c.name} channel={c} />
          ))}
        </div>
      )}

    </section>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "6px 10px",
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        color: active ? "var(--app-text-primary)" : "var(--app-text-tertiary)",
        backgroundColor: active ? "var(--app-surface)" : "transparent",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        fontFamily: "inherit",
        boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06), 0 0 0 1px var(--app-border-light)" : "none",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
  );
}

const countStyle = (active: boolean): React.CSSProperties => ({
  fontSize: 11,
  fontWeight: 600,
  color: active ? "var(--app-text-secondary)" : "var(--app-text-tertiary)",
  fontVariantNumeric: "tabular-nums",
});

function ChannelRow({ channel }: { channel: TrafficChannel }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{
        width: 8, height: 8, borderRadius: "50%",
        backgroundColor: channel.color, flexShrink: 0,
      }} />
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)", minWidth: 110 }}>
        {channel.name}
      </span>
      <span style={{ fontSize: 12, color: "var(--app-text-tertiary)", minWidth: 60, textAlign: "right" }}>
        {channel.count.toLocaleString()}건
      </span>
      <div style={{
        flex: 1, height: 6,
        backgroundColor: "var(--app-surface-secondary)",
        borderRadius: 3, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: `${channel.pct}%`,
          backgroundColor: channel.color,
          borderRadius: 3, transition: "width 0.4s",
        }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", minWidth: 48, textAlign: "right" }}>
        {channel.pct.toFixed(1)}%
      </span>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  padding: 20,
  backgroundColor: "var(--app-surface)",
  border: "1px solid var(--app-border)",
  borderRadius: 12,
  display: "flex", flexDirection: "column", gap: 12,
  minHeight: 320,
};

const tabBarStyle: React.CSSProperties = {
  display: "flex",
  gap: 4,
  padding: 4,
  backgroundColor: "var(--app-surface-secondary)",
  borderRadius: 8,
};
const titleStyle: React.CSSProperties = { fontSize: 16, fontWeight: 700, margin: 0 };
const emptyStyle: React.CSSProperties = {
  flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
  color: "var(--app-text-tertiary)", fontSize: 13,
};
