"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Loader2, RefreshCw, ChevronLeft, ChevronRight, Users, Settings2, X, Plus, Trash2, Save, Truck, Camera, Eye, EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import type { Order } from "@/lib/store/orders";
import type { LunchOrder } from "@/lib/store/lunch-orders";
import { useRouter } from "next/navigation";
import { addressToZone, ZONE_COLORS, ZONE_ORDER, zoneNumber, type Zone } from "@/lib/dispatch/zones";
import { summarizeItems } from "@/lib/utils/item-format";
import { useAuth } from "@/lib/auth/AuthContext";

const DISPATCH_ALLOWED_USERS = ["강성진", "유대현", "김원빈"];

// ─── Types ──────────────────────────────────

interface Driver {
  id: string;
  name: string;
  phone: string;
  memo: string;
  isActive: boolean;
}

interface Vehicle {
  id: string;
  plateNumber: string;
  vehicleType: string; // '2.5톤' | '1톤 탑차' | '1톤 저상탑차'
  maxCube: number;
  memo: string;
  isActive: boolean;
  defaultDriverId?: string | null;
}

interface DispatchRow {
  type: "order" | "lunch" | "unload";
  id: string;
  date: string;
  name: string;
  time: string;
  timeDisplay: string;
  timeSortKey: number;
  address: string;
  phone: string;
  items: string;
  amount: number;
  volume: number;
  driverName: string;
  driverId: string;
  driverPhone: string;
  vehicleId: string;
  routeOrder: number;
  isDispatched: boolean;
  status: string;
  needLadder: boolean;
  sessionId?: string | null;
  zone: Zone;
  district: string | null;
}

interface Capacity {
  truck1t: number;
  truck1tLow: number;
  truck25t: number;
  maxPerSlot: number;
}

type SortKey = "time" | "name" | "amount" | "routeOrder";
type SortDir = "asc" | "desc";
type TypeFilter = "all" | "order" | "lunch";
type StatusFilter = "all" | "unassigned" | "assigned";

// ─── Helpers ──────────────────────────────────

