"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { MessageSquare, CheckCircle, Calendar, AlertCircle, Clock, TrendingUp, Loader2, Send, Bell, X, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { getCached, setCache, CACHE_KEYS } from "@/lib/cache/prefetch";
import { toast } from "sonner";

interface Stats {
  total: number;
  pending: number;
  quoteSent: number;
  booked: number;
  completed: number;
  needsCheck: number;
  nudgeTarget: number;
  reminderTarget: number;
}

interface FunnelItem {
  sessionId: string;
  name: string;
  phone: string;
  sentAt: string;
  source: "template" | "manual";
  targetDate: string | null;
  timeSlot: string | null;
}

type FunnelCategory = "block" | "specific" | "otherDate" | "pending" | "churn";

interface AbcFunnel {
  total: number;
  booked: number;
  bookedBlock: number;
  bookedSpecific: number;
  bookedOtherDate: number;
  churn: number;
  pending: number;
  conversionRate: number;
  churnRate: number;
  blockAdoptionRate: number;
  details: Record<FunnelCategory, FunnelItem[]>;
}

interface NudgeTarget {
  sessionId: string;
  name: string;
  phone: string;
  createdAt: string;
}

interface ReminderTarget {
  sessionId: string;
  name: string;
  phone: string;
  preferredDate: string;
  preferredTime: string;
  address: string;
}

interface DailyStats {
  total: number;
  quoteSent: number;
  booked: number;
}

interface MonthlyData {
  month: string;
  summary: { total: number; quoteSent: number; booked: number; bookedRevenue: number; bookedAvg: number };
  daily: Record<string, DailyStats>;
}

