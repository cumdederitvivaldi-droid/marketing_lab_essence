/**
 * 품목 키워드 정규화 모듈
 *
 * AI가 추출한 "raw" 품목명을 DB keyword로 변환하는 코드 기반 매핑.
 * 기존 AI 프롬프트(400줄+)의 규칙을 코드로 이관하여
 * 프롬프트 토큰을 절감하고 매핑 정확도를 보장한다.
 */

// ─── 타입 ───
export interface RawItem {
  raw: string;
  quantity: number;
}

export interface NormalizedItem {
  keyword: string;
  quantity: number;
}

// ─── 1. 동의어 (부분 문자열 치환) ───
const SYNONYMS: [RegExp, string][] = [
  [/장농/g, "장롱"],
  [/쇼파/g, "소파"],
  [/메트리스/g, "매트리스"],
  [/매트레스/g, "매트리스"],
  [/메트레스/g, "매트리스"],
  [/체이블/g, "테이블"],    // 오타: 체이블 → 테이블
  [/테이불/g, "테이블"],    // 오타: 테이불 → 테이블
  [/전자렌지/g, "전자레인지"],  // 오타: 전자렌지 → 전자레인지 (렌지대 등은 변환 안 함)
  [/조그만/g, "소형"],
  [/조그마한/g, "소형"],
  [/조그맣/g, "소형"],
  [/작은/g, "소형"],
  [/미니/g, "소형"],
  [/큰/g, "대형"],
];

// ─── 2. 정확 키워드 치환 (exact match, 공백 제거 후 비교) ───
const KEYWORD_ALIASES: Record<string, string> = {
  "옷장": "장롱",
  "티비장": "거실장",
  "TV장": "거실장",
  "tv장": "거실장",
  "티비다이": "거실장",
  "TV다이": "거실장",
  "티비받침대": "거실장",
  "TV받침대": "거실장",
  "세탁기": "세탁기 일반",
  "통돌이세탁기": "세탁기 일반",
  "일반세탁기": "세탁기 일반",
  "드럼세탁기": "세탁기 트럼",
  "벽걸이에어컨": "에어컨 벽걸이",
  "스탠드에어컨": "에어컨 스탠드",
  "스텐드에어컨": "에어컨 스탠드",
  "컴퓨터의자": "컴퓨터 의자",
  "PC의자": "컴퓨터 의자",
  "사무용의자": "사무용 의자",
  "사무의자": "사무용 의자",
  "오피스의자": "사무용 의자",
  "게이밍의자": "게이밍 의자",
  "게임의자": "게이밍 의자",
  "중역의자": "중역 의자",
  "안마의자": "안마의자",
  "마사지의자": "안마의자",
  "입식책상": "입식 책상",
  "좌식책상": "좌식 책상",
  "좌탁": "좌식 책상",
  "컴퓨터책상": "컴퓨터책상",
  "PC책상": "컴퓨터책상",
  "스탠딩책상": "스탠딩책상",
  "전동책상": "스탠딩책상",
  "모션데스크": "스탠딩책상",
  "런닝머신": "런닝머신",
  "러닝머신": "런닝머신",
  "책장": "2m이하 책장",
  "리프트업테이블": "사이드 테이블",
  "스툴": "소파 스툴",
  "스톨": "소파 스툴",
  "1인용스툴": "소파 스툴",
  "1인용스톨": "소파 스툴",
  "소파스툴": "소파 스툴",
  "소파스톨": "소파 스툴",
};

// ─── 3. 아이/아기/유아 접두어 매핑 ───
const CHILD_PREFIX = /^(아이|아기|애기|애들|아동)/;
const CHILD_MAPPINGS: Record<string, string> = {
  "책상": "학생 책상",
  "장롱": "주니어 장롱",
  "장농": "주니어 장롱",
  "옷장": "주니어 장롱",
  "서랍장": "3단이하 서랍장",
  "소파": "1인용 소파",
};
// 침대는 별도 처리 (유아/아기/아이에 따라 다름)
const CHILD_BED_MAPPINGS: Record<string, string> = {
  "유아": "유아침대",
  "아기": "아기침대",
  "애기": "아기침대",
  "영아": "아기침대",
  "아이": "싱글 침대",
  "애들": "싱글 침대",
  "아동": "싱글 침대",
};