function todayKST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function formatDateLabel(d: string): string {
  const date = new Date(d + "T00:00:00");
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}(${dayNames[date.getDay()]})`;
}

function shiftDate(d: string, offset: number): string {
  const date = new Date(d + "T00:00:00");
  date.setDate(date.getDate() + offset);
  return date.toISOString().split("T")[0];
}

function parseTimeTo24(raw: string): number {
  if (!raw || raw === "-") return 99;
  if (/야간/.test(raw)) return 21;

  const m = raw.match(/(오전|오후)\s*(\d{1,2})\s*[:시]\s*(\d{0,2})?/);
  if (m) {
    let h = parseInt(m[2]);
    const min = parseInt(m[3] || "0");
    if (m[1] === "오후" && h !== 12) h += 12;
    if (m[1] === "오전" && h === 12) h = 0;
    return h + min / 60;
  }

  const m2 = raw.match(/(\d{1,2})\s*[:]\s*(\d{2})/);
  if (m2) return parseInt(m2[1]) + parseInt(m2[2]) / 60;

  const m3 = raw.match(/(오전|오후)\s*(\d{1,2})\s*시/);
  if (m3) {
    let h = parseInt(m3[2]);
    if (m3[1] === "오후" && h !== 12) h += 12;
    if (m3[1] === "오전" && h === 12) h = 0;
    return h;
  }

  return 99;
}

function formatTimeDisplay(raw: string): string {
  if (!raw || raw === "-") return "-";
  if (/야간/.test(raw)) return "야간";

  const h24 = parseTimeTo24(raw);
  if (h24 >= 99) return raw;

  const h = Math.floor(h24);
  const min = Math.round((h24 - h) * 60);
  const period = h < 12 ? "오전" : "오후";
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const base = `${period} ${displayH}:${String(min).padStart(2, "0")}`;

  const rangeMatch = raw.match(/[~\-]\s*(?:오전|오후)?\s*(\d{1,2})\s*[:시]?\s*(\d{0,2})?/);
  if (rangeMatch) {
    const endRaw = raw.slice(raw.indexOf("~") + 1).trim() || raw.slice(raw.indexOf("-") + 1).trim();
    if (endRaw) {
      const endH24 = parseTimeTo24(endRaw.startsWith("오") ? endRaw : (h24 >= 12 ? "오후 " : "오전 ") + endRaw);
      if (endH24 < 99) {
        const eH = Math.floor(endH24);
        const eMin = Math.round((endH24 - eH) * 60);
        const ePeriod = eH < 12 ? "오전" : "오후";
        const eDisplay = eH === 0 ? 12 : eH > 12 ? eH - 12 : eH;
        return `${base}~${ePeriod} ${eDisplay}:${String(eMin).padStart(2, "0")}`;
      }
    }
  }

  return base;
}

function orderToRow(o: Order): DispatchRow {
  const itemSummary = summarizeItems(o.items);
  const rawTime = o.timeSlot || "-";
  const z = addressToZone(o.address);
  return {
    type: "order", id: o.id, date: o.date, name: o.customerName, time: rawTime,
    timeDisplay: formatTimeDisplay(rawTime), timeSortKey: parseTimeTo24(rawTime),
    address: o.address, phone: o.phone, items: itemSummary, amount: o.totalPrice,
    volume: o.totalVolume, driverName: o.driverName, driverId: o.driverId,
    driverPhone: o.driverPhone, vehicleId: o.vehicleId || "", routeOrder: o.routeOrder, isDispatched: o.isDispatched,
    status: o.status, needLadder: o.needLadder, sessionId: o.sessionId,
    zone: z.zone, district: z.district,
  };
}

function lunchToRow(l: LunchOrder): DispatchRow {
  const rawTime = l.pickupTime || "-";
  const z = addressToZone(l.pickupAddress);
  return {
    type: "lunch", id: l.id, date: l.date, name: l.vendorName, time: rawTime,
    timeDisplay: formatTimeDisplay(rawTime), timeSortKey: parseTimeTo24(rawTime),
    address: l.pickupAddress, phone: l.siteContact, items: l.boxCount ? `${l.boxCount}개` : "-",
    amount: l.totalAmount, volume: 0, driverName: l.driverName, driverId: "",
    driverPhone: l.driverPhone, vehicleId: l.vehicleId || "", routeOrder: 0, isDispatched: l.isDispatched,
    status: l.status, needLadder: false,
    zone: z.zone, district: z.district,
  };
}

// ─── Region colors (레거시 호환용 — ZONE_COLORS가 대체) ──────────────────────────────────

function stripSidoPrefix(address: string): string {
  // "서울 ", "경기 ", "인천 " 접두 제거 (zone chip이 이미 지역 표시하므로 중복 방지)
  const m = address.match(/^(서울(?:시|특별시)?|경기(?:도)?|인천(?:시|광역시)?)\s*/);
  return m ? address.slice(m[0].length) : address;
}

/** 부피 → 차량 분량 텍스트 (스탯 바용) */
function truckLabel(vol: number, truckCap: number): string {
  const ratio = vol / truckCap;
  if (ratio <= 1.05) {
    if (ratio <= 0.15) return "⅛차";
    if (ratio <= 0.3) return "¼차";
    if (ratio <= 0.6) return "반차";
    if (ratio <= 0.8) return "¾차";
    return "한차";
  }
  const full = Math.floor(ratio);
  const rem = ratio - full;
  if (rem < 0.15) return `${full}대`;
  if (rem < 0.6) return `${full}대 반`;
  return `${full + 1}대`;
}

/** 칼럼 헤더: 라벨 + 숨김 버튼 (눈 아이콘) */
function ColHead({ label, onHide }: { label: string; onHide: () => void }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {label}
      <button onClick={onHide} title="칼럼 숨기기"
        style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "inline-flex", color: "var(--app-text-tertiary)", opacity: 0.5 }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.5"; }}>
        <EyeOff style={{ width: 12, height: 12 }} />
      </button>
    </span>
  );
}

/** 숨긴 칼럼 복원용 메뉴 — 좌측 상단 아이콘 클릭 시 드롭다운 */
function ColTogglesMenu({ all, hidden, toggle }: { all: { key: string; label: string }[]; hidden: Set<string>; toggle: (k: string) => void }) {
  const [open, setOpen] = useState(false);
  const hiddenCount = all.filter((c) => hidden.has(c.key)).length;
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button onClick={() => setOpen((o) => !o)} title="칼럼 표시 설정"
        style={{ background: hiddenCount > 0 ? "var(--app-tag-orange-bg)" : "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 4, display: "inline-flex", color: hiddenCount > 0 ? "var(--app-tag-orange-text)" : "var(--app-text-tertiary)" }}>
        <Eye style={{ width: 14, height: 14 }} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 100 }} />
          <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 101, minWidth: 140, backgroundColor: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 8, boxShadow: "var(--app-shadow-lg)", padding: "6px 0", marginTop: 4 }}>
            <div style={{ padding: "4px 12px", fontSize: 11, color: "var(--app-text-tertiary)", fontWeight: 600 }}>칼럼 표시</div>
            {all.map((c) => {
              const isHiddenCol = hidden.has(c.key);
              return (
                <button key={c.key} onClick={() => toggle(c.key)}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 12px", fontSize: 13, textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "var(--app-text-primary)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--app-surface-secondary)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}>
                  {isHiddenCol ? <EyeOff style={{ width: 13, height: 13, color: "var(--app-text-tertiary)" }} /> : <Eye style={{ width: 13, height: 13, color: "#059669" }} />}
                  <span style={{ opacity: isHiddenCol ? 0.5 : 1 }}>{c.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </span>
  );
}

/** 비주얼 부피 인디케이터 — 바 + 멀티트럭 박스 */
function VolumeIndicator({ vol, truckCap }: { vol: number; truckCap: number }) {
  const ratio = vol / truckCap;

  if (ratio <= 1.05) {
    // 단일 트럭: 프로그레스 바
    const pct = Math.min(ratio * 100, 100);
    const color = pct <= 30 ? "#22C55E" : pct <= 55 ? "#84CC16" : pct <= 80 ? "#EAB308" : "#EF4444";
    const label = ratio <= 0.15 ? "⅛" : ratio <= 0.3 ? "¼" : ratio <= 0.45 ? "⅓" : ratio <= 0.6 ? "반" : ratio <= 0.8 ? "¾" : "가득";
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <div style={{ width: 36, height: 9, borderRadius: 5, backgroundColor: "#E5E7EB", overflow: "hidden", flexShrink: 0 }}>
          <div style={{ width: `${pct}%`, height: "100%", borderRadius: 5, backgroundColor: color }} />
        </div>
        <span style={{ fontSize: 10, color, fontWeight: 700, whiteSpace: "nowrap" }}>{label}</span>
      </div>
    );
  }

  // 멀티트럭: 채워진 박스 아이콘
  const full = Math.floor(ratio);
  const rem = ratio - full;
  const hasHalf = rem >= 0.15;
  const label = rem < 0.15 ? `${full}대` : rem < 0.6 ? `${full}대 반` : `${full + 1}대`;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
      {Array.from({ length: Math.min(full, 5) }, (_, i) => (
        <div key={i} style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: "#EF4444" }} />
      ))}
      {hasHalf && (
        <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: "#E5E7EB", overflow: "hidden", display: "flex" }}>
          <div style={{ width: rem < 0.6 ? "50%" : "80%", height: "100%", backgroundColor: "#F59E0B" }} />
        </div>
      )}
      <span style={{ fontSize: 10, color: "#EF4444", fontWeight: 700, marginLeft: 1, whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}

function formatItemsNice(items: string): string {
  return items
    .replace(/\s*(\d+)개/g, "$1")
    .replace(/,\s*/g, " · ");
}

/** 레인지 주문 여부 ("~" 포함) */
function isRangeTime(row: DispatchRow): boolean {
  return row.time.includes("~");
}

/** 드래그 가능한 시간 범위 반환. 고정 시간은 같은 슬롯만, 레인지는 범위 내 */
function getValidHourRange(row: DispatchRow): { min: number; max: number } {
  if (!isRangeTime(row)) {
    const h = Math.floor(row.timeSortKey);
    return { min: h, max: h };
  }
  const parts = row.time.split("~");
  const startH = Math.floor(parseTimeTo24(parts[0].trim()));
  let endH = Math.floor(parseTimeTo24(parts[1].trim()));
  if (endH < startH) endH = startH;
  return { min: startH, max: endH };
}

/** 해당 시간 슬롯에 드롭 가능한지 */
function canDropAtHour(fromRow: DispatchRow, targetHour: number): boolean {
  const range = getValidHourRange(fromRow);
  return targetHour >= range.min && targetHour <= range.max;
}

// ─── Draggable Modal Hook ──────────────────────────────────

function useDraggableModal(initialW: number, initialH: number) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: initialW, h: initialH });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);

  const centered = pos === null;
  const style: React.CSSProperties = centered
    ? { width: size.w, maxHeight: size.h }
    : { width: size.w, maxHeight: size.h, position: "fixed" as const, left: pos.x, top: pos.y };

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = (e.target as HTMLElement).closest("[data-modal-content]") as HTMLElement | null;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const origX = pos?.x ?? rect.left;
    const origY = pos?.y ?? rect.top;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX, origY };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: dragRef.current.origX + (ev.clientX - dragRef.current.startX),
        y: dragRef.current.origY + (ev.clientY - dragRef.current.startY),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: size.w, origH: size.h };
    // fix position before resizing if centered
    if (centered) {
      const el = (e.target as HTMLElement).closest("[data-modal-content]") as HTMLElement | null;
      if (el) {
        const rect = el.getBoundingClientRect();
        setPos({ x: rect.left, y: rect.top });
      }
    }

    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      setSize({
        w: Math.max(360, resizeRef.current.origW + (ev.clientX - resizeRef.current.startX)),
        h: Math.max(300, resizeRef.current.origH + (ev.clientY - resizeRef.current.startY)),
      });
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return { style, centered, onDragStart, onResizeStart };
}

// ─── Styles ──────────────────────────────────

const TH: React.CSSProperties = {
  padding: "10px 10px", fontSize: 13, fontWeight: 700, color: "#5F6B7A",
  textAlign: "center", whiteSpace: "nowrap",
  backgroundColor: "var(--app-surface)", position: "sticky", top: 0, zIndex: 2,
  userSelect: "none", letterSpacing: "0.04em",
  borderBottom: "2px solid var(--app-border)",
  borderRight: "1px solid var(--app-border-light)",
};
const TD: React.CSSProperties = {
  padding: "10px 10px", fontSize: 15, color: "var(--app-text-primary)",
  borderBottom: "1px solid var(--app-border)",
  borderRight: "1px solid var(--app-border-light)",
  lineHeight: 1.5, verticalAlign: "middle", textAlign: "center",
};
const BADGE = (bg: string, text: string): React.CSSProperties => ({
  display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600,
  backgroundColor: bg, color: text, whiteSpace: "nowrap",
});

// ─── Main Page ──────────────────────────────────

export default function DispatchPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // 권한 체크 — 허용되지 않은 사용자는 /conversations 으로 리다이렉트
  useEffect(() => {
    if (authLoading) return;
    if (user && !DISPATCH_ALLOWED_USERS.includes(user.name)) {
      router.replace("/conversations");
    }
  }, [user, authLoading, router]);

  const isAllowed = !!user && DISPATCH_ALLOWED_USERS.includes(user.name);

  const [date, setDate] = useState(todayKST);
  const [rows, _setRows] = useState<DispatchRow[]>([]);
  const rowsRef = useRef<DispatchRow[]>([]);
  const setRows = useCallback((r: DispatchRow[] | ((prev: DispatchRow[]) => DispatchRow[])) => {
    if (typeof r === "function") {
      _setRows((prev) => { const next = r(prev); rowsRef.current = next; return next; });
    } else {
      rowsRef.current = r; _setRows(r);
    }
  }, []);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [capacity, setCapacity] = useState<Capacity>({ truck1t: 7, truck1tLow: 7, truck25t: 10, maxPerSlot: 3 });
  const [loading, setLoading] = useState(true);

  // Filters & sort
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [driverFilter, setDriverFilter] = useState("");
  const [zoneFilter, setZoneFilter] = useState<Zone | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // 요약 모달
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  // 자유이동(테스트) 모드: UI 상에서만 모든 row 의 시간을 오전 9~오후 8 레인지로 덮어써서 모두 슬롯 이동 가능.
  const [freeMoveMode, setFreeMoveMode] = useState(false);
  // ABC 타임 테스트 모드: UI 상에서만 모든 row 를 A(9~12), B(13~16), C(17~20) 블록 중 랜덤 분배
  const [abcMode, setAbcMode] = useState(false);
  // 토글 ON 시마다 새 랜덤 배분 (row.id → 0/1/2). OFF 시 비움.
  const [abcAssignment, setAbcAssignment] = useState<Map<string, number>>(new Map());
  // 권역별 배경색 on/off (localStorage 저장)
  const [zoneBgEnabled, setZoneBgEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("dispatch_zone_bg") !== "off";
  });
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("dispatch_zone_bg", zoneBgEnabled ? "on" : "off");
  }, [zoneBgEnabled]);

  // 칼럼 숨기기 (localStorage 저장)
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(localStorage.getItem("dispatch_hidden_cols") || "[]")); } catch { return new Set(); }
  });
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("dispatch_hidden_cols", JSON.stringify([...hiddenCols]));
  }, [hiddenCols]);
  const toggleCol = (k: string) => setHiddenCols((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const isHidden = (k: string) => hiddenCols.has(k);
  // 숨길 수 있는 컬럼 (비필수)
  const TOGGLEABLE_COLS: { key: string; label: string }[] = [
    { key: "type", label: "구분" },
    { key: "name", label: "고객" },
    { key: "phone", label: "연락처" },
    { key: "items", label: "품목" },
    { key: "amount", label: "금액" },
  ];
  const visibleDataColCount = 10 - [...hiddenCols].filter((k) => TOGGLEABLE_COLS.some((c) => c.key === k)).length;

  // Modals
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [showCapModal, setShowCapModal] = useState(false);
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
  const [showAbcCapModal, setShowAbcCapModal] = useState(false);

  // Photo modal
  const [photoSessionId, setPhotoSessionId] = useState<string | null>(null);

  // Inline driver dropdown
  const [editingRowId, setEditingRowId] = useState<string | null>(null);

  // 시간 이동
  const [editingTimeRowId, setEditingTimeRowId] = useState<string | null>(null);

  // 하차 슬롯
  const [unloadSlots, setUnloadSlots] = useState<DispatchRow[]>([]);

  // 우클릭 컨텍스트 메뉴
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; rowId: string; timeSortKey: number } | null>(null);

  // 하차 추가 모달
  const [unloadModalTime, setUnloadModalTime] = useState<number | null>(null);

  // Drag — ID 기반 + 드래그 대상 ref
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const draggedRowRef = useRef<DispatchRow | null>(null);

  // 탭 시스템 (배차 시나리오 1/2/3)
  const TAB_COUNT = 3;
  const [activeTab, setActiveTab] = useState(1);
  const [mainTab, setMainTab] = useState(1);
  const tabCacheRef = useRef<Record<number, DispatchRow[]>>({});
  const unloadCacheRef = useRef<Record<number, DispatchRow[]>>({});
  const [tabCtxMenu, setTabCtxMenu] = useState<{ x: number; y: number; tab: number } | null>(null);

  // ─── Data fetch ────────────────────────────

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/dispatch?date=${date}`);
      const data = await res.json();
      const orderRows: DispatchRow[] = (data.orders ?? []).map(orderToRow);
      const lunchRows: DispatchRow[] = (data.lunchOrders ?? []).map(lunchToRow);
      const liveRows = [...orderRows, ...lunchRows];

      setDrivers(data.drivers ?? []);
      setVehicles(data.vehicles ?? []);
      if (data.capacity) setCapacity((prev) => ({ ...prev, ...data.capacity }));

      // settings 로드 (하차 슬롯 + 탭 데이터)
      let settings: Record<string, unknown> = {};
      try {
        const uRes = await fetch(`/api/settings`);
        const uData = await uRes.json();
        settings = uData.settings ?? {};
      } catch { /* ignore */ }

      // 하차 슬롯은 탭 캐시 초기화 후 세팅 (아래에서)

      // 탭 시스템 로드
      const savedMainTab = (settings[`dispatch_main_tab_${date}`] as number) || 1;
      setMainTab(savedMainTab);

      // 모든 탭 캐시 초기화
      tabCacheRef.current = {};
      unloadCacheRef.current = {};
      // 탭별 하차 슬롯 로드
      for (let t = 1; t <= TAB_COUNT; t++) {
        const uk = settings[`dispatch_unloads_${date}_${t}`];
        unloadCacheRef.current[t] = Array.isArray(uk) ? uk as DispatchRow[] : [];
      }
      // 메인 탭 하차가 없으면 레거시 키에서 가져오기
      if (unloadCacheRef.current[savedMainTab].length === 0) {
        const legacy = settings[`dispatch_unloads_${date}`];
        if (Array.isArray(legacy)) unloadCacheRef.current[savedMainTab] = legacy as DispatchRow[];
      }

      // 메인 탭 = 라이브 DB 데이터
      tabCacheRef.current[savedMainTab] = liveRows;

      // 비메인 탭 로드 (저장된 오버레이 적용)
      for (let t = 1; t <= TAB_COUNT; t++) {
        if (t === savedMainTab) continue;
        const tabData = settings[`dispatch_tab_${date}_${t}`] as Array<Record<string, unknown>> | undefined;
        if (tabData && Array.isArray(tabData)) {
          const merged = liveRows.map((r) => {
            const saved = tabData.find((s) => s.id === r.id);
            if (!saved) return { ...r, driverName: "", driverId: "", driverPhone: "", vehicleId: "", routeOrder: 0, isDispatched: false };
            return {
              ...r,
              driverName: (saved.driverName as string) ?? "",
              driverId: (saved.driverId as string) ?? "",
              driverPhone: (saved.driverPhone as string) ?? "",
              vehicleId: (saved.vehicleId as string) ?? "",
              routeOrder: (saved.routeOrder as number) ?? 0,
              isDispatched: !!(saved.driverName),
            };
          });
          tabCacheRef.current[t] = merged;
        }
      }

      // 현재 활성 탭 데이터 표시 (메인 탭으로 시작)
      setRows(tabCacheRef.current[savedMainTab] ?? liveRows);
      setUnloadSlots(unloadCacheRef.current[savedMainTab] ?? []);
      setActiveTab(savedMainTab);
    } catch {
      toast.error("배차 데이터 조회 실패");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── 탭 전환 ────────────────────────────

  const saveTabToSettings = useCallback(async (tab: number, tabRows: DispatchRow[]) => {
    if (tab === mainTab) return; // 메인 탭은 orders 직접 저장
    const assignments = tabRows.map((r) => ({
      id: r.id, type: r.type, driverName: r.driverName, driverId: r.driverId,
      driverPhone: r.driverPhone, vehicleId: r.vehicleId, routeOrder: r.routeOrder,
    }));
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: `dispatch_tab_${date}_${tab}`, value: assignments }),
      });
    } catch { /* ignore */ }
  }, [date, mainTab]);

  const switchTab = useCallback((newTab: number) => {
    if (newTab === activeTab) return;

    // 현재 탭 캐시 저장
    const currentRows = rowsRef.current;
    tabCacheRef.current[activeTab] = [...currentRows];
    unloadCacheRef.current[activeTab] = [...unloadSlots];
    if (activeTab !== mainTab) saveTabToSettings(activeTab, currentRows);

    // 새 탭 로드 — rows
    let newRows: DispatchRow[];
    if (tabCacheRef.current[newTab]) {
      newRows = [...tabCacheRef.current[newTab]];
    } else {
      const baseRows = tabCacheRef.current[mainTab] ?? currentRows;
      newRows = baseRows.map((r) => ({
        ...r, driverName: "", driverId: "", driverPhone: "", vehicleId: "",
        routeOrder: 0, isDispatched: false,
      }));
      tabCacheRef.current[newTab] = newRows;
      saveTabToSettings(newTab, newRows);
    }

    // 새 탭 로드 — 하차 슬롯
    setUnloadSlots(unloadCacheRef.current[newTab] ?? []);

    setRows(newRows);
    setActiveTab(newTab);
  }, [activeTab, mainTab, unloadSlots, saveTabToSettings, setRows]);

  const setAsMainTab = useCallback(async (tab: number) => {
    if (tab === mainTab) return;
    const tabRows = tabCacheRef.current[tab] ?? rowsRef.current;

    // 이 탭의 배정을 실제 orders에 적용
    const assignments = tabRows
      .filter((r) => r.type !== "unload")
      .map((r) => ({
        type: r.type, id: r.id, driverId: r.driverId, driverName: r.driverName,
        driverPhone: r.driverPhone, vehicleId: r.vehicleId, routeOrder: r.routeOrder,
      }));

    try {
      await fetch("/api/dispatch/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments }),
      });

      // 메인 탭 번호 저장
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: `dispatch_main_tab_${date}`, value: tab }),
      });

      setMainTab(tab);
      toast.success(`탭 ${tab}을 메인으로 설정 완료`);
    } catch {
      toast.error("메인 설정 실패");
    }
    setTabCtxMenu(null);
  }, [mainTab, date]);

  // ─── Filter & Sort ────────────────────────────

  const allRows = [...rows, ...unloadSlots];
  const filteredRows = allRows
    .filter((r) => r.type === "unload" || typeFilter === "all" || r.type === typeFilter)
    .filter((r) => {
      if (r.type === "unload") return true;
      if (statusFilter === "unassigned") return !r.driverName;
      if (statusFilter === "assigned") return !!r.driverName;
      return true;
    })
    .filter((r) => r.type === "unload" || !driverFilter || r.driverName.includes(driverFilter))
    .filter((r) => r.type === "unload" || zoneFilter === "all" || r.zone === zoneFilter)
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "time") {
        const diff = a.timeSortKey - b.timeSortKey;
        if (diff !== 0) return diff * dir;
        return (a.routeOrder - b.routeOrder) * dir;
      }
      if (sortKey === "amount") return (a.amount - b.amount) * dir;
      if (sortKey === "routeOrder") return (a.routeOrder - b.routeOrder) * dir;
      return a.name.localeCompare(b.name) * dir;
    });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sortIcon = (key: SortKey) => sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  // ─── 하차 슬롯 추가 ────────────────────────────

  const saveUnloads = useCallback(async (slots: DispatchRow[]) => {
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: `dispatch_unloads_${date}_${activeTab}`, value: slots }),
      });
    } catch { /* ignore */ }
  }, [date, activeTab]);

  const addUnloadSlot = (afterTimeSortKey: number, vehicle: Vehicle) => {
    const unloadTime = afterTimeSortKey + 0.5;
    const id = `unload-${Date.now()}`;
    const h = Math.floor(unloadTime);
    const period = h < 12 ? "오전" : "오후";
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const newSlot: DispatchRow = {
      type: "unload", id, date, name: "하차", time: "",
      timeDisplay: `${period} ${displayH}:00~`, timeSortKey: unloadTime,
      address: `${vehicle.vehicleType} ${vehicle.plateNumber}`, phone: "", items: "", amount: 0, volume: 0,
      driverName: "", driverId: "", driverPhone: "", vehicleId: vehicle.id, routeOrder: 0, isDispatched: false, status: "", needLadder: false,
      zone: "기타", district: null,
    };
    const updated = [...unloadSlots, newSlot];
    setUnloadSlots(updated);
    saveUnloads(updated);
    setCtxMenu(null);
    toast.success(`하차 슬롯 추가 — ${vehicle.vehicleType} ${vehicle.plateNumber}`);
  };

  const removeUnloadSlot = (id: string) => {
    const updated = unloadSlots.filter((s) => s.id !== id);
    setUnloadSlots(updated);
    saveUnloads(updated);
  };

  // ─── 시간 슬롯 이동 ────────────────────────────

  const moveToSlot = async (row: DispatchRow, newHour: number) => {
    // ABC 타임 테스트 모드: UI 오버라이드만 조작 (DB/rows 미변경)
    if (abcMode) {
      const blockIdx = newHour < 13 ? 0 : newHour < 17 ? 1 : 2;
      setAbcAssignment((prev) => {
        const next = new Map(prev);
        next.set(row.id, blockIdx);
        return next;
      });
      setEditingTimeRowId(null);
      return;
    }

    const newTimeDisplay = newHour < 12 ? `오전 ${newHour}:00`
      : newHour === 12 ? "오후 12:00"
      : `오후 ${newHour - 12}:00`;

    setRows((prev) => prev.map((r) => r.id === row.id
      ? { ...r, timeSortKey: newHour, timeDisplay: newTimeDisplay, time: newTimeDisplay }
      : r
    ));
    setEditingTimeRowId(null);

    try {
      const endpoint = row.type === "order" ? `/api/orders` : `/api/lunch`;
      const body = row.type === "order"
        ? { id: row.id, timeSlot: newTimeDisplay }
        : { id: row.id, pickupTime: newTimeDisplay };
      await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      toast.error("시간 변경 실패");
      fetchData(true);
    }
  };

  // ─── Assign driver + vehicle ────────────────────────────

  const assignDriverVehicle = async (row: DispatchRow, driverNames: string[], vehicleId: string) => {
    const combined = driverNames.join(", ");
    const firstDriver = drivers.find((d) => d.name === driverNames[0]);

    const updatedRows = rowsRef.current.map((r) => r.id === row.id
      ? { ...r, driverName: combined, driverId: firstDriver?.id ?? "", driverPhone: firstDriver?.phone ?? "", vehicleId, isDispatched: !!combined }
      : r
    );
    setRows(updatedRows);
    tabCacheRef.current[activeTab] = updatedRows;

    try {
      if (activeTab === mainTab) {
        // 메인 탭: 실제 orders에 저장
        await fetch("/api/dispatch/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assignments: [{
              type: row.type, id: row.id,
              driverId: firstDriver?.id ?? "",
              driverName: combined,
              driverPhone: firstDriver?.phone ?? "",
              vehicleId,
              routeOrder: row.routeOrder,
            }],
          }),
        });
      } else {
        // 비메인 탭: settings에 저장
        saveTabToSettings(activeTab, updatedRows);
      }
    } catch {
      toast.error("배정 실패");
      fetchData(true);
    }
  };

  // ─── Drag & Drop ────────────────────────────
  // 규칙:
  //  • 고정 시간 주문 → 같은 시간 슬롯 내 순서 변경만 가능
  //  • 레인지 주문 (오전 11:00~오후 12:00) → 레인지 범위 안에서만 이동, 시간 텍스트 유지
  //  • 빈 슬롯으로도 드롭 가능 (레인지 범위 내)

  const handleDragStart = (e: React.DragEvent, row: DispatchRow) => {
    if (row.type === "unload") { e.preventDefault(); return; }
    setDragRowId(row.id);
    draggedRowRef.current = row;
    e.dataTransfer.effectAllowed = "move";
    const ghost = document.createElement("div");
    ghost.style.cssText = "position:absolute;top:-999px;padding:8px 16px;background:#1AA3FF;color:#fff;border-radius:8px;font-size:13px;font-weight:600;white-space:nowrap;";
    ghost.textContent = row.name ?? "이동";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    requestAnimationFrame(() => document.body.removeChild(ghost));
  };

  const handleDragOverRow = (e: React.DragEvent, row: DispatchRow) => {
    if (row.type === "unload" || !draggedRowRef.current) return;
    const targetHour = Math.floor(row.timeSortKey);
    if (!canDropAtHour(draggedRowRef.current, targetHour)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverTarget(row.id);
  };

  const handleDragOverEmpty = (e: React.DragEvent, hour: number) => {
    if (!draggedRowRef.current) return;
    if (!canDropAtHour(draggedRowRef.current, hour)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverTarget(`empty-${hour}`);
  };

  const handleDragEnd = () => {
    setDragRowId(null);
    setDragOverTarget(null);
    draggedRowRef.current = null;
  };

  /**
   * 행 위에 드롭: 드래그한 row 를 target row 위치에 삽입 (target 포함 아래 row들은 한 칸씩 뒤로).
   * 같은 슬롯 내 재배치, 다른 슬롯으로의 이동 모두 처리.
   * 슬롯 내 전체 routeOrder 를 1,2,3… 순차 재할당해 DB 저장.
   */
  const handleDropOnRow = async (e: React.DragEvent, toRow: DispatchRow) => {
    e.preventDefault();
    const fromRow = draggedRowRef.current;
    if (!fromRow || fromRow.id === toRow.id || toRow.type === "unload") { handleDragEnd(); return; }

    const targetHour = Math.floor(toRow.timeSortKey);
    if (!canDropAtHour(fromRow, targetHour)) { handleDragEnd(); return; }

    // 1. 현재 rows 기반 target slot 멤버 재구성
    const slotMembers = rows
      .filter((r) => r.type !== "unload" && Math.floor(r.timeSortKey) === targetHour && r.id !== fromRow.id)
      .slice()
      .sort((a, b) => (a.routeOrder || 0) - (b.routeOrder || 0));

    const insertIdx = slotMembers.findIndex((r) => r.id === toRow.id);
    const insertAt = insertIdx >= 0 ? insertIdx : slotMembers.length;
    slotMembers.splice(insertAt, 0, fromRow);

    // 2. 순차 routeOrder 할당
    const newOrders = new Map<string, number>();
    slotMembers.forEach((r, i) => newOrders.set(r.id, i + 1));

    // 3. React state 업데이트 (fromRow 는 timeSortKey 도 갱신, 나머지는 routeOrder만)
    setRows((prev) => prev.map((r) => {
      const newOrder = newOrders.get(r.id);
      if (newOrder === undefined) return r;
      if (r.id === fromRow.id) {
        return { ...r, routeOrder: newOrder, timeSortKey: targetHour };
      }
      return { ...r, routeOrder: newOrder };
    }));
    handleDragEnd();

    // 4. DB 저장: 슬롯 전체 assignments
    try {
      const assignments = slotMembers.map((r) => ({
        type: r.type, id: r.id,
        driverId: r.driverId, driverName: r.driverName, driverPhone: r.driverPhone,
        vehicleId: r.vehicleId, routeOrder: newOrders.get(r.id) ?? 0,
      }));
      await fetch("/api/dispatch/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments }),
      });
    } catch {
      toast.error("순서 저장 실패");
      fetchData(true);
    }
  };

  /** 빈 슬롯에 드롭: 레인지 주문을 범위 내 빈 시간으로 이동 */
  const handleDropOnEmpty = async (e: React.DragEvent, hour: number) => {
    e.preventDefault();
    const fromRow = draggedRowRef.current;
    if (!fromRow) { handleDragEnd(); return; }
    if (!canDropAtHour(fromRow, hour)) { handleDragEnd(); return; }

    // 같은 슬롯이면 무시
    if (Math.floor(fromRow.timeSortKey) === hour) { handleDragEnd(); return; }

    setRows((prev) => prev.map((r) => {
      if (r.id === fromRow.id) {
        return { ...r, timeSortKey: hour, routeOrder: 1 };
      }
      return r;
    }));
    handleDragEnd();

    // DB 저장: routeOrder만 (시간 텍스트는 레인지 유지)
    try {
      await fetch("/api/dispatch/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignments: [{
            type: fromRow.type, id: fromRow.id,
            driverId: fromRow.driverId, driverName: fromRow.driverName, driverPhone: fromRow.driverPhone,
            vehicleId: fromRow.vehicleId, routeOrder: 1,
          }],
        }),
      });
    } catch {
      toast.error("순서 저장 실패");
      fetchData(true);
    }
  };

  // ─── Stats ────────────────────────────────

  // 야간 주문은 배차 대상이 아니므로 집계에서 제외
  const dispatchableRows = rows.filter((r) => !(r.time.includes("야간") || r.timeSortKey >= 21));
  const orderCount = dispatchableRows.filter((r) => r.type === "order").length;
  const lunchCount = dispatchableRows.filter((r) => r.type === "lunch").length;
  const assignedCount = dispatchableRows.filter((r) => r.driverName).length;

  const orderVolume = dispatchableRows.filter((r) => r.type === "order").reduce((s, r) => s + r.volume, 0);
  const cap1t = capacity.truck1t || 7;
  const cap25t = capacity.truck25t || 10;

  const totalVolumeTag = orderVolume === 0 ? ""
    : orderVolume <= cap1t ? `1톤 ${truckLabel(orderVolume, cap1t)}`
    : `2.5톤 ${truckLabel(orderVolume, cap25t)}`;
  const isMultiTruck = orderVolume > cap25t;

  // ─── Render ────────────────────────────────

  // 권한 체크 — 허용되지 않은 사용자는 빈 화면 (useEffect에서 리다이렉트 예정)
  if (!authLoading && user && !isAllowed) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--app-bg)" }}>
        <div style={{ textAlign: "center", color: "var(--app-text-tertiary)" }}>
          <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>접근 권한이 없습니다</p>
          <p style={{ fontSize: 13, marginTop: 4, margin: "4px 0 0" }}>배차 관리는 지정된 담당자만 이용할 수 있습니다</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", backgroundColor: "var(--app-bg)" }}>
      {/* ── Header ── */}
      <div style={{ backgroundColor: "var(--app-surface)", borderBottom: "1px solid var(--app-border)", padding: "16px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>배차 관리</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button onClick={() => setDate(shiftDate(date, -1))} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--app-text-secondary)" }}>
                <ChevronLeft style={{ width: 18, height: 18 }} />
              </button>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                style={{ fontSize: 15, fontWeight: 600, color: "var(--app-text-primary)", border: "none", background: "none", cursor: "pointer", padding: "4px 8px" }} />
              <span style={{ fontSize: 14, color: "var(--app-text-tertiary)" }}>{formatDateLabel(date)}</span>
              <button onClick={() => setDate(shiftDate(date, 1))} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--app-text-secondary)" }}>
                <ChevronRight style={{ width: 18, height: 18 }} />
              </button>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setShowDriverModal(true)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)", fontSize: 13, fontWeight: 600, color: "var(--app-text-secondary)", cursor: "pointer" }}>
              <Users style={{ width: 14, height: 14 }} /> 기사관리
            </button>
            <button onClick={() => setShowVehicleModal(true)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)", fontSize: 13, fontWeight: 600, color: "var(--app-text-secondary)", cursor: "pointer" }}>
              <Truck style={{ width: 14, height: 14 }} /> 차량관리
            </button>
            <button onClick={() => setShowCapModal(true)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)", fontSize: 13, fontWeight: 600, color: "var(--app-text-secondary)", cursor: "pointer" }}>
              <Settings2 style={{ width: 14, height: 14 }} /> 케파설정
            </button>
            <button onClick={() => setShowAbcCapModal(true)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)", fontSize: 13, fontWeight: 600, color: "var(--app-text-secondary)", cursor: "pointer" }}>
              <Settings2 style={{ width: 14, height: 14 }} /> ABC 케파설정
            </button>
            <button onClick={() => setShowBulkAssignModal(true)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--app-accent)", backgroundColor: "var(--app-accent)", fontSize: 13, fontWeight: 600, color: "white", cursor: "pointer" }}>
              <Plus style={{ width: 14, height: 14 }} /> 외부 배차 붙여넣기
            </button>
            <button onClick={() => fetchData()} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)", fontSize: 13, fontWeight: 600, color: "var(--app-text-secondary)", cursor: "pointer" }}>
              <RefreshCw style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>

        {/* 요약 단축 버튼 — 클릭 시 모달로 상세 표시 */}
        <div>
          <button onClick={() => setShowSummaryModal(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px",
              border: "1px solid var(--app-border)", borderRadius: 8, fontSize: 13,
              backgroundColor: "var(--app-surface)", color: "var(--app-text-primary)", cursor: "pointer",
            }}
            title="클릭하여 상세 요약 보기">
            <span style={{ fontWeight: 600 }}>요약</span>
            <span style={{ color: "var(--app-text-tertiary)" }}>·</span>
            <span>{dispatchableRows.length}건</span>
            {orderVolume > 0 && <><span style={{ color: "var(--app-text-tertiary)" }}>·</span><span>{orderVolume.toFixed(1)}m³</span></>}
            <span style={{ color: "var(--app-text-tertiary)" }}>·</span>
            <span>배정 {assignedCount}/{dispatchableRows.length}</span>
            {zoneFilter !== "all" && (() => {
              const c = ZONE_COLORS[zoneFilter];
              return <span style={{ marginLeft: 4, padding: "1px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}>{zoneNumber(zoneFilter)}. {zoneFilter}</span>;
            })()}
          </button>
        </div>

        {/* 탭 시나리오 */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: 14, borderBottom: "2px solid var(--app-border)" }}>
          {Array.from({ length: TAB_COUNT }, (_, i) => i + 1).map((tab) => {
            const isActive = tab === activeTab;
            const isMain = tab === mainTab;
            return (
              <button key={tab}
                onClick={() => switchTab(tab)}
                onContextMenu={(e) => { e.preventDefault(); setTabCtxMenu({ x: e.clientX, y: e.clientY, tab }); }}
                style={{
                  padding: "8px 20px", fontSize: 14, fontWeight: isActive ? 700 : 500, cursor: "pointer",
                  border: "none", borderBottom: isActive ? "3px solid var(--app-accent)" : "3px solid transparent",
                  backgroundColor: isActive ? "var(--app-surface)" : "transparent",
                  color: isActive ? "var(--app-accent)" : "var(--app-text-secondary)",
                  marginBottom: -2, borderRadius: "8px 8px 0 0", position: "relative",
                }}>
                {isMain && <span style={{ fontSize: 10, color: "#EF4444", marginRight: 4 }}>●</span>}
                시나리오 {tab}
                {isMain && <span style={{ fontSize: 10, color: "var(--app-text-tertiary)", marginLeft: 4 }}>(메인)</span>}
              </button>
            );
          })}
        </div>

        {/* 탭 우클릭 메뉴 */}
        {tabCtxMenu && (
          <>
            <div onClick={() => setTabCtxMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 1099 }} />
            <div style={{ position: "fixed", left: tabCtxMenu.x, top: tabCtxMenu.y, zIndex: 1100, backgroundColor: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 8, boxShadow: "var(--app-shadow-lg)", padding: "4px 0", minWidth: 150 }}>
              <button onClick={() => { setAsMainTab(tabCtxMenu.tab); setTabCtxMenu(null); }}
                disabled={tabCtxMenu.tab === mainTab}
                style={{ display: "block", width: "100%", padding: "10px 16px", fontSize: 14, textAlign: "left", background: "none", border: "none", cursor: tabCtxMenu.tab === mainTab ? "default" : "pointer", color: tabCtxMenu.tab === mainTab ? "var(--app-text-placeholder)" : "var(--app-text-primary)" }}
                onMouseEnter={(e) => { if (tabCtxMenu.tab !== mainTab) e.currentTarget.style.backgroundColor = "var(--app-surface-secondary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}>
                {tabCtxMenu.tab === mainTab ? "이미 메인입니다" : "메인으로 설정"}
              </button>
            </div>
          </>
        )}

        {/* Filters */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, fontSize: 13 }}>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid var(--app-input-border)", fontSize: 13, color: "var(--app-text-primary)", backgroundColor: "var(--app-surface)", cursor: "pointer" }}>
            <option value="all">전체</option>
            <option value="order">방문수거</option>
            <option value="lunch">런치</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid var(--app-input-border)", fontSize: 13, color: "var(--app-text-primary)", backgroundColor: "var(--app-surface)", cursor: "pointer" }}>
            <option value="all">전체 상태</option>
            <option value="unassigned">미배정</option>
            <option value="assigned">배정완료</option>
          </select>
          <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)}
            style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid var(--app-input-border)", fontSize: 13, color: "var(--app-text-primary)", backgroundColor: "var(--app-surface)", cursor: "pointer" }}>
            <option value="">기사: 전체</option>
            {drivers.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
          <select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value as Zone | "all")}
            style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid var(--app-input-border)", fontSize: 13, color: "var(--app-text-primary)", backgroundColor: "var(--app-surface)", cursor: "pointer" }}>
            <option value="all">권역: 전체</option>
            {ZONE_ORDER.map((z) => <option key={z} value={z}>{zoneNumber(z)}. {z}</option>)}
          </select>
          <button type="button"
            onClick={() => {
              setFreeMoveMode((v) => {
                const next = !v;
                if (next) setAbcMode(false); // 자유이동 ON 시 ABC OFF (상호 배타)
                return next;
              });
            }}
            title={freeMoveMode ? "원래 시간으로 복구" : "모든 주문을 오전 9~오후 8 레인지로 표시 (DB 미변경)"}
            style={{
              padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: `1px solid ${freeMoveMode ? "#9333EA" : "var(--app-input-border)"}`,
              backgroundColor: freeMoveMode ? "#F5F3FF" : "var(--app-surface)",
              color: freeMoveMode ? "#6D28D9" : "var(--app-text-secondary)",
              cursor: "pointer",
            }}>
            {freeMoveMode ? "● 자유이동 ON" : "자유이동 (테스트)"}
          </button>
          <button type="button"
            onClick={() => {
              setAbcMode((v) => {
                const next = !v;
                if (next) {
                  setFreeMoveMode(false); // ABC ON 시 자유이동 OFF
                  // 새 랜덤 분배 (토글 ON 마다 재생성)
                  const m = new Map<string, number>();
                  for (const r of rows) {
                    if (r.type === "unload") continue;
                    m.set(r.id, Math.floor(Math.random() * 3));
                  }
                  setAbcAssignment(m);
                } else {
                  setAbcAssignment(new Map());
                }
                return next;
              });
            }}
            title={abcMode ? "원래 시간으로 복구" : "모든 주문을 9~12/13~16/17~20 3개 블록 중 랜덤 배분 (DB 미변경, 토글마다 재섞음)"}
            style={{
              padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: `1px solid ${abcMode ? "#DC2626" : "var(--app-input-border)"}`,
              backgroundColor: abcMode ? "#FEF2F2" : "var(--app-surface)",
              color: abcMode ? "#B91C1C" : "var(--app-text-secondary)",
              cursor: "pointer",
            }}>
            {abcMode ? "● ABC 타임 ON" : "ABC 타임 (테스트)"}
          </button>
          <button type="button" onClick={() => setZoneBgEnabled((v) => !v)}
            title={zoneBgEnabled ? "권역 배경색 끄기" : "권역 배경색 켜기"}
            style={{
              padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: `1px solid ${zoneBgEnabled ? "#0EA5E9" : "var(--app-input-border)"}`,
              backgroundColor: zoneBgEnabled ? "#F0F9FF" : "var(--app-surface)",
              color: zoneBgEnabled ? "#0369A1" : "var(--app-text-secondary)",
              cursor: "pointer",
            }}>
            {zoneBgEnabled ? "● 권역 배경색 ON" : "권역 배경색"}
          </button>
        </div>


      </div>

      {/* 요약 모달 — 상단 단축 버튼 클릭 시 오픈 */}
      {showSummaryModal && (
        <div onClick={() => setShowSummaryModal(false)}
          style={{ position: "fixed", inset: 0, zIndex: 1200, backgroundColor: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: 720, maxWidth: "90vw", maxHeight: "85vh", overflow: "auto", backgroundColor: "var(--app-surface)", borderRadius: 12, boxShadow: "var(--app-shadow-lg)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--app-border)" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--app-text-primary)" }}>배차 요약 — {date}</div>
              <button onClick={() => setShowSummaryModal(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                <X style={{ width: 18, height: 18, color: "var(--app-text-tertiary)" }} />
              </button>
            </div>
            <div style={{ padding: "16px 20px" }}>
              {/* 기본 메트릭 */}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, fontSize: 13, paddingBottom: 14, borderBottom: "1px solid var(--app-border-light)" }}>
                <span style={{ ...BADGE("var(--app-tag-blue-bg)", "var(--app-accent)") }}>방문수거 {orderCount}건</span>
                <span style={{ ...BADGE("var(--app-tag-orange-bg)", "var(--app-tag-orange-text)") }}>런치 {lunchCount}건</span>
                {orderVolume > 0 && (
                  <>
                    <span style={{ color: "var(--app-text-secondary)" }}>적재 <strong>{orderVolume.toFixed(1)}m³</strong></span>
                    <span style={{ ...BADGE(isMultiTruck ? "#FEF3C7" : "#D1FAE5", isMultiTruck ? "#92400E" : "#047857"), fontSize: 12 }}>{totalVolumeTag}</span>
                  </>
                )}
                <span style={{ color: "var(--app-text-tertiary)" }}>배정 {assignedCount}/{dispatchableRows.length}</span>
              </div>

              {/* 권역 카드 */}
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 8 }}>권역별 (클릭하여 필터 적용)</div>
                {(() => {
                  type ZoneStat = { zone: Zone; count: number; volume: number; assigned: number };
                  const stats = new Map<Zone, ZoneStat>();
                  for (const r of dispatchableRows) {
                    if (r.type === "unload") continue;
                    const s = stats.get(r.zone) ?? { zone: r.zone, count: 0, volume: 0, assigned: 0 };
                    s.count++;
                    s.volume += r.volume || 0;
                    if (r.driverName) s.assigned++;
                    stats.set(r.zone, s);
                  }
                  const visible = ZONE_ORDER.map((z) => stats.get(z)).filter((s): s is ZoneStat => !!s && s.count > 0);
                  if (visible.length === 0) return <div style={{ fontSize: 13, color: "var(--app-text-tertiary)" }}>해당 날짜 주문 없음</div>;
                  return (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                      {visible.map((s) => {
                        const c = ZONE_COLORS[s.zone];
                        const active = zoneFilter === s.zone;
                        return (
                          <button key={s.zone} type="button"
                            onClick={() => { setZoneFilter(active ? "all" : s.zone); setShowSummaryModal(false); }}
                            style={{
                              padding: "10px 12px", borderRadius: 8, fontSize: 12,
                              backgroundColor: c.bg, color: c.text,
                              border: `1.5px solid ${active ? c.text : c.border}`,
                              cursor: "pointer", fontWeight: active ? 700 : 500, textAlign: "left",
                              display: "flex", flexDirection: "column", gap: 4,
                            }}>
                            <span style={{ fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: "50%", backgroundColor: c.text, color: "white", fontSize: 11, fontWeight: 800 }}>{zoneNumber(s.zone)}</span>
                              {s.zone}
                            </span>
                            <span style={{ fontSize: 11, opacity: 0.9 }}>
                              {s.count}건 · {s.volume > 0 ? `${s.volume.toFixed(1)}m³ · ` : ""}배정 {s.assigned}/{s.count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
                {zoneFilter !== "all" && (
                  <button onClick={() => { setZoneFilter("all"); setShowSummaryModal(false); }}
                    style={{ marginTop: 10, padding: "6px 12px", borderRadius: 6, fontSize: 12, backgroundColor: "transparent", color: "var(--app-text-secondary)", border: "1px dashed var(--app-border)", cursor: "pointer" }}>
                    권역 필터 해제
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 세로 시간축 테이블 ── */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }} onClick={() => { ctxMenu && setCtxMenu(null); editingRowId && setEditingRowId(null); tabCtxMenu && setTabCtxMenu(null); }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, color: "var(--app-text-tertiary)" }}>
            <Loader2 style={{ width: 20, height: 20, animation: "spin 1s linear infinite" }} /> 로딩 중...
          </div>
        ) : (
          <div style={{ border: "1px solid var(--app-border)", borderRadius: 12, overflow: "hidden", backgroundColor: "var(--app-surface)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 28, textAlign: "center", padding: "11px 4px" }}>
                  <ColTogglesMenu all={TOGGLEABLE_COLS} hidden={hiddenCols} toggle={toggleCol} />
                </th>
                <th style={{ ...TH, width: 72, textAlign: "center" }}>시간</th>
                {!isHidden("type") && <th style={{ ...TH, width: 72 }}><ColHead label="구분" onHide={() => toggleCol("type")} /></th>}
                {!isHidden("name") && <th style={TH}><ColHead label="고객" onHide={() => toggleCol("name")} /></th>}
                <th style={{ ...TH, width: 130 }}>시간</th>
                <th style={TH}>주소</th>
                {!isHidden("phone") && <th style={{ ...TH, width: 120 }}><ColHead label="연락처" onHide={() => toggleCol("phone")} /></th>}
                {!isHidden("items") && <th style={TH}><ColHead label="품목" onHide={() => toggleCol("items")} /></th>}
                <th style={{ ...TH, width: 130 }}>부피</th>
                {!isHidden("amount") && <th style={{ ...TH, width: 80 }}><ColHead label="금액" onHide={() => toggleCol("amount")} /></th>}
                <th style={{ ...TH, width: 140 }}>기사/차량</th>
                <th style={{ ...TH, width: 68, borderRight: "none" }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const HOURS = Array.from({ length: 12 }, (_, i) => i + 9); // 9~20 (야간 제외)
                const rowsByHour = new Map<number, DispatchRow[]>();
                for (const h of HOURS) rowsByHour.set(h, []);

                // 자유이동 / ABC 타임 테스트 모드: UI 오버라이드 (DB 미변경)
                const ABC_BLOCKS = [
                  { label: "오전 9:00~오후 12:00", start: 9 },
                  { label: "오후 1:00~오후 4:00", start: 13 },
                  { label: "오후 5:00~오후 8:00", start: 17 },
                ];
                const hashId = (id: string) => {
                  let h = 0;
                  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
                  return Math.abs(h);
                };
                const displayRows: DispatchRow[] = abcMode
                  ? filteredRows.map((r) => {
                      if (r.type === "unload") return r;
                      const idx = abcAssignment.get(r.id) ?? (hashId(r.id) % 3);
                      const block = ABC_BLOCKS[idx];
                      return { ...r, time: block.label, timeDisplay: block.label, timeSortKey: block.start };
                    })
                  : freeMoveMode
                  ? filteredRows.map((r) => r.type === "unload" ? r : { ...r, time: "오전 9:00~오후 8:00", timeDisplay: "오전 9:00~오후 8:00" })
                  : filteredRows;

                for (const r of displayRows) {
                  // 야간 주문은 배차 대상 아님 → 스킵 (원본 기준)
                  if (r.type !== "unload" && !freeMoveMode && !abcMode && (r.time.includes("야간") || r.timeSortKey >= 21)) continue;
                  const h = Math.floor(r.timeSortKey);
                  if (h >= 9 && h <= 20) rowsByHour.get(h)!.push(r);
                  else if (h < 9) rowsByHour.get(9)!.push(r);
                  else rowsByHour.get(20)!.push(r);
                }

                const hourStr = (h: number) => {
                  if (h < 12) return `오전\n${h}시`;
                  if (h === 12) return `오후\n12시`;
                  return `오후\n${h - 12}시`;
                };

                // 시간대별 좌측 컬러 바: 오전=파랑, 오후=초록
                const hourBarColor = (h: number) =>
                  h >= 12 ? "#10B981" : "#3B82F6";

                const TCELL: React.CSSProperties = {
                  ...TD, textAlign: "center", fontWeight: 600, fontSize: 13,
                  color: "var(--app-text-secondary)", backgroundColor: "transparent",
                  borderRight: "1px solid var(--app-border-light)",
                  verticalAlign: "middle", width: 72, whiteSpace: "pre-line",
                  position: "relative",
                };

                const flatOrder: { hour: number; row: DispatchRow | null; isFirst: boolean; slotCount: number; isFull: boolean }[] = [];
                HOURS.forEach((hour) => {
                  const slotRows = rowsByHour.get(hour)!;
                  const isFull = slotRows.length >= (capacity.maxPerSlot || 3);
                  if (slotRows.length === 0) {
                    flatOrder.push({ hour, row: null, isFirst: true, slotCount: 0, isFull: false });
                  } else {
                    slotRows.forEach((r, i) => flatOrder.push({ hour, row: r, isFirst: i === 0, slotCount: slotRows.length, isFull }));
                  }
                });

                return flatOrder.map((entry, flatIdx) => {
                  const { hour, row, isFirst, slotCount, isFull } = entry;

                  if (!row) {
                    const emptyIsOver = dragOverTarget === `empty-${hour}`;
                    return (
                      <tr key={`empty-${hour}`}
                        onDragOver={(e) => handleDragOverEmpty(e, hour)}
                        onDrop={(e) => handleDropOnEmpty(e, hour)}
                        onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, rowId: "", timeSortKey: hour }); }}
                        style={{ backgroundColor: emptyIsOver ? "#DBEAFE" : undefined, borderTop: emptyIsOver ? "2px solid #1AA3FF" : undefined }}
                      >
                        <td style={{ ...TD, padding: "0 4px", borderTop: "2px solid var(--app-border)" }}></td>
                        <td style={{ ...TCELL, borderTop: "2px solid var(--app-border)" }}><div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: hourBarColor(hour) }} />{hourStr(hour)}</td>
                        <td colSpan={10} style={{ ...TD, borderRight: "none", color: emptyIsOver ? "var(--app-accent)" : "var(--app-text-placeholder)", textAlign: "center", padding: "16px 0", borderTop: "2px solid var(--app-border)" }}>
                          {emptyIsOver ? "여기에 놓기" : "—"}
                        </td>
                      </tr>
                    );
                  }

                  if (row.type === "unload") {
                    return (
                      <tr key={row.id} style={{ backgroundColor: "#FEF9C3" }}>
                        <td style={{ ...TD, padding: "0 4px", borderTop: isFirst ? "2px solid var(--app-border)" : undefined }}></td>
                        {isFirst && <td rowSpan={slotCount} style={{ ...TCELL, borderTop: "2px solid var(--app-border)" }}><div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: hourBarColor(hour) }} />{hourStr(hour)}{isFull ? "\nFULL" : ""}</td>}
                        <td colSpan={visibleDataColCount} style={{ ...TD, borderRight: "none", textAlign: "center", padding: "12px", borderTop: isFirst ? "2px solid var(--app-border)" : undefined }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: "#92400E" }}>하차 (1시간)</span>
                          {row.address && <span style={{ fontSize: 12, color: "#78716C", marginLeft: 8 }}>— {row.address}</span>}
                          <button onClick={() => removeUnloadSlot(row.id)} style={{ marginLeft: 12, fontSize: 12, color: "#DC2626", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>삭제</button>
                        </td>
                      </tr>
                    );
                  }

                  // 차량별 누적 (하차 슬롯 이후 리셋)
                  let driverCum = "";
                  if (row.driverName && Number(row.volume) > 0 && row.vehicleId) {
                    const vid = row.vehicleId;
                    // 이 차량의 주문들 + 하차 슬롯을 시간순으로 추출
                    const vehicleEntries = flatOrder.filter((e) =>
                      e.row && ((e.row.type === "order" && e.row.vehicleId === vid) || (e.row.type === "unload" && e.row.vehicleId === vid))
                    );
                    const myPos = vehicleEntries.findIndex((e) => e.row!.id === row.id);
                    if (myPos >= 0) {
                      // 마지막 하차 슬롯 이후부터 누적
                      let startIdx = 0;
                      for (let i = myPos - 1; i >= 0; i--) {
                        if (vehicleEntries[i].row!.type === "unload") { startIdx = i + 1; break; }
                      }
                      const cum = vehicleEntries.slice(startIdx, myPos + 1)
                        .filter((e) => e.row!.type === "order")
                        .reduce((s, e) => s + Number(e.row!.volume), 0);
                      const vehInfo = vehicles.find((v) => v.id === vid);
                      const label = vehInfo ? vehInfo.plateNumber : row.driverName.split(",")[0].trim();
                      driverCum = `${label} 누적 ${cum.toFixed(1)}`;
                    }
                  } else if (row.driverName && Number(row.volume) > 0) {
                    // vehicleId 없는 경우: 기사 기준 누적 (기존 방식)
                    const dName = row.driverName.split(",")[0].trim();
                    const allOrdered = flatOrder.filter((e) => e.row && e.row.type === "order" && e.row.driverName.includes(dName));
                    const myPos = allOrdered.findIndex((e) => e.row!.id === row.id);
                    if (myPos >= 0) {
                      const cum = allOrdered.slice(0, myPos + 1).reduce((s, e) => s + Number(e.row!.volume), 0);
                      driverCum = `${dName} 누적 ${cum.toFixed(1)}`;
                    }
                  }

                  // 차량 정보
                  const veh = row.vehicleId ? vehicles.find((v) => v.id === row.vehicleId) : null;

                  const isDragFrom = dragRowId === row.id;
                  const isDragOver = dragOverTarget === row.id;
                  // 권역 셀 배경 — drag state 가 아니고 토글 ON 일 때만 softBg 적용
                  const zoneCellBg = (isDragOver || isDragFrom || !zoneBgEnabled) ? undefined : ZONE_COLORS[row.zone].softBg;

                  return (
                    <tr key={row.id}
                      onDragOver={(e) => handleDragOverRow(e, row)}
                      onDrop={(e) => handleDropOnRow(e, row)}
                      onDragEnd={handleDragEnd}
                      onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, rowId: row.id, timeSortKey: row.timeSortKey }); }}
                      style={{
                        backgroundColor: isDragOver ? "#DBEAFE" : isDragFrom ? "#F1F5F9" : "var(--app-surface)",
                        opacity: isDragFrom ? 0.4 : 1,
                        borderLeft: `4px solid ${ZONE_COLORS[row.zone].text}`,
                        borderTop: isFirst ? "2px solid var(--app-border)" : isDragOver ? "2px solid #1AA3FF" : undefined,
                      }}
                    >
                      {/* 드래그 핸들 — 여기만 잡아서 D&D, 나머지는 텍스트 선택 가능 */}
                      <td key="drag" draggable onDragStart={(e) => handleDragStart(e, row)}
                        style={{ ...TD, padding: "8px 4px", textAlign: "center", cursor: "grab", userSelect: "none", color: "var(--app-text-placeholder)", fontSize: 14, borderTop: isFirst ? "2px solid var(--app-border)" : undefined }}
                        title="드래그하여 순서 변경">⠿</td>
                      {isFirst && <td key="hour" rowSpan={slotCount} style={{ ...TCELL, borderTop: "2px solid var(--app-border)" }}><div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: hourBarColor(hour) }} />{hourStr(hour)}{isFull ? "\nFULL" : ""}</td>}
                        {!isHidden("type") && (
                          <td key="type" style={{ ...TD, padding: "8px" }}>
                            <span style={{ ...BADGE(row.type === "order" ? "var(--app-tag-blue-bg)" : "var(--app-tag-orange-bg)", row.type === "order" ? "var(--app-accent)" : "var(--app-tag-orange-text)"), padding: "4px 10px", fontSize: 12 }}>
                              {row.type === "order" ? "방문수거" : "런치"}
                            </span>
                          </td>
                        )}
                        {!isHidden("name") && <td key="name" style={{ ...TD, fontWeight: 600, whiteSpace: "nowrap", maxWidth: 80 }}>{row.name}</td>}
                        {/* 시간 — 레인지 주문은 클릭하여 슬롯 이동 가능 */}
                        <td style={{ ...TD, position: "relative", fontSize: 13, backgroundColor: zoneCellBg }}>
                          {row.time.includes("~") ? (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); setEditingTimeRowId(editingTimeRowId === row.id ? null : row.id); }}
                                style={{ background: "none", border: "1px dashed var(--app-accent)", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 12, color: "var(--app-accent)", fontWeight: 600, lineHeight: 1.5, textAlign: "left" }}
                                title="클릭하여 시간 확정">
                                {(() => {
                                  const parts = row.timeDisplay.split("~");
                                  return parts.length === 2
                                    ? <>{parts[0].trim()}<br /><span style={{ color: "var(--app-text-tertiary)" }}>~ {parts[1].trim()}</span></>
                                    : row.timeDisplay;
                                })()}
                              </button>
                              {editingTimeRowId === row.id && (
                                <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 100, minWidth: 180, backgroundColor: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 8, boxShadow: "var(--app-shadow-lg)", padding: "4px 0", maxHeight: 240, overflowY: "auto" }}>
                                  {abcMode ? (
                                    [
                                      { h: 9, label: "오전 9:00~오후 12:00" },
                                      { h: 13, label: "오후 1:00~오후 4:00" },
                                      { h: 17, label: "오후 5:00~오후 8:00" },
                                    ].map((b) => (
                                      <button key={b.h} onClick={() => moveToSlot(row, b.h)}
                                        style={{ display: "block", width: "100%", padding: "8px 14px", fontSize: 13, textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "var(--app-text-primary)" }}
                                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--app-surface-secondary)"; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}>
                                        {b.label}
                                      </button>
                                    ))
                                  ) : (
                                    Array.from({ length: 12 }, (_, i) => i + 9).map((h) => (
                                      <button key={h} onClick={() => moveToSlot(row, h)}
                                        style={{ display: "block", width: "100%", padding: "7px 14px", fontSize: 13, textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "var(--app-text-primary)" }}
                                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--app-surface-secondary)"; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}>
                                        {h < 12 ? `오전 ${h}시` : h === 12 ? "오후 12시" : `오후 ${h - 12}시`}
                                      </button>
                                    ))
                                  )}
                                </div>
                              )}
                            </>
                          ) : (
                            <span style={{ color: "var(--app-text-primary)", fontSize: 13 }}>{row.timeDisplay}</span>
                          )}
                        </td>
                        <td style={{ ...TD, maxWidth: 220, backgroundColor: zoneCellBg }} title={row.address}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                            {(() => {
                              const c = ZONE_COLORS[row.zone];
                              return (
                                <span
                                  title={`${row.zone}${row.district ? ` · ${row.district}` : ""}`}
                                  style={{
                                    flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
                                    width: 22, height: 22, borderRadius: "50%",
                                    backgroundColor: c.bg, color: c.text, border: `1.5px solid ${c.text}`,
                                    fontSize: 12, fontWeight: 800, fontVariantNumeric: "tabular-nums",
                                    cursor: "help",
                                  }}>
                                  {zoneNumber(row.zone)}
                                </span>
                              );
                            })()}
                            <div style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden", lineHeight: 1.4 }}>
                              {row.district && <span style={{ color: "var(--app-text-tertiary)", fontSize: 12, marginRight: 4 }}>{row.district}</span>}
                              <span>{stripSidoPrefix(row.address)}</span>
                            </div>
                          </div>
                        </td>
                        {!isHidden("phone") && <td style={{ ...TD, whiteSpace: "nowrap" }}>{row.phone}</td>}
                        {!isHidden("items") && <td style={{ ...TD, maxWidth: 260, textAlign: "left", backgroundColor: zoneCellBg }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                            <div style={{ flex: 1, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const, overflow: "hidden", lineHeight: 1.4, fontSize: 15 }} title={row.items}>
                              {formatItemsNice(row.items)}
                            </div>
                            {row.sessionId && (
                              <button onClick={(e) => { e.stopPropagation(); setPhotoSessionId(row.sessionId!); }}
                                style={{ flexShrink: 0, padding: 3, borderRadius: 4, border: "none", background: "var(--app-surface-secondary)", cursor: "pointer", display: "flex", alignItems: "center" }}
                                title="품목 사진 보기">
                                <Camera style={{ width: 13, height: 13, color: "var(--app-text-tertiary)" }} />
                              </button>
                            )}
                          </div>
                          {row.needLadder && <span style={{ display: "inline-block", marginTop: 2, padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700, backgroundColor: "#FEE2E2", color: "#DC2626" }}>사다리</span>}
                        </td>}
                        <td style={{ ...TD, fontSize: 13, backgroundColor: zoneCellBg }}>
                          {Number(row.volume) > 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <strong>{Number(row.volume).toFixed(1)}</strong>
                                <span style={{ color: "var(--app-text-tertiary)", fontSize: 10 }}>m³</span>
                              </div>
                              <div style={{ marginTop: 3 }}>
                                <VolumeIndicator vol={Number(row.volume)} truckCap={cap1t} />
                              </div>
                              {driverCum && <div style={{ fontSize: 11, color: "#6366F1", marginTop: 3 }}>{driverCum}</div>}
                            </div>
                          ) : "-"}
                        </td>
                        {!isHidden("amount") && <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums", backgroundColor: zoneCellBg }}>{row.amount > 0 ? row.amount.toLocaleString() : "-"}</td>}
                        {/* 기사/차량 셀 — 기사 체크박스 + 차량 선택 */}
                        <td style={{ ...TD, padding: "6px 8px", position: "relative", backgroundColor: zoneCellBg }}>
                          {editingRowId === row.id && (
                            <DriverVehicleDropdown
                              row={row} drivers={drivers} vehicles={vehicles}
                              onAssign={(names, vid) => assignDriverVehicle(row, names, vid)}
                              onClose={() => setEditingRowId(null)}
                            />
                          )}
                          <button onClick={(e) => { e.stopPropagation(); setEditingRowId(editingRowId === row.id ? null : row.id); }}
                            style={{ width: "100%", padding: "5px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid var(--app-border)", textAlign: "left",
                              backgroundColor: row.driverName ? "var(--app-tag-green-bg)" : "var(--app-surface)", color: row.driverName ? "var(--app-tag-green-text)" : "var(--app-text-placeholder)" }}>
                            {row.driverName ? (
                              <div>
                                <div>{row.driverName}</div>
                                {veh && <div style={{ fontSize: 10, color: "var(--app-text-tertiary)", marginTop: 1 }}>{veh.vehicleType} {veh.plateNumber}</div>}
                              </div>
                            ) : "선택 ▾"}
                          </button>
                        </td>
                        <td style={{ ...TD, borderRight: "none", backgroundColor: zoneCellBg }}>
                          <span style={row.driverName ? BADGE("var(--app-tag-green-bg)", "var(--app-tag-green-text)") : BADGE("var(--app-surface-secondary)", "var(--app-text-tertiary)")}>
                            {row.driverName ? "배정" : "미배정"}
                          </span>
                        </td>
                      </tr>
                    );
                })
              })()}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* ── 우클릭 컨텍스트 메뉴 ── */}
      {ctxMenu && (
        <div style={{ position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 1100, backgroundColor: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 8, boxShadow: "var(--app-shadow-lg)", padding: "4px 0", minWidth: 160 }}>
          <button onClick={() => { setUnloadModalTime(ctxMenu.timeSortKey); setCtxMenu(null); }}
            style={{ display: "block", width: "100%", padding: "10px 16px", fontSize: 14, textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "var(--app-text-primary)" }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--app-surface-secondary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}>
            하차 추가 (1시간)
          </button>
        </div>
      )}

      {/* ── Modals ── */}
      {showDriverModal && <DriverModal onClose={() => setShowDriverModal(false)} onRefresh={() => fetchData(true)} />}
      {showBulkAssignModal && (
        <BulkAssignModal
          onClose={() => setShowBulkAssignModal(false)}
          onApplied={() => fetchData(true)}
        />
      )}
      {showVehicleModal && <VehicleModal onClose={() => setShowVehicleModal(false)} onRefresh={() => fetchData(true)} />}
      {showCapModal && <CapacityModal capacity={capacity} onClose={() => setShowCapModal(false)} onSave={(c) => { setCapacity(c); setShowCapModal(false); }} />}
      {showAbcCapModal && <AbcCapacityModal onClose={() => setShowAbcCapModal(false)} />}
      {unloadModalTime !== null && (
        <UnloadModal
          vehicles={vehicles}
          onClose={() => setUnloadModalTime(null)}
          onAdd={(vehicle) => { addUnloadSlot(unloadModalTime, vehicle); setUnloadModalTime(null); }}
        />
      )}
      {photoSessionId && (
        <PhotoModal sessionId={photoSessionId} onClose={() => setPhotoSessionId(null)} />
      )}
    </div>
  );
}

