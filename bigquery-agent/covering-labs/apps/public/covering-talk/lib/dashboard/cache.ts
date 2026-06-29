// 관리자 대시보드 캐시 — module-level Map + localStorage 동기화 + in-flight dedup.
// 페이지 navigate / 새로고침 / 다른 페이지에서 prefetch — 모두 즉시 표시 가능하게.

import type { JourneyMapData, KrCardData, HealthCardData, TrafficChannel } from "./types";

export interface AnalyticsResponse {
  period: { from: string; to: string; fromDateKst: string; toDateKst: string; label: string; preset: string };
  generatedAt: string;
  krCards: KrCardData[];
  journeyMap: JourneyMapData;
  healthCards: HealthCardData[];
  traffic: TrafficChannel[];
  trafficConverted?: TrafficChannel[];
  _trafficNote?: string;
}

export const ANALYTICS_CACHE_MS = 2 * 60_000;
export const COMPLAINTS_CACHE_MS = 5 * 60_000;
// CS Report 는 서버측에서도 hour-key 단위로 캐시. 클라이언트는 10분 신선도 → 모달 진입 시 거의 항상 캐시 hit.
export const CS_REPORT_CACHE_MS = 10 * 60_000;
// Phase 별 이탈 사유는 LLM 호출이라 무겁다 → 10분 신선도.
export const CHURN_REASONS_CACHE_MS = 10 * 60_000;

type CachedAnalytics = { data: AnalyticsResponse; ts: number };
type CachedComplaints = { post: Record<string, number> | null; pre: Record<string, number> | null; ts: number };

const ANALYTICS_LS_KEY = "cs:dashboard:analytics:v1";
const COMPLAINTS_LS_KEY = "cs:dashboard:complaints:v1";

// module-level Map — SPA navigation 시 보존
export const analyticsCache = new Map<string, CachedAnalytics>();
export const complaintsCache = new Map<string, CachedComplaints>();

// in-flight promise dedup — 같은 key 동시 fetch 방지
const inflightAnalytics = new Map<string, Promise<AnalyticsResponse | null>>();
const inflightComplaints = new Map<string, Promise<{ post: Record<string, number> | null; pre: Record<string, number> | null }>>();

// ─── localStorage 동기화 ───
function loadFromLS<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}
function saveToLS(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota 등 무시 */ }
}

// 첫 로드 시 localStorage → memory cache 복원 (새로고침 후도 즉시 hit)
let _hydrated = false;
function hydrateOnce() {
  if (_hydrated || typeof window === "undefined") return;
  _hydrated = true;
  const a = loadFromLS<Record<string, CachedAnalytics>>(ANALYTICS_LS_KEY) ?? {};
  for (const [k, v] of Object.entries(a)) analyticsCache.set(k, v);
  const c = loadFromLS<Record<string, CachedComplaints>>(COMPLAINTS_LS_KEY) ?? {};
  for (const [k, v] of Object.entries(c)) complaintsCache.set(k, v);
}
hydrateOnce();

function persistAnalytics() {
  if (typeof window === "undefined") return;
  const all: Record<string, CachedAnalytics> = {};
  for (const [k, v] of analyticsCache) all[k] = v;
  saveToLS(ANALYTICS_LS_KEY, all);
}
function persistComplaints() {
  if (typeof window === "undefined") return;
  const all: Record<string, CachedComplaints> = {};
  for (const [k, v] of complaintsCache) all[k] = v;
  saveToLS(COMPLAINTS_LS_KEY, all);
}

// ─── public setters (memory + localStorage 동시 갱신) ───
export function setAnalyticsCache(key: string, value: CachedAnalytics) {
  analyticsCache.set(key, value);
  persistAnalytics();
}
export function setComplaintsCache(key: string, value: CachedComplaints) {
  complaintsCache.set(key, value);
  persistComplaints();
}