// ─── 4. 장롱 자/쪽 단위 파서 ───
function parseJangrongUnit(raw: string): NormalizedItem | null {
  // "장롱", "장농", "옷장", "시스템장" 포함 + 숫자+자/쪽 (+ "짜리" 접미사 허용)
  const normalized = raw.replace(/장농/g, "장롱").replace(/옷장/g, "장롱").replace(/시스템장/g, "장롱");
  const match = normalized.match(/장롱\s*(\d+)\s*[자쪽](?:짜리)?|(\d+)\s*[자쪽](?:짜리)?\s*장롱/);
  if (!match) return null;

  const totalJa = parseInt(match[1] || match[2], 10);

  if (totalJa === 4) {
    return { keyword: "장롱 4자", quantity: 1 };
  }
  // 3자 단위로 나누기
  if (totalJa % 3 === 0) {
    return { keyword: "장롱 3자", quantity: totalJa / 3 };
  }
  // 4자 단위 체크 (8자 = 4자 x 2 등)
  if (totalJa % 4 === 0) {
    return { keyword: "장롱 4자", quantity: totalJa / 4 };
  }
  // 혼합 (예: 7자 = 3자 + 4자)
  const count3 = Math.floor(totalJa / 3);
  return { keyword: "장롱 3자", quantity: count3 || 1 };
}

// ─── 5. 침대 프레임/매트리스/세트 파서 ───
// ⚠️ 긴 패턴 먼저! "싱글"이 "슈퍼싱글"보다 앞이면 잘못 매칭됨
const BED_SIZES: Record<string, string> = {
  "슈퍼싱글": "슈퍼싱글",
  "수퍼싱글": "슈퍼싱글",
  "SS": "슈퍼싱글",
  "싱글": "싱글",
  "더블": "퀸",
  "퀸": "퀸",
  "킹": "킹",
};

function parseBedItem(raw: string): NormalizedItem | null {
  const noSpace = raw.replace(/\s/g, "");

  // 범퍼침대
  if (/범퍼침대/.test(noSpace)) return { keyword: "범퍼침대", quantity: 1 };

  // 유아/아기/아이 침대
  for (const [prefix, keyword] of Object.entries(CHILD_BED_MAPPINGS)) {
    if (noSpace.startsWith(prefix) && noSpace.includes("침대")) {
      return { keyword, quantity: 1 };
    }
  }

  // 매트리스받침/깔판/침대받침 → 프레임
  if (/매트리스받침|매트리스\s*받침|깔판|침대깔판|침대\s*받침/.test(raw)) {
    for (const [sizeKey, sizeVal] of Object.entries(BED_SIZES)) {
      if (raw.includes(sizeKey)) {
        const prefix = sizeVal === "슈퍼싱글" ? "슈퍼싱글" : sizeVal;
        return { keyword: `${prefix}침대프레임`, quantity: 1 };
      }
    }
    return { keyword: "매트리스받침", quantity: 1 };
  }

  // 침대 + 매트리스제외/프레임만 → 프레임 확정
  if (/매트리스\s*제외|매트리스\s*뺀|매트리스\s*빼고|프레임\s*만|프레임\s*전용/.test(raw)) {
    for (const [sizeKey, sizeVal] of Object.entries(BED_SIZES)) {
      if (raw.includes(sizeKey)) {
        const prefix = sizeVal === "슈퍼싱글" ? "슈퍼싱글" : sizeVal;
        return { keyword: `${prefix}침대프레임`, quantity: 1 };
      }
    }
    return { keyword: "프레임만", quantity: 1 };
  }

  // 토퍼 (침대/매트리스가 아님!)
  if (/토퍼/.test(noSpace)) {
    for (const [sizeKey, sizeVal] of Object.entries(BED_SIZES)) {
      if (noSpace.includes(sizeKey)) {
        const mapped = sizeVal === "슈퍼싱글" ? "수퍼싱글" : sizeVal;
        return { keyword: `토퍼 ${mapped}`, quantity: 1 };
      }
    }
    return { keyword: "토퍼 싱글", quantity: 1 };
  }

  // 침대 + 매트리스 조합: "세트/SET" 명시 없으면 매트리스 단독
  // "슈퍼싱글 침대 매트리스" → 매트리스 수퍼싱글 (침대는 수식어)
  // "퀸침대 매트리스 세트" → 침대 퀸 SET (세트 명시)
  if (/매트리스|메트리스/.test(noSpace) && noSpace.includes("침대")) {
    const wantSet = /세트|SET|프레임.*매트|매트.*프레임/i.test(noSpace);
    for (const [sizeKey, sizeVal] of Object.entries(BED_SIZES)) {
      if (noSpace.includes(sizeKey)) {
        if (wantSet) {
          return { keyword: `침대 ${sizeVal} SET`, quantity: 1 };
        }
        const mapped = sizeVal === "슈퍼싱글" ? "수퍼싱글" : sizeVal;
        return { keyword: `매트리스 ${mapped}`, quantity: 1 };
      }
    }
    return wantSet ? { keyword: "침대 싱글 SET", quantity: 1 } : { keyword: "매트리스만", quantity: 1 };
  }

  // 매트리스 단독 (사이즈 있으면 바로 확정)
  if (/매트리스|메트리스/.test(noSpace)) {
    for (const [sizeKey, sizeVal] of Object.entries(BED_SIZES)) {
      if (noSpace.includes(sizeKey)) {
        const mapped = sizeVal === "슈퍼싱글" ? "수퍼싱글" : sizeVal;
        return { keyword: `매트리스 ${mapped}`, quantity: 1 };
      }
    }
    return { keyword: "매트리스만", quantity: 1 };
  }

  return null; // 일반 침대 — searchProduct에서 처리
}

