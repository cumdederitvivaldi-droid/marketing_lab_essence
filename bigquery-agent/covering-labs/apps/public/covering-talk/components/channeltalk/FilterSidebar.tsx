"use client";

import { Inbox, User, Tag, ChevronDown, ChevronRight, RefreshCw, Truck, Clock, Mail, UserX, FileText, Plus, Search, Pencil, Trash2, X, Check, GripHorizontal } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import type { CTChat } from "./types";
import { getTagColor } from "./utils";

// 상담사별 아바타 색상
const AVATAR_COLORS: Record<string, string> = {
  "라이언": "#3B82F6",
  "메리다": "#EC4899",
  "조이": "#F59E0B",
  "토미": "#8B5CF6",
  "테디": "#10B981",
};

function getAvatarColor(name: string): string {
  return AVATAR_COLORS[name] ?? "#6B7280";
}

interface FilterSidebarProps {
  chats: CTChat[];
  filterAssignee: string | null;
  filterTag: string | null;
  onFilterAssignee: (v: string | null) => void;
  onFilterTag: (v: string | null) => void;
  onRefresh: () => void;
  autoClose?: boolean;
  onToggleAutoClose?: (v: boolean) => void;
  autoVehicle?: boolean;
  onToggleAutoVehicle?: (v: boolean) => void;
  currentUserName?: string | null;
  managerAvatars?: Record<string, string>;
}