// ─── dedup fetch helpers ───
export async function fetchAnalyticsDedup(query: string): Promise<AnalyticsResponse | null> {
  const inflight = inflightAnalytics.get(query);
  if (inflight) return inflight;
  const p = (async () => {
    try {
      const res = await fetch(`/api/new_dashboard/analytics?${query}`, { cache: "no-store" });
      if (!res.ok) return null;
      const json: AnalyticsResponse = await res.json();
      setAnalyticsCache(query, { data: json, ts: Date.now() });
      return json;
    } catch { return null; }
    finally { inflightAnalytics.delete(query); }
  })();
  inflightAnalytics.set(query, p);
  return p;
}

export async function fetchComplaintsDedup(fromIso: string, toIso: string) {
  const periodKey = `${fromIso}|${toIso}`;
  const inflight = inflightComplaints.get(periodKey);
  if (inflight) return inflight;
  const p = (async () => {
    try {
      const fetchOne = (mode: "post" | "pre") =>
        fetch("/api/new_dashboard/complaints", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromIso, toIso, mode }),
        })
          .then((r) => r.json())
          .then((j: { counts?: Record<string, number> }) => j.counts ?? null)
          .catch(() => null);
      const [post, pre] = await Promise.all([fetchOne("post"), fetchOne("pre")]);
      setComplaintsCache(periodKey, { post, pre, ts: Date.now() });
      return { post, pre };
    } finally { inflightComplaints.delete(periodKey); }
  })();
  inflightComplaints.set(periodKey, p);
  return p;
}

// ─── CS Report (상담사 퍼포먼스) prefetch ───────────────────────
// 사용자가 "리포트" 버튼을 누르기 전에 백그라운드에서 모든 상담사 리포트를 미리 만들어둔다.
// 모달은 진입 시 csReportCache 를 먼저 확인하고 hit 면 로딩 없이 즉시 표시.

export interface CsCounselorMetrics {
  total: number | null;
  quoteSent: number | null;
  booked: number | null;
  totalReplies: number;
  aiAsIs: number;
  aiEdited: number;
  aiAsIsRate: number | null;
  repliesPerHour: number | null;
  closuresPerHour: number | null;
  medianResponseTimeMin: number | null;
}

interface CsAssigneeMetrics extends CsCounselorMetrics { name: string }
interface CsAnalyticsResponse { assignees: CsAssigneeMetrics[]; total: number }

interface CsReportConversation {
  sessionId: string;
  customerName: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  messages: Array<{
    role: string;
    content: string;
    sentBy: string | null;
    createdAt: string;
    isEdited: boolean;
  }>;
}

export interface CsReportResponse {
  counselor: string;
  conversations: CsReportConversation[];
  aiReport: { summary: string; strengths: string[]; improvements: string[] } | null;
  cachedAt: string | null;
}

type CachedCsReport = { data: CsReportResponse; ts: number };
type CachedChurnReasons = { counts: Record<string, number> | null; total: number; ts: number };
type CachedCsAnalytics = { data: CsAnalyticsResponse; ts: number };

export const csReportCache = new Map<string, CachedCsReport>();
export const churnReasonsCache = new Map<string, CachedChurnReasons>();
const csAnalyticsCache = new Map<string, CachedCsAnalytics>();

const inflightCsReport = new Map<string, Promise<CsReportResponse | null>>();
const inflightChurn = new Map<string, Promise<CachedChurnReasons | null>>();
const inflightCsAnalytics = new Map<string, Promise<CsAnalyticsResponse | null>>();

export function csReportKey(counselor: string, fromDateKst: string, toDateKst: string): string {
  return `${counselor}|${fromDateKst}|${toDateKst}`;
}
export function churnReasonsKey(phase: string, fromIso: string, toIso: string): string {
  return `${phase}|${fromIso}|${toIso}`;
}

function stripCounselorMetrics(m: CsAssigneeMetrics | CsCounselorMetrics): CsCounselorMetrics {
  return {
    total: m.total, quoteSent: m.quoteSent, booked: m.booked,
    totalReplies: m.totalReplies, aiAsIs: m.aiAsIs, aiEdited: m.aiEdited,
    aiAsIsRate: m.aiAsIsRate, repliesPerHour: m.repliesPerHour,
    closuresPerHour: m.closuresPerHour, medianResponseTimeMin: m.medianResponseTimeMin,
  };
}

