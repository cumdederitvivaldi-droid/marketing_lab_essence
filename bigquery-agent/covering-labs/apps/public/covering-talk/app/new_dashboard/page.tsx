"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  PeriodPreset,
  PeriodRange,
  periodFromSearchParams,
  periodToSearchParams,
  resolvePeriod,
  inferComparePeriod,
} from "@/lib/dashboard/period";
import { JourneyMapData, KrCardData, HealthCardData, TrafficChannel } from "@/lib/dashboard/types";
import {
  analyticsCache, complaintsCache, churnReasonsCache,
  ANALYTICS_CACHE_MS, COMPLAINTS_CACHE_MS, CHURN_REASONS_CACHE_MS,
  fetchAnalyticsDedup, fetchComplaintsDedup, fetchChurnReasonsDedup,
  churnReasonsKey,
} from "@/lib/dashboard/cache";
import { PeriodFilter } from "./components/PeriodFilter";
import { KrSection } from "./components/KrSection";
import { JourneyMapSection } from "./components/JourneyMapSection";
import { HeadlineKpis } from "./components/HeadlineKpis";
import { RegionMapSection } from "./components/RegionMapSection";
import { CsReportSection } from "./components/CsReportSection";
import { CsRealtimeSection } from "./components/CsRealtimeSection";
import { TabbedAnalyticsSection } from "./components/TabbedAnalyticsSection";
import { HealthSection } from "./components/HealthSection";
import { TrafficSection } from "./components/TrafficSection";
import { NoteProvider } from "./components/NoteContext";
import { NotePopover } from "./components/NotePopover";
import { ChurnReasonModal } from "./components/ChurnReasonModal";
import { ComplaintModal } from "./components/ComplaintModal";
import { OrdersDetailModal } from "./components/OrdersDetailModal";
import { NpsModal } from "./components/NpsModal";

const COMPLAINT_CATEGORIES_PUBLIC = [
  "파손훼손", "일정변경", "누락실수", "가격추가비용", "응대태도", "결제문제", "기타",
] as const;
type ComplaintCat = (typeof COMPLAINT_CATEGORIES_PUBLIC)[number];

// 관리자 대시보드 접근 권한 — 배차관리와 동일 (강성진/유대현/김원빈)
const ADMIN_DASHBOARD_ALLOWED_USERS = ["강성진", "유대현", "김원빈"];

// 캐시는 lib/dashboard/cache.ts 에서 import — layout 의 백그라운드 prefetch 와 공유

interface AnalyticsResponse {
  period: { from: string; to: string; fromDateKst: string; toDateKst: string; label: string; preset: string };
  generatedAt: string;
  krCards: KrCardData[];
  journeyMap: JourneyMapData;
  healthCards: HealthCardData[];
  traffic: TrafficChannel[];
  trafficConverted?: TrafficChannel[];
  _trafficNote?: string;
}

export default function NewDashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardInner />
    </Suspense>
  );
}

function DashboardLoading() {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      backgroundColor: "var(--app-bg)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 14,
    }}>
      <Loader2 style={{ width: 28, height: 28, color: "var(--app-accent)" }} className="animate-spin" />
      <div style={{ fontSize: 13, color: "var(--app-text-tertiary)", fontWeight: 500 }}>
        대시보드를 불러오는 중…
      </div>
    </div>
  );
}

