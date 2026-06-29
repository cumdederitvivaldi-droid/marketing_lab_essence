"use client";

import { useState, useEffect } from "react";

interface HourlyBucket {
  hour: number;
  count: number;
  totalRevenue: number;
  avgRevenue: number;
}

interface WeekdayHourlyBucket {
  weekday: number;
  hour: number;
  count: number;
}

interface DailyBucket {
  date: string;
  weekday: number;
  count: number;
  totalRevenue: number;
  avgRevenue: number;
  avgHour: number;
}

interface ConversionTimeSummary {
  peakHour: number;
  lowHour: number;
  topRevenueHour: number;
  totalConverted: number;
}

interface ConversionTimeData {
  hourly: HourlyBucket[];
  weekdayHourly: WeekdayHourlyBucket[];
  daily: DailyBucket[];
  summary: ConversionTimeSummary;
}

// Tab 3
interface PriceTier {
  tier: string;
  minPrice: number;
  maxPrice: number | null;
  quoteCount: number;
  convertedCount: number;
  conversionRate: number;
  avgRevenue: number;
  cancelledCount: number;
}
interface PriceTierSummary {
  totalQuotes: number;
  totalConverted: number;
  overallRate: number;
  avgQuotePrice: number;
}
interface PriceTierData {
  tiers: PriceTier[];
  summary: PriceTierSummary;
}

// Tab 4
interface RegionBucket {
  district: string;
  inflow: number;
  converted: number;
  conversionRate: number;
  totalRevenue: number;
  avgRevenue: number;
}
interface RegionSummary {
  topDistrict: string;
  topConvRateDistrict: string;
  topAvgPriceDistrict: string;
  totalDistricts: number;
}
interface RegionData {
  regions: RegionBucket[];
  summary: RegionSummary;
}

// Tab 5
interface ResponseTimeBucket {
  range: string;
  totalConvs: number;
  converted: number;
  conversionRate: number;
  aiCount: number;
  humanCount: number;
}
interface ResponseTimeSummary {
  avgResponseMinutes: number;
  fastestRangeRate: number;
  totalConvs: number;
}
interface ResponseTimeData {
  buckets: ResponseTimeBucket[];
  summary: ResponseTimeSummary;
}

// Tab 6
interface DistributionRow {
  orderCount: number;
  customerCount: number;
}
interface RepeatSummary {
  totalCustomers: number;
  repeatCustomers: number;
  repeatRate: number;
  avgLeadTimeDays: number;
  avgLtvKrw: number;
}
interface TopCustomer {
  phoneMasked: string;
  orderCount: number;
  totalRevenue: number;
  firstOrderAt: string;
  lastOrderAt: string;
}
interface RepeatData {
  distribution: DistributionRow[];
  summary: RepeatSummary;
  topCustomers: TopCustomer[];
}

// Tab 7 — PROMO 출장비 cap 적용 전후 비교
interface PromoSegment {
  from: string;
  to: string;
  durationDays: number;
  totalInflow: number;
  totalConverted: number;
  totalRevenue: number;
  avgConversionRate: number;
  avgRevenue: number;
  regions: Array<{
    district: string;
    inflow: number;
    converted: number;
    conversionRate: number;
    totalRevenue: number;
    avgRevenue: number;
    isCapTarget: boolean;
    rawPrice1: number;
  }>;
}
interface CapTargetCompare {
  district: string;
  rawPrice1: number;
  before: { inflow: number; converted: number; conversionRate: number; avgRevenue: number };
  after: { inflow: number; converted: number; conversionRate: number; avgRevenue: number };
  conversionRateDelta: number;
}
interface PromoCapData {
  capActivatedAt: string;
  before: PromoSegment;
  after: PromoSegment;
  capTargetCompare: CapTargetCompare[];
}

interface Props {
  fromDateKst: string;
  toDateKst: string;
}

const TAB_LABELS: string[] = [
  "전환 인입 시간",
  "전환 많은 날 vs 적은 날",
  "견적 가격대별 전환률",
  "지역별 전환률·객단가",
  "첫 응답 속도 ↔ 전환률",
  "재예약 (LTV)",
  "PROMO 캡 전후",
  "📞 전화상담 (실험)",
  "탭 9",
  "탭 10",
];

interface PhoneConsultSessionItem {
  sessionId: string;
  name: string | null;
  phone: string | null;
  status: string;
  currentPhase: string | null;
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
  isCompleted: boolean;
  isConverted: boolean;
  hasOrder: boolean;
  orderStatus: string | null;
  orderTotal: number | null;
}

interface PhoneConsultDaily {
  date: string;
  total: number;
  converted: number;
  cancelled: number;
  pending: number;
}

