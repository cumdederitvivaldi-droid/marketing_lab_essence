"use client";

import { useEffect, useRef, useState } from "react";

export interface Counselor {
  id: number;
  name: string;
}

interface Props {
  /** 매칭에 사용할 검색어 (`@` 이후 입력값). 비어있으면 전체 노출. */
  query: string;
  counselors: Counselor[];
  /** 현재 사용자 — 본인은 후보에서 제외. */
  excludeId?: number;
  onSelect: (c: Counselor) => void;
  onCancel: () => void;
  /** 위치: textarea 캐럿 좌표. left/bottom 기준. */
  anchorRect: { left: number; bottom: number } | null;
}

export function MentionPicker({ query, counselors, excludeId, onSelect, onCancel, anchorRect }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = counselors
    .filter((c) => c.id !== excludeId)
    .filter((c) => !query || c.name.startsWith(query));

  useEffect(() => { setActiveIdx(0); }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (filtered.length === 0) return;
      // 한글 IME 합성 중 Enter — 합성을 끝내는 키이므로 picker 선택 X (다음 Enter 에 처리).
      if (e.isComposing || (e as KeyboardEvent & { keyCode?: number }).keyCode === 229) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        onSelect(filtered[activeIdx]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [filtered, activeIdx, onSelect, onCancel]);

  if (filtered.length === 0 || !anchorRect) return null;

  return (
    <div
      ref={listRef}
      style={{
        position: "fixed",
        left: anchorRect.left,
        bottom: window.innerHeight - anchorRect.bottom + 8,
        minWidth: 180,
        maxHeight: 220,
        overflowY: "auto",
        backgroundColor: "var(--app-surface)",
        border: "1px solid var(--app-border)",
        borderRadius: 8,
        boxShadow: "var(--app-shadow-lg)",
        zIndex: 1000,
        padding: 4,
      }}
    >
      <div style={{
        padding: "4px 10px", fontSize: 11, color: "var(--app-text-tertiary)",
        fontWeight: 700, letterSpacing: "0.03em",
      }}>
        멘션할 상담사
      </div>
      {filtered.map((c, i) => (
        <button
          key={c.id}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onSelect(c); }}
          onMouseEnter={() => setActiveIdx(i)}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            width: "100%", padding: "6px 10px", borderRadius: 6,
            border: "none", cursor: "pointer", fontSize: 13,
            backgroundColor: i === activeIdx ? "var(--app-tag-purple-bg)" : "transparent",
            color: i === activeIdx ? "var(--app-tag-purple-text)" : "var(--app-text-primary)",
            textAlign: "left",
          }}
        >
          <span style={{
            width: 22, height: 22, borderRadius: "50%",
            backgroundColor: "#7B1FA2", color: "white",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700,
          }}>
            {c.name[0]}
          </span>
          <span style={{ fontWeight: 600 }}>{c.name}</span>
        </button>
      ))}
    </div>
  );
}