// 본문이 mount된 상태에서 데이터 도착 전까지 가리는 overlay (fade-out)
function DashboardOverlay() {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9998,
      backgroundColor: "var(--app-bg)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 14,
      animation: "csDashboardOverlayFade 200ms ease-out",
    }}>
      <Loader2 style={{ width: 28, height: 28, color: "var(--app-accent)" }} className="animate-spin" />
      <div style={{ fontSize: 13, color: "var(--app-text-tertiary)", fontWeight: 500 }}>
        대시보드를 불러오는 중…
      </div>
      <style>{`
        @keyframes csDashboardOverlayFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function DashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  // 권한 체크 — 미허용자는 /conversations 으로 리다이렉트 (dispatch와 동일 패턴)
  useEffect(() => {
    if (authLoading) return;
    if (user && !ADMIN_DASHBOARD_ALLOWED_USERS.includes(user.name)) {
      router.replace("/conversations");
    }
  }, [user, authLoading, router]);

  const isAllowed = !!user && ADMIN_DASHBOARD_ALLOWED_USERS.includes(user.name);

  const range: PeriodRange = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    return periodFromSearchParams(params);
  }, [searchParams]);

  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 비교 모드 상태
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareManual, setCompareManual] = useState(false);
  const [compareCustomDates, setCompareCustomDates] = useState<{ from: string; to: string } | null>(null);
  const [compareData, setCompareData] = useState<AnalyticsResponse | null>(null);

  const compareRange: PeriodRange | null = useMemo(() => {
    if (!compareEnabled) return null;
    if (compareManual && compareCustomDates) {
      return resolvePeriod("custom", compareCustomDates);
    }
    return inferComparePeriod(range);
  }, [compareEnabled, compareManual, compareCustomDates, range]);
  // (AI 인사이트 제거 — 분석 품질 미흡으로 PO 가 셀 메모 기능으로 직접 작성)
  // P2 / P4 / P5 별 이탈 사유 분류 결과 + 로딩 상태
  const [churnReasons, setChurnReasons] = useState<Record<string, Record<string, number> | null>>({});
  const [churnReasonsLoading, setChurnReasonsLoading] = useState<Record<string, boolean>>({});
  // 이탈 사유 뱃지 클릭 시 띄우는 모달 상태
  const [reasonModal, setReasonModal] = useState<{ phase: string; reason: string } | null>(null);
  // 고객 불만 — post(예약확정 후) / pre(예약 전) 별도 분류
  const [complaintCountsPost, setComplaintCountsPost] = useState<Record<ComplaintCat, number> | null>(null);
  const [complaintCountsPre, setComplaintCountsPre] = useState<Record<ComplaintCat, number> | null>(null);
  const [complaintModal, setComplaintModal] = useState<{ open: boolean; mode: "pre" | "post"; cat: ComplaintCat | null }>({
    open: false, mode: "post", cat: null,
  });
  // 취소율 / 미결제율 카드 상세 모달
  const [ordersModal, setOrdersModal] = useState<{ open: boolean; status: "cancelled" | "payment_requested" | null }>({
    open: false, status: null,
  });
  // NPS 모달
  const [npsModalOpen, setNpsModalOpen] = useState(false);

  interface NpsSummary {
    totalSent: number;
    totalResponded: number;
    responseRate: number;
    avgScore: number;
    bucketCounts: Record<string, number>;
  }
  const [npsData, setNpsData] = useState<NpsSummary | null>(null);

  const updatePeriod = useCallback(
    (next: PeriodRange) => {
      const params = new URLSearchParams(searchParams.toString());
      const patch = periodToSearchParams(next);
      params.delete("from");
      params.delete("to");
      Object.entries(patch).forEach(([k, v]) => params.set(k, v));
      router.replace(`/new_dashboard?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const handlePresetChange = useCallback(
    (preset: PeriodPreset) => {
      const next = preset === "custom"
        ? resolvePeriod("custom", { from: range.fromDateKst, to: range.toDateKst })
        : resolvePeriod(preset);
      updatePeriod(next);
    },
    [range.fromDateKst, range.toDateKst, updatePeriod],
  );

  const handleCustomChange = useCallback(
    (from: string, to: string) => {
      const next = resolvePeriod("custom", { from, to });
      updatePeriod(next);
    },
    [updatePeriod],
  );

  const fetchData = useCallback(async () => {
    if (!isAllowed) return;
    const cacheKey = searchParams.toString();
    const cached = analyticsCache.get(cacheKey);
    const isFresh = cached && Date.now() - cached.ts < ANALYTICS_CACHE_MS;

    // 캐시 hit (fresh) — 즉시 표시, refetch 생략
    if (isFresh) {
      setData(cached.data);
      setRefreshedAt(new Date(cached.ts));
      setError(null);
      setLoading(false);
      return;
    }

    // 캐시 stale — 즉시 표시(overlay 안 뜸) + 백그라운드 refresh
    if (cached) {
      setData(cached.data);
      setRefreshedAt(new Date(cached.ts));
      setError(null);
    } else {
      setLoading(true);
    }
    setError(null);
    const json = await fetchAnalyticsDedup(cacheKey);
    if (json) {
      setData(json);
      setRefreshedAt(new Date());
    } else if (!cached) {
      setError("알 수 없는 오류");
    }
    setLoading(false);
  }, [isAllowed, searchParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 비교 기간 데이터 fetch — compareRange 변경 시
  useEffect(() => {
    if (!compareRange || !isAllowed) {
      setCompareData(null);
      return;
    }
    let cancelled = false;
    const compareParams = new URLSearchParams();
    Object.entries(periodToSearchParams(compareRange)).forEach(([k, v]) => compareParams.set(k, v));
    const compareKey = compareParams.toString();
    const cached = analyticsCache.get(compareKey);
    if (cached && Date.now() - cached.ts < ANALYTICS_CACHE_MS) {
      setCompareData(cached.data);
      return;
    }
    if (cached) setCompareData(cached.data);  // stale 우선 표시
    fetchAnalyticsDedup(compareKey).then((json) => {
      if (cancelled) return;
      if (json) setCompareData(json);
    });
    return () => { cancelled = true; };
  }, [compareRange, isAllowed]);

  // P2 / P4 / P5 / P8 이탈 사유 — 별도 비동기 (Haiku on-demand + DB 캐시)
  // P8 = 예약확정 후 cancelled 된 케이스 (수거완료 단계 이탈)
  // 백그라운드 prefetch (lib/dashboard/cache.ts) 가 채워둔 캐시 hit 시 즉시 표시 + 네트워크 생략.
  useEffect(() => {
    if (!data) { setChurnReasons({}); setChurnReasonsLoading({}); return; }
    let cancelled = false;

    const phases = ["phase_2", "phase_4", "phase_5", "phase_8"] as const;
    const initLoading: Record<string, boolean> = {};
    const initReasons: Record<string, Record<string, number> | null> = {};
    const phasesToFetch: string[] = [];

    for (const phase of phases) {
      const cached = churnReasonsCache.get(churnReasonsKey(phase, data.period.from, data.period.to));
      const isFresh = cached && Date.now() - cached.ts < CHURN_REASONS_CACHE_MS;
      if (cached) initReasons[phase] = cached.counts;
      // fresh 캐시면 패치 생략, stale 또는 미스면 백그라운드 패치 (stale 은 기존 값 표시 유지)
      if (!isFresh) {
        phasesToFetch.push(phase);
        if (!cached) initLoading[phase] = true;
      }
    }
    setChurnReasons(initReasons);
    setChurnReasonsLoading(initLoading);

    for (const phase of phasesToFetch) {
      fetchChurnReasonsDedup(phase, data.period.from, data.period.to)
        .then((j) => {
          if (cancelled) return;
          setChurnReasons((prev) => ({ ...prev, [phase]: j?.counts ?? null }));
        })
        .catch(() => { /* 무시 */ })
        .finally(() => {
          if (cancelled) return;
          setChurnReasonsLoading((prev) => ({ ...prev, [phase]: false }));
        });
    }
    return () => { cancelled = true; };
  }, [data]);

  // 고객 불만 분류 — stale-while-revalidate (캐시 hit 즉시 표시 + 백그라운드 refresh)
  useEffect(() => {
    if (!data) { setComplaintCountsPost(null); setComplaintCountsPre(null); return; }
    const key = `${data.period.from}|${data.period.to}`;
    const cached = complaintsCache.get(key);
    const isFresh = cached && Date.now() - cached.ts < COMPLAINTS_CACHE_MS;

    if (cached) {
      setComplaintCountsPost(cached.post as Record<ComplaintCat, number> | null);
      setComplaintCountsPre(cached.pre as Record<ComplaintCat, number> | null);
    }
    if (isFresh) return;

    let cancelled = false;
    fetchComplaintsDedup(data.period.from, data.period.to).then(({ post, pre }) => {
      if (cancelled) return;
      setComplaintCountsPost(post as Record<ComplaintCat, number> | null);
      setComplaintCountsPre(pre as Record<ComplaintCat, number> | null);
    });
    return () => { cancelled = true; };
  }, [data]);

  // NPS 데이터 — 기간 변경 시 별도 fetch
  useEffect(() => {
    if (!data) { setNpsData(null); return; }
    let cancelled = false;
    fetch(
      `/api/new_dashboard/nps?fromDate=${encodeURIComponent(data.period.fromDateKst)}&toDate=${encodeURIComponent(data.period.toDateKst)}`,
    )
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setNpsData(j.summary ?? null); })
      .catch(() => { /* 무시 */ });
    return () => { cancelled = true; };
  }, [data]);

  // healthCards 의 complaints 카드를 두 카운트(전/후)로 합쳐 표시 — "{pre}/{post}건"
  const enrichedHealthCards = useMemo<HealthCardData[]>(() => {
    const cards = data?.healthCards ?? [];
    return cards.map((c) => {
      if (c.id === "complaints") {
        const pre = complaintCountsPre ? Object.values(complaintCountsPre).reduce((a, b) => a + b, 0) : null;
        const post = complaintCountsPost ? Object.values(complaintCountsPost).reduce((a, b) => a + b, 0) : null;
        if (pre === null && post === null) return c;
        const total = (pre ?? 0) + (post ?? 0);
        const status: HealthCardData["status"] =
          total > c.threshold ? "alert" : total >= c.threshold * 0.8 ? "warn" : "ok";
        return {
          ...c,
          current: total,
          currentDisplay: `${total}건 (${pre ?? "—"}/${post ?? "—"})`,
          status,
        };
      }
      if (c.id === "nps") {
        if (!npsData || npsData.totalResponded === 0) return c;
        const avg = npsData.avgScore;
        const status: HealthCardData["status"] = avg >= 4 ? "ok" : avg >= 3 ? "warn" : "alert";
        return {
          ...c,
          current: avg,
          currentDisplay: `${avg.toFixed(1)} / 5점`,
          status,
        };
      }
      return c;
    });
  }, [data?.healthCards, complaintCountsPost, complaintCountsPre, npsData]);


  if (authLoading || !user) {
    return <DashboardLoading />;
  }

  if (!isAllowed) {
    return null;
  }

  return (
    <NoteProvider>
      <div style={{
        height: "100vh",
        overflowY: "auto",
        backgroundColor: "var(--app-bg)",
        color: "var(--app-text-primary)",
      }}>
        <div style={{
          maxWidth: 1440, margin: "0 auto",
          padding: "24px 28px 80px",
          display: "flex", flexDirection: "column", gap: 24,
        }}>
          <PageHeader />

          <PeriodFilter
            range={range}
            onPresetChange={handlePresetChange}
            onCustomChange={handleCustomChange}
            onRefresh={fetchData}
            refreshedAt={refreshedAt}
            loading={loading}
            compareEnabled={compareEnabled}
            onCompareToggle={setCompareEnabled}
            compareRange={compareRange}
            compareManual={compareManual}
            onCompareModeChange={(manual) => {
              setCompareManual(manual);
              if (manual && !compareCustomDates) {
                // 직접 모드 전환 시 자동 추정값으로 초기화
                const auto = inferComparePeriod(range);
                setCompareCustomDates({ from: auto.fromDateKst, to: auto.toDateKst });
              }
            }}
            onCompareCustomChange={(from, to) => setCompareCustomDates({ from, to })}
          />

          {error && <ErrorBanner message={error} />}

          <KrSection cards={data?.krCards ?? []} loading={loading && !data} />

          <HeadlineKpis
            current={data ?? null}
            compare={compareData ?? null}
            currentRange={range}
            compareRange={compareRange}
            loading={loading && !data}
          />

          <JourneyMapSection
            data={(() => {
              if (!data?.journeyMap) return null;
              let map = { ...data.journeyMap };
              const phasesWithChurnReasons = ["phase_2", "phase_4", "phase_5", "phase_8"];
              map = {
                ...map,
                columns: map.columns.map((c) => {
                  if (!phasesWithChurnReasons.includes(c.phase)) return c;
                  const counts = churnReasons[c.phase];
                  if (!counts) return c;
                  const items = Object.entries(counts)
                    .filter(([, count]) => (count as number) > 0)
                    .map(([keyword, count]) => ({ keyword, count: count as number }));
                  return { ...c, churnReasons: items };
                }),
              };
              return map;
            })()}
            loading={loading && !data}
            churnReasonsLoading={churnReasonsLoading}
            onChurnReasonClick={(phase, reason) => setReasonModal({ phase, reason })}
            compareDailyFunnel={compareData?.journeyMap?.dailyFunnel ?? null}
          />

          <RegionMapSection
            fromDateKst={data?.period.fromDateKst ?? ""}
            toDateKst={data?.period.toDateKst ?? ""}
          />

          <CsReportSection
            fromDateKst={data?.period.fromDateKst ?? ""}
            toDateKst={data?.period.toDateKst ?? ""}
          />

          <CsRealtimeSection />

          <TabbedAnalyticsSection
            fromDateKst={data?.period.fromDateKst ?? ""}
            toDateKst={data?.period.toDateKst ?? ""}
          />

          <div style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
            gap: 16,
          }}>
            <HealthSection
              cards={enrichedHealthCards}
              loading={loading && !data}
              onCardClick={(id) => {
                if (id === "complaints") {
                  setComplaintModal({ open: true, mode: "post", cat: null });
                } else if (id === "cancel") {
                  setOrdersModal({ open: true, status: "cancelled" });
                } else if (id === "no_payment") {
                  setOrdersModal({ open: true, status: "payment_requested" });
                } else if (id === "nps") {
                  setNpsModalOpen(true);
                }
              }}
            />
            <TrafficSection
              channels={data?.traffic ?? []}
              channelsConverted={data?.trafficConverted ?? []}
              loading={loading && !data}
            />
          </div>
        </div>
      </div>
      <NotePopover />
      <ChurnReasonModal
        open={!!reasonModal}
        phase={reasonModal?.phase ?? null}
        reason={reasonModal?.reason ?? null}
        fromIso={data?.period.from ?? ""}
        toIso={data?.period.to ?? ""}
        onClose={() => setReasonModal(null)}
      />
      <ComplaintModal
        open={complaintModal.open}
        initialMode={complaintModal.mode}
        countsPost={complaintCountsPost}
        countsPre={complaintCountsPre}
        fromIso={data?.period.from ?? ""}
        toIso={data?.period.to ?? ""}
        initialCategory={complaintModal.cat}
        onClose={() => setComplaintModal((s) => ({ ...s, open: false }))}
        onUnmarked={(unmarkedMode, cat, sessionRemoved) => {
          // 카운트는 세션 단위 — 그 세션의 마지막 컴플레인 메시지를 unmark 했을 때만 -1
          if (!sessionRemoved) return;
          const decrement = (
            prev: Record<ComplaintCat, number> | null,
          ): Record<ComplaintCat, number> | null => {
            if (!prev) return prev;
            const cur = prev[cat] ?? 0;
            if (cur <= 0) return prev;
            return { ...prev, [cat]: cur - 1 };
          };
          if (unmarkedMode === "post") setComplaintCountsPost(decrement);
          else setComplaintCountsPre(decrement);
        }}
      />
      <OrdersDetailModal
        open={ordersModal.open}
        status={ordersModal.status}
        fromIso={data?.period.from ?? ""}
        toIso={data?.period.to ?? ""}
        onClose={() => setOrdersModal((s) => ({ ...s, open: false }))}
      />
      <NpsModal
        open={npsModalOpen}
        fromDateKst={data?.period.fromDateKst ?? ""}
        toDateKst={data?.period.toDateKst ?? ""}
        onClose={() => setNpsModalOpen(false)}
      />
      {/* 첫 진입 — 핵심 데이터(analytics + complaints counts) 다 도착할 때까지 풀스크린 overlay */}
      {(!data || complaintCountsPost === null || complaintCountsPre === null) && <DashboardOverlay />}
    </NoteProvider>
  );
}

function PageHeader() {
  return (
    <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{
        fontSize: 12, fontWeight: 600,
        color: "var(--app-text-tertiary)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}>
        Analytics · Customer Journey
      </span>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>
        방문수거 대시보드
      </h1>
    </header>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{
      padding: "10px 14px",
      backgroundColor: "rgba(239,68,68,0.10)",
      border: "1px solid rgba(239,68,68,0.30)",
      borderRadius: 10,
      fontSize: 13, color: "#9F1239",
    }}>
      ⚠️ {message}
    </div>
  );
}