// ─── 6. H형 책상 (책상/책장 세트) ───
function parseHDeskSet(raw: string): NormalizedItem | null {
  const noSpace = raw.replace(/\s/g, "");
  // 책상/책장, 책상+책장, 책상책장세트, 책장달린책상
  if (/책상[/+]책장|책장[/+]책상|책상\s*책장\s*세트|책장\s*달린\s*책상/.test(raw) ||
      /책상[/+]책장|책장[/+]책상|책상책장세트|책장달린책상/.test(noSpace)) {
    return { keyword: "H형 책상", quantity: 1 };
  }
  return null;
}

// ─── 7. 단수 → 사이즈 매핑 (책장, 서랍장, 선반) ───
interface TierConfig {
  patterns: RegExp[];
  tiers: { max: number; keyword: string }[];
  defaultKeyword: string;
  childKeyword?: string;
}

const TIER_ITEMS: Record<string, TierConfig> = {
  "책장": {
    patterns: [/(\d+)\s*단\s*책장/, /책장\s*(\d+)\s*단/],
    tiers: [
      { max: 4, keyword: "1.5m이하 책장" },
      { max: 6, keyword: "2m이하 책장" },
      { max: Infinity, keyword: "4m이하 책장" },
    ],
    defaultKeyword: "1.5m이하 책장",
    childKeyword: "책장(어린이용)",
  },
  "서랍장": {
    patterns: [/(\d+)\s*단\s*서랍장/, /서랍장\s*(\d+)\s*단/],
    tiers: [
      { max: 3, keyword: "3단이하 서랍장" },
      { max: Infinity, keyword: "6단이하 서랍장" },
    ],
    defaultKeyword: "서랍장",
  },
  "선반": {
    patterns: [/(\d+)\s*단\s*선반/, /선반\s*(\d+)\s*단/],
    tiers: [
      { max: 3, keyword: "3단이하 선반" },
      { max: Infinity, keyword: "6단이하 선반" },
    ],
    defaultKeyword: "선반",
  },
};

function parseTierItem(raw: string): NormalizedItem | null {
  const noSpace = raw.replace(/\s/g, "");

  for (const [category, config] of Object.entries(TIER_ITEMS)) {
    if (!noSpace.includes(category)) continue;

    // 어린이용 체크
    if (config.childKeyword && /어린이|아이|유아/.test(raw)) {
      return { keyword: config.childKeyword, quantity: 1 };
    }

    // 단수 추출
    for (const pattern of config.patterns) {
      const match = raw.match(pattern) || noSpace.match(pattern);
      if (match) {
        const tier = parseInt(match[1], 10);
        for (const t of config.tiers) {
          if (tier <= t.max) {
            return { keyword: t.keyword, quantity: 1 };
          }
        }
      }
    }

    // 와이드 서랍장
    if (category === "서랍장" && /와이드|넓은|가로형/.test(raw)) {
      return { keyword: "와이드 서랍장", quantity: 1 };
    }

    // mm 치수 → 사이즈 판단 (책장)
    if (category === "책장") {
      const mmMatch = raw.match(/(\d{3,4})\s*mm/);
      if (mmMatch) {
        const mm = parseInt(mmMatch[1], 10);
        if (mm <= 1500) return { keyword: "1.5m이하 책장", quantity: 1 };
        if (mm <= 2000) return { keyword: "2m이하 책장", quantity: 1 };
        return { keyword: "4m이하 책장", quantity: 1 };
      }
    }
  }

  return null;
}