const CARD_CONFIGS = [
  { key: "total",      title: "오늘 상담",  icon: MessageSquare, color: "var(--app-accent)", urgent: false },
  { key: "pending",    title: "대기중",     icon: Clock,         color: "#FF5B5B", urgent: true  },
  { key: "needsCheck", title: "확인 필요",  icon: AlertCircle,   color: "var(--app-tag-orange-text)", urgent: true  },
  { key: "quoteSent",  title: "견적 발송",  icon: TrendingUp,    color: "#20C997", urgent: false },
  { key: "booked",     title: "예약 완료",  icon: Calendar,      color: "var(--app-tag-purple-text)", urgent: false },
  { key: "completed",  title: "상담 완료",  icon: CheckCircle,   color: "#ADB5BD", urgent: false },
] as const;

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(() => getCached<Stats>(CACHE_KEYS.DASHBOARD_STATS));
  const [abcFunnel, setAbcFunnel] = useState<AbcFunnel | null>(null);
  const [funnelModal, setFunnelModal] = useState<{ category: FunnelCategory; label: string } | null>(null);
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);

  // 월별 캘린더
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1); // 1-indexed
  const [monthly, setMonthly] = useState<MonthlyData | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  const fetchStats = useCallback(() => {
    fetch("/api/dashboard/stats")
      .then((r) => r.json())
      .then((data) => { setStats(data); setCache(CACHE_KEYS.DASHBOARD_STATS, data); })
      .catch(() => {});
  }, []);

  const fetchAbcFunnel = useCallback(() => {
    fetch("/api/dashboard/abc-funnel")
      .then((r) => r.json())
      .then((data) => { if (!data?.error) setAbcFunnel(data); })
      .catch(() => {});
  }, []);

  const fetchMonthly = useCallback((y: number, m: number) => {
    const key = `${y}-${m.toString().padStart(2, "0")}`;
    setMonthlyLoading(true);
    fetch(`/api/dashboard/monthly?month=${key}`)
      .then((r) => r.json())
      .then((data) => setMonthly(data))
      .catch(() => {})
      .finally(() => setMonthlyLoading(false));
  }, []);

  useEffect(() => {
    if (!stats) fetchStats();
    fetchAbcFunnel();
    const interval = setInterval(() => { fetchStats(); fetchAbcFunnel(); }, 15000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchMonthly(calYear, calMonth);
  }, [calYear, calMonth, fetchMonthly]);

  const goMonthPrev = () => {
    if (calMonth === 1) { setCalYear((y) => y - 1); setCalMonth(12); }
    else setCalMonth((m) => m - 1);
  };
  const goMonthNext = () => {
    if (calMonth === 12) { setCalYear((y) => y + 1); setCalMonth(1); }
    else setCalMonth((m) => m + 1);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getValue = (key: string) => (stats as any)?.[key] ?? 0;

  return (
    <div style={{ height: "100%", overflowY: "auto", backgroundColor: "var(--app-bg)" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 40px" }}>

        {/* 헤더 */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>운영 현황</h1>
          <p style={{ fontSize: 14, color: "var(--app-text-tertiary)", marginTop: 4, margin: "4px 0 0" }}>오늘 기준 실시간 지표</p>
        </div>

        {/* 통계 카드 그리드 */}
        {!stats && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 0" }}>
            <Loader2 style={{ width: 24, height: 24, animation: "spin 1s linear infinite", color: "var(--app-accent)" }} />
            <span style={{ marginLeft: 8, color: "var(--app-text-tertiary)", fontSize: 15 }}>로딩 중...</span>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 32, opacity: stats ? 1 : 0 }}>
          {CARD_CONFIGS.map(({ key, title, icon: Icon, color, urgent }) => {
            const val = getValue(key);
            const isUrgent = urgent && val > 0;
            return (
              <div
                key={key}
                style={{
                  backgroundColor: "var(--app-surface)", borderRadius: 16, padding: 24,
                  border: isUrgent ? `1px solid ${color}30` : "1px solid var(--app-border)",
                  boxShadow: isUrgent ? `0 0 0 1px ${color}15` : "var(--app-shadow)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--app-text-tertiary)" }}>{title}</span>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12,
                    backgroundColor: color, display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon style={{ width: 22, height: 22, color: "white" }} />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 32, fontWeight: 700, color: "var(--app-text-primary)", lineHeight: 1 }}>{val}</span>
                  <span style={{ fontSize: 13, color: isUrgent ? color : "var(--app-text-placeholder)", fontWeight: isUrgent ? 500 : 400 }}>
                    {isUrgent ? "건 처리 필요" : "건"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ABC 시간안내 전환 */}
        {abcFunnel && abcFunnel.total > 0 && (
          <div style={{
            backgroundColor: "var(--app-surface)", borderRadius: 16, padding: 24,
            border: "1px solid var(--app-border)", boxShadow: "var(--app-shadow)",
            marginBottom: 32,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-tertiary)", margin: 0, letterSpacing: "0.02em" }}>
                  ABC 시간안내 전환
                </h2>
                <p style={{ fontSize: 11, color: "var(--app-text-placeholder)", margin: "4px 0 0" }}>
                  고객이 시간안내 버튼을 받고 예약으로 이어진 비율 (발송 후 1h 경과 기준)
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: "var(--app-tag-green-text)" }}>{abcFunnel.conversionRate}%</span>
                <span style={{ fontSize: 12, color: "var(--app-text-placeholder)" }}>전환율</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
              {[
                { label: "총 발송", value: abcFunnel.total, color: "var(--app-text-primary)", category: null as FunnelCategory | null },
                { label: "블록 예약", value: abcFunnel.bookedBlock, color: "var(--app-tag-green-text)", hint: "안내 수용", category: "block" as FunnelCategory },
                { label: "지정 예약", value: abcFunnel.bookedSpecific, color: "var(--app-tag-blue-text)", hint: "안내 거부·시각 고집", category: "specific" as FunnelCategory },
                { label: "타일자 예약", value: abcFunnel.bookedOtherDate, color: "var(--app-tag-purple-text)", hint: "날짜 변경", category: "otherDate" as FunnelCategory },
                { label: "진행 중", value: abcFunnel.pending, color: "var(--app-tag-orange-text)", hint: "1h 이내", category: "pending" as FunnelCategory },
                { label: "이탈", value: abcFunnel.churn, color: "#DC2626", hint: "1h+ 미예약", category: "churn" as FunnelCategory },
              ].map((c) => {
                const clickable = !!c.category && c.value > 0;
                return (
                  <button
                    key={c.label}
                    type="button"
                    disabled={!clickable}
                    onClick={() => { if (c.category) setFunnelModal({ category: c.category, label: c.label }); }}
                    style={{
                      padding: "10px 12px", borderRadius: 10, backgroundColor: "var(--app-bg)",
                      border: "1px solid var(--app-border-light, var(--app-border))",
                      textAlign: "left", cursor: clickable ? "pointer" : "default",
                      transition: "transform 0.1s, border-color 0.1s",
                      ...(clickable ? { outline: "none" } : {}),
                    }}
                    onMouseEnter={(e) => { if (clickable) (e.currentTarget.style.borderColor = c.color); }}
                    onMouseLeave={(e) => { if (clickable) (e.currentTarget.style.borderColor = "var(--app-border-light, var(--app-border))"); }}
                  >
                    <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginBottom: 4 }}>{c.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: c.color }}>{c.value}</div>
                    {c.hint && (
                      <div style={{ fontSize: 9, color: "var(--app-text-placeholder)", marginTop: 2 }}>{c.hint}</div>
                    )}
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--app-text-tertiary)", display: "flex", gap: 14 }}>
              {abcFunnel.booked > 0 && (
                <span>
                  블록 수용률 <span style={{ color: "var(--app-tag-green-text)", fontWeight: 600 }}>{abcFunnel.blockAdoptionRate}%</span>
                </span>
              )}
              {abcFunnel.churn > 0 && (
                <span>
                  이탈률 <span style={{ color: "#DC2626", fontWeight: 600 }}>{abcFunnel.churnRate}%</span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* 바로가기 */}
        <div style={{
          backgroundColor: "var(--app-surface)", borderRadius: 16, padding: 24,
          border: "1px solid var(--app-border)", boxShadow: "var(--app-shadow)",
        }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-tertiary)", margin: "0 0 16px", letterSpacing: "0.02em" }}>
            바로가기
          </h2>
          <div style={{ display: "flex", gap: 12 }}>
            <Link
              href="/conversations"
              style={{
                flex: 1, display: "flex", alignItems: "center", gap: 14,
                padding: 16, borderRadius: 12, border: "1px solid var(--app-border)",
                textDecoration: "none", transition: "all 0.15s",
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                backgroundColor: "var(--app-accent)", display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <MessageSquare style={{ width: 20, height: 20, color: "white" }} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)", margin: 0 }}>상담 관리</p>
                <p style={{ fontSize: 12, marginTop: 2, margin: "2px 0 0" }}>
                  {getValue("pending") > 0
                    ? <span style={{ color: "#FF5B5B", fontWeight: 500 }}>대기중 {getValue("pending")}건 처리 필요</span>
                    : <span style={{ color: "var(--app-text-placeholder)" }}>대기중인 상담 없음</span>
                  }
                </p>
              </div>
            </Link>

            <Link
              href="/conversations"
              style={{
                flex: 1, display: "flex", alignItems: "center", gap: 14,
                padding: 16, borderRadius: 12, border: "1px solid var(--app-border)",
                textDecoration: "none", transition: "all 0.15s",
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                backgroundColor: getValue("needsCheck") > 0 ? "var(--app-tag-orange-text)" : "var(--app-tag-orange-bg)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <AlertCircle style={{ width: 20, height: 20, color: getValue("needsCheck") > 0 ? "white" : "var(--app-tag-orange-text)" }} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)", margin: 0 }}>확인 필요</p>
                <p style={{ fontSize: 12, marginTop: 2, margin: "2px 0 0" }}>
                  {getValue("needsCheck") > 0
                    ? <span style={{ color: "var(--app-tag-orange-text)", fontWeight: 500 }}>{getValue("needsCheck")}건 상담사 직접 응대 필요</span>
                    : <span style={{ color: "var(--app-text-placeholder)" }}>확인 필요 없음</span>
                  }
                </p>
              </div>
            </Link>

            {/* 넛지하기 */}
            <button
              onClick={() => setNudgeOpen(true)}
              style={{
                flex: 1, display: "flex", alignItems: "center", gap: 14,
                padding: 16, borderRadius: 12, border: "1px solid var(--app-border)",
                textDecoration: "none", transition: "all 0.15s",
                backgroundColor: "transparent", cursor: "pointer", textAlign: "left",
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                backgroundColor: getValue("nudgeTarget") > 0 ? "var(--app-tag-orange-text)" : "var(--app-tag-orange-bg)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <Send style={{ width: 20, height: 20, color: getValue("nudgeTarget") > 0 ? "white" : "var(--app-tag-orange-text)" }} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)", margin: 0 }}>넛지하기</p>
                <p style={{ fontSize: 12, marginTop: 2, margin: "2px 0 0" }}>
                  {getValue("nudgeTarget") > 0
                    ? <span style={{ color: "var(--app-tag-orange-text)", fontWeight: 500 }}>{getValue("nudgeTarget")}건 넛지 대상</span>
                    : <span style={{ color: "var(--app-text-placeholder)" }}>넛지 대상 없음</span>
                  }
                </p>
              </div>
            </button>

            {/* 리마인드 */}
            <button
              onClick={() => setReminderOpen(true)}
              style={{
                flex: 1, display: "flex", alignItems: "center", gap: 14,
                padding: 16, borderRadius: 12, border: "1px solid var(--app-border)",
                textDecoration: "none", transition: "all 0.15s",
                backgroundColor: "transparent", cursor: "pointer", textAlign: "left",
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                backgroundColor: getValue("reminderTarget") > 0 ? "var(--app-tag-purple-text)" : "var(--app-tag-purple-bg)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <Bell style={{ width: 20, height: 20, color: getValue("reminderTarget") > 0 ? "white" : "var(--app-tag-purple-text)" }} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)", margin: 0 }}>리마인드</p>
                <p style={{ fontSize: 12, marginTop: 2, margin: "2px 0 0" }}>
                  {getValue("reminderTarget") > 0
                    ? <span style={{ color: "var(--app-tag-purple-text)", fontWeight: 500 }}>{getValue("reminderTarget")}건 내일 수거</span>
                    : <span style={{ color: "var(--app-text-placeholder)" }}>리마인드 대상 없음</span>
                  }
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* 이번달 종합 */}
        <div style={{
          backgroundColor: "var(--app-surface)", borderRadius: 16, padding: 24,
          border: "1px solid var(--app-border)", boxShadow: "var(--app-shadow)",
          marginTop: 24,
        }}>
          {/* 캘린더 헤더 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>
              월별 종합
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={goMonthPrev} style={{
                width: 32, height: 32, borderRadius: 8, border: "1px solid var(--app-border)",
                backgroundColor: "var(--app-surface)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <ChevronLeft style={{ width: 16, height: 16, color: "var(--app-text-secondary)" }} />
              </button>
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--app-text-primary)", minWidth: 100, textAlign: "center" }}>
                {calYear}년 {calMonth}월
              </span>
              <button onClick={goMonthNext} style={{
                width: 32, height: 32, borderRadius: 8, border: "1px solid var(--app-border)",
                backgroundColor: "var(--app-surface)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <ChevronRight style={{ width: 16, height: 16, color: "var(--app-text-secondary)" }} />
              </button>
            </div>
          </div>

          {/* 월 종합 카드 */}
          {monthly && !monthlyLoading && (
            <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 }}>
              <div style={{ backgroundColor: "var(--app-tag-blue-bg)", borderRadius: 12, padding: "16px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--app-text-secondary)", marginBottom: 6 }}>총 상담</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "var(--app-tag-blue-text)" }}>{monthly.summary.total}</div>
              </div>
              <div style={{ backgroundColor: "var(--app-tag-green-bg)", borderRadius: 12, padding: "16px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--app-text-secondary)", marginBottom: 6 }}>견적 발송</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "var(--app-tag-green-text)" }}>{monthly.summary.quoteSent}</div>
              </div>
              <div style={{ backgroundColor: "var(--app-tag-purple-bg)", borderRadius: 12, padding: "16px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--app-text-secondary)", marginBottom: 6 }}>예약 전환</div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 4 }}>
                  <span style={{ fontSize: 24, fontWeight: 700, color: "var(--app-tag-purple-text)" }}>{monthly.summary.booked}</span>
                  {monthly.summary.quoteSent > 0 && (
                    <span style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>
                      ({Math.round((monthly.summary.booked / monthly.summary.quoteSent) * 100)}%)
                    </span>
                  )}
                </div>
              </div>
            </div>
            {/* 매출 요약 */}
            {monthly.summary.bookedRevenue > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 20 }}>
                <div style={{ backgroundColor: "var(--app-tag-orange-bg)", borderRadius: 12, padding: "16px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--app-text-secondary)", marginBottom: 6 }}>전환 총액</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "var(--app-tag-orange-text)" }}>
                    {monthly.summary.bookedRevenue.toLocaleString()}<span style={{ fontSize: 13, fontWeight: 500 }}>원</span>
                  </div>
                </div>
                <div style={{ backgroundColor: "var(--app-tag-orange-bg)", borderRadius: 12, padding: "16px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--app-text-secondary)", marginBottom: 6 }}>객단가</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "var(--app-tag-orange-text)" }}>
                    {monthly.summary.bookedAvg.toLocaleString()}<span style={{ fontSize: 13, fontWeight: 500 }}>원</span>
                  </div>
                </div>
              </div>
            )}
            </>
          )}

          {/* 캘린더 */}
          {monthlyLoading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 0" }}>
              <Loader2 style={{ width: 20, height: 20, animation: "spin 1s linear infinite", color: "var(--app-accent)" }} />
              <span style={{ marginLeft: 8, color: "var(--app-text-tertiary)", fontSize: 14 }}>로딩 중...</span>
            </div>
          ) : monthly ? (
            <MonthlyCalendar year={calYear} month={calMonth} daily={monthly.daily} />
          ) : null}
        </div>

        {/* ── 운영 분석 ── */}
        <OperationAnalytics />

      </div>

      {/* 넛지 모달 */}
      {nudgeOpen && (
        <NudgeModal
          onClose={() => { setNudgeOpen(false); fetchStats(); }}
        />
      )}

      {/* 리마인드 모달 */}
      {reminderOpen && (
        <ReminderModal
          onClose={() => { setReminderOpen(false); fetchStats(); }}
        />
      )}

      {/* ABC 펀널 카테고리 세션 리스트 모달 */}
      {funnelModal && abcFunnel && (
        <FunnelDetailModal
          category={funnelModal.category}
          label={funnelModal.label}
          items={abcFunnel.details?.[funnelModal.category] ?? []}
          onClose={() => setFunnelModal(null)}
        />
      )}
    </div>
  );
}

