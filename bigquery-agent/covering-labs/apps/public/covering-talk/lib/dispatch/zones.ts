/**
 * 배차 권역(존) 매핑 유틸리티.
 * 9개 권역 + 기타 = 10개 분류. 주소 문자열 → 존 추출.
 *
 * abc_plan.md Phase B Step 7 의 존 정의와 일관.
 */

export type Zone =
  | "서울-동남" | "서울-동북" | "서울-서남" | "서울-서북"
  | "경기-남" | "경기-북" | "경기-서" | "경기-동"
  | "인천" | "기타";

/**
 * 시계방향 배치로 지리적 인접성을 번호에 반영.
 * 서울 내부 시계방향(서북→동북→동남→서남) 다음 경기 이어지는 고리(동→남→서→북) → 인천 → 기타
 * 인접 권역끼리 번호 차이 작음 (1~3), 대각은 4~5.
 *  1 서울-서북 (종로·마포)  ─┐
 *  2 서울-동북 (강북·노원)   │ 서울 내부
 *  3 서울-동남 (강남·송파)   │
 *  4 서울-서남 (영등포·구로) ─┘
 *  5 경기-동 (하남·이천)    ─┐
 *  6 경기-남 (수원·성남)     │ 서울 바깥 고리
 *  7 경기-서 (부천·안산)     │
 *  8 경기-북 (고양·파주)    ─┘
 *  9 인천
 * 10 기타
 */
export const ZONE_ORDER: Zone[] = [
  "서울-서북", "서울-동북", "서울-동남", "서울-서남",
  "경기-동", "경기-남", "경기-서", "경기-북",
  "인천", "기타",
];

/** 권역 숫자 표기 (1~10). 시계방향 배치로 인접 권역끼리 번호가 가까움. */
export function zoneNumber(z: Zone): number {
  return ZONE_ORDER.indexOf(z) + 1;
}


export const ZONE_COLORS: Record<Zone, { bg: string; softBg: string; text: string; border: string }> = {
  "서울-동남": { bg: "#FEE2E2", softBg: "#FEF2F2", text: "#B91C1C", border: "#FCA5A5" },
  "서울-동북": { bg: "#FED7AA", softBg: "#FFF7ED", text: "#C2410C", border: "#FDBA74" },
  "서울-서남": { bg: "#FEF3C7", softBg: "#FFFBEB", text: "#A16207", border: "#FDE68A" },
  "서울-서북": { bg: "#DBEAFE", softBg: "#EFF6FF", text: "#1D4ED8", border: "#93C5FD" },
  "경기-남":   { bg: "#D1FAE5", softBg: "#ECFDF5", text: "#047857", border: "#6EE7B7" },
  "경기-북":   { bg: "#CCFBF1", softBg: "#F0FDFA", text: "#0F766E", border: "#5EEAD4" },
  "경기-서":   { bg: "#E0E7FF", softBg: "#EEF2FF", text: "#4338CA", border: "#A5B4FC" },
  "경기-동":   { bg: "#EDE9FE", softBg: "#F5F3FF", text: "#6D28D9", border: "#C4B5FD" },
  "인천":      { bg: "#FCE7F3", softBg: "#FDF2F8", text: "#BE185D", border: "#F9A8D4" },
  "기타":      { bg: "#F3F4F6", softBg: "#F9FAFB", text: "#4B5563", border: "#D1D5DB" },
};

// 서울 구 → 존
const SEOUL_ZONE_MAP: Record<string, Zone> = {
  "강남구": "서울-동남", "서초구": "서울-동남", "송파구": "서울-동남", "강동구": "서울-동남",
  "성동구": "서울-동북", "광진구": "서울-동북", "동대문구": "서울-동북", "중랑구": "서울-동북",
  "성북구": "서울-동북", "강북구": "서울-동북", "도봉구": "서울-동북", "노원구": "서울-동북",
  "양천구": "서울-서남", "강서구": "서울-서남", "구로구": "서울-서남", "금천구": "서울-서남",
  "영등포구": "서울-서남", "동작구": "서울-서남", "관악구": "서울-서남",
  "은평구": "서울-서북", "서대문구": "서울-서북", "마포구": "서울-서북",
  "종로구": "서울-서북", "중구": "서울-서북", "용산구": "서울-서북",
};