export default function FilterSidebar({
  chats, filterAssignee, filterTag,
  onFilterAssignee, onFilterTag, onRefresh,
  currentUserName,
  managerAvatars = {},
}: FilterSidebarProps) {
  const [tagSectionOpen, setTagSectionOpen] = useState(true);

  // 담당자/태그 집계 + 안 읽은 메시지 카운트
  const assigneeCounts = new Map<string, number>();
  const assigneeUnread = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  let unassignedCount = 0;
  let unassignedUnread = 0;
  let totalUnread = 0;

  for (const c of chats) {
    const isUnread = c.lastMessagePersonType === "user";
    if (isUnread) totalUnread++;

    if (c.assignee) {
      assigneeCounts.set(c.assignee, (assigneeCounts.get(c.assignee) ?? 0) + 1);
      if (isUnread) assigneeUnread.set(c.assignee, (assigneeUnread.get(c.assignee) ?? 0) + 1);
    } else {
      unassignedCount++;
      if (isUnread) unassignedUnread++;
    }
    for (const t of c.tags) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
  }

  const sortedAssignees = Array.from(assigneeCounts.entries()).sort((a, b) => {
    const aUnread = assigneeUnread.get(a[0]) ?? 0;
    const bUnread = assigneeUnread.get(b[0]) ?? 0;
    if (aUnread !== bUnread) return bUnread - aUnread;
    return b[1] - a[1];
  });
  const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);

  // 현재 사용자 (테디→라이언 매핑)
  const myName = currentUserName === "테디" ? "라이언" : currentUserName;

  return (
    <div style={{
      width: "100%", height: "100%",
      display: "flex", flexDirection: "column", backgroundColor: "var(--app-surface-hover)",
      overflowY: "auto",
    }}>
      {/* 헤더 */}
      <div style={{
        padding: "16px 14px 12px",
        borderBottom: "1px solid var(--app-border-light)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>채널톡</h1>
        <button
          onClick={onRefresh}
          style={{
            width: 28, height: 28, borderRadius: 6, border: "none",
            backgroundColor: "transparent", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          title="새로고침"
        >
          <RefreshCw style={{ width: 14, height: 14, color: "var(--app-text-tertiary)" }} />
        </button>
      </div>

      {/* 전체 + 내 담당 + 안 읽은 메시지 */}
      <div style={{ padding: "8px 10px 0" }}>
        <SidebarItem
          label="전체"
          count={chats.length}
          active={!filterAssignee && !filterTag}
          onClick={() => { onFilterAssignee(null); onFilterTag(null); }}
          icon={<Inbox style={{ width: 15, height: 15 }} />}
        />

        {/* 내 담당 (로그인 사용자) */}
        {myName && assigneeCounts.has(myName) && (
          <SidebarItem
            label={myName}
            count={assigneeCounts.get(myName)!}
            active={filterAssignee === myName}
            onClick={() => { onFilterAssignee(filterAssignee === myName ? null : myName); onFilterTag(null); }}
            icon={<Avatar name={myName} size={20} avatarUrl={managerAvatars[myName]} />}
            unreadCount={assigneeUnread.get(myName) ?? 0}
            highlight
          />
        )}

        {/* 안 읽은 메시지 */}
        <SidebarItem
          label="안 읽은 메시지"
          count={-1}
          active={filterAssignee === "__unread__"}
          onClick={() => { onFilterAssignee(filterAssignee === "__unread__" ? null : "__unread__"); onFilterTag(null); }}
          icon={<Mail style={{ width: 15, height: 15 }} />}
          badge={totalUnread > 0 ? (totalUnread > 99 ? "99+" : String(totalUnread)) : undefined}
          badgeColor="#ef4444"
        />
      </div>

      {/* 담당자 */}
      <div style={{ padding: "12px 10px 0" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)", padding: "0 6px 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>
          담당자
        </div>
        {unassignedCount > 0 && (
          <SidebarItem
            label="담당자 없음"
            count={unassignedCount}
            active={filterAssignee === "__none__"}
            onClick={() => { onFilterAssignee(filterAssignee === "__none__" ? null : "__none__"); onFilterTag(null); }}
            icon={<UserX style={{ width: 15, height: 15, color: "#9CA3AF" }} />}
            unreadCount={unassignedUnread}
          />
        )}
        {sortedAssignees
          .filter(([name]) => name !== myName) // 내 이름은 위에서 이미 표시
          .map(([name, count]) => (
          <SidebarItem
            key={name}
            label={name}
            count={count}
            active={filterAssignee === name}
            onClick={() => { onFilterAssignee(filterAssignee === name ? null : name); onFilterTag(null); }}
            icon={<Avatar name={name} size={20} avatarUrl={managerAvatars[name]} />}
            unreadCount={assigneeUnread.get(name) ?? 0}
          />
        ))}
      </div>

      {/* 상담 태그 */}
      <div style={{ padding: "12px 10px 0" }}>
        <button
          onClick={() => setTagSectionOpen(!tagSectionOpen)}
          style={{
            display: "flex", alignItems: "center", gap: 4, width: "100%",
            fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)", padding: "0 6px 6px",
            border: "none", backgroundColor: "transparent", cursor: "pointer",
            textTransform: "uppercase", letterSpacing: 0.5,
          }}
        >
          {tagSectionOpen
            ? <ChevronDown style={{ width: 12, height: 12 }} />
            : <ChevronRight style={{ width: 12, height: 12 }} />
          }
          상담 태그
        </button>
        {tagSectionOpen && sortedTags.map(([tag, count]) => {
          const tc = getTagColor(tag);
          return (
            <SidebarItem
              key={tag}
              label={tag}
              count={count}
              active={filterTag === tag}
              onClick={() => { onFilterTag(filterTag === tag ? null : tag); onFilterAssignee(null); }}
              icon={<Tag style={{ width: 13, height: 13, color: tc.color }} />}
              labelColor={tc.color}
            />
          );
        })}
      </div>

      {/* 설정 링크 */}
      <div style={{ marginTop: "auto", padding: "12px 14px", borderTop: "1px solid var(--app-border-light)" }}>
        <a
          href="/settings"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 10px", borderRadius: 8,
            color: "var(--app-text-secondary)", fontSize: 13, fontWeight: 500,
            textDecoration: "none", transition: "background-color 0.1s",
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--app-surface-secondary)"}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.32 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          설정
        </a>
      </div>
    </div>
  );
}

// ─── 아바타 ───

function Avatar({ name, size = 20, avatarUrl }: { name: string; size?: number; avatarUrl?: string }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        style={{
          width: size, height: size, borderRadius: "50%",
          objectFit: "cover", flexShrink: 0,
        }}
      />
    );
  }
  const color = getAvatarColor(name);
  const initial = name[0] ?? "?";
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      backgroundColor: color, color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.5, fontWeight: 700, flexShrink: 0,
      lineHeight: 1,
    }}>
      {initial}
    </div>
  );
}

// ─── 토글 버튼 ───