interface PhoneConsultData {
  summary: {
    total: number;
    completed: number;
    completionRate: number;
    converted: number;
    conversionRate: number;
    inProgress: number;
  };
  daily: PhoneConsultDaily[];
  sessions: PhoneConsultSessionItem[];
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function formatKrw(n: number): string {
  if (n === 0) return "—";
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString()}만`;
  return `${n.toLocaleString()}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function fmtAvgHour(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${pad2(hh)}:${pad2(mm)}`;
}

function fmtMd(date: string): string {
  const [, m, d] = date.split("-");
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

export function TabbedAnalyticsSection({ fromDateKst, toDateKst }: Props) {
  const [activeTab, setActiveTab] = useState(0);
  const [data, setData] = useState<ConversionTimeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [priceTierData, setPriceTierData] = useState<PriceTierData | null>(null);
  const [priceTierLoading, setPriceTierLoading] = useState(false);
  const [priceTierError, setPriceTierError] = useState<string | null>(null);

  const [regionData, setRegionData] = useState<RegionData | null>(null);
  const [regionLoading, setRegionLoading] = useState(false);
  const [regionError, setRegionError] = useState<string | null>(null);

  const [responseTimeData, setResponseTimeData] = useState<ResponseTimeData | null>(null);
  const [responseTimeLoading, setResponseTimeLoading] = useState(false);
  const [responseTimeError, setResponseTimeError] = useState<string | null>(null);

  const [repeatData, setRepeatData] = useState<RepeatData | null>(null);
  const [repeatLoading, setRepeatLoading] = useState(false);
  const [repeatError, setRepeatError] = useState<string | null>(null);

  const [promoCapData, setPromoCapData] = useState<PromoCapData | null>(null);
  const [promoCapLoading, setPromoCapLoading] = useState(false);
  const [promoCapError, setPromoCapError] = useState<string | null>(null);
  const [capActivatedAt, setCapActivatedAt] = useState<string>("2026-05-07T17:00");

  const [phoneConsultData, setPhoneConsultData] = useState<PhoneConsultData | null>(null);
  const [phoneConsultLoading, setPhoneConsultLoading] = useState(false);
  const [phoneConsultError, setPhoneConsultError] = useState<string | null>(null);

  // period 가 변하면 모든 탭 data reset → useEffect 들이 새로 fetch
  useEffect(() => {
    setData(null);
    setPriceTierData(null);
    setRegionData(null);
    setResponseTimeData(null);
    setRepeatData(null);
    setPromoCapData(null);
    setPhoneConsultData(null);
  }, [fromDateKst, toDateKst]);

  useEffect(() => {
    if (!fromDateKst || !toDateKst || activeTab !== 7 || phoneConsultData) return;
    setPhoneConsultLoading(true);
    setPhoneConsultError(null);
    fetch(`/api/new_dashboard/phone-consultations?fromDate=${fromDateKst}&toDate=${toDateKst}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res: PhoneConsultData & { error?: string }) => {
        if (res.error) { setPhoneConsultError(res.error); return; }
        setPhoneConsultData(res);
      })
      .catch((e) => setPhoneConsultError(e instanceof Error ? e.message : "Unknown error"))
      .finally(() => setPhoneConsultLoading(false));
  }, [fromDateKst, toDateKst, activeTab, phoneConsultData]);

  useEffect(() => {
    if (!fromDateKst || !toDateKst) return;
    if (activeTab !== 0 && activeTab !== 1) return;
    if (data) return;
    setLoading(true);
    setError(null);
    fetch(`/api/new_dashboard/conversion-time?fromDate=${fromDateKst}&toDate=${toDateKst}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res: ConversionTimeData & { error?: string }) => {
        if (res.error) { setError(res.error); return; }
        setData(res);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Unknown error"))
      .finally(() => setLoading(false));
  }, [fromDateKst, toDateKst, activeTab, data]);

  useEffect(() => {
    if (!fromDateKst || !toDateKst || activeTab !== 2 || priceTierData) return;
    setPriceTierLoading(true);
    setPriceTierError(null);
    fetch(`/api/new_dashboard/price-tiers?fromDate=${fromDateKst}&toDate=${toDateKst}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res: PriceTierData & { error?: string }) => {
        if (res.error) { setPriceTierError(res.error); return; }
        setPriceTierData(res);
      })
      .catch((e) => setPriceTierError(e instanceof Error ? e.message : "Unknown error"))
      .finally(() => setPriceTierLoading(false));
  }, [fromDateKst, toDateKst, activeTab, priceTierData]);

  useEffect(() => {
    if (!fromDateKst || !toDateKst || activeTab !== 3 || regionData) return;
    setRegionLoading(true);
    setRegionError(null);
    fetch(`/api/new_dashboard/region-conversion?fromDate=${fromDateKst}&toDate=${toDateKst}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res: RegionData & { error?: string }) => {
        if (res.error) { setRegionError(res.error); return; }
        setRegionData(res);
      })
      .catch((e) => setRegionError(e instanceof Error ? e.message : "Unknown error"))
      .finally(() => setRegionLoading(false));
  }, [fromDateKst, toDateKst, activeTab, regionData]);

  useEffect(() => {
    if (!fromDateKst || !toDateKst || activeTab !== 4 || responseTimeData) return;
    setResponseTimeLoading(true);
    setResponseTimeError(null);
    fetch(`/api/new_dashboard/response-time?fromDate=${fromDateKst}&toDate=${toDateKst}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res: ResponseTimeData & { error?: string }) => {
        if (res.error) { setResponseTimeError(res.error); return; }
        setResponseTimeData(res);
      })
      .catch((e) => setResponseTimeError(e instanceof Error ? e.message : "Unknown error"))
      .finally(() => setResponseTimeLoading(false));
  }, [fromDateKst, toDateKst, activeTab, responseTimeData]);

  useEffect(() => {
    if (!fromDateKst || !toDateKst || activeTab !== 5 || repeatData) return;
    setRepeatLoading(true);
    setRepeatError(null);
    fetch(`/api/new_dashboard/repeat-customers?fromDate=${fromDateKst}&toDate=${toDateKst}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res: RepeatData & { error?: string }) => {
        if (res.error) { setRepeatError(res.error); return; }
        setRepeatData(res);
      })
      .catch((e) => setRepeatError(e instanceof Error ? e.message : "Unknown error"))
      .finally(() => setRepeatLoading(false));
  }, [fromDateKst, toDateKst, activeTab, repeatData]);

  useEffect(() => {
    if (!fromDateKst || !toDateKst || activeTab !== 6) return;
    setPromoCapLoading(true);
    setPromoCapError(null);
    const capIso = capActivatedAt ? `${capActivatedAt}:00+09:00` : "";
    const qs = new URLSearchParams({ fromDate: fromDateKst, toDate: toDateKst });
    if (capIso) qs.set("capActivatedAt", capIso);
    fetch(`/api/new_dashboard/promo-cap-impact?${qs.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res: PromoCapData & { error?: string }) => {
        if (res.error) { setPromoCapError(res.error); setPromoCapData(null); return; }
        setPromoCapData(res);
      })
      .catch((err) => setPromoCapError(err instanceof Error ? err.message : String(err)))
      .finally(() => setPromoCapLoading(false));
  }, [fromDateKst, toDateKst, activeTab, capActivatedAt]);

  return (
    <div style={{
      background: "var(--app-card-bg)",
      borderRadius: 12,
      border: "1px solid var(--app-border)",
      overflow: "hidden",
      fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{
        display: "flex",
        overflowX: "auto",
        borderBottom: "1px solid var(--app-border)",
        scrollbarWidth: "none",
      }}>
        {TAB_LABELS.map((label, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActiveTab(i)}
            style={{
              flexShrink: 0,
              padding: "12px 18px",
              fontSize: 13,
              fontFamily: "inherit",
              fontWeight: activeTab === i ? 700 : 500,
              color: activeTab === i ? "var(--app-accent)" : "var(--app-text-secondary)",
              background: activeTab === i ? "var(--app-surface)" : "transparent",
              border: "none",
              borderBottom: activeTab === i ? "2px solid var(--app-accent)" : "2px solid transparent",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.15s",
              letterSpacing: "-0.01em",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: 20 }}>
        {activeTab === 0 || activeTab === 1 ? (
          <>
            {loading && <LoadingState />}
            {error && !loading && <ErrorState msg={error} />}
            {!loading && !error && activeTab === 0 && data && <Tab1ConversionTime data={data} />}
            {!loading && !error && activeTab === 1 && data && <Tab2DayComparison data={data} />}
          </>
        ) : activeTab === 2 ? (
          <>
            {priceTierLoading && <LoadingState />}
            {priceTierError && !priceTierLoading && <ErrorState msg={priceTierError} />}
            {!priceTierLoading && !priceTierError && priceTierData && <Tab3PriceTiers data={priceTierData} />}
          </>
        ) : activeTab === 3 ? (
          <>
            {regionLoading && <LoadingState />}
            {regionError && !regionLoading && <ErrorState msg={regionError} />}
            {!regionLoading && !regionError && regionData && <Tab4RegionConversion data={regionData} />}
          </>
        ) : activeTab === 4 ? (
          <>
            {responseTimeLoading && <LoadingState />}
            {responseTimeError && !responseTimeLoading && <ErrorState msg={responseTimeError} />}
            {!responseTimeLoading && !responseTimeError && responseTimeData && <Tab5ResponseTime data={responseTimeData} />}
          </>
        ) : activeTab === 5 ? (
          <>
            {repeatLoading && <LoadingState />}
            {repeatError && !repeatLoading && <ErrorState msg={repeatError} />}
            {!repeatLoading && !repeatError && repeatData && <Tab6RepeatCustomers data={repeatData} />}
          </>
        ) : activeTab === 6 ? (
          <>
            {promoCapLoading && <LoadingState />}
            {promoCapError && !promoCapLoading && <ErrorState msg={promoCapError} />}
            {!promoCapLoading && !promoCapError && promoCapData && (
              <Tab7PromoCapImpact
                data={promoCapData}
                capActivatedAt={capActivatedAt}
                onCapDateChange={setCapActivatedAt}
              />
            )}
          </>
        ) : activeTab === 7 ? (
          <>
            {phoneConsultLoading && <LoadingState />}
            {phoneConsultError && !phoneConsultLoading && <ErrorState msg={phoneConsultError} />}
            {!phoneConsultLoading && !phoneConsultError && phoneConsultData && (
              <Tab8PhoneConsultations data={phoneConsultData} />
            )}
          </>
        ) : (
          <div style={{ color: "var(--app-text-tertiary)", fontSize: 13, padding: "32px 0", textAlign: "center" }}>
            준비 중
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ color: "var(--app-text-tertiary)", fontSize: 13, padding: "32px 0", textAlign: "center" }}>
      로딩 중...
    </div>
  );
}

function ErrorState({ msg }: { msg: string }) {
  return <div style={{ color: "#ef4444", fontSize: 13, padding: 8 }}>오류: {msg}</div>;
}

function Tab3PriceTiers({ data }: { data: PriceTierData }) {
  const maxQuoteCount = Math.max(...data.tiers.map((t) => t.quoteCount), 1);
  const maxConvRate = Math.max(...data.tiers.map((t) => t.conversionRate), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <SummaryCard label="견적 발송 건수" value={`${data.summary.totalQuotes.toLocaleString()}건`} color="var(--app-accent)" />
        <SummaryCard label="전환 건수" value={`${data.summary.totalConverted.toLocaleString()}건`} color="#22C55E" />
        <SummaryCard label="전체 전환률" value={`${data.summary.overallRate}%`} color="#A855F7" />
        <SummaryCard label="평균 견적가" value={formatKrw(data.summary.avgQuotePrice) + "원"} color="#F59E0B" />
      </div>

      <ChartBlock title="가격 구간별 견적 건수" subtitle="견적 발송 기준">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 160, paddingBottom: 4, borderBottom: "1px solid var(--app-border-light)" }}>
          {data.tiers.map((t) => {
            const heightPct = maxQuoteCount > 0 ? (t.quoteCount / maxQuoteCount) * 100 : 0;
            return (
              <div key={t.tier} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 2 }}>
                {t.quoteCount > 0 && heightPct < 25 && (
                  <span style={{ fontSize: 9, color: "var(--app-text-tertiary)", fontWeight: 700 }}>{t.quoteCount}</span>
                )}
                <div
                  title={`${t.tier} · 견적 ${t.quoteCount}건 · 전환 ${t.convertedCount}건 · 전환률 ${t.conversionRate}%`}
                  style={{
                    width: "100%",
                    height: `${heightPct}%`,
                    minHeight: t.quoteCount > 0 ? 3 : 0,
                    background: "var(--app-accent)",
                    borderRadius: "4px 4px 0 0",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "center",
                    paddingTop: 3,
                  }}
                >
                  {heightPct >= 25 && t.quoteCount > 0 && (
                    <span style={{ fontSize: 10, color: "#fff", fontWeight: 700 }}>{t.quoteCount}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          {data.tiers.map((t) => (
            <div key={t.tier} style={{ flex: 1, textAlign: "center", fontSize: 10, color: "var(--app-text-tertiary)" }}>{t.tier}</div>
          ))}
        </div>
      </ChartBlock>

      <ChartBlock title="가격 구간별 전환률" subtitle="전환률 막대 (%) — 높을수록 해당 구간 전환 잘 됨">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 160, paddingBottom: 4, borderBottom: "1px solid var(--app-border-light)" }}>
          {data.tiers.map((t) => {
            const heightPct = maxConvRate > 0 ? (t.conversionRate / maxConvRate) * 100 : 0;
            return (
              <div key={t.tier} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 2 }}>
                {t.conversionRate > 0 && heightPct < 25 && (
                  <span style={{ fontSize: 9, color: "#22C55E", fontWeight: 700 }}>{t.conversionRate}%</span>
                )}
                <div
                  title={`${t.tier} · 전환률 ${t.conversionRate}% · 평균 매출 ${t.avgRevenue.toLocaleString()}원`}
                  style={{
                    width: "100%",
                    height: `${heightPct}%`,
                    minHeight: t.conversionRate > 0 ? 3 : 0,
                    background: "#22C55E",
                    borderRadius: "4px 4px 0 0",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "center",
                    paddingTop: 3,
                  }}
                >
                  {heightPct >= 25 && t.conversionRate > 0 && (
                    <span style={{ fontSize: 10, color: "#fff", fontWeight: 700 }}>{t.conversionRate}%</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          {data.tiers.map((t) => (
            <div key={t.tier} style={{ flex: 1, textAlign: "center", fontSize: 10, color: "var(--app-text-tertiary)" }}>{t.tier}</div>
          ))}
        </div>
      </ChartBlock>

      <ChartBlock title="구간별 상세">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
          {data.tiers.map((t) => (
            <div key={t.tier} style={{
              background: "var(--app-surface)",
              borderRadius: 10,
              padding: "12px 10px",
              border: "1px solid var(--app-border-light)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--app-accent)" }}>{t.tier}</div>
              <div style={{ fontSize: 10, color: "var(--app-text-tertiary)" }}>견적 <strong style={{ color: "var(--app-text-primary)" }}>{t.quoteCount}건</strong></div>
              <div style={{ fontSize: 10, color: "var(--app-text-tertiary)" }}>전환 <strong style={{ color: "#22C55E" }}>{t.convertedCount}건</strong></div>
              <div style={{ fontSize: 10, color: "var(--app-text-tertiary)" }}>전환률 <strong style={{ color: "#A855F7" }}>{t.conversionRate}%</strong></div>
              <div style={{ fontSize: 10, color: "var(--app-text-tertiary)" }}>평균매출 <strong style={{ color: "#F59E0B" }}>{formatKrw(t.avgRevenue)}원</strong></div>
              <div style={{ fontSize: 10, color: "var(--app-text-tertiary)" }}>취소 <strong style={{ color: "#ef4444" }}>{t.cancelledCount}건</strong></div>
            </div>
          ))}
        </div>
      </ChartBlock>
    </div>
  );
}

type RegionSortKey = "inflow" | "converted" | "conversionRate" | "avgRevenue";

function Tab4RegionConversion({ data }: { data: RegionData }) {
  const [sortKey, setSortKey] = useState<RegionSortKey>("inflow");

  const sorted = [...data.regions].sort((a, b) => {
    if (sortKey === "inflow") return b.inflow - a.inflow;
    if (sortKey === "converted") return b.converted - a.converted;
    if (sortKey === "conversionRate") return b.conversionRate - a.conversionRate;
    return b.avgRevenue - a.avgRevenue;
  });

  const maxInflow = Math.max(...data.regions.map((r) => r.inflow), 1);
  const maxConvRate = Math.max(...data.regions.map((r) => r.conversionRate), 1);
  const maxAvgRevenue = Math.max(...data.regions.map((r) => r.avgRevenue), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <SummaryCard label="인입 TOP 구" value={data.summary.topDistrict} color="var(--app-accent)" />
        <SummaryCard label="전환률 TOP 구" value={data.summary.topConvRateDistrict} color="#22C55E" />
        <SummaryCard label="객단가 TOP 구" value={data.summary.topAvgPriceDistrict} color="#F59E0B" />
        <SummaryCard label="총 지역 수" value={`${data.summary.totalDistricts}개 구`} color="#A855F7" />
      </div>

      <ChartBlock title="지역별 인입 현황" subtitle="전체 구 — 정렬 토글 또는 컬럼 헤더 클릭">
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {(["inflow", "converted", "conversionRate", "avgRevenue"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSortKey(k)}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                fontFamily: "inherit",
                fontWeight: sortKey === k ? 700 : 500,
                color: sortKey === k ? "#fff" : "var(--app-text-secondary)",
                background: sortKey === k ? "var(--app-accent)" : "var(--app-surface)",
                border: "1px solid var(--app-border-light)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              {k === "inflow" ? "인입순" : k === "converted" ? "전환순" : k === "conversionRate" ? "전환률순" : "객단가순"}
            </button>
          ))}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "inherit" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--app-border)" }}>
                <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--app-text-tertiary)", fontWeight: 700, fontSize: 11 }}>구</th>
                <SortHeader label="인입" sortKey="inflow" active={sortKey} onClick={setSortKey} align="right" />
                <SortHeader label="전환" sortKey="converted" active={sortKey} onClick={setSortKey} align="right" />
                <SortHeader label="전환률" sortKey="conversionRate" active={sortKey} onClick={setSortKey} align="right" />
                <SortHeader label="평균매출" sortKey="avgRevenue" active={sortKey} onClick={setSortKey} align="right" />
                <SortHeader label="인입 분포" sortKey="inflow" active={sortKey} onClick={setSortKey} align="left" width={120} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const barW = maxInflow > 0 ? (r.inflow / maxInflow) * 100 : 0;
                return (
                  <tr
                    key={r.district}
                    style={{
                      borderBottom: "1px solid var(--app-border-light)",
                      background: i % 2 === 0 ? "transparent" : "var(--app-surface)",
                    }}
                  >
                    <td style={{ padding: "7px 8px", fontWeight: 700, color: "var(--app-text-primary)" }}>
                      {r.district}
                    </td>
                    <td style={{ textAlign: "right", padding: "7px 8px", fontVariantNumeric: "tabular-nums", color: "var(--app-text-primary)", fontWeight: 600 }}>
                      {r.inflow.toLocaleString()}
                    </td>
                    <td style={{ textAlign: "right", padding: "7px 8px", fontVariantNumeric: "tabular-nums", color: "#22C55E", fontWeight: 600 }}>
                      {r.converted.toLocaleString()}
                    </td>
                    <td style={{ textAlign: "right", padding: "7px 8px", fontVariantNumeric: "tabular-nums", color: "#A855F7", fontWeight: 700 }}>
                      {r.conversionRate}%
                    </td>
                    <td style={{ textAlign: "right", padding: "7px 8px", fontVariantNumeric: "tabular-nums", color: "#F59E0B", fontWeight: 600 }}>
                      {formatKrw(r.avgRevenue)}원
                    </td>
                    <td style={{ padding: "7px 8px" }}>
                      <div style={{ height: 8, borderRadius: 4, background: "var(--app-border-light)", overflow: "hidden" }}>
                        <div style={{ width: `${barW}%`, height: "100%", background: "var(--app-accent)", borderRadius: 4 }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ChartBlock>

      <ChartBlock title="구별 전환률 막대" subtitle="인입 3건 이상인 구만 표시">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 160, paddingBottom: 4, borderBottom: "1px solid var(--app-border-light)" }}>
          {data.regions.filter((r) => r.inflow >= 3).map((r) => {
            const h = maxConvRate > 0 ? (r.conversionRate / maxConvRate) * 100 : 0;
            return (
              <div key={r.district} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 2 }}>
                {r.conversionRate > 0 && h < 25 && (
                  <span style={{ fontSize: 8, color: "#22C55E", fontWeight: 700 }}>{r.conversionRate}%</span>
                )}
                <div
                  title={`${r.district} 전환률 ${r.conversionRate}%`}
                  style={{ width: "100%", height: `${h}%`, minHeight: r.conversionRate > 0 ? 3 : 0, background: "#22C55E", borderRadius: "3px 3px 0 0", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 2 }}
                >
                  {h >= 25 && <span style={{ fontSize: 9, color: "#fff", fontWeight: 700 }}>{r.conversionRate}%</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          {data.regions.filter((r) => r.inflow >= 3).map((r) => (
            <div key={r.district} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "var(--app-text-tertiary)" }}>
              {r.district.replace("구", "")}
            </div>
          ))}
        </div>
      </ChartBlock>

      <ChartBlock title="구별 평균 매출" subtitle="전환 2건 이상인 구만 표시">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 160, paddingBottom: 4, borderBottom: "1px solid var(--app-border-light)" }}>
          {data.regions.filter((r) => r.converted >= 2).map((r) => {
            const h = maxAvgRevenue > 0 ? (r.avgRevenue / maxAvgRevenue) * 100 : 0;
            return (
              <div key={r.district} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 2 }}>
                {r.avgRevenue > 0 && h < 25 && (
                  <span style={{ fontSize: 8, color: "#F59E0B", fontWeight: 700 }}>{formatKrw(r.avgRevenue)}</span>
                )}
                <div
                  title={`${r.district} 평균매출 ${r.avgRevenue.toLocaleString()}원`}
                  style={{ width: "100%", height: `${h}%`, minHeight: r.avgRevenue > 0 ? 3 : 0, background: "#F59E0B", borderRadius: "3px 3px 0 0", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 2 }}
                >
                  {h >= 25 && <span style={{ fontSize: 9, color: "#fff", fontWeight: 700 }}>{formatKrw(r.avgRevenue)}</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          {data.regions.filter((r) => r.converted >= 2).map((r) => (
            <div key={r.district} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "var(--app-text-tertiary)" }}>
              {r.district.replace("구", "")}
            </div>
          ))}
        </div>
      </ChartBlock>
    </div>
  );
}

function Tab5ResponseTime({ data }: { data: ResponseTimeData }) {
  const maxTotal = Math.max(...data.buckets.map((b) => b.totalConvs), 1);
  const maxConvRate = Math.max(...data.buckets.map((b) => b.conversionRate), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <SummaryCard label="총 상담 수" value={`${data.summary.totalConvs.toLocaleString()}건`} color="var(--app-accent)" />
        <SummaryCard label="평균 첫 응답 시간" value={`${data.summary.avgResponseMinutes}분`} color="#22C55E" />
        <SummaryCard label="최고 전환률 구간" value={`${data.summary.fastestRangeRate}%`} color="#A855F7" />
      </div>

      <ChartBlock title="응답 시간 구간별 상담 건수" subtitle="구간별 총 상담 수">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 160, paddingBottom: 4, borderBottom: "1px solid var(--app-border-light)" }}>
          {data.buckets.map((b) => {
            const h = maxTotal > 0 ? (b.totalConvs / maxTotal) * 100 : 0;
            return (
              <div key={b.range} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 2 }}>
                {b.totalConvs > 0 && h < 25 && (
                  <span style={{ fontSize: 9, color: "var(--app-text-tertiary)", fontWeight: 700 }}>{b.totalConvs}</span>
                )}
                <div
                  title={`${b.range} · 총 ${b.totalConvs}건 · 전환 ${b.converted}건 · 전환률 ${b.conversionRate}%`}
                  style={{ width: "100%", height: `${h}%`, minHeight: b.totalConvs > 0 ? 3 : 0, background: "var(--app-accent)", borderRadius: "4px 4px 0 0", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 3 }}
                >
                  {h >= 25 && <span style={{ fontSize: 10, color: "#fff", fontWeight: 700 }}>{b.totalConvs}</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          {data.buckets.map((b) => (
            <div key={b.range} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "var(--app-text-tertiary)" }}>{b.range}</div>
          ))}
        </div>
      </ChartBlock>

      <ChartBlock title="응답 시간 구간별 전환률" subtitle="높을수록 전환 잘 됨">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 160, paddingBottom: 4, borderBottom: "1px solid var(--app-border-light)" }}>
          {data.buckets.map((b) => {
            const h = maxConvRate > 0 ? (b.conversionRate / maxConvRate) * 100 : 0;
            return (
              <div key={b.range} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 2 }}>
                {b.conversionRate > 0 && h < 25 && (
                  <span style={{ fontSize: 9, color: "#22C55E", fontWeight: 700 }}>{b.conversionRate}%</span>
                )}
                <div
                  title={`${b.range} · 전환률 ${b.conversionRate}%`}
                  style={{ width: "100%", height: `${h}%`, minHeight: b.conversionRate > 0 ? 3 : 0, background: "#22C55E", borderRadius: "4px 4px 0 0", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 3 }}
                >
                  {h >= 25 && <span style={{ fontSize: 10, color: "#fff", fontWeight: 700 }}>{b.conversionRate}%</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          {data.buckets.map((b) => (
            <div key={b.range} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "var(--app-text-tertiary)" }}>{b.range}</div>
          ))}
        </div>
      </ChartBlock>

      <ChartBlock title="구간별 AI vs 상담사 응답 비율" subtitle="스택 막대 — AI(파랑) / 사람(주황)">
        <div style={{ display: "flex", gap: 8 }}>
          {data.buckets.map((b) => {
            const total = b.aiCount + b.humanCount;
            const aiPct = total > 0 ? Math.round((b.aiCount / total) * 100) : 0;
            const humanPct = total > 0 ? 100 - aiPct : 0;
            return (
              <div key={b.range} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 9, color: "var(--app-text-tertiary)", textAlign: "center", fontWeight: 700 }}>{b.range}</div>
                <div style={{ height: 80, display: "flex", flexDirection: "column", borderRadius: 4, overflow: "hidden", border: "1px solid var(--app-border-light)" }}>
                  <div
                    title={`AI: ${b.aiCount}건 (${aiPct}%)`}
                    style={{ flex: aiPct, background: "var(--app-accent)", display: "flex", alignItems: "center", justifyContent: "center", minHeight: aiPct > 0 ? 4 : 0 }}
                  >
                    {aiPct >= 20 && <span style={{ fontSize: 9, color: "#fff", fontWeight: 700 }}>{aiPct}%</span>}
                  </div>
                  <div
                    title={`사람: ${b.humanCount}건 (${humanPct}%)`}
                    style={{ flex: humanPct, background: "#F59E0B", display: "flex", alignItems: "center", justifyContent: "center", minHeight: humanPct > 0 ? 4 : 0 }}
                  >
                    {humanPct >= 20 && <span style={{ fontSize: 9, color: "#fff", fontWeight: 700 }}>{humanPct}%</span>}
                  </div>
                </div>
                <div style={{ fontSize: 8, color: "var(--app-text-tertiary)", textAlign: "center" }}>전환률 <strong style={{ color: "#A855F7" }}>{b.conversionRate}%</strong></div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 11, color: "var(--app-text-tertiary)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--app-accent)" }} /> AI 응답
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: "#F59E0B" }} /> 상담사 응답
          </span>
        </div>
      </ChartBlock>
    </div>
  );
}