// 경기 시/군 → 존
const GYEONGGI_ZONE_MAP: Record<string, Zone> = {
  // 남
  "수원시": "경기-남", "용인시": "경기-남", "성남시": "경기-남", "안양시": "경기-남",
  "과천시": "경기-남", "의왕시": "경기-남", "군포시": "경기-남", "안성시": "경기-남",
  "평택시": "경기-남", "오산시": "경기-남", "화성시": "경기-남",
  // 북
  "고양시": "경기-북", "파주시": "경기-북", "김포시": "경기-북", "양주시": "경기-북",
  "동두천시": "경기-북", "연천군": "경기-북", "포천시": "경기-북", "의정부시": "경기-북",
  "남양주시": "경기-북", "구리시": "경기-북", "가평군": "경기-북",
  // 서
  "부천시": "경기-서", "광명시": "경기-서", "시흥시": "경기-서", "안산시": "경기-서",
  // 동
  "하남시": "경기-동", "이천시": "경기-동", "여주시": "경기-동", "양평군": "경기-동",
  // "광주시" 는 경기도 광주시도 있고 서울 인접인데 경기-동 분류 (경기 광주)
  "광주시": "경기-동",
};

// 인천 구/군 → 존 (전부 인천)
const INCHEON_ZONE_MAP: Record<string, Zone> = {
  "중구": "인천", "동구": "인천", "미추홀구": "인천", "연수구": "인천",
  "남동구": "인천", "부평구": "인천", "계양구": "인천", "서구": "인천",
  "강화군": "인천", "옹진군": "인천", "남구": "인천",
};

/** 시군구명 → 존 (서울/경기/인천 중 맞는 것 선택) */
export function districtToZone(district: string | null | undefined, sidoHint?: "서울" | "경기" | "인천"): Zone {
  if (!district) return "기타";
  const d = district.trim();

  // sidoHint 있으면 해당 맵만 조회 (중구/서구/동구/남구 같은 중복 구명 방지)
  if (sidoHint === "서울") return SEOUL_ZONE_MAP[d] || "기타";
  if (sidoHint === "경기") return GYEONGGI_ZONE_MAP[d] || "기타";
  if (sidoHint === "인천") return INCHEON_ZONE_MAP[d] || "기타";

  // hint 없으면 서울 > 경기 > 인천 순서로 탐색
  if (SEOUL_ZONE_MAP[d]) return SEOUL_ZONE_MAP[d];
  if (GYEONGGI_ZONE_MAP[d]) return GYEONGGI_ZONE_MAP[d];
  if (INCHEON_ZONE_MAP[d]) return INCHEON_ZONE_MAP[d];
  return "기타";
}

/**
 * 주소 문자열 → { zone, district } 추출.
 *
 * 전제: 주소는 Kakao 정규화 완료된 포맷이 대부분이라
 * "서울 강남구 ...", "경기 고양시 ...", "인천 부평구 ..." 형태.
 * 예외: 시도 prefix 없는 경우 district-resolver 매핑 활용은 후속.
 */
export function addressToZone(address: string | null | undefined): { zone: Zone; district: string | null } {
  if (!address) return { zone: "기타", district: null };
  const addr = address.trim();

  // 시도 감지
  let sidoHint: "서울" | "경기" | "인천" | undefined;
  if (/^서울/.test(addr)) sidoHint = "서울";
  else if (/^경기/.test(addr)) sidoHint = "경기";
  else if (/^인천/.test(addr)) sidoHint = "인천";

  // 시군구 추출: "구"/"시"/"군"으로 끝나는 첫 토큰
  // 주의: "서울 강남구 ..." / "경기 고양시 덕양구 ..." / "경기 성남시 분당구 ..."
  // 경기도 시+구 케이스는 시를 취함 (성남시, 고양시 등)
  let district: string | null = null;

  if (sidoHint === "서울" || sidoHint === "인천") {
    // "OO구" or "OO군"
    const m = addr.match(/(?:^|\s)([가-힣]{1,4}(?:구|군))(?=\s|$|[,])/);
    if (m) district = m[1];
  } else if (sidoHint === "경기") {
    // "OO시" 우선 (성남시·고양시 등)
    const m = addr.match(/(?:^|\s)([가-힣]{1,5}시)(?=\s|$|[,])/);
    if (m) district = m[1];
    else {
      // 시 없으면 군 (가평군·양평군·연천군)
      const m2 = addr.match(/(?:^|\s)([가-힣]{1,4}군)(?=\s|$|[,])/);
      if (m2) district = m2[1];
    }
  } else {
    // sidoHint 없음 — 아무거나 시/군/구 하나 집기
    const m = addr.match(/(?:^|\s)([가-힣]{1,5}(?:시|군|구))(?=\s|$|[,])/);
    if (m) district = m[1];
  }

  const zone = districtToZone(district, sidoHint);
  return { zone, district };
}