// ─── Photo Modal ──────────────────────────────

function PhotoModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [pos, setPos] = useState({ x: -1, y: -1 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/conversations/${sessionId}`);
        if (!res.ok) return;
        const data = await res.json();
        const msgs = data.messages ?? [];
        const urls = msgs
          .filter((m: { messageType: string; imageUrl?: string }) => m.messageType === "image" && m.imageUrl)
          .map((m: { imageUrl: string }) => m.imageUrl);
        setImages(urls);
      } catch {}
      setLoading(false);
    })();
  }, [sessionId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIdx((i) => Math.min(images.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, onClose]);

  // 센터 초기 위치
  useEffect(() => {
    if (pos.x === -1) setPos({ x: Math.max(50, (window.innerWidth - 600) / 2), y: Math.max(50, (window.innerHeight - 500) / 2) });
  }, [pos.x]);

  const onDragStart = (e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({ x: dragRef.current.origX + ev.clientX - dragRef.current.startX, y: dragRef.current.origY + ev.clientY - dragRef.current.startY });
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div style={{
      position: "fixed", left: pos.x, top: pos.y, zIndex: 9999,
      width: 600, backgroundColor: "var(--app-modal-bg, white)", borderRadius: 12,
      boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden",
    }}>
      {/* Header — 드래그 가능 */}
      <div onMouseDown={onDragStart} style={{
        padding: "12px 16px", cursor: "move",
        backgroundColor: "var(--app-surface)", borderBottom: "1px solid var(--app-border)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)" }}>
          품목 사진 {images.length > 0 ? `(${idx + 1}/${images.length})` : ""}
        </span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <X style={{ width: 16, height: 16, color: "var(--app-text-tertiary)" }} />
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: 16, minHeight: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {loading ? (
          <Loader2 style={{ width: 28, height: 28, animation: "spin 1s linear infinite", color: "var(--app-text-tertiary)" }} />
        ) : images.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--app-text-placeholder)" }}>
            <Camera style={{ width: 40, height: 40, marginBottom: 8, opacity: 0.5 }} />
            <p style={{ margin: 0, fontSize: 14 }}>이 상담에 첨부된 사진이 없습니다</p>
          </div>
        ) : (
          <div style={{ position: "relative", width: "100%" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images[idx]} alt={`사진 ${idx + 1}`}
              style={{ width: "100%", maxHeight: 450, objectFit: "contain", borderRadius: 8 }} />
            {images.length > 1 && (
              <>
                {idx > 0 && (
                  <button onClick={() => setIdx(idx - 1)} style={{
                    position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
                    width: 36, height: 36, borderRadius: "50%", border: "none",
                    backgroundColor: "rgba(0,0,0,0.5)", color: "white", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <ChevronLeft style={{ width: 20, height: 20 }} />
                  </button>
                )}
                {idx < images.length - 1 && (
                  <button onClick={() => setIdx(idx + 1)} style={{
                    position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                    width: 36, height: 36, borderRadius: "50%", border: "none",
                    backgroundColor: "rgba(0,0,0,0.5)", color: "white", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <ChevronRight style={{ width: 20, height: 20 }} />
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div style={{ padding: "0 16px 12px", display: "flex", gap: 6, overflowX: "auto" }}>
          {images.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={url} alt="" onClick={() => setIdx(i)}
              style={{
                width: 48, height: 48, objectFit: "cover", borderRadius: 6, cursor: "pointer", flexShrink: 0,
                border: i === idx ? "2px solid var(--app-accent)" : "2px solid transparent",
                opacity: i === idx ? 1 : 0.6,
              }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Draggable Modal Wrapper ──────────────────

function DraggableModal({ children, onClose, initialW, initialH }: {
  children: React.ReactNode;
  onClose: () => void;
  initialW: number;
  initialH: number;
}) {
  const { style, centered, onDragStart, onResizeStart } = useDraggableModal(initialW, initialH);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, backgroundColor: "var(--app-modal-backdrop)",
      display: "flex", alignItems: centered ? "center" : "flex-start",
      justifyContent: centered ? "center" : "flex-start",
      zIndex: 1000, paddingTop: centered ? 0 : 20,
    }}>
      <div data-modal-content onClick={(e) => e.stopPropagation()} style={{
        backgroundColor: "var(--app-modal-bg)", borderRadius: 16,
        overflow: "hidden", boxShadow: "var(--app-shadow-lg)",
        display: "flex", flexDirection: "column",
        ...style,
      }}>
        {/* 드래그 핸들 (상단 바) */}
        <div onMouseDown={onDragStart} style={{
          padding: "4px 0", cursor: "move", display: "flex", justifyContent: "center", flexShrink: 0,
        }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "var(--app-border)" }} />
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "0 28px 24px" }}>
          {children}
        </div>
        {/* 리사이즈 핸들 */}
        <div onMouseDown={onResizeStart} style={{
          position: "absolute", right: 0, bottom: 0, width: 16, height: 16, cursor: "nwse-resize",
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" style={{ opacity: 0.3 }}>
            <path d="M14 14L14 8M14 14L8 14" stroke="currentColor" strokeWidth="2" />
            <path d="M14 14L14 12M14 14L12 14" stroke="currentColor" strokeWidth="2" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// ─── Driver Management Modal ──────────────────

function DriverModal({ onClose, onRefresh }: { onClose: () => void; onRefresh: () => void }) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", phone: "", memo: "" });
  const [saving, setSaving] = useState(false);

  const fetchDrivers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/drivers");
      const data = await res.json();
      setDrivers(data.drivers ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchDrivers(); }, [fetchDrivers]);

  const handleAdd = async () => {
    if (!form.name.trim()) { toast.error("기사명을 입력하세요"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.success("기사 등록 완료");
        setForm({ name: "", phone: "", memo: "" });
        fetchDrivers();
        onRefresh();
      } else {
        const d = await res.json();
        toast.error(d.error || "등록 실패");
      }
    } catch { toast.error("등록 실패"); }
    finally { setSaving(false); }
  };

  const handleMemoSave = async (id: string, memo: string) => {
    await fetch("/api/drivers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, memo }),
    });
    setDrivers((prev) => prev.map((d) => d.id === id ? { ...d, memo } : d));
    onRefresh();
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    await fetch("/api/drivers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isActive }),
    });
    fetchDrivers();
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 기사를 삭제하시겠습니까?")) return;
    await fetch("/api/drivers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    toast.success("기사 삭제 완료");
    fetchDrivers();
    onRefresh();
  };

  return (
    <DraggableModal onClose={onClose} initialW={680} initialH={720}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>기사 관리</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <X style={{ width: 20, height: 20, color: "var(--app-text-tertiary)" }} />
        </button>
      </div>

      {/* Add form */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, marginBottom: 16 }}>
        <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="기사명 *" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--app-input-border)", fontSize: 13 }} />
        <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="연락처" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--app-input-border)", fontSize: 13 }} />
        <input value={form.memo} onChange={(e) => setForm((p) => ({ ...p, memo: e.target.value }))} placeholder="메모" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--app-input-border)", fontSize: 13 }} />
        <button onClick={handleAdd} disabled={saving} style={{ padding: "8px 14px", borderRadius: 8, backgroundColor: "var(--app-accent)", color: "white", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
          {saving ? "..." : <><Plus style={{ width: 13, height: 13, display: "inline", verticalAlign: "middle" }} /> 추가</>}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 20, color: "var(--app-text-tertiary)" }}>
          <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite", display: "inline-block" }} /> 조회 중...
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["기사명", "연락처", "메모", "상태", ""].map((h) => (
                <th key={h} style={{ ...TH, position: "static" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => (
              <tr key={d.id}>
                <td style={{ ...TD, fontWeight: 600 }}>{d.name}</td>
                <td style={TD}>{d.phone || "-"}</td>
                <td style={TD}>
                  <input
                    defaultValue={d.memo || ""}
                    placeholder="-"
                    onBlur={(e) => {
                      const val = e.target.value.trim();
                      if (val !== (d.memo || "")) handleMemoSave(d.id, val);
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    style={{ width: "100%", padding: "4px 8px", borderRadius: 6, border: "1px solid transparent", fontSize: 13, background: "transparent", color: "var(--app-text-primary)" }}
                    onFocus={(e) => { e.target.style.borderColor = "var(--app-input-border)"; e.target.style.backgroundColor = "var(--app-surface)"; }}
                    onBlurCapture={(e) => { e.target.style.borderColor = "transparent"; e.target.style.backgroundColor = "transparent"; }}
                  />
                </td>
                <td style={TD}>
                  <button onClick={() => handleToggle(d.id, !d.isActive)} style={{
                    padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer",
                    backgroundColor: d.isActive ? "var(--app-tag-green-bg)" : "var(--app-surface-secondary)",
                    color: d.isActive ? "var(--app-tag-green-text)" : "var(--app-text-tertiary)",
                  }}>
                    {d.isActive ? "활성" : "비활성"}
                  </button>
                </td>
                <td style={{ ...TD, textAlign: "center" }}>
                  <button onClick={() => handleDelete(d.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--app-text-tertiary)", padding: 2 }}>
                    <Trash2 style={{ width: 14, height: 14 }} />
                  </button>
                </td>
              </tr>
            ))}
            {drivers.length === 0 && (
              <tr><td colSpan={5} style={{ ...TD, textAlign: "center", color: "var(--app-text-placeholder)" }}>등록된 기사가 없습니다</td></tr>
            )}
          </tbody>
        </table>
      )}
    </DraggableModal>
  );
}

// ─── Vehicle Management Modal ──────────────────

function VehicleModal({ onClose, onRefresh }: { onClose: () => void; onRefresh: () => void }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ plateNumber: "", vehicleType: "1톤 탑차", maxCube: 7, memo: "", defaultDriverId: "" });
  const [saving, setSaving] = useState(false);

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const [vRes, dRes] = await Promise.all([
        fetch("/api/vehicles"),
        fetch("/api/drivers"),
      ]);
      const vData = await vRes.json();
      const dData = await dRes.json();
      setVehicles(vData.vehicles ?? []);
      setDrivers(dData.drivers ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);

  const updateDefaultDriver = async (vehicleId: string, driverId: string | null) => {
    await fetch("/api/vehicles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: vehicleId, defaultDriverId: driverId }),
    });
    fetchVehicles();
    onRefresh();
  };

  const handleAdd = async () => {
    if (!form.plateNumber.trim()) { toast.error("차량번호를 입력하세요"); return; }
    setSaving(true);
    try {
      const payload = {
        plateNumber: form.plateNumber,
        vehicleType: form.vehicleType,
        maxCube: form.maxCube,
        memo: form.memo,
        defaultDriverId: form.defaultDriverId || null,
      };
      const res = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("차량 등록 완료");
        setForm({ plateNumber: "", vehicleType: "1톤 탑차", maxCube: 7, memo: "", defaultDriverId: "" });
        fetchVehicles();
        onRefresh();
      } else {
        const d = await res.json();
        toast.error(d.error || "등록 실패");
      }
    } catch { toast.error("등록 실패"); }
    finally { setSaving(false); }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    await fetch("/api/vehicles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isActive }),
    });
    fetchVehicles();
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 차량을 삭제하시겠습니까?")) return;
    await fetch("/api/vehicles", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    toast.success("차량 삭제 완료");
    fetchVehicles();
    onRefresh();
  };

  return (
    <DraggableModal onClose={onClose} initialW={640} initialH={520}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>차량 관리</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <X style={{ width: 20, height: 20, color: "var(--app-text-tertiary)" }} />
        </button>
      </div>

      {/* Add form */}
      <div style={{ display: "grid", gridTemplateColumns: "110px 110px 60px 110px 1fr auto", gap: 8, marginBottom: 16 }}>
        <input value={form.plateNumber} onChange={(e) => setForm((p) => ({ ...p, plateNumber: e.target.value }))} placeholder="차량번호 *" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--app-input-border)", fontSize: 13 }} />
        <select value={form.vehicleType} onChange={(e) => {
          const vt = e.target.value;
          setForm((p) => ({ ...p, vehicleType: vt, maxCube: vt === "2.5톤" ? 10 : 7 }));
        }} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--app-input-border)", fontSize: 13 }}>
          <option value="1톤 탑차">1톤 탑차</option>
          <option value="1톤 저상탑차">1톤 저상탑차</option>
          <option value="2.5톤">2.5톤</option>
        </select>
        <input type="number" value={form.maxCube || ""} onChange={(e) => setForm((p) => ({ ...p, maxCube: parseFloat(e.target.value) || 0 }))} placeholder="m³" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--app-input-border)", fontSize: 13, width: 60 }} />
        <select value={form.defaultDriverId} onChange={(e) => setForm((p) => ({ ...p, defaultDriverId: e.target.value }))} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--app-input-border)", fontSize: 13 }}>
          <option value="">고정 기사 없음</option>
          {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <input value={form.memo} onChange={(e) => setForm((p) => ({ ...p, memo: e.target.value }))} placeholder="메모" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--app-input-border)", fontSize: 13 }} />
        <button onClick={handleAdd} disabled={saving} style={{ padding: "8px 14px", borderRadius: 8, backgroundColor: "var(--app-accent)", color: "white", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
          {saving ? "..." : <><Plus style={{ width: 13, height: 13, display: "inline", verticalAlign: "middle" }} /> 추가</>}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 20, color: "var(--app-text-tertiary)" }}>
          <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite", display: "inline-block" }} /> 조회 중...
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["차량번호", "차량종류", "적재(m³)", "고정 기사", "메모", "상태", ""].map((h) => (
                <th key={h} style={{ ...TH, position: "static" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id}>
                <td style={{ ...TD, fontWeight: 600 }}>{v.plateNumber}</td>
                <td style={TD}>{v.vehicleType}</td>
                <td style={TD}>{v.maxCube}</td>
                <td style={TD}>
                  <select
                    value={v.defaultDriverId ?? ""}
                    onChange={(e) => updateDefaultDriver(v.id, e.target.value || null)}
                    style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--app-input-border)", fontSize: 12, backgroundColor: "var(--app-surface)" }}
                  >
                    <option value="">-</option>
                    {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </td>
                <td style={TD}>{v.memo || "-"}</td>
                <td style={TD}>
                  <button onClick={() => handleToggle(v.id, !v.isActive)} style={{
                    padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer",
                    backgroundColor: v.isActive ? "var(--app-tag-green-bg)" : "var(--app-surface-secondary)",
                    color: v.isActive ? "var(--app-tag-green-text)" : "var(--app-text-tertiary)",
                  }}>
                    {v.isActive ? "활성" : "비활성"}
                  </button>
                </td>
                <td style={{ ...TD, textAlign: "center" }}>
                  <button onClick={() => handleDelete(v.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--app-text-tertiary)", padding: 2 }}>
                    <Trash2 style={{ width: 14, height: 14 }} />
                  </button>
                </td>
              </tr>
            ))}
            {vehicles.length === 0 && (
              <tr><td colSpan={7} style={{ ...TD, textAlign: "center", color: "var(--app-text-placeholder)" }}>등록된 차량이 없습니다</td></tr>
            )}
          </tbody>
        </table>
      )}
    </DraggableModal>
  );
}

// ─── Capacity Settings Modal ──────────────────

function AbcCapacityModal({ onClose }: { onClose: () => void }) {
  type Caps = { A: number; B: number; C: number };
  const emptyCaps: Caps = { A: 8, B: 8, C: 8 };
  const weekendCaps: Caps = { A: 6, B: 6, C: 6 };
  type S = {
    default: Caps;
    mon?: Caps; tue?: Caps; wed?: Caps; thu?: Caps; fri?: Caps; sat?: Caps; sun?: Caps;
    holidays: string[];
    dates: Record<string, Caps>;
    closedDates: string[];
  };
  const [settings, setSettings] = useState<S>({
    default: { ...emptyCaps },
    mon: { ...weekendCaps }, sat: { ...weekendCaps }, sun: { ...weekendCaps },
    holidays: [],
    dates: {},
    closedDates: [],
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newHoliday, setNewHoliday] = useState("");

  // 달력 상태
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-11
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });

  // 월간 예약 카운트 (fetch)
  const [monthCounts, setMonthCounts] = useState<Record<string, Record<"A"|"B"|"C", number>>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings");
        const d = await res.json();
        const v = d.settings?.abc_capacity as Partial<S> | undefined;
        if (v) setSettings({
          default: { ...emptyCaps, ...(v.default || {}) },
          mon: v.mon, tue: v.tue, wed: v.wed, thu: v.thu, fri: v.fri, sat: v.sat, sun: v.sun,
          holidays: v.holidays || [],
          dates: v.dates || {},
          closedDates: v.closedDates || [],
        });
      } catch { /* ignore */ }
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 월간 카운트 fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/schedule/abc/month?year=${viewYear}&month=${viewMonth + 1}`);
        if (!res.ok) return;
        const d = await res.json();
        if (cancelled) return;
        const cnt: Record<string, Record<"A"|"B"|"C", number>> = {};
        for (const [date, info] of Object.entries(d.days || {})) {
          cnt[date] = (info as { counts: Record<"A"|"B"|"C", number> }).counts;
        }
        setMonthCounts(cnt);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [viewYear, viewMonth]);

  // 요일별 테이블
  type WeekKey = "default" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  const weekdays: { key: WeekKey; label: string }[] = [
    { key: "default", label: "기본 (화~금)" },
    { key: "mon", label: "월요일" },
    { key: "tue", label: "화요일" },
    { key: "wed", label: "수요일" },
    { key: "thu", label: "목요일" },
    { key: "fri", label: "금요일" },
    { key: "sat", label: "토요일" },
    { key: "sun", label: "일요일" },
  ];

  const getWeekCaps = (key: WeekKey): Caps => {
    const v = settings[key];
    if (typeof v === "object" && v !== null && "A" in v) return v as Caps;
    return settings.default;
  };
  const setWeekCap = (key: WeekKey, block: keyof Caps, n: number) => {
    setSettings((s) => ({ ...s, [key]: { ...getWeekCaps(key), [block]: n } }));
  };

  // 공휴일
  const addHoliday = () => {
    if (!newHoliday.match(/^\d{4}-\d{2}-\d{2}$/)) { toast.error("YYYY-MM-DD 형식"); return; }
    if (settings.holidays.includes(newHoliday)) return;
    setSettings((s) => ({ ...s, holidays: [...s.holidays, newHoliday].sort() }));
    setNewHoliday("");
  };
  const removeHoliday = (d: string) => setSettings((s) => ({ ...s, holidays: s.holidays.filter((h) => h !== d) }));
  const toggleHolidayForDate = (date: string) => {
    setSettings((s) => ({
      ...s,
      holidays: s.holidays.includes(date)
        ? s.holidays.filter((h) => h !== date)
        : [...s.holidays, date].sort(),
    }));
  };
  const toggleClosedForDate = (date: string) => {
    setSettings((s) => ({
      ...s,
      closedDates: s.closedDates.includes(date)
        ? s.closedDates.filter((c) => c !== date)
        : [...s.closedDates, date].sort(),
    }));
  };

  // 날짜별 override 헬퍼
  const WEEK_KEYS: WeekKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const resolveCapForDate = (date: string): { caps: Caps; source: "closed" | "date" | "holiday" | "week" | "default" } => {
    if (settings.closedDates.includes(date)) return { caps: { A: 0, B: 0, C: 0 }, source: "closed" };
    const override = settings.dates[date];
    if (override) return { caps: override, source: "date" };
    const dow = new Date(`${date}T00:00:00`).getDay();
    const isHoliday = settings.holidays.includes(date);
    const wKey: WeekKey = isHoliday ? "sun" : WEEK_KEYS[dow];
    const weekVal = settings[wKey];
    if (weekVal && typeof weekVal === "object" && "A" in weekVal) {
      return { caps: weekVal as Caps, source: isHoliday ? "holiday" : "week" };
    }
    // fallback
    if (wKey === "sat" || wKey === "sun" || wKey === "mon") {
      return { caps: { ...weekendCaps }, source: isHoliday ? "holiday" : "week" };
    }
    return { caps: settings.default, source: "default" };
  };

  const setDateOverride = (date: string, block: keyof Caps, n: number) => {
    setSettings((s) => {
      const existing = s.dates[date] ?? { ...resolveCapForDate(date).caps };
      return { ...s, dates: { ...s.dates, [date]: { ...existing, [block]: n } } };
    });
  };
  const clearDateOverride = (date: string) => {
    setSettings((s) => {
      const { [date]: _omit, ...rest } = s.dates;
      void _omit;
      return { ...s, dates: rest };
    });
  };

  // 달력 셀 생성 (6주 x 7일 = 42칸)
  const calendarCells = (() => {
    const first = new Date(viewYear, viewMonth, 1);
    const startOffset = first.getDay(); // 0=일
    const cells: { date: string; inMonth: boolean; dayNum: number }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(viewYear, viewMonth, i - startOffset + 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      cells.push({
        date: `${y}-${m}-${day}`,
        inMonth: d.getMonth() === viewMonth,
        dayNum: d.getDate(),
      });
    }
    return cells;
  })();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  };
  const gotoToday = () => {
    const n = new Date();
    setViewYear(n.getFullYear());
    setViewMonth(n.getMonth());
    const y = n.getFullYear();
    const m = String(n.getMonth() + 1).padStart(2, "0");
    const d = String(n.getDate()).padStart(2, "0");
    setSelectedDate(`${y}-${m}-${d}`);
  };

  const todayIso = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  })();

  const selectedInfo = resolveCapForDate(selectedDate);
  const hasDateOverride = !!settings.dates[selectedDate];
  const isSelectedHoliday = settings.holidays.includes(selectedDate);
  const isSelectedClosed = settings.closedDates.includes(selectedDate);
  const selectedCounts = monthCounts[selectedDate] ?? { A: 0, B: 0, C: 0 };
  const selectedWeekday = (() => {
    const dow = new Date(`${selectedDate}T00:00:00`).getDay();
    return ["일", "월", "화", "수", "목", "금", "토"][dow];
  })();

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "abc_capacity", value: settings }),
      });
      if (!res.ok) throw new Error();
      toast.success("ABC 케파 저장됨");
      onClose();
    } catch { toast.error("저장 실패"); } finally { setSaving(false); }
  };

  const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1200, backgroundColor: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 1280, maxWidth: "98vw", maxHeight: "96vh", display: "flex", flexDirection: "column", backgroundColor: "var(--app-surface)", borderRadius: 12, boxShadow: "var(--app-shadow-lg)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 22px", borderBottom: "1px solid var(--app-border)" }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>ABC 타임 케파 설정</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><X style={{ width: 18, height: 18 }} /></button>
        </div>

        {!loaded ? (
          <div style={{ textAlign: "center", padding: 60 }}><Loader2 style={{ width: 24, height: 24, animation: "spin 1s linear infinite" }} /></div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1.9fr 1fr", gap: 24, padding: "18px 22px", overflow: "auto" }}>
            {/* LEFT: 달력 */}
            <div>
              {/* 달력 네비 */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={prevMonth} style={navBtnStyle}>◀</button>
                  <div style={{ fontSize: 17, fontWeight: 700, minWidth: 130, textAlign: "center" }}>
                    {viewYear}. {String(viewMonth + 1).padStart(2, "0")}
                  </div>
                  <button onClick={nextMonth} style={navBtnStyle}>▶</button>
                </div>
                <button onClick={gotoToday} style={{ padding: "5px 14px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)", cursor: "pointer" }}>오늘</button>
              </div>

              {/* 요일 헤더 */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>
                {dayLabels.map((d, i) => (
                  <div key={d} style={{ fontSize: 12, fontWeight: 600, textAlign: "center", color: i === 0 ? "#DC2626" : i === 6 ? "#2563EB" : "var(--app-text-tertiary)", padding: "4px 0" }}>{d}</div>
                ))}
              </div>

              {/* 달력 셀 — 예약 카운트 함께 표시 */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
                {calendarCells.map((cell, i) => {
                  const info = resolveCapForDate(cell.date);
                  const isSelected = cell.date === selectedDate;
                  const isToday = cell.date === todayIso;
                  const isHoliday = settings.holidays.includes(cell.date);
                  const isClosed = settings.closedDates.includes(cell.date);
                  const hasOverride = !!settings.dates[cell.date];
                  const dow = i % 7;
                  const cnt = monthCounts[cell.date] ?? { A: 0, B: 0, C: 0 };
                  const totalCount = cnt.A + cnt.B + cnt.C;
                  const totalCap = info.caps.A + info.caps.B + info.caps.C;

                  let bg: string;
                  let borderColor: string;
                  if (isClosed) {
                    bg = "#374151";
                    borderColor = isSelected ? "var(--app-accent)" : "#1F2937";
                  } else if (hasOverride) {
                    bg = "#E0F2FE";
                    borderColor = isSelected ? "var(--app-accent)" : "#0EA5E9";
                  } else if (isHoliday) {
                    bg = "#FEE2E2";
                    borderColor = isSelected ? "var(--app-accent)" : "#F87171";
                  } else if (!cell.inMonth) {
                    bg = "var(--app-surface-secondary)";
                    borderColor = isSelected ? "var(--app-accent)" : "var(--app-border-light)";
                  } else {
                    bg = "var(--app-surface)";
                    borderColor = isSelected ? "var(--app-accent)" : "var(--app-border-light)";
                  }

                  const textColor = isClosed ? "white" : dow === 0 || isHoliday ? "#DC2626" : dow === 6 ? "#2563EB" : "var(--app-text-primary)";

                  const blockCell = (block: "A" | "B" | "C") => {
                    const c = cnt[block];
                    const cap = info.caps[block];
                    const ratio = cap > 0 ? c / cap : 1;
                    const full = cap > 0 && c >= cap;
                    const color = isClosed
                      ? "#D1D5DB"
                      : full
                        ? "#DC2626"
                        : ratio >= 0.75
                          ? "#EA580C"
                          : "var(--app-text-secondary)";
                    return (
                      <div key={block} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        fontSize: 10, fontWeight: full ? 700 : 500, color,
                      }}>
                        <span style={{ fontWeight: 700, opacity: 0.8 }}>{block}</span>
                        <span>{c}/{cap}</span>
                      </div>
                    );
                  };

                  return (
                    <button
                      key={cell.date}
                      onClick={() => setSelectedDate(cell.date)}
                      style={{
                        padding: "8px 7px",
                        minHeight: 100,
                        textAlign: "left",
                        backgroundColor: bg,
                        border: `${isSelected ? 2 : 1}px solid ${borderColor}`,
                        borderRadius: 8,
                        cursor: "pointer",
                        opacity: cell.inMonth ? 1 : 0.45,
                        display: "flex",
                        flexDirection: "column",
                        gap: 3,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, fontWeight: isToday ? 800 : 600, color: textColor }}>
                          {cell.dayNum}
                          {isToday && <span style={{ marginLeft: 4, fontSize: 9, fontWeight: 700, color: isClosed ? "#D1D5DB" : "var(--app-accent)" }}>오늘</span>}
                        </span>
                        <span style={{ display: "flex", gap: 2, fontSize: 9, fontWeight: 700 }}>
                          {isClosed && <span style={{ color: "white", backgroundColor: "#DC2626", padding: "1px 4px", borderRadius: 3 }}>마감</span>}
                          {!isClosed && hasOverride && <span style={{ color: "#0284C7" }}>●</span>}
                          {!isClosed && isHoliday && !hasOverride && <span style={{ color: "#DC2626" }}>공휴일</span>}
                        </span>
                      </div>
                      {isClosed ? (
                        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
                          예약 불가
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 2 }}>
                          {blockCell("A")}
                          {blockCell("B")}
                          {blockCell("C")}
                        </div>
                      )}
                      <div style={{ marginTop: "auto", fontSize: 9, color: isClosed ? "#D1D5DB" : "var(--app-text-tertiary)", textAlign: "right" }}>
                        {isClosed ? "" : `${totalCount}/${totalCap}`}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* 선택된 날짜 편집 패널 */}
              <div style={{ marginTop: 16, padding: "14px 16px", border: "1.5px solid var(--app-accent)", borderRadius: 10, backgroundColor: "rgba(59,130,246,0.04)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>{selectedDate} ({selectedWeekday})</span>
                    {isSelectedClosed && <span style={{ fontSize: 11, fontWeight: 700, color: "white", backgroundColor: "#DC2626", padding: "2px 8px", borderRadius: 4 }}>마감</span>}
                    {!isSelectedClosed && hasDateOverride && <span style={{ fontSize: 11, fontWeight: 600, color: "#0284C7" }}>개별 설정</span>}
                    {!isSelectedClosed && !hasDateOverride && (
                      <span style={{ fontSize: 11, fontWeight: 500, color: "var(--app-text-tertiary)" }}>
                        {selectedInfo.source === "holiday" ? "공휴일 규칙" : selectedInfo.source === "week" ? "요일 규칙" : "기본값"}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
                      <input type="checkbox" checked={isSelectedHoliday} onChange={() => toggleHolidayForDate(selectedDate)} disabled={isSelectedClosed} />
                      공휴일
                    </label>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer", fontWeight: isSelectedClosed ? 700 : 500, color: isSelectedClosed ? "#DC2626" : "var(--app-text-primary)" }}>
                      <input type="checkbox" checked={isSelectedClosed} onChange={() => toggleClosedForDate(selectedDate)} />
                      마감 (예약 전면 불가)
                    </label>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  {(["A", "B", "C"] as const).map((b) => {
                    const c = selectedCounts[b];
                    const cap = selectedInfo.caps[b];
                    const full = cap > 0 && c >= cap;
                    return (
                      <div key={b} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--app-text-secondary)", minWidth: 16 }}>{b}</span>
                        <span style={{
                          fontSize: 12, fontWeight: 600,
                          padding: "2px 7px", borderRadius: 10,
                          color: full ? "#DC2626" : "var(--app-text-tertiary)",
                          backgroundColor: full ? "#FEE2E2" : "var(--app-bg)",
                        }}>
                          예약 {c}
                        </span>
                        <span style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>/</span>
                        <input
                          type="number"
                          min={0}
                          max={30}
                          disabled={isSelectedClosed}
                          value={selectedInfo.caps[b]}
                          onChange={(e) => setDateOverride(selectedDate, b, parseInt(e.target.value) || 0)}
                          style={{ width: 56, padding: "4px 6px", fontSize: 13, textAlign: "center", border: "1px solid var(--app-border)", borderRadius: 6, backgroundColor: isSelectedClosed ? "#F3F4F6" : "var(--app-surface)" }}
                        />
                      </div>
                    );
                  })}
                  {hasDateOverride && !isSelectedClosed && (
                    <button onClick={() => clearDateOverride(selectedDate)} style={{ marginLeft: "auto", padding: "5px 12px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: "1px solid var(--app-border)", backgroundColor: "white", cursor: "pointer", color: "var(--app-text-secondary)" }}>요일 규칙으로 리셋</button>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT: 요일별 + 공휴일 + 마감 리스트 */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--app-text-tertiary)", marginBottom: 8 }}>요일별 기본 케파</div>
              <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                    <th style={{ padding: "8px 2px", textAlign: "left", fontWeight: 600, color: "var(--app-text-tertiary)" }}>요일</th>
                    <th style={{ padding: "8px 2px", textAlign: "center", fontWeight: 600, color: "var(--app-text-tertiary)" }}>A</th>
                    <th style={{ padding: "8px 2px", textAlign: "center", fontWeight: 600, color: "var(--app-text-tertiary)" }}>B</th>
                    <th style={{ padding: "8px 2px", textAlign: "center", fontWeight: 600, color: "var(--app-text-tertiary)" }}>C</th>
                  </tr>
                </thead>
                <tbody>
                  {weekdays.map((w) => (
                    <tr key={w.key} style={{ borderBottom: "1px solid var(--app-border-light)" }}>
                      <td style={{ padding: "6px 2px", fontWeight: 600 }}>{w.label}</td>
                      {(["A", "B", "C"] as const).map((b) => (
                        <td key={b} style={{ padding: "5px 2px", textAlign: "center" }}>
                          <input type="number" min={0} max={30} value={getWeekCaps(w.key)[b]}
                            onChange={(e) => setWeekCap(w.key, b, parseInt(e.target.value) || 0)}
                            style={{ width: 54, padding: "4px 6px", fontSize: 13, textAlign: "center", border: "1px solid var(--app-border)", borderRadius: 5 }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginTop: 16, padding: "12px 14px", backgroundColor: "var(--app-bg)", borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 8 }}>공휴일 (일요일 규칙 적용)</div>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <input type="date" value={newHoliday} onChange={(e) => setNewHoliday(e.target.value)}
                    style={{ flex: 1, padding: "6px 8px", fontSize: 13, border: "1px solid var(--app-border)", borderRadius: 6 }} />
                  <button onClick={addHoliday} style={{ padding: "6px 14px", fontSize: 13, fontWeight: 600, borderRadius: 6, backgroundColor: "var(--app-accent)", color: "white", border: "none", cursor: "pointer" }}>추가</button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {settings.holidays.length === 0 ? <span style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>등록된 공휴일 없음</span> :
                    settings.holidays.map((d) => (
                      <span key={d} style={{ padding: "3px 8px", fontSize: 12, backgroundColor: "white", border: "1px solid var(--app-border)", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {d}
                        <button onClick={() => removeHoliday(d)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#DC2626" }}><X style={{ width: 12, height: 12 }} /></button>
                      </span>
                    ))}
                </div>
              </div>

              {settings.closedDates.length > 0 && (
                <div style={{ marginTop: 14, padding: "12px 14px", backgroundColor: "#FEF2F2", borderRadius: 8, border: "1px solid #FECACA" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#DC2626", marginBottom: 8 }}>
                    마감 날짜 ({settings.closedDates.length}건) — 예약 전면 불가
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {settings.closedDates.slice().sort().map((d) => (
                      <span key={d} style={{ padding: "3px 8px", fontSize: 12, backgroundColor: "white", border: "1px solid #FECACA", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontWeight: 600 }}>{d}</span>
                        <button onClick={() => toggleClosedForDate(d)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#DC2626" }}><X style={{ width: 12, height: 12 }} /></button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {Object.keys(settings.dates).length > 0 && (
                <div style={{ marginTop: 14, padding: "12px 14px", backgroundColor: "#F0F9FF", borderRadius: 8, border: "1px solid #BAE6FD" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#0284C7", marginBottom: 8 }}>
                    날짜별 개별 설정 ({Object.keys(settings.dates).length}건)
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {Object.entries(settings.dates).sort(([a], [b]) => a.localeCompare(b)).map(([d, c]) => (
                      <span key={d} style={{ padding: "3px 8px", fontSize: 12, backgroundColor: "white", border: "1px solid #BAE6FD", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontWeight: 600 }}>{d}</span>
                        <span style={{ color: "var(--app-text-tertiary)" }}>· {c.A}/{c.B}/{c.C}</span>
                        <button onClick={() => clearDateOverride(d)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#DC2626" }}><X style={{ width: 12, height: 12 }} /></button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 16, fontSize: 12, color: "var(--app-text-tertiary)", lineHeight: 1.6 }}>
                <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--app-text-secondary)" }}>우선순위</div>
                <div>1. <strong style={{ color: "#DC2626" }}>마감</strong> (검정 셀) — 예약 전면 차단</div>
                <div>2. 날짜별 개별 설정 (파란 셀)</div>
                <div>3. 공휴일 (빨간 셀 → 일요일 규칙)</div>
                <div>4. 요일별 기본 케파</div>
              </div>
            </div>
          </div>
        )}

        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--app-border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{ padding: "8px 18px", fontSize: 13, fontWeight: 500, borderRadius: 6, border: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)", cursor: "pointer" }}>취소</button>
          <button onClick={handleSave} disabled={saving || !loaded} style={{ padding: "8px 18px", fontSize: 13, fontWeight: 600, borderRadius: 6, backgroundColor: "var(--app-accent)", color: "white", border: "none", cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 6,
  border: "1px solid var(--app-border)",
  backgroundColor: "var(--app-surface)",
  cursor: "pointer",
  fontSize: 10,
  color: "var(--app-text-secondary)",
};

function CapacityModal({ capacity, onClose, onSave }: {
  capacity: Capacity;
  onClose: () => void;
  onSave: (c: Capacity) => void;
}) {
  const [form, setForm] = useState(capacity);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "dispatch_capacity", value: form }),
      });
      if (res.ok) {
        toast.success("차량 적재량 설정 저장 완료");
        onSave(form);
      } else {
        toast.error("저장 실패");
      }
    } catch { toast.error("저장 실패"); }
    finally { setSaving(false); }
  };

  return (
    <DraggableModal onClose={onClose} initialW={420} initialH={480}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>차량 적재량 설정</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <X style={{ width: 20, height: 20, color: "var(--app-text-tertiary)" }} />
        </button>
      </div>
      <p style={{ fontSize: 13, color: "var(--app-text-tertiary)", margin: "0 0 16px", lineHeight: 1.5 }}>
        차량 종류별 적재 가능 부피를 설정합니다. 총 적재량에 따라 필요한 차량 대수가 자동 계산됩니다.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 6, display: "block" }}>1톤 탑차 적재량</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="number" min={1} step={0.5} value={form.truck1t} onChange={(e) => setForm((p) => ({ ...p, truck1t: parseFloat(e.target.value) || 7 }))}
              style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--app-input-border)", fontSize: 15, textAlign: "center" }} />
            <span style={{ fontSize: 13, color: "var(--app-text-tertiary)" }}>m³ (기본 7)</span>
          </div>
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 6, display: "block" }}>1톤 저상탑차 적재량</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="number" min={1} step={0.5} value={form.truck1tLow} onChange={(e) => setForm((p) => ({ ...p, truck1tLow: parseFloat(e.target.value) || 7 }))}
              style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--app-input-border)", fontSize: 15, textAlign: "center" }} />
            <span style={{ fontSize: 13, color: "var(--app-text-tertiary)" }}>m³ (기본 7)</span>
          </div>
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 6, display: "block" }}>2.5톤 적재량</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="number" min={1} step={0.5} value={form.truck25t} onChange={(e) => setForm((p) => ({ ...p, truck25t: parseFloat(e.target.value) || 10 }))}
              style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--app-input-border)", fontSize: 15, textAlign: "center" }} />
            <span style={{ fontSize: 13, color: "var(--app-text-tertiary)" }}>m³ (기본 10)</span>
          </div>
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 6, display: "block" }}>시간 슬롯당 최대 주문 수</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="number" min={1} value={form.maxPerSlot} onChange={(e) => setForm((p) => ({ ...p, maxPerSlot: parseInt(e.target.value) || 3 }))}
              style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--app-input-border)", fontSize: 15, textAlign: "center" }} />
            <span style={{ fontSize: 13, color: "var(--app-text-tertiary)" }}>건 (기본 3)</span>
          </div>
        </div>
        <button onClick={handleSave} disabled={saving} style={{
          height: 44, borderRadius: 10, backgroundColor: "var(--app-accent)", color: "white",
          border: "none", fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          opacity: saving ? 0.7 : 1,
        }}>
          {saving ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> : <Save style={{ width: 16, height: 16 }} />}
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </DraggableModal>
  );
}

// ─── Unload Modal ──────────────────

function UnloadModal({ vehicles, onClose, onAdd }: {
  vehicles: Vehicle[];
  onClose: () => void;
  onAdd: (vehicle: Vehicle) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = vehicles.filter((v) =>
    !search || v.vehicleType.includes(search) || v.plateNumber.includes(search) || v.memo.includes(search)
  );

  // 차량종류별 그룹핑
  const groups: Record<string, Vehicle[]> = {};
  filtered.forEach((v) => {
    if (!groups[v.vehicleType]) groups[v.vehicleType] = [];
    groups[v.vehicleType].push(v);
  });

  return (
    <DraggableModal onClose={onClose} initialW={400} initialH={480}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>하차 추가</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <X style={{ width: 20, height: 20, color: "var(--app-text-tertiary)" }} />
        </button>
      </div>
      <p style={{ fontSize: 13, color: "var(--app-text-tertiary)", margin: "0 0 12px" }}>
        하차할 차량을 선택하세요. 해당 차량의 누적 적재량이 리셋됩니다.
      </p>
      {vehicles.length > 6 && (
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="차량번호 또는 종류 검색..."
          style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--app-input-border)", fontSize: 13, marginBottom: 12 }}
        />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {Object.entries(groups).map(([type, vehs]) => (
          <div key={type}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--app-text-tertiary)", padding: "8px 0 4px", borderBottom: "1px solid var(--app-border-light)" }}>{type}</div>
            {vehs.map((v) => (
              <button key={v.id} onClick={() => onAdd(v)}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", background: "none", border: "none", cursor: "pointer", borderRadius: 8, fontSize: 14, color: "var(--app-text-primary)", textAlign: "left" }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--app-surface-secondary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}>
                <Truck style={{ width: 16, height: 16, color: "var(--app-text-tertiary)", flexShrink: 0 }} />
                <span style={{ fontWeight: 600 }}>{v.plateNumber}</span>
                {v.memo && <span style={{ color: "var(--app-text-tertiary)", fontSize: 12 }}>{v.memo}</span>}
              </button>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 20, color: "var(--app-text-placeholder)", fontSize: 13 }}>일치하는 차량이 없습니다</div>
        )}
      </div>
    </DraggableModal>
  );
}

// ─── Driver/Vehicle Dropdown (뷰포트 잘림 방지) ──────────────────

function DriverVehicleDropdown({ row, drivers, vehicles, onAssign, onClose }: {
  row: DispatchRow;
  drivers: Driver[];
  vehicles: Vehicle[];
  onAssign: (names: string[], vehicleId: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const parent = ref.current.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dropH = 420; // 예상 드롭다운 높이
    const openUp = rect.bottom + dropH > window.innerHeight;
    setPos({
      left: rect.left,
      top: openUp ? rect.top : rect.bottom,
      openUp,
    });
  }, []);

  const sel = (row.driverName || "").split(",").map(s => s.trim()).filter(Boolean);

  const content = (
    <>
      <div style={{ padding: "4px 12px", fontSize: 11, fontWeight: 700, color: "var(--app-text-tertiary)", borderBottom: "1px solid var(--app-border-light)" }}>기사 선택</div>
      {drivers.map((d) => {
        const chk = sel.includes(d.name);
        return (
          <label key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", cursor: "pointer", fontSize: 13 }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--app-surface-secondary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}>
            <input type="checkbox" checked={chk} style={{ accentColor: "var(--app-accent)" }} onChange={() => {
              const nl = chk ? sel.filter(n => n !== d.name) : [...sel, d.name];
              onAssign(nl, row.vehicleId);
            }} />
            {d.name} <span style={{ color: "var(--app-text-tertiary)", fontSize: 11 }}>{d.memo}</span>
          </label>
        );
      })}
      <div style={{ padding: "6px 12px", fontSize: 11, fontWeight: 700, color: "var(--app-text-tertiary)", borderTop: "1px solid var(--app-border-light)", marginTop: 2 }}>차량 선택</div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", cursor: "pointer", fontSize: 13 }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--app-surface-secondary)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}>
        <input type="radio" name={`veh-${row.id}`} checked={!row.vehicleId} style={{ accentColor: "var(--app-accent)" }} onChange={() => onAssign(sel, "")} />
        <span style={{ color: "var(--app-text-tertiary)" }}>차량 없음</span>
      </label>
      {vehicles.map((v) => (
        <label key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", cursor: "pointer", fontSize: 13 }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--app-surface-secondary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}>
          <input type="radio" name={`veh-${row.id}`} checked={row.vehicleId === v.id} style={{ accentColor: "var(--app-accent)" }} onChange={() => onAssign(sel, v.id)} />
          <span>{v.vehicleType}</span>
          <span style={{ color: "var(--app-text-tertiary)", fontSize: 11 }}>{v.plateNumber}</span>
        </label>
      ))}
      <div style={{ borderTop: "1px solid var(--app-border-light)", padding: "4px 12px", marginTop: 4 }}>
        <button onClick={onClose} style={{ fontSize: 12, color: "var(--app-accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>닫기</button>
      </div>
    </>
  );

  return (
    <div ref={ref} onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        left: pos?.left ?? 0,
        top: pos ? (pos.openUp ? "auto" : pos.top) : 0,
        bottom: pos?.openUp ? `${window.innerHeight - pos.top}px` : "auto",
        zIndex: 1200,
        minWidth: 230,
        maxHeight: 420,
        overflowY: "auto",
        backgroundColor: "var(--app-surface)",
        border: "1px solid var(--app-border)",
        borderRadius: 8,
        boxShadow: "var(--app-shadow-lg)",
        padding: "6px 0",
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {content}
    </div>
  );
}

// ─── 외부 배차 붙여넣기 모달 ──────────────────
//   탭 구분 텍스트(붙여넣기) → /api/dispatch/bulk-assign 호출 → orders.driver_name 일괄 매칭.

interface AssignResult {
  raw: string;
  status: "assigned" | "no_driver_match" | "no_order_match" | "skipped";
  customerName: string | null;
  phone: string | null;
  driverName: string | null;
  message?: string;
}

function BulkAssignModal({ onClose, onApplied }: { onClose: () => void; onApplied: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<AssignResult[] | null>(null);
  const [summary, setSummary] = useState<{ total: number; assigned: number; no_driver: number; no_order: number; skipped: number } | null>(null);

  const handleApply = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/dispatch/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(`적용 실패: ${data.error ?? res.status}`);
        return;
      }
      setResults(data.results);
      setSummary(data.summary);
      if (data.summary.assigned > 0) {
        toast.success(`${data.summary.assigned}건 배정 완료`);
        onApplied();
      } else {
        toast.message("매칭된 항목이 없습니다");
      }
    } finally {
      setBusy(false);
    }
  };

  const statusBadge = (s: AssignResult["status"]) => {
    const map: Record<AssignResult["status"], { bg: string; text: string; label: string }> = {
      assigned: { bg: "#DCFCE7", text: "#166534", label: "배정완료" },
      no_driver_match: { bg: "#FEF3C7", text: "#92400E", label: "기사 미매칭" },
      no_order_match: { bg: "#FEE2E2", text: "#991B1B", label: "주문 미발견" },
      skipped: { bg: "#E5E7EB", text: "#374151", label: "스킵" },
    };
    const m = map[s];
    return (
      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: m.bg, color: m.text }}>
        {m.label}
      </span>
    );
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, backgroundColor: "var(--app-modal-backdrop)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        backgroundColor: "var(--app-modal-bg)", borderRadius: 16,
        width: "min(880px, 92vw)", maxHeight: "88vh",
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "var(--app-shadow-lg)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid var(--app-border)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--app-text-primary)" }}>외부 배차 붙여넣기</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--app-text-tertiary)" }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ padding: "16px 24px", flex: 1, overflowY: "auto" }}>
          <p style={{ fontSize: 13, color: "var(--app-text-secondary)", marginTop: 0, marginBottom: 12, lineHeight: 1.5 }}>
            외부 시트에서 복사한 행을 그대로 붙여 넣으세요. <b>전화번호</b> 로 orders 매칭, 전화번호 직전 컬럼이 등록된 기사명과 일치하면 배정합니다.
            기사 화이트리스트(<code style={{ background: "var(--app-surface-secondary)", padding: "1px 5px", borderRadius: 3, fontSize: 12 }}>drivers</code>) 에 없는 이름은 무시되어 <b>배정전</b> 상태로 유지됩니다.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`예시:\n2026.05.06\t고객명(채널)\t오전 9:00~오후 12:00\t주소...\t김장극\t010-XXXX-XXXX\t품목...`}
            rows={10}
            style={{
              width: "100%", padding: "10px 12px", fontSize: 12, fontFamily: "monospace",
              border: "1px solid var(--app-border)", borderRadius: 8,
              outline: "none", resize: "vertical", boxSizing: "border-box",
              background: "var(--app-surface)",
            }}
          />

          {summary && (
            <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--app-surface-secondary)", borderRadius: 8, fontSize: 13, display: "flex", gap: 14, flexWrap: "wrap" }}>
              <span><b>총 {summary.total}건</b></span>
              <span style={{ color: "#166534" }}>배정 {summary.assigned}</span>
              <span style={{ color: "#92400E" }}>기사 미매칭 {summary.no_driver}</span>
              <span style={{ color: "#991B1B" }}>주문 미발견 {summary.no_order}</span>
              <span style={{ color: "#374151" }}>스킵 {summary.skipped}</span>
            </div>
          )}

          {results && results.length > 0 && (
            <div style={{ marginTop: 10, border: "1px solid var(--app-border)", borderRadius: 8, overflow: "hidden", maxHeight: 260, overflowY: "auto" }}>
              {results.map((r, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px", fontSize: 12,
                  borderBottom: i < results.length - 1 ? "1px solid var(--app-border)" : "none",
                  background: i % 2 === 0 ? "var(--app-surface)" : "var(--app-surface-secondary)",
                }}>
                  {statusBadge(r.status)}
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--app-text-primary)" }}>
                    {r.customerName ?? "—"} · {r.phone ?? "—"}
                    {r.driverName && <span style={{ color: "var(--app-text-secondary)", marginLeft: 6 }}>→ {r.driverName}</span>}
                  </span>
                  {r.message && <span style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>{r.message}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 24px", borderTop: "1px solid var(--app-border)" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-secondary)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            닫기
          </button>
          <button
            onClick={handleApply}
            disabled={busy || !text.trim()}
            style={{
              padding: "8px 18px", borderRadius: 8, border: "none",
              background: "var(--app-accent)", color: "white",
              fontSize: 13, fontWeight: 600,
              cursor: busy ? "wait" : "pointer",
              opacity: busy || !text.trim() ? 0.5 : 1,
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            {busy ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : null}
            적용
          </button>
        </div>
      </div>
    </div>
  );
}