function Tab6RepeatCustomers({ data }: { data: RepeatData }) {
  const maxCustomerCount = Math.max(...data.distribution.map((d) => d.customerCount), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <SummaryCard label="총 고객 수" value={`${data.summary.totalCustomers.toLocaleString()}명`} color="var(--app-accent)" />
        <SummaryCard label="재예약 고객" value={`${data.summary.repeatCustomers.toLocaleString()}명`} color="#22C55E" />
        <SummaryCard label="재예약률" value={`${data.summary.repeatRate}%`} color="#A855F7" />
        <SummaryCard label="평균 재방문 주기" value={`${data.summary.avgLeadTimeDays}일`} color="#F59E0B" />
        <SummaryCard label="평균 LTV" value={formatKrw(data.summary.avgLtvKrw) + "원"} color="var(--app-accent)" />
      </div>

      <ChartBlock title="주문 횟수 분포" subtitle="1회 / 2회 / 3회+ 고객 수">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 24, height: 160, paddingBottom: 4, borderBottom: "1px solid var(--app-border-light)" }}>
          {data.distribution.map((d) => {
            const h = maxCustomerCount > 0 ? (d.customerCount / maxCustomerCount) * 100 : 0;
            const label = d.orderCount === 3 ? "3회+" : `${d.orderCount}회`;
            const color = d.orderCount === 1 ? "var(--app-accent)" : d.orderCount === 2 ? "#22C55E" : "#A855F7";
            return (
              <div key={d.orderCount} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 4 }}>
                {d.customerCount > 0 && h < 25 && (
                  <span style={{ fontSize: 11, color, fontWeight: 700 }}>{d.customerCount.toLocaleString()}</span>
                )}
                <div
                  title={`${label} 고객: ${d.customerCount.toLocaleString()}명`}
                  style={{ width: "100%", height: `${h}%`, minHeight: d.customerCount > 0 ? 4 : 0, background: color, borderRadius: "6px 6px 0 0", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 6 }}
                >
                  {h >= 25 && <span style={{ fontSize: 14, color: "#fff", fontWeight: 800 }}>{d.customerCount.toLocaleString()}</span>}
                </div>
                <div style={{ fontSize: 13, color, fontWeight: 700 }}>{label}</div>
              </div>
            );
          })}
        </div>
      </ChartBlock>

      {data.topCustomers.length > 0 && (
        <ChartBlock title="Top 10 고객 (매출 기준)" subtitle="period 내 첫 주문이 있는 전체 주문 기준">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--app-border)" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--app-text-tertiary)", fontWeight: 700, fontSize: 11 }}>#</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--app-text-tertiary)", fontWeight: 700, fontSize: 11 }}>전화</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--app-text-tertiary)", fontWeight: 700, fontSize: 11 }}>주문 수</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--app-text-tertiary)", fontWeight: 700, fontSize: 11 }}>누적 매출</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--app-text-tertiary)", fontWeight: 700, fontSize: 11 }}>첫 주문</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--app-text-tertiary)", fontWeight: 700, fontSize: 11 }}>최근 주문</th>
                </tr>
              </thead>
              <tbody>
                {data.topCustomers.map((c, i) => {
                  const firstKst = fmtIsoToKstMd(c.firstOrderAt);
                  const lastKst = fmtIsoToKstMd(c.lastOrderAt);
                  return (
                    <tr key={c.phoneMasked + i} style={{ borderBottom: "1px solid var(--app-border-light)", background: i % 2 === 0 ? "transparent" : "var(--app-surface)" }}>
                      <td style={{ padding: "7px 8px", color: "var(--app-text-tertiary)", fontWeight: 600 }}>{i + 1}</td>
                      <td style={{ padding: "7px 8px", color: "var(--app-text-primary)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{c.phoneMasked}</td>
                      <td style={{ textAlign: "right", padding: "7px 8px", color: c.orderCount >= 3 ? "#A855F7" : "#22C55E", fontWeight: 700 }}>{c.orderCount}회</td>
                      <td style={{ textAlign: "right", padding: "7px 8px", color: "#F59E0B", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{c.totalRevenue.toLocaleString()}원</td>
                      <td style={{ textAlign: "right", padding: "7px 8px", color: "var(--app-text-secondary)", fontSize: 11 }}>{firstKst}</td>
                      <td style={{ textAlign: "right", padding: "7px 8px", color: "var(--app-text-secondary)", fontSize: 11 }}>{lastKst}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ChartBlock>
      )}
    </div>
  );
}

function fmtIsoToKstMd(iso: string): string {
  const utcMs = new Date(iso).getTime();
  const kstMs = utcMs + 9 * 60 * 60 * 1000;
  const d = new Date(kstMs);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function Tab1ConversionTime({ data }: { data: ConversionTimeData }) {
  const maxCount = Math.max(...data.hourly.map((h) => h.count), 1);
  const maxAvgRevenue = Math.max(...data.hourly.map((h) => h.avgRevenue), 1);
  const maxHeatCount = Math.max(...data.weekdayHourly.map((b) => b.count), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <SummaryCard label="총 전환 건수" value={`${data.summary.totalConverted.toLocaleString()}건`} color="var(--app-accent)" />
        <SummaryCard label="가장 많이 들어온 시간" value={`${pad2(data.summary.peakHour)}시`} color="#22C55E" />
        <SummaryCard label="가장 적게 들어온 시간" value={`${pad2(data.summary.lowHour)}시`} color="#F59E0B" />
        <SummaryCard label="평균 매출 최고 시간" value={`${pad2(data.summary.topRevenueHour)}시`} color="#A855F7" />
      </div>

      <ChartBlock title="시간대별 전환 건수" subtitle="created_at 기준 KST">
        <BarChart
          data={data.hourly.map((h) => ({ key: h.hour, value: h.count, label: `${pad2(h.hour)}시 · ${h.count}건` }))}
          max={maxCount}
          height={200}
          color="var(--app-accent)"
          xLabel={(h) => `${h}`}
          showValueOnBar
        />
      </ChartBlock>

      <ChartBlock title="시간대별 평균 매출" subtitle="해당 시간 전환건의 평균 total_price">
        <BarChart
          data={data.hourly.map((h) => ({ key: h.hour, value: h.avgRevenue, label: `${pad2(h.hour)}시 평균 ${h.avgRevenue.toLocaleString()}원` }))}
          max={maxAvgRevenue}
          height={150}
          color="#A855F7"
          xLabel={(h) => `${h}`}
          formatValue={(v) => formatKrw(v)}
          showValueOnBar
        />
        <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap", paddingTop: 6, borderTop: "1px dashed var(--app-border-light)" }}>
          <span style={{ fontSize: 11, color: "var(--app-text-tertiary)", fontWeight: 600 }}>평균 매출 TOP 3:</span>
          {data.hourly.filter((h) => h.avgRevenue > 0).sort((a, b) => b.avgRevenue - a.avgRevenue).slice(0, 3).map((h, i) => (
            <span key={h.hour} style={{ fontSize: 11, color: "var(--app-text-secondary)" }}>
              <span style={{ color: "#A855F7", fontWeight: 700 }}>#{i + 1}</span> {pad2(h.hour)}시 <strong>{formatKrw(h.avgRevenue)}원</strong>
            </span>
          ))}
        </div>
      </ChartBlock>

      <ChartBlock title="요일 × 시간 히트맵" subtitle="진할수록 전환 건수가 많은 셀">
        <Heatmap weekdayHourly={data.weekdayHourly} maxCount={maxHeatCount} />
      </ChartBlock>
    </div>
  );
}

function Tab2DayComparison({ data }: { data: ConversionTimeData }) {
  if (data.daily.length === 0) {
    return <div style={{ color: "var(--app-text-tertiary)", fontSize: 13, padding: 16 }}>데이터 없음</div>;
  }

  const sorted = [...data.daily].sort((a, b) => b.count - a.count);
  const N = Math.min(5, Math.floor(sorted.length / 2));
  const top = N > 0 ? sorted.slice(0, N) : sorted.slice(0, 1);
  const bottom = N > 0 ? sorted.slice(-N).reverse() : [];

  const topAvgCount = avg(top.map((d) => d.count));
  const bottomAvgCount = avg(bottom.map((d) => d.count));
  const topAvgRevenue = avg(top.map((d) => d.avgRevenue));
  const bottomAvgRevenue = avg(bottom.map((d) => d.avgRevenue));
  const topAvgHour = avg(top.map((d) => d.avgHour));
  const bottomAvgHour = avg(bottom.map((d) => d.avgHour));

  const maxDaily = Math.max(...data.daily.map((d) => d.count), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <DiffCard label="평균 전환 건수" topVal={`${topAvgCount.toFixed(1)}건`} bottomVal={`${bottomAvgCount.toFixed(1)}건`} delta={topAvgCount - bottomAvgCount} unit="건" />
        <DiffCard label="평균 객단가" topVal={`${formatKrw(Math.round(topAvgRevenue))}원`} bottomVal={`${formatKrw(Math.round(bottomAvgRevenue))}원`} delta={Math.round(topAvgRevenue - bottomAvgRevenue)} unit="원" formatDelta={formatKrw} />
        <DiffCard label="평균 인입 시각" topVal={fmtAvgHour(topAvgHour)} bottomVal={fmtAvgHour(bottomAvgHour)} delta={topAvgHour - bottomAvgHour} unit="시간" formatDelta={(v) => `${v.toFixed(1)}`} />
      </div>

      <ChartBlock title="일자별 전환 건수" subtitle="기간 전체 — 진한 막대 = 전환 많은 날, 옅은 막대 = 적은 날">
        <DailyBars daily={data.daily} max={maxDaily} top={top} bottom={bottom} />
      </ChartBlock>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <DayList title={`전환 많은 날 TOP ${top.length}`} accent="#22C55E" days={top} max={maxDaily} />
        <DayList title={`전환 적은 날 BOTTOM ${bottom.length}`} accent="#F59E0B" days={bottom} max={maxDaily} />
      </div>
    </div>
  );
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function ChartBlock({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--app-text-primary)" }}>{title}</span>
        {subtitle && <span style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function BarChart({
  data,
  max,
  height,
  color,
  xLabel,
  showValueOnBar,
  formatValue,
}: {
  data: { key: number; value: number; label: string }[];
  max: number;
  height: number;
  color: string;
  xLabel: (key: number) => string;
  showValueOnBar?: boolean;
  formatValue?: (v: number) => string;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height, paddingBottom: 4, borderBottom: "1px solid var(--app-border-light)" }}>
        {data.map((d) => {
          const heightPct = max > 0 ? (d.value / max) * 100 : 0;
          const showLabel = showValueOnBar && d.value > 0 && heightPct >= 25;
          return (
            <div key={d.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              {showValueOnBar && d.value > 0 && heightPct < 25 && (
                <div style={{ fontSize: 9, color: "var(--app-text-tertiary)", fontWeight: 700, marginBottom: 2, lineHeight: 1 }}>
                  {formatValue ? formatValue(d.value) : d.value}
                </div>
              )}
              <div
                title={d.label}
                style={{
                  width: "100%",
                  height: `${heightPct}%`,
                  minHeight: d.value > 0 ? 3 : 0,
                  background: color,
                  borderRadius: "3px 3px 0 0",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "center",
                  paddingTop: 2,
                }}
              >
                {showLabel && (
                  <span style={{ fontSize: 9, color: "#fff", fontWeight: 700, lineHeight: 1 }}>
                    {formatValue ? formatValue(d.value) : d.value}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
        {data.map((d) => (
          <div key={d.key} style={{ flex: 1, textAlign: "center", fontSize: 10, color: "var(--app-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
            {xLabel(d.key)}
          </div>
        ))}
      </div>
    </div>
  );
}

function Heatmap({ weekdayHourly, maxCount }: { weekdayHourly: WeekdayHourlyBucket[]; maxCount: number }) {
  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 2, fontSize: 11, fontFamily: "inherit" }}>
          <thead>
            <tr>
              <th style={{ width: 32, padding: "4px 8px", textAlign: "left", color: "var(--app-text-tertiary)", fontWeight: 600, fontSize: 10 }}></th>
              {Array.from({ length: 24 }, (_, h) => (
                <th key={h} style={{ width: 28, padding: "4px 0", textAlign: "center", color: "var(--app-text-tertiary)", fontWeight: 600, fontSize: 10 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 7 }, (_, w) => (
              <tr key={w}>
                <td style={{ padding: "4px 8px", color: "var(--app-text-secondary)", fontWeight: 700, whiteSpace: "nowrap", fontSize: 12 }}>
                  {WEEKDAY_LABELS[w]}
                </td>
                {Array.from({ length: 24 }, (_, h) => {
                  const bucket = weekdayHourly.find((b) => b.weekday === w && b.hour === h);
                  const count = bucket?.count ?? 0;
                  const intensity = maxCount > 0 ? count / maxCount : 0;
                  const alpha = intensity > 0 ? 0.18 + intensity * 0.82 : 0;
                  return (
                    <td
                      key={h}
                      title={`${WEEKDAY_LABELS[w]} ${pad2(h)}시 · ${count}건`}
                      style={{
                        width: 28,
                        height: 26,
                        background: alpha > 0 ? `rgba(26, 163, 255, ${alpha})` : "var(--app-surface)",
                        borderRadius: 4,
                        textAlign: "center",
                        fontSize: 10,
                        fontWeight: 600,
                        color: intensity > 0.55 ? "#fff" : "var(--app-text-secondary)",
                      }}
                    >
                      {count > 0 ? count : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 11, color: "var(--app-text-tertiary)" }}>
        <span>적음</span>
        {[0.18, 0.35, 0.55, 0.75, 1.0].map((a) => (
          <span key={a} style={{ width: 18, height: 12, borderRadius: 2, background: `rgba(26, 163, 255, ${a})` }} />
        ))}
        <span>많음</span>
      </div>
    </div>
  );
}

function DiffCard({ label, topVal, bottomVal, delta, unit, formatDelta }: { label: string; topVal: string; bottomVal: string; delta: number; unit: string; formatDelta?: (v: number) => string }) {
  const positive = delta > 0;
  const sign = positive ? "+" : delta < 0 ? "−" : "";
  const abs = Math.abs(delta);
  const fmtAbs = formatDelta ? formatDelta(abs) : abs.toLocaleString();
  return (
    <div style={{
      background: "var(--app-surface)",
      borderRadius: 10,
      padding: "12px 14px",
      border: "1px solid var(--app-border-light)",
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}>
      <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", fontWeight: 700 }}>{label}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div>
          <div style={{ fontSize: 9, color: "#22C55E", fontWeight: 700 }}>많은 날</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--app-text-primary)" }}>{topVal}</div>
        </div>
        <div style={{ fontSize: 11, color: positive ? "#22C55E" : delta < 0 ? "#F59E0B" : "var(--app-text-tertiary)", fontWeight: 700, whiteSpace: "nowrap" }}>
          {sign}{fmtAbs}{unit ? ` ${unit}` : ""}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 9, color: "#F59E0B", fontWeight: 700 }}>적은 날</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--app-text-primary)" }}>{bottomVal}</div>
        </div>
      </div>
    </div>
  );
}

function DailyBars({ daily, max, top, bottom }: { daily: DailyBucket[]; max: number; top: DailyBucket[]; bottom: DailyBucket[] }) {
  const topDates = new Set(top.map((d) => d.date));
  const bottomDates = new Set(bottom.map((d) => d.date));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 140, paddingBottom: 4, borderBottom: "1px solid var(--app-border-light)" }}>
        {daily.map((d) => {
          const heightPct = max > 0 ? (d.count / max) * 100 : 0;
          const isTop = topDates.has(d.date);
          const isBottom = bottomDates.has(d.date);
          const color = isTop ? "#22C55E" : isBottom ? "#F59E0B" : "var(--app-border)";
          return (
            <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              <div
                title={`${fmtMd(d.date)} (${WEEKDAY_LABELS[d.weekday]}) · ${d.count}건 · 평균 ${formatKrw(d.avgRevenue)}원 · 평균 인입 ${fmtAvgHour(d.avgHour)}`}
                style={{
                  width: "100%",
                  height: `${heightPct}%`,
                  minHeight: d.count > 0 ? 3 : 0,
                  background: color,
                  borderRadius: "3px 3px 0 0",
                  opacity: isTop || isBottom ? 1 : 0.55,
                }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 2, marginTop: 4 }}>
        {daily.map((d) => (
          <div key={d.date} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "var(--app-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
            {daily.length <= 31 ? fmtMd(d.date).split("/")[1] : ""}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11, color: "var(--app-text-tertiary)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "#22C55E" }} /> TOP
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "#F59E0B" }} /> BOTTOM
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--app-border)" }} /> 그 외
        </span>
      </div>
    </div>
  );
}

function DayList({ title, accent, days, max }: { title: string; accent: string; days: DailyBucket[]; max: number }) {
  return (
    <div style={{
      background: "var(--app-surface)",
      borderRadius: 10,
      padding: 14,
      border: "1px solid var(--app-border-light)",
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: accent, marginBottom: 10 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {days.map((d) => {
          const widthPct = max > 0 ? (d.count / max) * 100 : 0;
          return (
            <div key={d.date} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: "var(--app-text-primary)" }}>
                  {fmtMd(d.date)} <span style={{ color: "var(--app-text-tertiary)", fontWeight: 500 }}>({WEEKDAY_LABELS[d.weekday]})</span>
                </span>
                <span style={{ fontWeight: 800, color: accent }}>{d.count}건</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: "var(--app-border-light)", overflow: "hidden" }}>
                <div style={{ width: `${widthPct}%`, height: "100%", background: accent }} />
              </div>
              <div style={{ display: "flex", gap: 12, fontSize: 10, color: "var(--app-text-tertiary)" }}>
                <span>객단가 <strong style={{ color: "var(--app-text-secondary)" }}>{formatKrw(d.avgRevenue)}원</strong></span>
                <span>평균 인입 <strong style={{ color: "var(--app-text-secondary)" }}>{fmtAvgHour(d.avgHour)}</strong></span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  active,
  onClick,
  align,
  width,
}: {
  label: string;
  sortKey: RegionSortKey;
  active: RegionSortKey;
  onClick: (k: RegionSortKey) => void;
  align: "left" | "right";
  width?: number;
}) {
  const isActive = active === sortKey;
  return (
    <th
      style={{
        textAlign: align,
        padding: "6px 8px",
        color: isActive ? "var(--app-accent)" : "var(--app-text-tertiary)",
        fontWeight: 700,
        fontSize: 11,
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        ...(width ? { width } : {}),
      }}
      onClick={() => onClick(sortKey)}
    >
      {label}
      <span style={{ marginLeft: 4, fontSize: 9, opacity: isActive ? 1 : 0.3 }}>
        {isActive ? "▼" : "▽"}
      </span>
    </th>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: "var(--app-surface)",
      borderRadius: 10,
      padding: "12px 14px",
      border: "1px solid var(--app-border-light)",
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}>
      <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

// ── Tab 7: PROMO 출장비 cap 적용 전후 ───────────
//   가설: price1 ≥ 5만 지역(인천·시흥 등) 출장비가 전환 저해 → 5만 cap 적용 후
//         전환률·매출 회복했을 것. 활성 시점은 datepicker 로 조정.

function Tab7PromoCapImpact({
  data,
  capActivatedAt,
  onCapDateChange,
}: {
  data: PromoCapData;
  capActivatedAt: string;
  onCapDateChange: (v: string) => void;
}) {
  const before = data.before;
  const after = data.after;
  const totalDelta = after.avgConversionRate - before.avgConversionRate;
  const revenueDelta = after.avgRevenue - before.avgRevenue;

  // cap 미적용 일반 지역 평균 (대조군)
  const capDistrictsSet = new Set([
    ...before.regions.filter((r) => r.isCapTarget).map((r) => r.district),
    ...after.regions.filter((r) => r.isCapTarget).map((r) => r.district),
  ]);
  const ctrlBeforeRegions = before.regions.filter((r) => !capDistrictsSet.has(r.district));
  const ctrlAfterRegions = after.regions.filter((r) => !capDistrictsSet.has(r.district));
  const ctrlBeforeInflow = ctrlBeforeRegions.reduce((s, r) => s + r.inflow, 0);
  const ctrlBeforeConverted = ctrlBeforeRegions.reduce((s, r) => s + r.converted, 0);
  const ctrlAfterInflow = ctrlAfterRegions.reduce((s, r) => s + r.inflow, 0);
  const ctrlAfterConverted = ctrlAfterRegions.reduce((s, r) => s + r.converted, 0);
  const ctrlBeforeRate = ctrlBeforeInflow > 0 ? (ctrlBeforeConverted / ctrlBeforeInflow) * 100 : 0;
  const ctrlAfterRate = ctrlAfterInflow > 0 ? (ctrlAfterConverted / ctrlAfterInflow) * 100 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 상단 컨트롤 */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 12px", background: "var(--app-surface-secondary, #f8fafc)",
        borderRadius: 8, gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 12, color: "var(--app-text-secondary)", lineHeight: 1.6 }}>
          가설 — <b>price1 ≥ 5만원</b> 지역(인천 / 시흥 / 안산 등)은 출장비 부담으로 전환이 저조했고,
          5만원 cap 적용 이후 회복했을 것. cap 활성 시각 기준 전후로 분할 비교.
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <span style={{ color: "var(--app-text-tertiary)" }}>cap 활성 시각</span>
          <input
            type="datetime-local"
            value={capActivatedAt}
            onChange={(e) => onCapDateChange(e.target.value)}
            style={{
              padding: "4px 8px", fontSize: 12, border: "1px solid var(--app-border)",
              borderRadius: 6, background: "var(--app-surface)",
            }}
          />
        </label>
      </div>

      {/* 전체 평균 KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        <KpiCard label="cap 전 전환률" value={`${before.avgConversionRate.toFixed(1)}%`} sub={`${before.totalConverted} / ${before.totalInflow} · ${before.durationDays.toFixed(1)}일`} color="#64748b" />
        <KpiCard label="cap 후 전환률" value={`${after.avgConversionRate.toFixed(1)}%`} sub={`${after.totalConverted} / ${after.totalInflow} · ${after.durationDays.toFixed(1)}일`} color={totalDelta >= 0 ? "#10b981" : "#ef4444"} />
        <KpiCard label="cap 전 객단가" value={formatKrw(before.avgRevenue)} sub="원" color="#64748b" />
        <KpiCard label="cap 후 객단가" value={formatKrw(after.avgRevenue)} sub={revenueDelta >= 0 ? `+${formatKrw(Math.abs(revenueDelta))}` : `-${formatKrw(Math.abs(revenueDelta))}`} color={revenueDelta >= 0 ? "#10b981" : "#ef4444"} />
      </div>

      {/* cap 영향권 vs 비영향권 비교 */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
      }}>
        <div style={{ padding: 12, border: "1px solid var(--app-border)", borderRadius: 8, background: "#fff7ed" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#9a3412", marginBottom: 6 }}>
            🎯 cap 영향권 (price1 ≥ 5만)
          </div>
          <div style={{ fontSize: 11, color: "var(--app-text-secondary)" }}>
            전: <b>{capTargetSegmentRate(data, "before")}%</b> / 후: <b>{capTargetSegmentRate(data, "after")}%</b>
            {" · "}변화: <b style={{ color: capTargetSegmentDelta(data) >= 0 ? "#10b981" : "#ef4444" }}>
              {capTargetSegmentDelta(data) >= 0 ? "+" : ""}{capTargetSegmentDelta(data).toFixed(1)}p
            </b>
          </div>
        </div>
        <div style={{ padding: 12, border: "1px solid var(--app-border)", borderRadius: 8, background: "#f0f9ff" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#075985", marginBottom: 6 }}>
            🧊 비영향권 (대조군)
          </div>
          <div style={{ fontSize: 11, color: "var(--app-text-secondary)" }}>
            전: <b>{ctrlBeforeRate.toFixed(1)}%</b> / 후: <b>{ctrlAfterRate.toFixed(1)}%</b>
            {" · "}변화: <b style={{ color: (ctrlAfterRate - ctrlBeforeRate) >= 0 ? "#10b981" : "#ef4444" }}>
              {(ctrlAfterRate - ctrlBeforeRate) >= 0 ? "+" : ""}{(ctrlAfterRate - ctrlBeforeRate).toFixed(1)}p
            </b>
          </div>
        </div>
      </div>

      {/* cap 영향 지역 상세 표 */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--app-text-primary)", marginBottom: 8 }}>
          cap 영향 지역 상세 ({data.capTargetCompare.length}개)
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--app-surface-secondary)" }}>
                <th style={thStyle}>지역</th>
                <th style={thStyle}>1명단가</th>
                <th style={thStyle}>cap 전 인입</th>
                <th style={thStyle}>cap 전 전환률</th>
                <th style={thStyle}>cap 후 인입</th>
                <th style={thStyle}>cap 후 전환률</th>
                <th style={thStyle}>Δ 전환률</th>
                <th style={thStyle}>cap 후 객단가</th>
              </tr>
            </thead>
            <tbody>
              {data.capTargetCompare.map((r) => (
                <tr key={r.district} style={{ borderTop: "1px solid var(--app-border-light)" }}>
                  <td style={tdStyle}><b>{r.district}</b></td>
                  <td style={tdStyle}>{r.rawPrice1.toLocaleString()}</td>
                  <td style={tdStyle}>{r.before.inflow}</td>
                  <td style={tdStyle}>{r.before.conversionRate.toFixed(1)}%</td>
                  <td style={tdStyle}>{r.after.inflow}</td>
                  <td style={tdStyle}>{r.after.conversionRate.toFixed(1)}%</td>
                  <td style={{ ...tdStyle, color: r.conversionRateDelta >= 0 ? "#10b981" : "#ef4444", fontWeight: 700 }}>
                    {r.conversionRateDelta >= 0 ? "+" : ""}{r.conversionRateDelta.toFixed(1)}p
                  </td>
                  <td style={tdStyle}>{r.after.avgRevenue ? `${formatKrw(r.after.avgRevenue)}원` : "—"}</td>
                </tr>
              ))}
              {data.capTargetCompare.length === 0 && (
                <tr><td colSpan={8} style={{ padding: "16px 0", textAlign: "center", color: "var(--app-text-tertiary)" }}>
                  해당 기간에 cap 영향권 인입 데이터 없음
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function capTargetSegmentRate(d: PromoCapData, seg: "before" | "after"): string {
  const regs = d[seg].regions.filter((r) => r.isCapTarget);
  const inflow = regs.reduce((s, r) => s + r.inflow, 0);
  const conv = regs.reduce((s, r) => s + r.converted, 0);
  return inflow > 0 ? ((conv / inflow) * 100).toFixed(1) : "0.0";
}
function capTargetSegmentDelta(d: PromoCapData): number {
  return Number(capTargetSegmentRate(d, "after")) - Number(capTargetSegmentRate(d, "before"));
}

const thStyle: React.CSSProperties = {
  padding: "6px 8px", textAlign: "left", fontWeight: 700,
  color: "var(--app-text-secondary)", fontSize: 11, whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = {
  padding: "6px 8px", color: "var(--app-text-primary)",
  fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
};

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ padding: 12, border: "1px solid var(--app-border)", borderRadius: 8, background: "var(--app-surface)" }}>
      <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--app-text-tertiary)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function Tab8PhoneConsultations({ data }: { data: PhoneConsultData }) {
  const { summary, daily, sessions } = data;
  const maxTotal = Math.max(1, ...daily.map((d) => d.total));

  const orderStatusLabels: Record<string, string> = {
    // 전화상담 탭에선 예약 여부만 중요 — 모든 주문 상태를 '예약완료' 로 통일
    confirmed: "예약완료", payment_requested: "예약완료",
    prepaid: "예약완료", completed: "예약완료", cancelled: "예약완료",
  };

  function fmtTime(iso: string): string {
    const d = new Date(iso);
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    const mm = kst.getUTCMonth() + 1;
    const dd = kst.getUTCDate();
    const hh = String(kst.getUTCHours()).padStart(2, "0");
    const mi = String(kst.getUTCMinutes()).padStart(2, "0");
    return `${mm}/${dd} ${hh}:${mi}`;
  }
  function fmtPhone(raw: string | null): string {
    if (!raw) return "—";
    const d = raw.replace(/\D/g, "");
    if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
    return raw;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 헤더 */}
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--app-text-primary)", marginBottom: 4 }}>
          📞 전화상담 실험 (자동 태그 집계)
        </div>
        <div style={{ fontSize: 12, color: "var(--app-text-tertiary)", lineHeight: 1.5 }}>
          AI 가 전화상담 의사를 감지한 세션에 자동 부여되는 <code>전화요청</code> 태그 기준 ·
          상담완료 시 <code>전화요청완료</code> 로 전환 · 같은 phone/session 의 주문 매칭으로 전환율 산출
        </div>
      </div>

      {/* KPI 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
        <KpiCard
          label="전화요청 총 건수"
          value={summary.total.toLocaleString()}
          sub="기간 내"
          color="var(--app-text-primary)"
        />
        <KpiCard
          label="상담완료"
          value={`${summary.completed}건`}
          sub={`완료율 ${summary.completionRate}%`}
          color="#00695C"
        />
        <KpiCard
          label="진행중"
          value={`${summary.inProgress}건`}
          sub="미완료"
          color="#E65100"
        />
        <KpiCard
          label="예약완료"
          value={`${summary.converted}건`}
          sub={`예약율 ${summary.conversionRate}%`}
          color="#1976D2"
        />
        <KpiCard
          label="평균 객단가"
          value={(() => {
            const orders = sessions.filter((s) => s.isConverted && s.orderTotal);
            if (orders.length === 0) return "—";
            const avg = orders.reduce((sum, s) => sum + (s.orderTotal ?? 0), 0) / orders.length;
            return `${Math.round(avg / 10000).toLocaleString()}만`;
          })()}
          sub="예약완료 건"
          color="#7B1FA2"
        />
      </div>

      {/* 일자별 분포 */}
      {daily.length > 0 && (
        <ChartBlock title="일자별 추이">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {daily.map((d) => (
              <div key={d.date} style={{ display: "grid", gridTemplateColumns: "60px 1fr 200px", alignItems: "center", gap: 12, fontSize: 12 }}>
                <div style={{ color: "var(--app-text-secondary)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtMd(d.date)}</div>
                <div style={{ display: "flex", height: 18, borderRadius: 4, overflow: "hidden", background: "var(--app-surface-secondary)" }}>
                  <div style={{ width: `${(d.converted / maxTotal) * 100}%`, background: "#1976D2" }} title={`예약완료 ${d.converted}`} />
                  <div style={{ width: `${(d.pending / maxTotal) * 100}%`, background: "#FFB74D" }} title={`진행중 ${d.pending}`} />
                </div>
                <div style={{ display: "flex", gap: 10, color: "var(--app-text-tertiary)", fontVariantNumeric: "tabular-nums", fontSize: 11 }}>
                  <span>총 <b style={{ color: "var(--app-text-primary)" }}>{d.total}</b></span>
                  <span style={{ color: "#1976D2" }}>예약완료 {d.converted}</span>
                  <span style={{ color: "#E65100" }}>진행 {d.pending}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 10, fontSize: 11, color: "var(--app-text-tertiary)" }}>
            <LegendDot color="#1976D2" label="예약완료" />
            <LegendDot color="#FFB74D" label="진행중" />
          </div>
        </ChartBlock>
      )}

      {/* 세션 목록 */}
      <ChartBlock title={`세션 상세 (${sessions.length}건)`}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                <th style={thStyle}>인입</th>
                <th style={thStyle}>고객</th>
                <th style={thStyle}>연락처</th>
                <th style={thStyle}>전화상담</th>
                <th style={thStyle}>주문</th>
                <th style={{ ...thStyle, textAlign: "right" }}>금액</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.sessionId} style={{ borderBottom: "1px solid var(--app-border-light)" }}>
                  <td style={tdStyle}>{fmtTime(s.createdAt)}</td>
                  <td style={tdStyle}>
                    <a
                      href={`/conversations?id=${s.sessionId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--app-accent)", textDecoration: "none", fontWeight: 600 }}
                    >
                      {s.name ?? "—"}
                    </a>
                  </td>
                  <td style={tdStyle}>{fmtPhone(s.phone)}</td>
                  <td style={tdStyle}>
                    <span style={{
                      display: "inline-block", padding: "2px 6px", borderRadius: 4,
                      fontSize: 10, fontWeight: 700,
                      backgroundColor: s.isCompleted ? "#E0F2F1" : "#FFF3E0",
                      color: s.isCompleted ? "#00695C" : "#E65100",
                    }}>
                      {s.isCompleted ? "완료" : "요청중"}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {s.hasOrder ? (
                      <span style={{
                        display: "inline-block", padding: "2px 6px", borderRadius: 4,
                        fontSize: 10, fontWeight: 700,
                        backgroundColor: "#E3F2FD",
                        color: "#1565C0",
                      }}>
                        {s.orderStatus ? (orderStatusLabels[s.orderStatus] ?? s.orderStatus) : "—"}
                      </span>
                    ) : (
                      <span style={{ color: "var(--app-text-placeholder)" }}>—</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {s.orderTotal ? `${Math.round(s.orderTotal / 10000).toLocaleString()}만` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sessions.length === 0 && (
          <div style={{ color: "var(--app-text-tertiary)", fontSize: 12, padding: "16px 0", textAlign: "center" }}>
            기간 내 전화요청 세션이 없습니다.
          </div>
        )}
      </ChartBlock>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block" }} />
      <span>{label}</span>
    </div>
  );
}
