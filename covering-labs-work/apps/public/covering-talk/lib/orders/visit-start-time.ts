// 방문 시간대(time_slot) 의 "시작 시각" 을 KST Date 로 환산.
//   §6.1 100% 선결제 자동취소 (방문 시작 시각 - 12h) 기준 계산용.
//   time_slot 표기 케이스가 다양해서 견고하게 파싱.

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

/**
 * time_slot 문자열에서 시작 시각(시·분)을 추출.
 *
 * 핵심: 오전/오후 prefix 가 있으면 항상 적용. "오후 1:00" 같은 케이스에서
 *   24h 형식만 파싱하면 1시(=01:00 KST)로 잘못 해석되어 deadline 이 ~12시간
 *   일찍 계산되는 버그를 방지.
 *
 * 지원 케이스:
 *   "09:00~12:00"          → 9:00
 *   "오전 9시~오후 12시"   → 9:00
 *   "오후 1시"             → 13:00
 *   "오후 1:00~오후 4:00"  → 13:00
 *   "오후 12:00"           → 12:00 (정오)
 *   "오전 12:00"           → 0:00 (자정)
 *   "13:00"                → 13:00
 *   "9~12시"               → 9:00
 *   ""/null                → null
 */
export function parseVisitStartTime(timeSlot: string | null | undefined): { hour: number; min: number } | null {
  if (!timeSlot) return null;
  const first = timeSlot.split(/[~～\-–]/)[0]?.trim();
  if (!first) return null;
  const period = timeSlot.match(/(오전|오후)/)?.[1];

  // HH:MM 또는 "X시 [N분]" 형식 모두 매칭. 시·분 분리.
  // 분 구분자: ":" / "시" 둘 다 허용.
  const m = first.match(/(\d{1,2})\s*(?::|시)\s*(\d{0,2})/);
  if (!m) {
    // "9시" 처럼 분이 아예 없는 케이스
    const onlyHour = first.match(/^(\d{1,2})$/);
    if (!onlyHour) return null;
    let hour = parseInt(onlyHour[1], 10);
    if (hour < 0 || hour > 24) return null;
    if (hour === 24) hour = 0;
    if (period === "오후" && hour < 12) hour += 12;
    if (period === "오전" && hour === 12) hour = 0;
    return { hour, min: 0 };
  }

  let hour = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (hour < 0 || hour > 24 || min < 0 || min >= 60) return null;
  if (hour === 24) hour = 0;
  // 오전/오후 보정 — period 가 명시되어 있으면 항상 적용.
  if (period === "오후" && hour < 12) hour += 12;
  if (period === "오전" && hour === 12) hour = 0;
  return { hour, min };
}

/**
 * 방문 시작 시각의 절대 시각을 Date(UTC)로 반환.
 * date: "2026-05-12" (KST 날짜), time_slot: 다양한 표기.
 * 시작 시각 파싱 실패 시 09:00 KST 기본값 (가장 빠른 케파 시작 시각).
 */
export function getVisitStartUtc(dateYyyyMmDd: string, timeSlot: string | null | undefined): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYyyyMmDd)) return null;
  const parsed = parseVisitStartTime(timeSlot) ?? { hour: 9, min: 0 };
  // KST(UTC+9) 기준 시각 → UTC로 변환: 한국 시각 - 9h = UTC
  // ISO 형식으로 명시적 timezone 표기.
  const iso = `${dateYyyyMmDd}T${pad(parsed.hour)}:${pad(parsed.min)}:00+09:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 방문 시각 - hours 시간 한도 시각(UTC) 계산.
 *   예: hours=12 → 방문 시작 12시간 전.
 */
export function getDeadlineUtc(dateYyyyMmDd: string, timeSlot: string | null | undefined, hoursBefore: number): Date | null {
  const start = getVisitStartUtc(dateYyyyMmDd, timeSlot);
  if (!start) return null;
  return new Date(start.getTime() - hoursBefore * 60 * 60 * 1000);
}
