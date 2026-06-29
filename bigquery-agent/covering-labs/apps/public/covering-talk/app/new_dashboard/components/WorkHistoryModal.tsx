"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, GripHorizontal, Loader2 } from "lucide-react";

interface SysCount { consults: number; replies: number }
interface DayRecord {
  dateKst: string;     // "YYYY-MM-DD"
  minutes: number;     // 운영시간(08–22) 내 distinct 1분 bucket = 근무 분
  consultCount: number; // 하루 전체 distinct 세션 수 (전 시스템 합)
  replyCount: number;   // 하루 전체 총 답변 메시지 수 (전 시스템 합)
  bySystem: { visit: SysCount; lunch: SysCount; channeltalk: SysCount };
  isToday: boolean;
}

interface ApiResp {
  counselor: string;
  days: number;
  fromDateKst: string;
  toDateKst: string;
  operatingHoursKst: { start: number; end: number };
  records: DayRecord[];
  summary: {
    totalMinutes: number;
    totalConsults: number;
    totalReplies: number;
    workedDayCount: number;
    avgMinutesPerWorkedDay: number;
    avgRepliesPerWorkedDay: number;
  };
}

interface Props {
  open: boolean;
  counselor: string;
  onClose: () => void;
}

const INITIAL_W = 880;
const INITIAL_H = 720;
const PRESET_DAYS = [7, 30, 90] as const;
const MAX_BAR_MINUTES = 12 * 60; // 운영시간 풀 12시간