function ToggleButton({ icon, label, active, onClick }: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", padding: "8px 8px", borderRadius: 8,
        border: "none", cursor: "pointer",
        backgroundColor: active ? "var(--app-accent-light, rgba(59,130,246,0.1))" : "var(--app-surface-secondary)",
        transition: "background-color 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: active ? "var(--app-accent)" : "var(--app-text-tertiary)" }}>
        {icon}
        <span style={{ fontSize: 13, fontWeight: 500, color: active ? "var(--app-accent)" : "var(--app-text-secondary)" }}>
          {label}
        </span>
      </div>
      <div style={{
        width: 36, height: 20, borderRadius: 10, padding: 2,
        backgroundColor: active ? "var(--app-accent, #3b82f6)" : "var(--app-border, #d1d5db)",
        transition: "background-color 0.2s", display: "flex", alignItems: "center",
      }}>
        <div style={{
          width: 16, height: 16, borderRadius: "50%", backgroundColor: "#fff",
          transition: "transform 0.2s",
          transform: active ? "translateX(16px)" : "translateX(0px)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />
      </div>
    </button>
  );
}

// ─── 사이드바 아이템 ───

function SidebarItem({ label, count, active, onClick, icon, labelColor, unreadCount, highlight, badge, badgeColor }: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  labelColor?: string;
  unreadCount?: number;
  highlight?: boolean;
  badge?: string;
  badgeColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", padding: "7px 8px", borderRadius: 8,
        border: "none", cursor: "pointer",
        backgroundColor: active ? "var(--app-selected-bg)" : highlight ? "rgba(59,130,246,0.06)" : "transparent",
        transition: "background-color 0.1s",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = highlight ? "rgba(59,130,246,0.1)" : "var(--app-surface-secondary)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = highlight ? "rgba(59,130,246,0.06)" : "transparent"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {icon}
        <span style={{
          fontSize: 14,
          color: labelColor ?? (active ? "var(--app-accent)" : highlight ? "var(--app-text-primary)" : "var(--app-text-primary)"),
          fontWeight: active || highlight || (unreadCount && unreadCount > 0) ? 700 : 400,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {label}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0, marginLeft: 6 }}>
        {/* 커스텀 배지 */}
        {badge && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: "#fff",
            backgroundColor: badgeColor ?? "#ef4444", borderRadius: 10,
            minWidth: 20, height: 20, padding: "0 6px",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            lineHeight: 1,
          }}>
            {badge}
          </span>
        )}
        {count >= 0 && (
          <span style={{
            fontSize: 13,
            fontWeight: (unreadCount && unreadCount > 0) ? 700 : 500,
            color: (unreadCount && unreadCount > 0) ? "#F59E0B" : active ? "var(--app-accent)" : "var(--app-text-tertiary)",
          }}>
            {count}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── 템플릿 수정 버튼 + 모달 ───

interface Macro {
  id: number;
  name: string;
  content: string;
  category: string;
  sort_order: number;
  is_active: boolean;
}

function TemplateButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "100%", padding: "8px 8px", borderRadius: 8,
          border: "none", cursor: "pointer",
          backgroundColor: "var(--app-surface-secondary)",
          transition: "background-color 0.15s",
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--app-surface-hover)"}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "var(--app-surface-secondary)"}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--app-text-tertiary)" }}>
          <FileText style={{ width: 14, height: 14 }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--app-text-secondary)" }}>템플릿 수정</span>
        </div>
        <Pencil style={{ width: 12, height: 12, color: "var(--app-text-tertiary)" }} />
      </button>
      {open && <TemplateModal onClose={() => setOpen(false)} />}
    </>
  );
}

