/**
 * Kakao Local API 클라이언트
 * 주소 검색 API: https://dapi.kakao.com/v2/local/search/address.json
 *
 * 원시 주소 문자열("서울시 송파구 잠실동 212-49번지 1층")을
 * 정규 포맷(도로명 주소 + 지번 + 우편번호 + 상세)으로 변환.
 *
 * 환경변수: KAKAO_REST_API_KEY
 */

const API_BASE = "https://dapi.kakao.com/v2/local/search/address.json";

export interface NormalizedAddress {
  /** 표시용 한 줄 주소 (도로명 우선, 없으면 지번) */
  fullAddress: string;
  /** 도로명 주소 "서울 강남구 테헤란로 123" */
  roadAddress: string;
  /** 지번 주소 "서울 강남구 역삼동 123-45" */
  jibunAddress: string;
  /** 우편번호 (도로명 기준) */
  postalCode: string;
  /** 시도 "서울" */
  sido: string;
  /** 시군구 "강남구" */
  sigungu: string;
  /** 동·읍·면 "역삼동" */
  bname: string;
  /** 건물명 "테헤란빌딩" */
  buildingName: string;
  /** 원문에서 정규 주소 뒤에 남은 상세 (층/호/동호수 등) */
  detail: string;
  /** 위경도 */
  lat: number;
  lng: number;
}

function getApiKey(): string {
  const key = process.env.KAKAO_REST_API_KEY?.trim();
  if (!key) throw new Error("KAKAO_REST_API_KEY 환경변수 미설정");
  return key;
}

/**
 * Kakao가 반환한 정규 주소의 마지막 번지를 원문에서 찾아
 * 그 뒤의 모든 텍스트를 detail로 추출.
 * → 토큰 기반이 아니라 문자 기반이라 "A동 101호", "본교무실 앞",
 *   "지하1층 입구" 등 모든 상세주소 형태 보존.
 *
 * buildingName 인자: fullAddress에 이미 "(buildingName)"이 붙으므로
 *   detail에서 동일 패턴을 제거해 중복 방지 (재정규화 시 무한 증식 차단).
 */
export function extractDetailAfterAddress(
  rawText: string,
  normalizedAddressName: string,
  buildingName?: string
): string {
  if (!rawText || !normalizedAddressName) return "";
  const raw = rawText.replace(/\s+/g, " ").trim();

  // 정규 주소의 마지막 번지 (예: "123", "123-45")
  const lastNumMatch = normalizedAddressName.match(/(\d+(?:-\d+)?)\s*$/);
  if (!lastNumMatch) return "";
  const lastNum = lastNumMatch[1];

  // 원문에서 해당 숫자 찾기 — 단어 경계 기반 (뒤에 숫자/하이픈 X).
  // 예: jibun 마지막 "2" 가 raw "120" 의 중간 "2" 로 오탐되던 버그 방지.
  const escaped = lastNum.replace(/[-]/g, "\\-");
  const boundaryRe = new RegExp(`${escaped}(?![\\d\\-])`, "g");
  let idx = -1;
  let m: RegExpExecArray | null;
  while ((m = boundaryRe.exec(raw)) !== null) idx = m.index;
  if (idx === -1) return "";

  let after = raw.slice(idx + lastNum.length);
  // 앞쪽 "번지", "번", 콤마, 공백 제거
  after = after.replace(/^(?:번지|번)?\s*,?\s*/, "").trim();

  // buildingName이 파라괄호 형태 `(…)` 로 detail 안에 포함되어 있으면 모두 제거.
  // fullAddress = `${road.address_name} (${buildingName})` 이라 중복 누적 위험 차단.
  if (buildingName) {
    const bnEsc = buildingName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parenRe = new RegExp(`\\(\\s*${bnEsc}\\s*\\)`, "g");
    after = after.replace(parenRe, "");
    after = after.replace(/\s+/g, " ").replace(/^[\s,]+/, "").trim();
  }

  return after;
}

/**
 * Kakao 매칭 실패 시 fallback용: 명확한 detail 토큰(숫자+동/호/층)만 분리.
 * "A동 101호 본교무실 앞" 같은 자유 서술은 main에 남겨두고 Kakao 재시도.
 */