function todayKstDateStr(): string {
  const KST_OFFSET = 9 * 60 * 60 * 1000;
  const d = new Date(Date.now() + KST_OFFSET);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function kstDateOffset(daysBack: number): string {
  const KST_OFFSET = 9 * 60 * 60 * 1000;
  const d = new Date(Date.now() + KST_OFFSET);
  d.setUTCDate(d.getUTCDate() - daysBack);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function formatWorkMinutes(min: number): string {
  if (min <= 0) return "0분";
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

function formatDateLabel(dateKst: string): string {
  const [y, m, d] = dateKst.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = ["일", "월", "화", "수", "목", "금", "토"][dt.getUTCDay()];
  return `${m}월 ${d}일 (${dow})`;
}

export function WorkHistoryModal({ open, counselor, onClose }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  // mode: "preset" — 7/30/90일 토글 | "custom" — 직접 날짜 범위
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [days, setDays] = useState<number>(30);
  const [customFrom, setCustomFrom] = useState<string>(() => kstDateOffset(29));
  const [customTo, setCustomTo] = useState<string>(() => todayKstDateStr());
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 첫 렌더 가운데 배치
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const cx = (window.innerWidth - INITIAL_W) / 2;
    const cy = (window.innerHeight - INITIAL_H) / 2;
    setPos({ x: Math.max(16, cx), y: Math.max(16, cy) });
  }, [open]);

  // 데이터 fetch — mode 에 따라 days 또는 from/to 파라미터로 호출
  useEffect(() => {
    if (!open || !counselor) return;
    if (mode === "custom" && (!customFrom || !customTo)) return;
    if (mode === "custom" && customFrom > customTo) {
      setError("시작일이 종료일보다 늦을 수 없습니다");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = mode === "custom"
      ? `counselor=${encodeURIComponent(counselor)}&from=${customFrom}&to=${customTo}`
      : `counselor=${encodeURIComponent(counselor)}&days=${days}`;
    fetch(`/api/new_dashboard/cs-realtime/work-history?${qs}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((res: ApiResp & { error?: string }) => {
        if (cancelled) return;
        if (res.error) { setError(res.error); setData(null); return; }
        setData(res);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Unknown error"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [open, counselor, mode, days, customFrom, customTo]);

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 드래그
  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragState.current = { startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y };
    document.body.style.userSelect = "none";
  }, [pos]);

  useEffect(() => {
    if (!open) return;
    const onMove = (e: MouseEvent) => {
      const s = dragState.current;
      if (!s) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 80, s.baseX + (e.clientX - s.startX))),
        y: Math.max(0, Math.min(window.innerHeight - 60, s.baseY + (e.clientY - s.startY))),
      });
    };
    const onUp = () => { dragState.current = null; document.body.style.userSelect = ""; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label={`${counselor} 상담 기록`}
      style={{
        position: "fixed", left: pos.x, top: pos.y,
        width: INITIAL_W, height: INITIAL_H, zIndex: 9999,
        backgroundColor: "var(--app-modal-bg)",
        border: "1px solid var(--app-border)",
        borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}
    >
      {/* 헤더 (drag handle) */}
      <header
        onMouseDown={onDragStart}
        style={{
          padding: "10px 14px", borderBottom: "1px solid var(--app-border)",
          display: "flex", alignItems: "center", gap: 10,
          cursor: "move", backgroundColor: "var(--app-surface-secondary)",
          userSelect: "none",
        }}
      >
        <GripHorizontal style={{ width: 14, height: 14, color: "var(--app-text-tertiary)" }} />
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          <strong>{counselor}</strong>
          <span style={{ color: "var(--app-text-tertiary)", marginLeft: 6, fontWeight: 400 }}>
            상담 기록 · KST 08–22
          </span>
        </div>
        {/* 기간 토글 — preset (7/30/90일) | custom (직접 날짜) */}
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{ display: "flex", borderRadius: 8, border: "1px solid var(--app-border)", overflow: "hidden", marginLeft: 8 }}
        >
          {PRESET_DAYS.map((n, i) => {
            const active = mode === "preset" && days === n;
            return (
              <button
                key={n}
                onClick={() => { setMode("preset"); setDays(n); }}
                style={{
                  padding: "4px 10px", fontSize: 11, fontWeight: 600,
                  background: active ? "var(--app-accent)" : "var(--app-surface)",
                  color: active ? "#fff" : "var(--app-text-secondary)",
                  border: "none",
                  borderLeft: i > 0 ? "1px solid var(--app-border)" : "none",
                  cursor: "pointer",
                }}
              >
                {n}일
              </button>
            );
          })}
          <button
            onClick={() => setMode("custom")}
            style={{
              padding: "4px 10px", fontSize: 11, fontWeight: 600,
              background: mode === "custom" ? "var(--app-accent)" : "var(--app-surface)",
              color: mode === "custom" ? "#fff" : "var(--app-text-secondary)",
              border: "none", borderLeft: "1px solid var(--app-border)",
              cursor: "pointer",
            }}
          >
            직접
          </button>
        </div>
        {mode === "custom" && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 6 }}
          >
            <input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={{
                fontSize: 11, padding: "3px 6px", borderRadius: 6,
                border: "1px solid var(--app-border)",
                background: "var(--app-surface)", color: "var(--app-text-primary)",
                fontVariantNumeric: "tabular-nums",
              }}
            />
            <span style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>~</span>
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              max={todayKstDateStr()}
              onChange={(e) => setCustomTo(e.target.value)}
              style={{
                fontSize: 11, padding: "3px 6px", borderRadius: 6,
                border: "1px solid var(--app-border)",
                background: "var(--app-surface)", color: "var(--app-text-primary)",
                fontVariantNumeric: "tabular-nums",
              }}
            />
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={onClose} aria-label="닫기" style={{
          background: "transparent", border: "none", cursor: "pointer", padding: 4,
          color: "var(--app-text-tertiary)", display: "flex", alignItems: "center",
        }}>
          <X style={{ width: 16, height: 16 }} />
        </button>
      </header>

      {/* 본문 */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {error && (
          <div style={{ padding: 16, color: "#ef4444", fontSize: 13 }}>오류: {error}</div>
        )}
        {!data && !error && (
          <div style={{ padding: 30, textAlign: "center", color: "var(--app-text-tertiary)" }}>
            {loading ? <Loader2 style={{ width: 20, height: 20 }} className="animate-spin" /> : "데이터 없음"}
          </div>
        )}
        {data && (
          <>
            {/* 요약 카드 — 대시보드 KPI 카드 톤 */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8,
              padding: 12, borderBottom: "1px solid var(--app-border)",
            }}>
              <SummaryItem label="총 상담" primary={data.summary.totalConsults.toLocaleString()} sub="세션" color="#A855F7" />
              <SummaryItem label="총 답변" primary={data.summary.totalReplies.toLocaleString()} sub="메시지" color="#1AA3FF" />
              <SummaryItem label="총 근무" primary={formatWorkMinutes(data.summary.totalMinutes)} sub={`근무일 ${data.summary.workedDayCount}일`} color="#22C55E" />
              <SummaryItem label="근무일 평균" primary={formatWorkMinutes(data.summary.avgMinutesPerWorkedDay)} sub={`답변 ${data.summary.avgRepliesPerWorkedDay}/일`} color="#F59E0B" />
            </div>

            {/* 일별 테이블 — 2단 헤더 (시스템 / 상담·답변) */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "130px repeat(4, 86px) 1fr 80px",
              alignItems: "center", gap: 4, padding: "6px 12px 0",
              fontSize: 10, fontWeight: 600, color: "var(--app-text-tertiary)",
              backgroundColor: "var(--app-surface-secondary)",
              borderBottom: "1px solid var(--app-border-light)",
            }}>
              <div></div>
              <div style={{ textAlign: "center" }}>방문수거</div>
              <div style={{ textAlign: "center" }}>런치</div>
              <div style={{ textAlign: "center" }}>채널톡</div>
              <div style={{ textAlign: "center", color: "var(--app-text-secondary)" }}>합계</div>
              <div></div>
              <div></div>
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "130px repeat(4, 86px) 1fr 80px",
              alignItems: "center", gap: 4, padding: "4px 12px 8px",
              fontSize: 10, fontWeight: 600, color: "var(--app-text-tertiary)",
              textTransform: "uppercase", letterSpacing: 0.3,
              backgroundColor: "var(--app-surface-secondary)",
              borderBottom: "1px solid var(--app-border)",
            }}>
              <div>날짜</div>
              <div style={{ textAlign: "right" }}>상담 / 답변</div>
              <div style={{ textAlign: "right" }}>상담 / 답변</div>
              <div style={{ textAlign: "right" }}>상담 / 답변</div>
              <div style={{ textAlign: "right" }}>상담 / 답변</div>
              <div>근무 비율</div>
              <div style={{ textAlign: "right" }}>근무</div>
            </div>

            {/* 일별 행 리스트 */}
            <div style={{ padding: "4px 8px" }}>
              {data.records.map((r) => (
                <DayRow key={r.dateKst} record={r} />
              ))}
              {data.records.length === 0 && (
                <div style={{ padding: 20, color: "var(--app-text-tertiary)", fontSize: 12, textAlign: "center" }}>
                  기록 없음
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryItem({ label, primary, sub, color }: { label: string; primary: string; sub: string; color: string }) {
  return (
    <div style={{
      background: "var(--app-surface)", borderRadius: 8, padding: "8px 10px",
      border: "1px solid var(--app-border-light)",
      display: "flex", flexDirection: "column", gap: 2, minHeight: 60,
    }}>
      <div style={{ fontSize: 10, color: "var(--app-text-tertiary)", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color, lineHeight: 1.2 }}>{primary}</div>
      <div style={{ fontSize: 10, color: "var(--app-text-tertiary)" }}>{sub}</div>
    </div>
  );
}

function DayRow({ record }: { record: DayRecord }) {
  const pct = Math.min(100, Math.round((record.minutes / MAX_BAR_MINUTES) * 100));
  const hasActivity = record.minutes > 0 || record.replyCount > 0;
  const barColor = record.isToday ? "#1AA3FF" : record.minutes > 0 ? "#22C55E" : "transparent";
  const visit = record.bySystem.visit;
  const lunch = record.bySystem.lunch;
  const ct = record.bySystem.channeltalk;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "130px repeat(4, 86px) 1fr 80px",
      alignItems: "center", gap: 4, padding: "7px 8px",
      borderBottom: "1px solid var(--app-border-light)",
      opacity: hasActivity ? 1 : 0.55,
      fontSize: 12,
    }}>
      <div style={{ color: "var(--app-text-secondary)" }}>
        {formatDateLabel(record.dateKst)}
        {record.isToday && (
          <span style={{
            marginLeft: 6, fontSize: 9, padding: "1px 5px", borderRadius: 3,
            background: "rgba(26,163,255,0.15)", color: "#1AA3FF", fontWeight: 700,
          }}>오늘</span>
        )}
      </div>
      <SysCell sys={visit} />
      <SysCell sys={lunch} />
      <SysCell sys={ct} />
      <SysCell sys={{ consults: record.consultCount, replies: record.replyCount }} bold />
      <div style={{
        height: 8, borderRadius: 4, background: "var(--app-surface-secondary)",
        overflow: "hidden", position: "relative",
      }}>
        <div style={{
          width: `${pct}%`, height: "100%", background: barColor, transition: "width 0.2s",
        }} />
      </div>
      <div style={{ textAlign: "right", color: record.minutes > 0 ? "var(--app-text-primary)" : "var(--app-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
        {formatWorkMinutes(record.minutes)}
      </div>
    </div>
  );
}

function SysCell({ sys, bold }: { sys: SysCount; bold?: boolean }) {
  const has = sys.consults > 0 || sys.replies > 0;
  const color = has ? "var(--app-text-primary)" : "var(--app-text-tertiary)";
  return (
    <div style={{
      textAlign: "right", color, fontVariantNumeric: "tabular-nums",
      fontWeight: bold ? 700 : 400,
    }}>
      {has ? `${sys.consults} / ${sys.replies}` : "—"}
    </div>
  );
}
