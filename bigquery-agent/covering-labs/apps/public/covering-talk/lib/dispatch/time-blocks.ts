/**
 * ABC 타임 블록 유틸리티.
 * 기존 orders.time_slot / lunch_orders.pickup_time 문자열을 런타임 파싱해 블록 분류.
 * DB 스키마 변경 없이 집계·UI 에서 공용 사용.
 */

export type TimeBlock = "A" | "B" | "C";

export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface BlockRange {
  startH: number;    // 24h 시작 시각
  endH: number;      // 24h 종료 시각 (exclusive 아님 — B는 13~16시이면 endH=16 포함)
  label: string;     // 한국어 짧은 라벨 "오전 9시~12시"
  slot: string;      // time_slot 정규화 포맷 "오전 9:00~오후 12:00"
}

export const BLOCK_RANGES: Record<TimeBlock, BlockRange> = {
  A: { startH: 9,  endH: 12, label: "오전 9시~12시", slot: "오전 9:00~오후 12:00" },
  B: { startH: 13, endH: 16, label: "오후 1시~4시",  slot: "오후 1:00~오후 4:00"  },
  C: { startH: 17, endH: 20, label: "오후 5시~8시",  slot: "오후 5:00~오후 8:00"  },
};

export const BLOCK_ORDER: TimeBlock[] = ["A", "B", "C"];

/** 시간 문자열 → 24시간 숫자 (0~23.99). 파싱 실패 시 null.
 *  "오전 9:30", "오후 2시", "14:00", "오전 9:00~오후 12:00" 등 지원.
 *  app/dispatch/page.tsx parseTimeTo24 의 공용 버전 (21/야간 제외).
 */
export function parseStartHour(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s || s === "-") return null;
  if (/야간/.test(s)) return null; // 야간은 배차 대상 아님

  // "오전/오후 N시" 또는 "오전/오후 N:MM"
  const korM = s.match(/(오전|오후)\s*(\d{1,2})\s*(?::|시)?\s*(\d{0,2})/);
  if (korM) {
    let h = parseInt(korM[2]);
    const min = parseInt(korM[3] || "0") || 0;
    if (korM[1] === "오후" && h !== 12) h += 12;
    if (korM[1] === "오전" && h === 12) h = 0;
    return h + min / 60;
  }

  // "14:30" 24시간 포맷
  const h24 = s.match(/(\d{1,2}):(\d{2})/);
  if (h24) {
    const h = parseInt(h24[1]);
    const m = parseInt(h24[2]);
    if (h >= 0 && h < 24) return h + m / 60;
  }

  return null;
}

/** 시작 시각 기준으로 소속 블록 결정. 블록 경계 밖이면 null. */
export function hourToBlock(hour: number | null): TimeBlock | null {
  if (hour === null) return null;
  if (hour >= 9 && hour < 13) return "A";   // 9~12
  if (hour >= 13 && hour < 17) return "B";  // 13~16
  if (hour >= 17 && hour <= 20.5) return "C"; // 17~20 (약간 여유)
  return null;
}

/** time_slot 문자열 → 블록. 파싱 실패/블록 밖이면 null. */
export function timeSlotToBlock(timeSlot: string | null | undefined): TimeBlock | null {
  const h = parseStartHour(timeSlot);
  return hourToBlock(h);
}

/** 블록 시작 시각 (9/13/17). */
export function parseBlockStartHour(block: TimeBlock): number {
  return BLOCK_RANGES[block].startH;
}

/** YYYY-MM-DD → 요일 키. KST 타임존 가정 (날짜 문자열이 이미 KST). */
export function getWeekdayKey(date: string): WeekdayKey {
  const d = new Date(`${date}T00:00:00`);
  const idx = d.getDay(); // 0=일 1=월 ... 6=토
  return (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as WeekdayKey[])[idx];
}

/** 케파 설정 JSON 구조 */
export interface ABCCapacitySettings {
  default?: Record<TimeBlock, number>;
  mon?: Record<TimeBlock, number>;
  tue?: Record<TimeBlock, number>;
  wed?: Record<TimeBlock, number>;
  thu?: Record<TimeBlock, number>;
  fri?: Record<TimeBlock, number>;
  sat?: Record<TimeBlock, number>;
  sun?: Record<TimeBlock, number>;
  holidays?: string[];
  /** 날짜별 override (YYYY-MM-DD → 케파). 요일/공휴일보다 우선. */
  dates?: Record<string, Record<TimeBlock, number>>;
  /** 강제 마감 날짜 (YYYY-MM-DD). 케파와 무관하게 예약 불가 처리. 최우선. */
  closedDates?: string[];
}

export const DEFAULT_CAPACITY: Record<TimeBlock, number> = { A: 8, B: 8, C: 8 };
export const WEEKEND_CAPACITY: Record<TimeBlock, number> = { A: 6, B: 6, C: 6 };

/**
 * 날짜별 케파 해결.
 * 우선순위:
 *   1. closedDates 포함 → 0/0/0 (강제 마감)
 *   2. dates[date] 있으면 그것
 *   3. holidays 포함 → sun 규칙
 *   4. 요일별 override 있으면 그것
 *   5. default (기본 8건)
 *   6. 토/일/월은 설정 없어도 6건으로 간주 (요구사항)
 */
export function resolveCapacity(
  settings: ABCCapacitySettings | null,
  date: string
): Record<TimeBlock, number> {
  const s = settings || {};

  // 1. 강제 마감 (최우선)
  if (s.closedDates?.includes(date)) return { A: 0, B: 0, C: 0 };

  // 2. 날짜별 override
  const dateOverride = s.dates?.[date];
  if (dateOverride) return { ...dateOverride };

  let key: WeekdayKey = getWeekdayKey(date);

  if (s.holidays?.includes(date)) {
    key = "sun";
  }

  const override = s[key];
  if (override) return override;

  // 기본값: 토/일/월은 6, 나머지 8 (설정 없을 때)
  if (key === "sat" || key === "sun" || key === "mon") return { ...WEEKEND_CAPACITY };
  return s.default ? { ...s.default } : { ...DEFAULT_CAPACITY };
}

/** 특정 날짜가 강제 마감인지 */
export function isDateClosed(
  settings: ABCCapacitySettings | null,
  date: string
): boolean {
  return !!settings?.closedDates?.includes(date);
}

/** 런치 박스 수 파싱 — "100", "150개", "백개" 등 대응. 실패 시 0. */
export function parseBoxCount(raw: string | null | undefined): number {
  if (!raw) return 0;
  const m = raw.match(/\d+/);
  if (!m) return 0;
  const n = parseInt(m[0], 10);
  return isNaN(n) ? 0 : n;
}