export function TemplateModal({ onClose }: { onClose: () => void }) {
  const [macros, setMacros] = useState<Macro[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", content: "", category: "" });
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", content: "", category: "" });

  // 드래그 & 리사이즈
  const [pos, setPos] = useState({ x: Math.max(80, window.innerWidth / 2 - 320), y: 60 });
  const [size, setSize] = useState({ w: 640, h: Math.min(700, window.innerHeight - 120) });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);

  const fetchMacros = useCallback(async () => {
    try {
      const res = await fetch("/api/macros");
      const data = await res.json();
      setMacros(data.macros ?? []);
      setCategories(data.categories ?? []);
      if (expanded.size === 0 && data.categories?.length) {
        setExpanded(new Set(data.categories));
      }
    } catch { toast.error("매크로 로드 실패"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchMacros(); }, [fetchMacros]);

  // 드래그
  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: Math.max(0, dragRef.current.origX + ev.clientX - dragRef.current.startX),
        y: Math.max(0, dragRef.current.origY + ev.clientY - dragRef.current.startY),
      });
    };
    const onUp = () => { dragRef.current = null; document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); document.body.style.cursor = ""; document.body.style.userSelect = ""; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  };

  // 리사이즈
  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: size.w, origH: size.h };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      setSize({
        w: Math.max(400, Math.min(1000, resizeRef.current.origW + ev.clientX - resizeRef.current.startX)),
        h: Math.max(300, Math.min(900, resizeRef.current.origH + ev.clientY - resizeRef.current.startY)),
      });
    };
    const onUp = () => { resizeRef.current = null; document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); document.body.style.cursor = ""; document.body.style.userSelect = ""; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "nwse-resize";
    document.body.style.userSelect = "none";
  };

  const saveEdit = async () => {
    if (!editingId || !editForm.name.trim() || !editForm.content.trim()) return;
    try {
      const res = await fetch("/api/macros", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingId, ...editForm }) });
      if (!res.ok) throw new Error();
      toast.success("매크로 수정 완료");
      setEditingId(null);
      fetchMacros();
    } catch { toast.error("매크로 수정 실패"); }
  };

  const deleteMacro = async (id: number, name: string) => {
    if (!confirm(`"${name}" 삭제?`)) return;
    try {
      const res = await fetch("/api/macros", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!res.ok) throw new Error();
      toast.success("삭제 완료");
      fetchMacros();
    } catch { toast.error("삭제 실패"); }
  };

  const addMacro = async () => {
    if (!addForm.name.trim() || !addForm.content.trim()) { toast.error("이름과 내용 필수"); return; }
    try {
      const res = await fetch("/api/macros", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(addForm) });
      if (!res.ok) throw new Error();
      toast.success("추가 완료");
      setShowAdd(false);
      setAddForm({ name: "", content: "", category: "" });
      fetchMacros();
    } catch { toast.error("추가 실패"); }
  };

  const filtered = search.trim()
    ? macros.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.content.toLowerCase().includes(search.toLowerCase()))
    : macros;

  const grouped: Record<string, Macro[]> = {};
  for (const m of filtered) { if (!grouped[m.category]) grouped[m.category] = []; grouped[m.category].push(m); }

  const inputStyle: React.CSSProperties = {
    padding: "6px 10px", borderRadius: 6, border: "1px solid var(--app-border)",
    fontSize: 13, outline: "none", backgroundColor: "var(--app-input-bg, var(--app-surface))",
    color: "var(--app-text-primary)", boxSizing: "border-box",
  };

  return createPortal(
    <div
      style={{
        position: "fixed", left: pos.x, top: pos.y, width: size.w, height: size.h,
        backgroundColor: "var(--app-surface)", borderRadius: 12,
        boxShadow: "0 20px 60px rgba(0,0,0,0.3), 0 0 0 1px var(--app-border)",
        display: "flex", flexDirection: "column", zIndex: 9999, overflow: "hidden",
      }}
    >
      {/* 헤더 (드래그 핸들) */}
      <div
        onMouseDown={onDragStart}
        style={{
          padding: "12px 16px", cursor: "grab",
          borderBottom: "1px solid var(--app-border-light)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          backgroundColor: "var(--app-surface-hover)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <GripHorizontal style={{ width: 14, height: 14, color: "var(--app-text-tertiary)" }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--app-text-primary)" }}>
            템플릿 관리
          </span>
          <span style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>({macros.length}개)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => setShowAdd(!showAdd)}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "4px 10px", borderRadius: 6, border: "none",
              backgroundColor: "var(--app-accent)", color: "white",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}
          >
            <Plus style={{ width: 12, height: 12 }} /> 추가
          </button>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
          >
            <X style={{ width: 16, height: 16, color: "var(--app-text-tertiary)" }} />
          </button>
        </div>
      </div>

      {/* 검색 */}
      <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--app-border-light)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", backgroundColor: "var(--app-surface-secondary)", borderRadius: 6 }}>
          <Search style={{ width: 14, height: 14, color: "var(--app-text-tertiary)" }} />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="검색..."
            style={{ border: "none", background: "transparent", outline: "none", fontSize: 13, color: "var(--app-text-primary)", flex: 1 }}
          />
          {search && <button onClick={() => setSearch("")} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0 }}><X style={{ width: 12, height: 12, color: "var(--app-text-tertiary)" }} /></button>}
        </div>
      </div>

      {/* 추가 폼 */}
      {showAdd && (
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--app-border-light)", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input value={addForm.name} onChange={(e) => setAddForm(p => ({ ...p, name: e.target.value }))} placeholder="매크로명" style={{ ...inputStyle, flex: 1 }} />
            <select value={addForm.category} onChange={(e) => setAddForm(p => ({ ...p, category: e.target.value }))} style={{ ...inputStyle, minWidth: 120 }}>
              <option value="">카테고리</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <textarea value={addForm.content} onChange={(e) => setAddForm(p => ({ ...p, content: e.target.value }))} placeholder="내용..." rows={3} style={{ ...inputStyle, width: "100%", resize: "vertical", lineHeight: 1.5 }} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 8 }}>
            <button onClick={() => setShowAdd(false)} style={{ ...inputStyle, cursor: "pointer", fontSize: 12 }}>취소</button>
            <button onClick={addMacro} style={{ padding: "6px 14px", borderRadius: 6, border: "none", backgroundColor: "var(--app-accent)", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>추가</button>
          </div>
        </div>
      )}

      {/* 매크로 목록 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--app-text-tertiary)", fontSize: 13 }}>로딩 중...</div>
        ) : Object.keys(grouped).length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--app-text-tertiary)", fontSize: 13 }}>
            {search ? "검색 결과 없음" : "템플릿 없음"}
          </div>
        ) : (
          Object.entries(grouped).map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: 4 }}>
              <button
                onClick={() => setExpanded(prev => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; })}
                style={{
                  display: "flex", alignItems: "center", gap: 6, width: "100%",
                  padding: "8px 10px", backgroundColor: "var(--app-surface-secondary)",
                  borderRadius: expanded.has(cat) ? "8px 8px 0 0" : 8,
                  border: "none", cursor: "pointer", textAlign: "left",
                }}
              >
                {expanded.has(cat)
                  ? <ChevronDown style={{ width: 14, height: 14, color: "var(--app-text-secondary)" }} />
                  : <ChevronRight style={{ width: 14, height: 14, color: "var(--app-text-secondary)" }} />
                }
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)" }}>{cat}</span>
                <span style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>({items.length})</span>
              </button>
              {expanded.has(cat) && (
                <div style={{ backgroundColor: "var(--app-surface)", borderRadius: "0 0 8px 8px", border: "1px solid var(--app-border-light)", borderTop: "none" }}>
                  {items.map((macro, idx) => (
                    <div key={macro.id} style={{ padding: "10px 12px", borderTop: idx > 0 ? "1px solid var(--app-border-light)" : "none" }}>
                      {editingId === macro.id ? (
                        <div>
                          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                            <input value={editForm.name} onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))} style={{ ...inputStyle, flex: 1, borderColor: "var(--app-accent)" }} />
                            <select value={editForm.category} onChange={(e) => setEditForm(p => ({ ...p, category: e.target.value }))} style={{ ...inputStyle, minWidth: 100 }}>
                              {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <textarea value={editForm.content} onChange={(e) => setEditForm(p => ({ ...p, content: e.target.value }))} rows={4} style={{ ...inputStyle, width: "100%", resize: "vertical", lineHeight: 1.5, borderColor: "var(--app-accent)" }} />
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 6 }}>
                            <button onClick={() => setEditingId(null)} style={{ display: "flex", alignItems: "center", gap: 3, ...inputStyle, cursor: "pointer", fontSize: 12 }}>
                              <X style={{ width: 12, height: 12 }} /> 취소
                            </button>
                            <button onClick={saveEdit} style={{ display: "flex", alignItems: "center", gap: 3, padding: "6px 12px", borderRadius: 6, border: "none", backgroundColor: "var(--app-accent)", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                              <Check style={{ width: 12, height: 12 }} /> 저장
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--app-text-primary)", marginBottom: 3 }}>{macro.name}</div>
                            <div style={{ fontSize: 12, color: "var(--app-text-secondary)", lineHeight: 1.5, whiteSpace: "pre-wrap", maxHeight: 48, overflow: "hidden" }}>{macro.content}</div>
                          </div>
                          <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                            <button onClick={() => { setEditingId(macro.id); setEditForm({ name: macro.name, content: macro.content, category: macro.category }); }} style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)", cursor: "pointer" }} title="수정">
                              <Pencil style={{ width: 12, height: 12, color: "var(--app-text-secondary)" }} />
                            </button>
                            <button onClick={() => deleteMacro(macro.id, macro.name)} style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)", cursor: "pointer" }} title="삭제">
                              <Trash2 style={{ width: 12, height: 12, color: "#E8344E" }} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 리사이즈 핸들 */}
      <div
        onMouseDown={onResizeStart}
        style={{
          position: "absolute", bottom: 0, right: 0, width: 20, height: 20,
          cursor: "nwse-resize", display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <div style={{ width: 10, height: 10, borderRight: "2px solid var(--app-text-tertiary)", borderBottom: "2px solid var(--app-text-tertiary)", opacity: 0.5 }} />
      </div>
    </div>,
    document.body
  );
}
