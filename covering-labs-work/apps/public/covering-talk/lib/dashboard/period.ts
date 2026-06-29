/**
 * 관리자 대시보드 — 기간 필터 타입과 KST 기준 범위 계산
 *
 * 모든 기간은 KST(Asia/Seoul) 자정 기준으로 산출되며,
 * 반환값은 UTC 기반 ISO 문자열 + ms 타임스탬프 양쪽 모두 제공한다.
 */

export type PeriodPreset =
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "lastMonth"
  | "last12Weeks"
  | "custom";

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  thisWeek: "이번 주",
  lastWeek: "지난주",
  thisMonth: "이번 달",
  lastMonth: "지난달",
  last12Weeks: "최근 12주",
  custom: "직접 지정",
};

export interface PeriodRange {
  preset: PeriodPreset;
  fromMs: number;        // UTC ms (포함)
  toMs: number;          // UTC ms (포함, 해당 일자 23:59:59.999)
  fromIso: string;       // ISO 문자열
  toIso: string;
  fromDateKst: string;   // YYYY-MM-DD (KST)
  toDateKst: string;
  label: string;         // "이번 달" / "2026-04-01 ~ 2026-04-23" 등
}

const KST_OFFSET = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC ms → KST 자정 (해당 날짜의 KST 00:00) UTC ms */
function kstStartOfDay(utcMs: number): number {
  const kstShifted = new Date(utcMs + KST_OFFSET);
  kstShifted.setUTCHours(0, 0, 0, 0);
  return kstShifted.getTime() - KST_OFFSET;
}

/** UTC ms → "YYYY-MM-DD" KST */
function toKstDateString(utcMs: number): string {
  return new Date(utcMs + KST_OFFSET).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" KST → UTC ms (해당 일자 KST 00:00) */
function fromKstDateString(dateStr: string): number {
  // dateStr은 KST 자정 기준 → UTC로는 -9h
  return new Date(`${dateStr}T00:00:00+09:00`).getTime();
}

/** KST 기준 "이번 주 월요일" UTC ms 반환 */
function kstStartOfWeek(utcMs: number): number {
  const kst = new Date(utcMs + KST_OFFSET);
  const dow = kst.getUTCDay(); // 0=일, 1=월
  const diffToMon = (dow + 6) % 7; // 월요일 시작
  const monKstMs = kst.getTime() - diffToMon * DAY_MS;
  const monStart = new Date(monKstMs);
  monStart.setUTCHours(0, 0, 0, 0);
  return monStart.getTime() - KST_OFFSET;
}

/** KST 기준 "이번 달 1일" UTC ms 반환 */
function kstStartOfMonth(utcMs: number): number {
  const kst = new Date(utcMs + KST_OFFSET);
  const monthStart = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1));
  return monthStart.getTime() - KST_OFFSET;
}

function buildRange(preset: PeriodPreset, fromMs: number, toMs: number, customLabel?: string): PeriodRange {
  const fromDateKst = toKstDateString(fromMs);
  const toDateKst = toKstDateString(toMs);
  const label =
    preset === "custom"
      ? customLabel ?? `${fromDateKst} ~ ${toDateKst}`
      : PERIOD_PRESET_LABELS[preset];
  return {
    preset,
    fromMs,
    toMs,
    fromIso: new Date(fromMs).toISOString(),
    toIso: new Date(toMs).toISOString(),
    fromDateKst,
    toDateKst,
    label,
  };
}