// ─── 8. 크기 수식어 기반 품목 매핑 ───
const SIZE_ITEM_OVERRIDES: Record<string, Record<string, string>> = {
  "냉장고": { "소형": "중형 냉장고" },
  "서랍장": { "소형": "3단이하 서랍장" },
  "소파": { "소형": "1인용 소파", "대형": "4인용 소파" },
  "침대": { "소형": "싱글 침대", "대형": "퀸 침대" },
  "테이블": { "소형": "소형 테이블" },
  "의자": { "소형": "소형 의자" },
  "거울": { "대형": "전신 거울" },
  "화분": { "소형": "소형 화분" },
  "책상": { "소형": "소형 책상", "대형": "대형 책상" },
  "책장": { "소형": "1.5m이하 책장", "대형": "4m이하 책장" },
};

// ─── 9. 식탁 매핑 ───
function parseDiningTable(raw: string): NormalizedItem | null {
  const noSpace = raw.replace(/\s/g, "");
  if (!noSpace.includes("식탁")) return null;

  if (/대리석/.test(noSpace)) return { keyword: "대리석세트 식탁", quantity: 1 };
  // 인원수 파싱
  const personMatch = noSpace.match(/(\d+)인/);
  if (personMatch) {
    const count = parseInt(personMatch[1], 10);
    if (count <= 4) return { keyword: "6인용미만 식탁", quantity: 1 };
    return { keyword: "6인용이상 식탁", quantity: 1 };
  }
  return null;
}

// ─── 10. 책/전집/도서 ───
function parseBooks(raw: string): NormalizedItem | null {
  const noSpace = raw.replace(/\s/g, "");
  if (/헌책/.test(noSpace)) return { keyword: "헌책", quantity: 1 };
  if (/책박스|책한박스/.test(noSpace)) return { keyword: "책 박스", quantity: 1 };
  if (/책다수|책여러권|전집|책묶음/.test(noSpace)) return { keyword: "책 묶음", quantity: 1 };
  return null;
}

// ─── 11. 괄호 안 치수 제거 ───
function stripDimensions(raw: string): string {
  // (1200*420*800), (길이400mm) 등 제거 — 단, mm 값은 미리 추출됨
  return raw.replace(/\s*\([\d*xX×]+\)\s*/g, "").replace(/\s*\(길이\d+mm\)\s*/g, "").trim();
}

