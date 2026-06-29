/**
 * 커버링 AI 상담 — 정책 검증 엔진
 *
 * 추천 답변이 현재 정책에 맞는지 Haiku로 검증
 */

import * as fs from "fs";
import * as path from "path";

// 정책문서 캐싱
let cachedPolicy: string | null = null;
let cachedSections: Map<string, string> | null = null;

export function loadPolicyDocument(): string {
  if (cachedPolicy) return cachedPolicy;

  const policyPath = path.join(
    process.cwd(),
    "tools",
    "channeltalk-ai",
    "policy-document.md"
  );

  try {
    cachedPolicy = fs.readFileSync(policyPath, "utf-8");
  } catch {
    console.warn("[validate] 정책문서를 찾을 수 없습니다:", policyPath);
    cachedPolicy = "정책문서가 아직 생성되지 않았습니다.";
  }

  return cachedPolicy;
}

/** 정책문서를 ## 섹션별로 파싱 (캐싱) */
export function loadPolicySections(): Map<string, string> {
  if (cachedSections) return cachedSections;

  const doc = loadPolicyDocument();
  cachedSections = new Map();

  const sectionRegex = /^## \d+\.\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  const starts: Array<{ title: string; index: number }> = [];

  while ((match = sectionRegex.exec(doc)) !== null) {
    starts.push({ title: match[1].trim(), index: match.index });
  }

  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].index : doc.length;
    cachedSections.set(starts[i].title, doc.substring(starts[i].index, end).trim());
  }

  return cachedSections;
}

/** 카테고리 → 관련 정책 섹션 매핑 (20개 카테고리) */
const CATEGORY_SECTION_MAP: Record<string, string[]> = {
  // A. 서비스이용
  "이용_배출품목":     ["수거 규칙", "봉투 정책"],
  "이용_대형폐기물":   ["대형폐기물", "수거 규칙", "가격/결제"],
  "이용_서비스안내":   ["서비스 개요", "가격/결제", "봉투 정책"],
  "이용_주문관리":     ["앱/시스템", "구독 관리", "수거 규칙"],

  // B. 구독
  "구독_관리":         ["구독 관리", "가격/결제"],

  // C. 배송
  "배송_현황":         ["봉투 정책", "서비스 개요"],
  "배송_이슈":         ["봉투 정책", "환불/보상 정책"],

  // D. 미수거
  "미수거_정책위반":   ["수거 규칙", "미수거/오인수거 처리"],
  "미수거_누락":       ["미수거/오인수거 처리", "환불/보상 정책", "수거 규칙"],
  "미수거_출입실패":   ["출입/접근 문제", "미수거/오인수거 처리"],

  // E. 결제
  "결제_안내":         ["가격/결제", "서비스 개요"],
  "결제_이슈":         ["가격/결제", "환불/보상 정책", "수거 규칙"],

  // F. 독립
  "앱_오류":           ["앱/시스템", "서비스 개요"],
  "수거_확인":         ["수거 규칙", "미수거/오인수거 처리"],
  "오인수거":          ["미수거/오인수거 처리", "환불/보상 정책"],
  "계정_정보":         ["앱/시스템", "구독 관리"],
  "쿠폰":             ["쿠폰 정책", "가격/결제"],
  "VOC":              ["서비스 개요", "환불/보상 정책"],
  "기타":              ["서비스 개요", "수거 규칙", "가격/결제"],
  "빼기주문":          ["수거 규칙", "서비스 개요"],

  // 하위호환: 기존 15개 카테고리 (이전 임베딩 데이터용)
  "배차/차량추적":     ["배차/차량 등록", "수거 규칙"],
  "오인수거/미수거":   ["미수거/오인수거 처리", "수거 규칙", "환불/보상 정책"],
  "가격/결제/쿠폰":   ["가격/결제", "쿠폰 정책", "서비스 개요"],
  "봉투/수거용품":     ["봉투 정책", "수거 규칙"],
  "배출방법/이용문의": ["수거 규칙", "서비스 개요", "봉투 정책"],
  "구독관리/해지":     ["구독 관리", "가격/결제"],
  "일정변경/스킵":     ["구독 관리", "수거 규칙"],
  "출입/접근문제":     ["출입/접근 문제", "수거 규칙"],
  "앱/시스템오류":     ["앱/시스템", "서비스 개요"],
  "환불/보상":         ["환불/보상 정책", "가격/결제"],
  "주소/개인정보변경": ["앱/시스템", "구독 관리"],
  "신규가입/이용안내": ["서비스 개요", "봉투 정책", "가격/결제"],
  "무게/측정문제":     ["수거 규칙", "가격/결제", "환불/보상 정책"],
  "배송/봉투배송":     ["봉투 정책", "서비스 개요"],
};

/** 카테고리에 해당하는 정책 섹션만 반환 */
export function getPolicySectionsForCategory(category: string): string {
  const sections = loadPolicySections();
  const sectionTitles = CATEGORY_SECTION_MAP[category] || CATEGORY_SECTION_MAP["기타"];

  const matched: string[] = [];
  for (const title of sectionTitles) {
    // 부분 매칭 (섹션 제목에 키워드 포함)
    for (const [key, content] of sections) {
      if (key.includes(title) || title.includes(key)) {
        matched.push(content);
        break;
      }
    }
  }

  return matched.length > 0 ? matched.join("\n\n---\n\n") : loadPolicyDocument().substring(0, 4000);
}