function FunnelDetailModal({ category, label, items, onClose }: {
  category: FunnelCategory;
  label: string;
  items: FunnelItem[];
  onClose: () => void;
}) {
  void category;
  const fmtDateTime = (iso: string) => {
    const d = new Date(iso);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${m}/${day} ${hh}:${mm}`;
  };
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, backgroundColor: "var(--app-modal-backdrop)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--app-surface)", borderRadius: 16, padding: "24px 28px",
          width: 640, maxHeight: "80vh", display: "flex", flexDirection: "column",
          boxShadow: "var(--app-shadow-lg)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--app-text-primary)" }}>
              {label} <span style={{ color: "var(--app-text-tertiary)", fontWeight: 500 }}>({items.length}건)</span>
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--app-text-placeholder)" }}>
              클릭하면 해당 채팅방으로 이동합니다
            </p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X style={{ width: 18, height: 18, color: "var(--app-text-tertiary)" }} />
          </button>
        </div>

        {items.length === 0 ? (
          <div style={{ padding: "32px 0", textAlign: "center", color: "var(--app-text-tertiary)", fontSize: 14 }}>
            해당 카테고리 세션이 없습니다.
          </div>
        ) : (
          <div style={{ overflowY: "auto", border: "1px solid var(--app-border)", borderRadius: 10 }}>
            {items.map((it, i) => (
              <Link
                key={it.sessionId + it.sentAt}
                href={`/conversations?id=${it.sessionId}`}
                style={{
                  display: "grid", gridTemplateColumns: "110px 1fr auto", gap: 12,
                  padding: "10px 14px", fontSize: 13, alignItems: "center",
                  borderBottom: i < items.length - 1 ? "1px solid var(--app-border-light, var(--app-border))" : "none",
                  textDecoration: "none", color: "var(--app-text-primary)",
                  backgroundColor: i % 2 === 0 ? "var(--app-surface)" : "var(--app-bg)",
                }}
              >
                <span style={{ color: "var(--app-text-tertiary)", fontSize: 12 }}>{fmtDateTime(it.sentAt)}</span>
                <span>
                  <span style={{ fontWeight: 600 }}>{it.name || "(이름 미등록)"}</span>
                  <span style={{ color: "var(--app-text-placeholder)", fontSize: 11, marginLeft: 8 }}>
                    #{it.sessionId}
                  </span>
                  {it.timeSlot && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: "var(--app-text-tertiary)" }}>
                      · {it.timeSlot}{it.targetDate ? ` (${it.targetDate})` : ""}
                    </span>
                  )}
                </span>
                <span style={{
                  fontSize: 10, padding: "2px 6px", borderRadius: 4,
                  backgroundColor: it.source === "template" ? "var(--app-tag-blue-bg)" : "var(--app-tag-purple-bg)",
                  color: it.source === "template" ? "var(--app-tag-blue-text)" : "var(--app-tag-purple-text)",
                  fontWeight: 600,
                }}>
                  {it.source === "template" ? "템플릿" : "수기"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReminderModal({ onClose }: { onClose: () => void }) {
  const [targets, setTargets] = useState<ReminderTarget[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch("/api/reminder")
      .then((r) => r.json())
      .then((data) => {
        setTargets(data.targets || []);
        setSelected(new Set((data.targets || []).map((t: ReminderTarget) => t.sessionId)));
      })
      .catch(() => toast.error("리마인드 대상 조회 실패"))
      .finally(() => setLoading(false));
  }, []);

  const toggleAll = () => {
    if (selected.size === targets.length) setSelected(new Set());
    else setSelected(new Set(targets.map((t) => t.sessionId)));
  };

  const toggle = (sid: string) => {
    const next = new Set(selected);
    if (next.has(sid)) next.delete(sid);
    else next.add(sid);
    setSelected(next);
  };

  const handleSend = async () => {
    if (selected.size === 0) return;
    setSending(true);
    try {
      const res = await fetch("/api/reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionIds: Array.from(selected) }),
      });
      const data = await res.json();
      if (data.sent > 0) toast.success(`${data.sent}건 리마인드 발송 완료`);
      if (data.failed > 0) toast.error(`${data.failed}건 발송 실패`);
      onClose();
    } catch {
      toast.error("리마인드 발송 중 오류 발생");
    } finally {
      setSending(false);
    }
  };

  const fmtTime = (t: string) => {
    if (!t || t === "-") return "";
    const h = parseInt(t.split(":")[0], 10);
    const m = t.split(":")[1] || "00";
    if (isNaN(h)) return t;
    return h < 12 ? `오전 ${h}:${m}` : h === 12 ? `오후 12:${m}` : `오후 ${h - 12}:${m}`;
  };

  const reminderMsg = `[자동발송]\n안녕하세요, 커버링입니다.\n내일 방문수거 예약이 잡혀 있어 안내드립니다.\n수거 방문 전 다시 한번 연락드리겠습니다.\n감사합니다 😊`;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, backgroundColor: "var(--app-modal-backdrop)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--app-modal-bg)", borderRadius: 20, width: 480, maxHeight: "80vh",
          display: "flex", flexDirection: "column", overflow: "hidden",
          boxShadow: "var(--app-shadow-lg)",
        }}
      >
        {/* 헤더 */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px 16px", borderBottom: "1px solid var(--app-border-light)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, backgroundColor: "var(--app-tag-purple-text)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Bell style={{ width: 18, height: 18, color: "white" }} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>리마인드 발송</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X style={{ width: 20, height: 20, color: "var(--app-text-tertiary)" }} />
          </button>
        </div>

        {/* 본문 */}
        <div style={{ padding: "16px 24px", overflowY: "auto", flex: 1 }}>
          {/* 메시지 미리보기 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 8 }}>발송 메시지</div>
            <div style={{
              backgroundColor: "var(--app-tag-purple-bg)", border: "1px solid var(--app-border)", borderRadius: 12,
              padding: 14, fontSize: 13, lineHeight: 1.6, color: "var(--app-tag-purple-text)",
              whiteSpace: "pre-line",
            }}>
              {reminderMsg}
            </div>
          </div>

          {/* 대상 목록 */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)" }}>
                리마인드 대상 {targets.length}건
              </div>
              {targets.length > 0 && (
                <button
                  onClick={toggleAll}
                  style={{
                    fontSize: 12, color: "var(--app-tag-purple-text)", background: "none", border: "none",
                    cursor: "pointer", fontWeight: 500,
                  }}
                >
                  {selected.size === targets.length ? "전체 해제" : "전체 선택"}
                </button>
              )}
            </div>

            {loading ? (
              <div style={{ textAlign: "center", padding: 24, color: "var(--app-text-tertiary)", fontSize: 13 }}>
                <Loader2 style={{ width: 20, height: 20, animation: "spin 1s linear infinite", display: "inline" }} />
                <span style={{ marginLeft: 8 }}>조회 중...</span>
              </div>
            ) : targets.length === 0 ? (
              <div style={{
                textAlign: "center", padding: 24, color: "var(--app-text-tertiary)", fontSize: 13,
                backgroundColor: "var(--app-bg)", borderRadius: 12,
              }}>
                내일 수거 예정 리마인드 대상이 없습니다
              </div>
            ) : (
              <div style={{
                maxHeight: 240, overflowY: "auto", borderRadius: 12,
                border: "1px solid var(--app-border)",
              }}>
                {targets.map((t, i) => (
                  <label
                    key={t.sessionId}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 12px", cursor: "pointer",
                      borderBottom: i < targets.length - 1 ? "1px solid var(--app-border-light)" : "none",
                      backgroundColor: selected.has(t.sessionId) ? "var(--app-tag-purple-bg)" : "var(--app-surface)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(t.sessionId)}
                      onChange={() => toggle(t.sessionId)}
                      style={{ width: 16, height: 16, accentColor: "var(--app-tag-purple-text)" }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)", minWidth: 60 }}>
                      {t.name !== "미등록" ? t.name : <span style={{ color: "var(--app-text-placeholder)" }}>미등록 <span style={{ fontSize: 10 }}>({t.sessionId.slice(0, 12)}...)</span></span>}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>{t.phone !== "-" ? t.phone : ""}</span>
                    <span style={{ fontSize: 11, color: "var(--app-tag-purple-text)", fontWeight: 500, marginLeft: "auto" }}>
                      {fmtTime(t.preferredTime)}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 하단 */}
        <div style={{ padding: "16px 24px 20px", borderTop: "1px solid var(--app-border-light)" }}>
          <button
            onClick={handleSend}
            disabled={sending || selected.size === 0}
            style={{
              width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
              backgroundColor: selected.size > 0 ? "var(--app-tag-purple-text)" : "var(--app-border)",
              color: selected.size > 0 ? "white" : "var(--app-text-placeholder)",
              fontSize: 15, fontWeight: 700, cursor: selected.size > 0 ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {sending ? (
              <>
                <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} />
                발송 중...
              </>
            ) : (
              <>
                <Bell style={{ width: 16, height: 16 }} />
                {selected.size}건 리마인드 발송하기
              </>
            )}
          </button>
          <p style={{ fontSize: 11, color: "var(--app-text-placeholder)", textAlign: "center", marginTop: 8, margin: "8px 0 0" }}>
            발송 완료 건은 &quot;리마인드 완료&quot;로 표시되며 재발송 불가합니다.
          </p>
        </div>
      </div>
    </div>
  );
}

function NudgeModal({ onClose }: { onClose: () => void }) {
  const [targets, setTargets] = useState<NudgeTarget[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch("/api/nudge")
      .then((r) => r.json())
      .then((data) => {
        setTargets(data.targets || []);
        setSelected(new Set((data.targets || []).map((t: NudgeTarget) => t.sessionId)));
      })
      .catch(() => toast.error("넛지 대상 조회 실패"))
      .finally(() => setLoading(false));
  }, []);

  const toggleAll = () => {
    if (selected.size === targets.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(targets.map((t) => t.sessionId)));
    }
  };

  const toggle = (sid: string) => {
    const next = new Set(selected);
    if (next.has(sid)) next.delete(sid);
    else next.add(sid);
    setSelected(next);
  };

  const handleSend = async () => {
    if (selected.size === 0) return;
    setSending(true);
    try {
      const res = await fetch("/api/nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionIds: Array.from(selected) }),
      });
      const data = await res.json();
      if (data.sent > 0) toast.success(`${data.sent}건 넛지 발송 완료`);
      if (data.failed > 0) toast.error(`${data.failed}건 발송 실패`);
      onClose();
    } catch {
      toast.error("넛지 발송 중 오류 발생");
    } finally {
      setSending(false);
    }
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${(d.getMonth() + 1).toString().padStart(2, "0")}.${d.getDate().toString().padStart(2, "0")}`;
  };

  const nudgeMsg = `고객님, 안녕하세요\n커버링 방문수거 입니다!\n\n어제 보내드린 견적은 확인하셨나요?\n\n혹시 추가로 견적 관련해 궁금하신 점이나, 변경 사항 있으시면 언제든 말씀 주세요!\n고객님 편하신 시간에 연락 주시면 빠르게 답변 드릴 수 있도록 하겠습니다 : )`;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, backgroundColor: "var(--app-modal-backdrop)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--app-modal-bg)", borderRadius: 20, width: 480, maxHeight: "80vh",
          display: "flex", flexDirection: "column", overflow: "hidden",
          boxShadow: "var(--app-shadow-lg)",
        }}
      >
        {/* 헤더 */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px 16px", borderBottom: "1px solid var(--app-border-light)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, backgroundColor: "var(--app-tag-orange-text)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Send style={{ width: 18, height: 18, color: "white" }} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>넛지 발송</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X style={{ width: 20, height: 20, color: "var(--app-text-tertiary)" }} />
          </button>
        </div>

        {/* 본문 */}
        <div style={{ padding: "16px 24px", overflowY: "auto", flex: 1 }}>
          {/* 메시지 미리보기 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 8 }}>발송 메시지</div>
            <div style={{
              backgroundColor: "var(--app-tag-orange-bg)", border: "1px solid var(--app-border)", borderRadius: 12,
              padding: 14, fontSize: 13, lineHeight: 1.6, color: "var(--app-tag-orange-text)",
              whiteSpace: "pre-line",
            }}>
              {nudgeMsg}
            </div>
          </div>

          {/* 대상 목록 */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)" }}>
                넛지 대상 {targets.length}건
              </div>
              {targets.length > 0 && (
                <button
                  onClick={toggleAll}
                  style={{
                    fontSize: 12, color: "var(--app-accent)", background: "none", border: "none",
                    cursor: "pointer", fontWeight: 500,
                  }}
                >
                  {selected.size === targets.length ? "전체 해제" : "전체 선택"}
                </button>
              )}
            </div>

            {loading ? (
              <div style={{ textAlign: "center", padding: 24, color: "var(--app-text-tertiary)", fontSize: 13 }}>
                <Loader2 style={{ width: 20, height: 20, animation: "spin 1s linear infinite", display: "inline" }} />
                <span style={{ marginLeft: 8 }}>조회 중...</span>
              </div>
            ) : targets.length === 0 ? (
              <div style={{
                textAlign: "center", padding: 24, color: "var(--app-text-tertiary)", fontSize: 13,
                backgroundColor: "var(--app-bg)", borderRadius: 12,
              }}>
                넛지 대상이 없습니다
              </div>
            ) : (
              <div style={{
                maxHeight: 240, overflowY: "auto", borderRadius: 12,
                border: "1px solid var(--app-border)",
              }}>
                {targets.map((t, i) => (
                  <label
                    key={t.sessionId}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 12px", cursor: "pointer",
                      borderBottom: i < targets.length - 1 ? "1px solid var(--app-border-light)" : "none",
                      backgroundColor: selected.has(t.sessionId) ? "var(--app-tag-orange-bg)" : "var(--app-surface)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(t.sessionId)}
                      onChange={() => toggle(t.sessionId)}
                      style={{ width: 16, height: 16, accentColor: "var(--app-tag-orange-text)" }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)", minWidth: 60 }}>
                      {t.name !== "미등록" ? t.name : <span style={{ color: "var(--app-text-placeholder)" }}>미등록 <span style={{ fontSize: 10 }}>({t.sessionId.slice(0, 12)}...)</span></span>}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>{t.phone !== "-" ? t.phone : ""}</span>
                    <span style={{ fontSize: 11, color: "var(--app-text-placeholder)", marginLeft: "auto" }}>
                      {fmtDate(t.createdAt)}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 하단 */}
        <div style={{ padding: "16px 24px 20px", borderTop: "1px solid var(--app-border-light)" }}>
          <button
            onClick={handleSend}
            disabled={sending || selected.size === 0}
            style={{
              width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
              backgroundColor: selected.size > 0 ? "var(--app-tag-orange-text)" : "var(--app-border)",
              color: selected.size > 0 ? "white" : "var(--app-text-placeholder)",
              fontSize: 15, fontWeight: 700, cursor: selected.size > 0 ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {sending ? (
              <>
                <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} />
                발송 중...
              </>
            ) : (
              <>
                <Send style={{ width: 16, height: 16 }} />
                {selected.size}건 넛지 발송하기
              </>
            )}
          </button>
          <p style={{ fontSize: 11, color: "var(--app-text-placeholder)", textAlign: "center", marginTop: 8, margin: "8px 0 0" }}>
            넛지 발송 후 상태가 &quot;넛지완료&quot;로 변경되며 재발송 불가합니다.
          </p>
        </div>
      </div>
    </div>
  );
}

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function MonthlyCalendar({ year, month, daily }: { year: number; month: number; daily: Record<string, DailyStats> }) {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, "0")}-${today.getDate().toString().padStart(2, "0")}`;

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // pad to fill last row
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      {/* 요일 헤더 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0, marginBottom: 4 }}>
        {DAY_LABELS.map((d, i) => (
          <div key={d} style={{
            textAlign: "center", fontSize: 12, fontWeight: 600,
            color: i === 0 ? "#FF5B5B" : i === 6 ? "var(--app-accent)" : "var(--app-text-tertiary)",
            padding: "6px 0",
          }}>
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {cells.map((day, idx) => {
          if (day === null) return <div key={`e-${idx}`} />;

          const dayKey = `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
          const d = daily[dayKey];
          const isToday = dayKey === todayKey;
          const dayOfWeek = (firstDay + day - 1) % 7;
          const hasData = d && d.total > 0;

          return (
            <div
              key={dayKey}
              style={{
                minHeight: 72, padding: "4px 6px", borderRadius: 8,
                backgroundColor: isToday ? "var(--app-selected-bg)" : hasData ? "var(--app-surface-hover)" : "transparent",
                border: isToday ? "1px solid var(--app-border)" : "1px solid transparent",
              }}
            >
              <div style={{
                fontSize: 12, fontWeight: isToday ? 700 : 500,
                color: isToday ? "var(--app-accent)" : dayOfWeek === 0 ? "#FF5B5B" : dayOfWeek === 6 ? "var(--app-accent)" : "var(--app-text-secondary)",
                marginBottom: 2,
              }}>
                {day}
              </div>
              {hasData && (
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <div style={{ fontSize: 10, color: "var(--app-accent)", fontWeight: 500, lineHeight: 1.4 }}>
                    상담 {d.total}
                  </div>
                  {d.quoteSent > 0 && (
                    <div style={{ fontSize: 10, color: "#20C997", fontWeight: 500, lineHeight: 1.4 }}>
                      견적 {d.quoteSent}
                    </div>
                  )}
                  {d.booked > 0 && (
                    <div style={{ fontSize: 10, color: "var(--app-tag-purple-text)", fontWeight: 500, lineHeight: 1.4 }}>
                      전환 {d.booked}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 범례 */}
      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--app-border-light)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: "var(--app-accent)" }} />
          <span style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>상담</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: "#20C997" }} />
          <span style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>견적발송</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: "var(--app-tag-purple-text)" }} />
          <span style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>예약전환</span>
        </div>
      </div>
    </div>
  );
}