/** 프리셋·커스텀 날짜로 PeriodRange 산출 */
export function resolvePeriod(
  preset: PeriodPreset,
  custom?: { from?: string; to?: string },
  nowMs: number = Date.now(),
): PeriodRange {
  const todayStart = kstStartOfDay(nowMs);
  const todayEnd = todayStart + DAY_MS - 1;

  switch (preset) {
    case "thisWeek": {
      const start = kstStartOfWeek(nowMs);
      return buildRange("thisWeek", start, todayEnd);
    }
    case "lastWeek": {
      const thisWeekStart = kstStartOfWeek(nowMs);
      const lastWeekStart = thisWeekStart - 7 * DAY_MS;
      const lastWeekEnd = thisWeekStart - 1;
      return buildRange("lastWeek", lastWeekStart, lastWeekEnd);
    }
    case "thisMonth": {
      const start = kstStartOfMonth(nowMs);
      return buildRange("thisMonth", start, todayEnd);
    }
    case "lastMonth": {
      const thisMonthStart = kstStartOfMonth(nowMs);
      const lastMonthEnd = thisMonthStart - 1;
      const lastMonthStart = kstStartOfMonth(lastMonthEnd);
      return buildRange("lastMonth", lastMonthStart, lastMonthEnd);
    }
    case "last12Weeks": {
      const start = kstStartOfWeek(nowMs) - 11 * 7 * DAY_MS;
      return buildRange("last12Weeks", start, todayEnd);
    }
    case "custom": {
      const from = custom?.from ? fromKstDateString(custom.from) : todayStart;
      const toBase = custom?.to ? fromKstDateString(custom.to) : todayStart;
      const to = toBase + DAY_MS - 1;
      return buildRange("custom", from, to);
    }
  }
}

/** URL 쿼리 → PeriodRange */
export function periodFromSearchParams(params: URLSearchParams, nowMs: number = Date.now()): PeriodRange {
  const presetRaw = params.get("preset");
  const validPresets: PeriodPreset[] = ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last12Weeks", "custom"];
  const preset: PeriodPreset = (validPresets.includes(presetRaw as PeriodPreset) ? presetRaw : "thisMonth") as PeriodPreset;
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;
  return resolvePeriod(preset, { from, to }, nowMs);
}

/** PeriodRange → URL 쿼리 객체 */
export function periodToSearchParams(range: PeriodRange): Record<string, string> {
  const out: Record<string, string> = { preset: range.preset };
  if (range.preset === "custom") {
    out.from = range.fromDateKst;
    out.to = range.toDateKst;
  }
  return out;
}

/**
 * 비교 기간 자동 산출 — 현재 range 직전 같은 길이.
 * 예: thisMonth (4-1 ~ 4-28) → 직전 28일 (3-4 ~ 3-31)
 * 단, lastWeek/lastMonth 같이 "이미 과거" 인 preset 은 그 직전 같은 단위 (lastWeek → 그 전 주, lastMonth → 그 전 달).
 */
export function inferComparePeriod(range: PeriodRange): PeriodRange {
  switch (range.preset) {
    case "thisWeek": {
      const lastWeekStart = range.fromMs - 7 * DAY_MS;
      const lastWeekEnd = range.fromMs - 1;
      return buildRange("custom", lastWeekStart, lastWeekEnd, `${toKstDateString(lastWeekStart)} ~ ${toKstDateString(lastWeekEnd)} (직전 주)`);
    }
    case "lastWeek": {
      const prevStart = range.fromMs - 7 * DAY_MS;
      const prevEnd = range.fromMs - 1;
      return buildRange("custom", prevStart, prevEnd, `${toKstDateString(prevStart)} ~ ${toKstDateString(prevEnd)} (그 전 주)`);
    }
    case "thisMonth": {
      const thisMonthStart = kstStartOfMonth(range.fromMs);
      const lastMonthEnd = thisMonthStart - 1;
      const lastMonthStart = kstStartOfMonth(lastMonthEnd);
      return buildRange("custom", lastMonthStart, lastMonthEnd, `${toKstDateString(lastMonthStart)} ~ ${toKstDateString(lastMonthEnd)} (지난달)`);
    }
    case "lastMonth": {
      const prevMonthEnd = range.fromMs - 1;
      const prevMonthStart = kstStartOfMonth(prevMonthEnd);
      return buildRange("custom", prevMonthStart, prevMonthEnd, `${toKstDateString(prevMonthStart)} ~ ${toKstDateString(prevMonthEnd)} (그 전 달)`);
    }
    case "last12Weeks":
    case "custom":
    default: {
      // 직전 같은 길이
      const lengthMs = range.toMs - range.fromMs + 1;
      const compareEnd = range.fromMs - 1;
      const compareStart = compareEnd - lengthMs + 1;
      return buildRange("custom", compareStart, compareEnd, `${toKstDateString(compareStart)} ~ ${toKstDateString(compareEnd)} (직전 동일 기간)`);
    }
  }
}