async function fetchCsAnalyticsDedup(fromDateKst: string, toDateKst: string): Promise<CsAnalyticsResponse | null> {
  const key = `${fromDateKst}|${toDateKst}`;
  const inflight = inflightCsAnalytics.get(key);
  if (inflight) return inflight;
  const p = (async () => {
    try {
      const res = await fetch(`/api/dashboard/analytics?startDate=${fromDateKst}&endDate=${toDateKst}`, { cache: "no-store" });
      if (!res.ok) return null;
      const json: CsAnalyticsResponse = await res.json();
      csAnalyticsCache.set(key, { data: json, ts: Date.now() });
      return json;
    } catch { return null; }
    finally { inflightCsAnalytics.delete(key); }
  })();
  inflightCsAnalytics.set(key, p);
  return p;
}

export async function fetchCsReportDedup(
  counselor: string,
  metrics: CsAssigneeMetrics | CsCounselorMetrics,
  fromDateKst: string,
  toDateKst: string,
): Promise<CsReportResponse | null> {
  const key = csReportKey(counselor, fromDateKst, toDateKst);
  const inflight = inflightCsReport.get(key);
  if (inflight) return inflight;
  const p = (async () => {
    try {
      const res = await fetch("/api/new_dashboard/cs-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          counselor,
          fromDateKst,
          toDateKst,
          metrics: stripCounselorMetrics(metrics),
        }),
      });
      if (!res.ok) return null;
      const json: CsReportResponse = await res.json();
      csReportCache.set(key, { data: json, ts: Date.now() });
      return json;
    } catch { return null; }
    finally { inflightCsReport.delete(key); }
  })();
  inflightCsReport.set(key, p);
  return p;
}

export async function fetchChurnReasonsDedup(
  phase: string,
  fromIso: string,
  toIso: string,
): Promise<CachedChurnReasons | null> {
  const key = churnReasonsKey(phase, fromIso, toIso);
  const inflight = inflightChurn.get(key);
  if (inflight) return inflight;
  const p = (async () => {
    try {
      const res = await fetch("/api/new_dashboard/churn-reasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase, fromIso, toIso }),
      });
      if (!res.ok) return null;
      const json = await res.json() as { counts: Record<string, number> | null; total?: number };
      const cached: CachedChurnReasons = { counts: json.counts ?? null, total: json.total ?? 0, ts: Date.now() };
      churnReasonsCache.set(key, cached);
      return cached;
    } catch { return null; }
    finally { inflightChurn.delete(key); }
  })();
  inflightChurn.set(key, p);
  return p;
}

async function prefetchCsReports(fromDateKst: string, toDateKst: string): Promise<void> {
  const analytics = await fetchCsAnalyticsDedup(fromDateKst, toDateKst);
  if (!analytics) return;
  // AI / 미배정은 리포트 버튼이 안 뜨므로 prefetch 제외
  const counselors = (analytics.assignees ?? []).filter(
    (a) => a.name !== "AI" && a.name !== "미배정",
  );
  await Promise.all(
    counselors.map((c) => fetchCsReportDedup(c.name, c, fromDateKst, toDateKst).catch(() => null)),
  );
}

async function prefetchChurnReasonsAll(fromIso: string, toIso: string): Promise<void> {
  await Promise.all(
    ["phase_2", "phase_4", "phase_5", "phase_8"].map((p) =>
      fetchChurnReasonsDedup(p, fromIso, toIso).catch(() => null),
    ),
  );
}

/** layout 에서 호출 — 권한자에게 background prefetch */
export async function prefetchDashboardData(): Promise<void> {
  const json = await fetchAnalyticsDedup("");
  if (!json) return;
  await Promise.all([
    fetchComplaintsDedup(json.period.from, json.period.to),
    prefetchCsReports(json.period.fromDateKst, json.period.toDateKst),
    prefetchChurnReasonsAll(json.period.from, json.period.to),
  ]);
}
