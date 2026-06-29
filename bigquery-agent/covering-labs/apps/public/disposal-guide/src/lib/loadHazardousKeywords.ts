import {
  FALLBACK_HAZARDOUS_KEYWORDS,
  type HazardousCategory,
  type HazardousMatch,
} from '../data/hazardousKeywords';

// 시트 키워드가 비어 있거나 NEXT_PUBLIC_HAZARDOUS_SHEET_CSV_URL이 없을 때 사용하는 fallback.
// Google Sheets는 publish-to-web으로 CSV export URL을 만들어 사용한다.
// 인증 없이 접근 가능한 URL을 NEXT_PUBLIC_HAZARDOUS_SHEET_CSV_URL 환경변수로 전달.
//
// 시트 컬럼 (헤더 1행):
//   keyword     | category               | enabled
//   ----------- | ---------------------- | -------
//   알약        | PHARMACEUTICAL         | TRUE
//   페인트      | HAZARDOUS_WASTE        | TRUE
//   ...
//
// enabled가 FALSE 또는 빈 값이면 무시한다.
// category 값이 PHARMACEUTICAL / HAZARDOUS_WASTE 가 아니면 무시한다.

const REVALIDATE_SECONDS = 3600; // 1시간마다 갱신

const VALID_CATEGORIES: HazardousCategory[] = ['PHARMACEUTICAL', 'HAZARDOUS_WASTE'];

export type HazardousKeywordSource = 'sheet' | 'fallback';

export interface HazardousKeywordLoadResult {
  keywords: HazardousMatch[];
  source: HazardousKeywordSource;
}

function parseCsvRow(line: string): string[] {
  // 따옴표 안 콤마 처리
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ',' && !inQuote) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseSheetCsv(csv: string): HazardousMatch[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length <= 1) return [];

  const header = parseCsvRow(lines[0]).map((h) => h.toLowerCase());
  const keywordIdx = header.indexOf('keyword');
  const categoryIdx = header.indexOf('category');
  const enabledIdx = header.indexOf('enabled');

  if (keywordIdx < 0 || categoryIdx < 0) return [];

  const result: HazardousMatch[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i]);
    const keyword = cols[keywordIdx]?.trim();
    const category = cols[categoryIdx]?.trim().toUpperCase() as HazardousCategory;
    const enabled = enabledIdx >= 0 ? cols[enabledIdx]?.trim().toUpperCase() : 'TRUE';

    if (!keyword) continue;
    // 빈 값 / FALSE / 0 / NO 모두 비활성으로 처리 (주석과 동작 일치)
    if (!enabled || enabled === 'FALSE' || enabled === '0' || enabled === 'NO') continue;
    if (!VALID_CATEGORIES.includes(category)) continue;

    result.push({ keyword, category });
  }
  return result;
}

export async function loadHazardousKeywordsWithSource(): Promise<HazardousKeywordLoadResult> {
  const url = process.env.NEXT_PUBLIC_HAZARDOUS_SHEET_CSV_URL;
  if (!url) {
    return {
      keywords: FALLBACK_HAZARDOUS_KEYWORDS,
      source: 'fallback',
    };
  }

  // 네트워크 행 시 빌드/요청이 무한 대기하지 않도록 5초 타임아웃 + abort.
  // await fetch는 헤더 수신 시점에 resolve되므로, 본문(res.text)까지 보호하려면
  // clearTimeout은 본문 읽기 완료 이후로 미뤄야 한다.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[hazardousKeywords] sheet fetch failed: ${res.status}, using fallback`);
      return {
        keywords: FALLBACK_HAZARDOUS_KEYWORDS,
        source: 'fallback',
      };
    }
    const csv = await res.text();
    const parsed = parseSheetCsv(csv);
    if (parsed.length === 0) {
      console.warn('[hazardousKeywords] sheet returned empty list, using fallback');
      return {
        keywords: FALLBACK_HAZARDOUS_KEYWORDS,
        source: 'fallback',
      };
    }
    return {
      keywords: parsed,
      source: 'sheet',
    };
  } catch (err) {
    console.warn('[hazardousKeywords] sheet fetch error, using fallback', err);
    return {
      keywords: FALLBACK_HAZARDOUS_KEYWORDS,
      source: 'fallback',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadHazardousKeywords(): Promise<HazardousMatch[]> {
  const { keywords } = await loadHazardousKeywordsWithSource();
  return keywords;
}