// ─── 단일 키워드 동의어 치환 (기존 normalizeKeyword 대체) ───
export function normalizeKeyword(kw: string): string {
  // 1. KEYWORD_ALIASES 정확 매치
  const noSpace = kw.replace(/\s/g, "");
  const aliased = KEYWORD_ALIASES[kw] ?? KEYWORD_ALIASES[noSpace];
  if (aliased) return aliased;

  // 2. SYNONYMS 부분 문자열 치환
  let result = kw;
  for (const [pattern, replacement] of SYNONYMS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ─── 메인 정규화 함수 ───
export function normalizeItems(rawItems: RawItem[]): NormalizedItem[] {
  const results: NormalizedItem[] = [];

  for (const item of rawItems) {
    const normalized = normalizeSingleItem(item);
    results.push(normalized);
  }

  // 후처리: 매트리스 + 프레임/받침 SET 합침
  return mergeMatressSets(results);
}

function normalizeSingleItem(item: RawItem): NormalizedItem {
  let raw = item.raw.trim();
  const quantity = item.quantity || 1;

  // 0-a. 수량 단위 제거: "냉장고1대", "세탁기2개", "소파1세트" → "냉장고", "세탁기", "소파"
  //       수량은 이미 item.quantity에 있으므로 품목명에서는 제거
  raw = raw.replace(/\d+\s*(?:세트|대|개)(?![가-힣])/g, "").trim();

  // 0-b. 한글→숫자 경계에 공백 삽입: "소파2인용" → "소파 2인용", "장롱12자" → "장롱 12자"
  raw = raw.replace(/([가-힣])(\d)/g, "$1 $2");

  // 0-c. 괄호 안 타입/부가정보를 공백 구분으로 변환: "냉장고(단문형)" → "냉장고 단문형"
  //       단, 치수 괄호 (1200*420*800) 등은 stripDimensions에서 제거
  raw = raw.replace(/\(([가-힣a-zA-Z]+)\)/g, " $1").replace(/\s+/g, " ").trim();

  // 0-c. 괄호 안 치수 제거 (mm값은 tier 파서에서 먼저 처리)
  const cleanRaw = stripDimensions(raw);

  // 1. H형 책상 체크 (최우선)
  const hDesk = parseHDeskSet(raw);
  if (hDesk) return { ...hDesk, quantity };

  // 2. 장롱 자/쪽 단위
  const jarong = parseJangrongUnit(raw);
  if (jarong) return jarong; // quantity는 자/쪽 계산에서 결정됨

  // 3. 침대/매트리스/토퍼/프레임 파서
  const bed = parseBedItem(raw);
  if (bed) return { ...bed, quantity };

  // 4. 책/전집
  const book = parseBooks(raw);
  if (book) return { ...book, quantity };

  // 5. 식탁
  const table = parseDiningTable(raw);
  if (table) return { ...table, quantity };

  // 6. 단수 기반 (책장 N단, 서랍장 N단, 선반 N단)
  const tier = parseTierItem(raw);
  if (tier) return { ...tier, quantity };

  // 7. 아이/아기 접두어
  const childMatch = raw.match(CHILD_PREFIX);
  if (childMatch) {
    const prefix = childMatch[1];
    const body = raw.replace(CHILD_PREFIX, "").replace(/\s/g, "");
    // 침대는 위에서 처리됨 — 여기서는 나머지 품목
    for (const [key, mapped] of Object.entries(CHILD_MAPPINGS)) {
      if (body.includes(key)) {
        return { keyword: mapped, quantity };
      }
    }
  }

  // 8. KEYWORD_ALIASES (정확 매치)
  const noSpaceRaw = cleanRaw.replace(/\s/g, "");
  const aliased = KEYWORD_ALIASES[cleanRaw] ?? KEYWORD_ALIASES[noSpaceRaw];
  if (aliased) return { keyword: aliased, quantity };

  // 9. SYNONYMS (부분 문자열 치환)
  let result = cleanRaw;
  for (const [pattern, replacement] of SYNONYMS) {
    result = result.replace(pattern, replacement);
  }

  // 10. 크기 수식어 + 품목 조합 매핑
  const sizeMatch = result.match(/^(소형|대형)\s*/);
  if (sizeMatch) {
    const size = sizeMatch[1];
    const body = result.replace(/^(소형|대형)\s*/, "");
    const override = SIZE_ITEM_OVERRIDES[body]?.[size];
    if (override) return { keyword: override, quantity };
  }

  // 11. 전신거울 특수 처리
  if (/전신거울|전신\s*거울/.test(raw)) {
    return { keyword: "전신 거울", quantity };
  }

  return { keyword: result, quantity };
}

// ─── SET 합침: 같은 사이즈 매트리스 + 프레임 → 침대 세트 ───
function mergeMatressSets(items: NormalizedItem[]): NormalizedItem[] {
  const SIZE_MAP: Record<string, string> = {
    "싱글": "싱글 침대",
    "슈퍼싱글": "수퍼싱글 침대",
    "수퍼싱글": "수퍼싱글 침대",
    "퀸": "퀸 침대",
    "킹": "킹 침대",
  };

  const mattresses: Map<string, number> = new Map(); // size → index
  const frames: Map<string, number> = new Map();
  const merged = new Set<number>();

  for (let i = 0; i < items.length; i++) {
    const kw = items[i].keyword;

    // 매트리스 사이즈 감지
    const mattressMatch = kw.match(/매트리스\s*(싱글|슈퍼싱글|수퍼싱글|퀸|킹)/);
    if (mattressMatch) {
      const size = mattressMatch[1].replace("수퍼싱글", "슈퍼싱글");
      mattresses.set(size, i);
      continue;
    }

    // 프레임 사이즈 감지
    const frameMatch = kw.match(/(싱글|슈퍼싱글|수퍼싱글|퀸|킹)침대프레임/);
    if (frameMatch) {
      const size = frameMatch[1].replace("수퍼싱글", "슈퍼싱글");
      frames.set(size, i);
      continue;
    }
  }

  // 같은 사이즈의 매트리스 + 프레임 → SET으로 합침
  for (const [size, mattIdx] of mattresses) {
    const frameIdx = frames.get(size);
    if (frameIdx !== undefined) {
      const setKeyword = SIZE_MAP[size] || `${size} 침대`;
      items[mattIdx] = { keyword: setKeyword, quantity: 1 };
      merged.add(frameIdx);
    }
  }

  return items.filter((_, i) => !merged.has(i));
}
