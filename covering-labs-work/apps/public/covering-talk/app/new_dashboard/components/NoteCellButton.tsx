"use client";

import React, { useRef } from "react";
import { MessageCircle } from "lucide-react";
import { useNoteContext } from "./NoteContext";

interface Props {
  section: string;
  cellKey: string;
  /** 셀 우상단에 inline 으로 띄우는 이모지 스타일. true 면 항상 보임, false 면 hover 시만. 기본 false. */
  alwaysVisible?: boolean;
}

export function NoteCellButton({ section, cellKey, alwaysVisible = false }: Props) {
  const { counts, openPopover, active } = useNoteContext();
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const key = `${section}::${cellKey}`;
  const c = counts[key];

  const isActive = active?.section === section && active?.cellKey === cellKey;
  const total = c?.total ?? 0;
  const unresolved = c?.unresolved ?? 0;
  const hasNotes = total > 0;

  // 메모 없으면 hover 시만 + 작게, 있으면 항상 노출
  const visible = alwaysVisible || hasNotes || isActive;

  return (
    <button
      ref={btnRef}
      onClick={(e) => {
        e.stopPropagation();
        if (btnRef.current) openPopover(section, cellKey, btnRef.current);
      }}
      title={hasNotes ? `메모 ${total}개${unresolved > 0 ? ` (미해결 ${unresolved})` : ""}` : "메모 추가"}
      className="note-cell-button"
      style={{
        position: "relative",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 18, height: 18,
        padding: 0, marginLeft: 4,
        backgroundColor: "transparent",
        border: "none",
        cursor: "pointer",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.15s",
        verticalAlign: "middle",
      }}
    >
      <MessageCircle
        style={{
          width: 12, height: 12,
          color: unresolved > 0 ? "#F59E0B" : hasNotes ? "var(--app-accent)" : "var(--app-text-tertiary)",
          fill: unresolved > 0 ? "rgba(245,158,11,0.20)" : hasNotes ? "rgba(59,130,246,0.20)" : "transparent",
        }}
      />
      {total > 0 && (
        <span style={{
          position: "absolute", top: -4, right: -6,
          minWidth: 12, height: 12, borderRadius: 6,
          fontSize: 8, fontWeight: 700,
          color: "white",
          backgroundColor: unresolved > 0 ? "#F59E0B" : "var(--app-accent)",
          padding: "0 3px", lineHeight: "12px",
        }}>
          {total > 9 ? "9+" : total}
        </span>
      )}
    </button>
  );
}

/** 셀 wrapper — 컨텐츠는 셀 정중앙에 위치하고 NoteCellButton 은 우상단 absolute. hover 시 노출.  */
export function CellWithNote({
  section,
  cellKey,
  children,
}: {
  section: string;
  cellKey: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="cell-with-note"
      style={{
        position: "relative",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ display: "inline-block" }}>{children}</div>
      <span style={{ position: "absolute", top: 0, right: 2, display: "inline-flex" }}>
        <NoteCellButton section={section} cellKey={cellKey} />
      </span>
      <style>{`
        .cell-with-note:hover .note-cell-button { opacity: 1 !important; }
      `}</style>
    </div>
  );
}