// ─── 운영 분석 (conversations 기반) ─────────────────

interface ResponseMetrics {
  firstResponseAvg: number;
  firstResponseMedian: number;
  closeTimeAvg: number;
  closeTimeMedian: number;
  sampleCount: number;
  closeSampleCount: number;
}

// ─── 운영 분석 헬퍼 컴포넌트 ─────────────────
function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{
      padding: "14px 16px",
      backgroundColor: "var(--app-surface-secondary)",
      border: "1px solid var(--app-border)",
      borderRadius: 10,
    }}>
      <div style={{ fontSize: 12, color: "var(--app-text-tertiary)", marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color }}>{value}</span>
        <span style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>{sub}</span>
      </div>
    </div>
  );
}

function Th({ children, align = "right" }: { children: React.ReactNode; align?: "left" | "center" | "right" }) {
  return (
    <th style={{
      textAlign: align, padding: "10px 8px",
      fontSize: 12, color: "var(--app-text-tertiary)",
      fontWeight: 500, whiteSpace: "nowrap",
    }}>{children}</th>
  );
}

function Td({ children, primary, sub, subColor }: {
  children?: React.ReactNode;
  primary?: string;
  sub?: string;
  subColor?: string;
}) {
  // primary+sub 모드: 두 줄 표시 / children 모드: 단일 값
  if (primary !== undefined) {
    return (
      <td style={{ textAlign: "right", padding: "10px 8px", fontSize: 14, color: "var(--app-text-primary)" }}>
        <div style={{ fontWeight: 600 }}>{primary}</div>
        {sub && <div style={{ fontSize: 11, color: subColor ?? "var(--app-text-tertiary)", marginTop: 2 }}>{sub}</div>}
      </td>
    );
  }
  return (
    <td style={{ textAlign: "right", padding: "10px 8px", fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)" }}>
      {children}
    </td>
  );
}

interface AnalyticsAssignee {
  name: string;
  total: number | null;
  quoteSent: number | null;
  booked: number | null;
  totalReplies: number;
  aiAsIs: number;
  aiEdited: number;
  aiAsIsRate: number | null;
  activeHours: number;
  repliesPerHour: number | null;
  closuresPerHour: number | null;
  medianResponseTimeMin: number | null;
}

interface AnalyticsData {
  total: number;
  heatmap: number[][];
  assignees: AnalyticsAssignee[];
  responseMetrics: ResponseMetrics;
}

const DAY_LABELS_OP = ["일", "월", "화", "수", "목", "금", "토"];

function OperationAnalytics() {
  const today = new Date();
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const todayStr = today.toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(todayStr);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/analytics?startDate=${startDate}&endDate=${endDate}`);
      setData(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const heatmapMax = useMemo(() => {
    if (!data) return 1;
    let max = 0;
    for (const row of data.heatmap) for (const c of row) if (c > max) max = c;
    return max || 1;
  }, [data]);

  const heatColor = (count: number) => {
    if (count === 0) return "var(--app-bg)";
    return `rgba(124, 58, 237, ${0.15 + (count / heatmapMax) * 0.85})`;
  };

  const fmtDuration = (ms: number) => {
    if (ms <= 0) return "-";
    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h > 0) return `${h}시간 ${m}분`;
    return `${m}분`;
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: "var(--app-surface)", borderRadius: 16, padding: 24,
    border: "1px solid var(--app-border)", boxShadow: "var(--app-shadow)", marginTop: 24,
  };

  return (
    <>
      <div style={{ ...cardStyle, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>운영 분석</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            style={{ padding: "6px 10px", fontSize: 13, border: "1px solid var(--app-border)", borderRadius: 8, backgroundColor: "var(--app-bg)", color: "var(--app-text-primary)" }} />
          <span style={{ color: "var(--app-text-tertiary)" }}>~</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            style={{ padding: "6px 10px", fontSize: 13, border: "1px solid var(--app-border)", borderRadius: 8, backgroundColor: "var(--app-bg)", color: "var(--app-text-primary)" }} />
          {loading && <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite", color: "var(--app-accent)" }} />}
          <button
            type="button"
            disabled={!data || loading}
            onClick={() => {
              if (!data) return;
              window.location.href = `/covering-talk/api/dashboard/analytics/export?startDate=${startDate}&endDate=${endDate}`;
            }}
            style={{
              padding: "6px 12px", fontSize: 13, border: "1px solid var(--app-border)", borderRadius: 8,
              backgroundColor: !data || loading ? "var(--app-surface-secondary)" : "var(--app-accent)",
              color: !data || loading ? "var(--app-text-tertiary)" : "#fff",
              cursor: !data || loading ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >CSV 다운로드</button>
        </div>
      </div>

      {data && (
        <>
          {/* 응답 시간 지표 */}
          <div style={{ ...cardStyle, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 12, color: "var(--app-text-tertiary)", marginBottom: 8 }}>첫 응답까지 시간</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--app-accent)" }}>{fmtDuration(data.responseMetrics.firstResponseMedian)}</div>
              <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginTop: 4 }}>평균 {fmtDuration(data.responseMetrics.firstResponseAvg)}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 12, color: "var(--app-text-tertiary)", marginBottom: 8 }}>상담 종료까지 시간</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#20C997" }}>{fmtDuration(data.responseMetrics.closeTimeMedian)}</div>
              <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginTop: 4 }}>평균 {fmtDuration(data.responseMetrics.closeTimeAvg)}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 12, color: "var(--app-text-tertiary)", marginBottom: 8 }}>전체 상담</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--app-text-primary)" }}>{data.total}건</div>
              <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginTop: 4 }}>응답 {data.responseMetrics.sampleCount}건 측정</div>
            </div>
          </div>

          {/* 시간대별 히트맵 */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--app-text-primary)", margin: "0 0 16px" }}>시간대별 유입 분포</h3>
            <div style={{ overflowX: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "32px repeat(24, 1fr)", gap: 3 }}>
                <div />
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} style={{ textAlign: "center", fontSize: 10, color: "var(--app-text-tertiary)", padding: "2px 0" }}>{h}</div>
                ))}
                {DAY_LABELS_OP.map((day, di) => (
                  <div key={di} style={{ display: "contents" }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: di === 0 || di === 6 ? "#EF4444" : "var(--app-text-secondary)", display: "flex", alignItems: "center", justifyContent: "center" }}>{day}</div>
                    {Array.from({ length: 24 }, (_, h) => {
                      const c = data.heatmap[di]?.[h] || 0;
                      return (
                        <div key={h} title={`${day} ${h}시: ${c}건`} style={{
                          backgroundColor: heatColor(c), borderRadius: 4, height: 26,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 9, fontWeight: c > 0 ? 600 : 400, color: c > 0 ? "#fff" : "transparent",
                        }}>{c > 0 ? c : ""}</div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 상담사별 퍼포먼스 섹션 제거 — /new_dashboard CS Realtime + CsReportSection 으로 통합됨. */}
        </>
      )}
    </>
  );
}
