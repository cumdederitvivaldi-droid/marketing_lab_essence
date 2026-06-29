/** 사용자 메시지에서 예약 희망 날짜/시간 추출 (날짜: YYYY-MM-DD, 시간: HH:MM, 종료시간: HH:MM) */
export function extractBookingDateTime(text: string): { date: string; time: string; timeEnd: string } {
  let date = "";
  let time = "";
  let timeEnd = "";

  // 한글 숫자 → 아라비아 숫자 변환
  const korNumMap: Record<string, number> = {
    "한": 1, "두": 2, "세": 3, "네": 4, "다섯": 5,
    "여섯": 6, "일곱": 7, "여덟": 8, "아홉": 9, "열": 10,
    "열한": 11, "열두": 12,
  };

  const pad = (n: number) => String(n).padStart(2, "0");

  // ── 날짜 파싱 → YYYY-MM-DD ──
  const dateMatchFull = text.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  const dateMatch1 = text.match(/(\d{1,2})월\s*(\d{1,2})\s*일/);
  // 4자리 연도 형식 — 앞뒤 숫자 boundary 필수 (계좌번호 "079846-04-066" 같은 중간 매칭 방지)
  const dateMatch2 = text.match(/(?<!\d)(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?!\d)/);
  // "25.03.17" 같은 2자리 연도 형식
  const dateMatch2digit = text.match(/(?<!\d)(\d{2})[-./](\d{1,2})[-./](\d{1,2})(?!\d)/);
  // "3/18", "03.18" 등 연도 없는 M/D 형식
  const dateMatchShort = text.match(/(?<!\d)(\d{1,2})[/.](\d{1,2})(?!\d)/);
  // "19일" 월 없이 일만 — 현재 월 기준, 지난 날이면 다음 달.
  // `(?!요일|이요|예요)` — "일요일/화요일" 또는 "입니다/이요/예요" 어미 배제, 그 외 한글 조사(에/은/에는/쯤/경) 는 허용.
  const dateMatchDayOnly = text.match(/(?<!\d)(\d{1,2})\s?일(?!요일|이요|예요)/);
  const dateMatchRelative = text.match(/(금주|이번\s*주|담주|차주|다음\s*주)\s*(월|화|수|목|금|토|일)요일?|(?:^|[^가-힣])(내일모레|내일\s*모레|모레|모래|낼|익일|내일|글피|오늘)(?:요|이요|에|입니다|이에요)?(?![가-힣])/);

  if (dateMatchFull) {
    const y = parseInt(dateMatchFull[1]);
    const m = parseInt(dateMatchFull[2]);
    const d = parseInt(dateMatchFull[3]);
    date = `${y}-${pad(m)}-${pad(d)}`;
  } else if (dateMatch1) {
    const now = new Date();
    const month = parseInt(dateMatch1[1]);
    const day = parseInt(dateMatch1[2]);
    const year = now.getFullYear();
    date = `${year}-${pad(month)}-${pad(day)}`;
  } else if (dateMatch2) {
    const y = parseInt(dateMatch2[1]);
    const m = parseInt(dateMatch2[2]);
    const d = parseInt(dateMatch2[3]);
    // 합리 범위 검증 (예: 9846 같은 비현실 연도 거부)
    const nowYear = new Date().getFullYear();
    if (y >= nowYear - 1 && y <= nowYear + 5 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      date = `${y}-${pad(m)}-${pad(d)}`;
    }
  } else if (dateMatch2digit) {
    // "25.03.17" → 2자리 연도를 4자리로 변환 (20xx)
    const y = 2000 + parseInt(dateMatch2digit[1]);
    const m = parseInt(dateMatch2digit[2]);
    const d = parseInt(dateMatch2digit[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      date = `${y}-${pad(m)}-${pad(d)}`;
    }
  } else if (dateMatchShort) {
    // "3/18" → 연도 없는 M/D 형식
    const now = new Date();
    const month = parseInt(dateMatchShort[1]);
    const day = parseInt(dateMatchShort[2]);
    // 월이 1~12, 일이 1~31 범위인지 확인
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const year = now.getFullYear();
      date = `${year}-${pad(month)}-${pad(day)}`;
    }
  } else if (dateMatchDayOnly) {
    // "19일" 월 없이 일만 → 현재 월 기준, 지난 날이면 다음 달
    const now = new Date();
    const day = parseInt(dateMatchDayOnly[1]);
    if (day >= 1 && day <= 31) {
      let m = now.getMonth() + 1;
      let y = now.getFullYear();
      if (day < now.getDate()) { m++; if (m > 12) { m = 1; y++; } }
      date = `${y}-${pad(m)}-${pad(day)}`;
    }
  } else if (dateMatchRelative) {
    // 상대 날짜 → 절대 날짜 변환
    const now = new Date();
    const dayMap: Record<string, number> = { "일": 0, "월": 1, "화": 2, "수": 3, "목": 4, "금": 5, "토": 6 };
    // group 1: 주+요일 (이번주 X요일, 다음주 X요일) / group 2: 주 키워드 요일 / group 3: 단독 키워드
    const weekKey = dateMatchRelative[1]?.replace(/\s/g, "");
    const weekDay = dateMatchRelative[2];
    const singleKey = dateMatchRelative[3];

    if (singleKey) {
      const k = singleKey.replace(/\s/g, "");
      let delta: number | null = null;
      if (k === "오늘") delta = 0;
      else if (k === "내일" || k === "낼" || k === "익일") delta = 1;
      else if (k === "모레" || k === "모래" || k === "내일모레") delta = 2;
      else if (k === "글피") delta = 3;
      if (delta !== null) {
        now.setDate(now.getDate() + delta);
        date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      }
    } else if (weekKey && weekDay) {
      const target = dayMap[weekDay] ?? 0;
      const mondayOffset = (now.getDay() + 6) % 7;
      const mondayDate = new Date(now);
      mondayDate.setDate(now.getDate() - mondayOffset);
      const targetOffset = (target + 6) % 7;
      const extraWeek = (weekKey === "다음주" || weekKey === "차주" || weekKey === "담주") ? 7 : 0;
      mondayDate.setDate(mondayDate.getDate() + targetOffset + extraWeek);
      date = `${mondayDate.getFullYear()}-${pad(mondayDate.getMonth() + 1)}-${pad(mondayDate.getDate())}`;
    }
  }

  // ── 시간 파싱 → HH:MM (24시간) + 범위 지원 ──
  // 범위 매칭을 단일 시간보다 먼저 시도

  // "오후 2시~4시", "오전 10시~오후 1시", "오후 2시 30분~4시 30분"
  const rangeKor = text.match(/(오전|오후)\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?\s*[~\-–]\s*(?:(오전|오후)\s*)?(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
  // "14:00~16:00", "14:00-16:00"
  const rangeColon = text.match(/(\d{1,2}):(\d{2})\s*[~\-–]\s*(\d{1,2}):(\d{2})/);

  if (rangeKor) {
    let startH = parseInt(rangeKor[2]);
    const startM = rangeKor[3] ? parseInt(rangeKor[3]) : 0;
    const startAmPm = rangeKor[1];
    if (startAmPm === "오후" && startH < 12) startH += 12;
    if (startAmPm === "오전" && startH === 12) startH = 0;

    let endH = parseInt(rangeKor[5]);
    const endM = rangeKor[6] ? parseInt(rangeKor[6]) : 0;
    const endAmPm = rangeKor[4] || startAmPm; // 종료 오전/오후 미기재 시 시작과 동일
    if (endAmPm === "오후" && endH < 12) endH += 12;
    // "오전 9시~12시" 패턴의 종료 12시는 정오(12:00) — 자정 변환 안 함.
    // 운영 시간(10~22시) 기준 자정으로 가는 케이스 없음. range 종료가 12면 항상 정오.
    if (endAmPm === "오전" && endH === 12) endH = 12;

    // 유효성 검증: 시 0~23, 분 0~59
    if (startH <= 23 && startM <= 59 && endH <= 23 && endM <= 59) {
      time = `${pad(startH)}:${pad(startM)}`;
      timeEnd = `${pad(endH)}:${pad(endM)}`;
    }
  } else if (rangeColon) {
    const sH = parseInt(rangeColon[1]);
    const sM = parseInt(rangeColon[2]);
    const eH = parseInt(rangeColon[3]);
    const eM = parseInt(rangeColon[4]);
    if (sH <= 23 && sM <= 59 && eH <= 23 && eM <= 59) {
      time = `${pad(sH)}:${pad(sM)}`;
      timeEnd = `${pad(eH)}:${pad(eM)}`;
    }
  } else {
    // 단일 시간 매칭
    const timeMatch1 = text.match(/(오전|오후)\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
    const timeMatchKorNum = text.match(/(오전|오후)\s*(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열한|열두|열)\s*시/);
    const timeMatch2 = text.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
    const timeMatch3 = text.match(/(\d{1,2}):(\d{2})/);

    if (timeMatch1) {
      let hour = parseInt(timeMatch1[2]);
      const min = timeMatch1[3] ? parseInt(timeMatch1[3]) : 0;
      if (timeMatch1[1] === "오후" && hour < 12) hour += 12;
      if (timeMatch1[1] === "오전" && hour === 12) hour = 0;
      time = `${pad(hour)}:${pad(min)}`;
    } else if (timeMatchKorNum) {
      let hour = korNumMap[timeMatchKorNum[2]] ?? 0;
      if (hour > 0) {
        if (timeMatchKorNum[1] === "오후" && hour < 12) hour += 12;
        if (timeMatchKorNum[1] === "오전" && hour === 12) hour = 0;
        time = `${pad(hour)}:00`;
      }
    } else if (timeMatch3) {
      const hour = parseInt(timeMatch3[1]);
      const min = timeMatch3[2];
      time = `${pad(hour)}:${min}`;
    } else if (timeMatch2) {
      let hour = parseInt(timeMatch2[1]);
      if (hour >= 1 && hour <= 23) {
        // 운영시간 10:00~22:00 기준: 오전/오후 명시 없이 1~9시면 오후로 추정
        if (hour >= 1 && hour <= 9) {
          hour += 12;
        }
        const min = timeMatch2[2] ? parseInt(timeMatch2[2]) : 0;
        time = `${pad(hour)}:${pad(min)}`;
      }
    }

    // "오후", "오전"만 있고 구체적 시간이 없는 경우 기본값
    if (!time) {
      if (/오후/.test(text)) {
        time = "14:00"; // 오후 기본 2시
      } else if (/오전/.test(text)) {
        time = "10:00"; // 오전 기본 10시
      }
    }
  }

  return { date, time, timeEnd };
}

/** "09:00" → "오전 9:00" / "13:00" → "오후 1:00" / "12:00" → "오후 12:00" / "00:00" → "오전 12:00" */
function formatTimeKor(time24: string): string {
  if (!time24) return time24;
  const m = time24.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return time24;
  const h = parseInt(m[1], 10);
  const minStr = m[2];
  if (isNaN(h) || h < 0 || h > 23) return time24;

  let period: "오전" | "오후";
  let h12: number;
  if (h === 0) { period = "오전"; h12 = 12; }
  else if (h < 12) { period = "오전"; h12 = h; }
  else if (h === 12) { period = "오후"; h12 = 12; }
  else { period = "오후"; h12 = h - 12; }

  return `${period} ${h12}:${minStr}`;
}

/** "09:00~12:00" → "오전 9:00~오후 12:00" / "16:00" → "오후 4:00" — range 와 단일 둘 다 지원.
 *  이미 한국어("오전"/"오후") 가 포함되어 있으면 그대로 반환 (이중 변환 방지). */
export function formatTimeSlotKor(slot: string): string {
  if (!slot) return slot;
  if (/오전|오후/.test(slot)) return slot;
  const parts = slot.split("~");
  return parts.map((p) => formatTimeKor(p.trim())).join("~");
}