export function splitAddressDetail(raw: string): { main: string; detail: string } {
  const text = (raw || "").replace(/\s+/g, " ").trim();
  if (!text) return { main: "", detail: "" };

  const normalized = text.replace(/(번길|로|길)(\d)/g, "$1 $2");
  const tokens = normalized.split(/[\s,]+/).filter(Boolean);

  const isDetailToken = (t: string): boolean => {
    if (/^(?:지하\s*)?\d+(?:-\d+)?\s*(?:동|호|층|호실|실)$/.test(t)) return true;
    if (/^(?:지하|옥상|B\d+|지층)$/.test(t)) return true;
    return false;
  };

  let startDetail = tokens.length;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (isDetailToken(tokens[i])) startDetail = i;
    else break;
  }
  return { main: tokens.slice(0, startDetail).join(" "), detail: tokens.slice(startDetail).join(" ") };
}

/**
 * 원시 주소 문자열을 Kakao Local API로 정규화.
 * 매칭 실패 시 null 반환.
 */
type KakaoDoc = {
  address_name: string;
  address_type: string;
  address: { address_name: string; region_1depth_name: string; region_2depth_name: string; region_3depth_name: string } | null;
  road_address: { address_name: string; building_name: string; region_1depth_name: string; region_2depth_name: string; region_3depth_name: string; zone_no: string } | null;
  x: string;
  y: string;
};

async function queryKakao(query: string): Promise<KakaoDoc | null> {
  const url = `${API_BASE}?query=${encodeURIComponent(query)}&size=1`;
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${getApiKey()}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Kakao Local API ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { documents: KakaoDoc[]; meta: { total_count: number } };
  return data.documents?.[0] || null;
}

export async function normalizeAddress(rawText: string): Promise<NormalizedAddress | null> {
  const cleaned = (rawText || "").trim();
  if (!cleaned) return null;
  if (cleaned.length < 4) return null;

  // 1차: 원문 그대로 쿼리 (Kakao가 tolerance 있어서 detail 포함해도 매칭 가능)
  let doc = await queryKakao(cleaned);

  // 2차 fallback: 괄호 `(...)` 안의 건물명/별칭 제거 후 재쿼리
  // 예: "경기 성남시 분당구 미금로 23 (무지개마을) 109-1404" → "경기 성남시 분당구 미금로 23 109-1404"
  if (!doc) {
    const noParens = cleaned.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
    if (noParens && noParens !== cleaned) {
      doc = await queryKakao(noParens);
    }
  }

  // 3차 fallback: 명확한 detail 토큰(N동/N호/N층) 분리 후 메인만 재쿼리
  if (!doc) {
    const { main } = splitAddressDetail(cleaned);
    if (main && main !== cleaned) {
      doc = await queryKakao(main);
    }
  }

  // 4차 fallback: 괄호 제거 + detail 분리 결합
  if (!doc) {
    const noParens = cleaned.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
    const { main } = splitAddressDetail(noParens);
    if (main && main !== noParens && main !== cleaned) {
      doc = await queryKakao(main);
    }
  }

  if (!doc) return null;

  const road = doc.road_address;
  const jibun = doc.address;

  const primary = road?.address_name || jibun?.address_name || doc.address_name;
  const sido = road?.region_1depth_name || jibun?.region_1depth_name || "";
  const sigungu = road?.region_2depth_name || jibun?.region_2depth_name || "";
  const bname = road?.region_3depth_name || jibun?.region_3depth_name || "";

  const buildingName = road?.building_name || "";

  // detail 추출: Kakao 지번 또는 도로명의 마지막 번지를 원문에서 찾아 그 뒤 전체
  const jibunName = jibun?.address_name || "";
  const roadName = road?.address_name || "";
  // 지번 우선 (원문이 대개 지번 표기), 실패 시 도로명 시도
  let detail = extractDetailAfterAddress(cleaned, jibunName, buildingName);
  if (!detail) detail = extractDetailAfterAddress(cleaned, roadName, buildingName);
  const displayAddress = buildingName && road
    ? `${road.address_name} (${buildingName})`
    : primary;

  return {
    fullAddress: displayAddress,
    roadAddress: road?.address_name || "",
    jibunAddress: jibun?.address_name || "",
    postalCode: road?.zone_no || "",
    sido,
    sigungu,
    bname,
    buildingName,
    detail,
    lat: parseFloat(doc.y),
    lng: parseFloat(doc.x),
  };
}
