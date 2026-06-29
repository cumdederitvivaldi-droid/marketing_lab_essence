// 커버링에서 수거하지 않는 폐기물 키워드.
// 1차 데이터 소스: Google Sheets (운영팀이 편집)
// 시트 미연결 / 실패 시 fallback으로 아래 정적 리스트 사용.

import type { HazardousMatch } from '../types';
export type { HazardousCategory, HazardousMatch } from '../types';

// 폐의약품 (약국 회수함, 보건소 수거)
const PHARMACEUTICAL_KEYWORDS = [
  '폐의약품', '의약품', '처방약', '조제약',
  '알약', '정제', '캡슐', '가루약', '분말약', '연질캡슐',
  '시럽약', '물약', '안약', '점안액',
  '연고약', '파스', '의료용 패치',
  '인슐린', '주사제', '주사기', '주사바늘', '주삿바늘', '주사침', '인슐린펜',
  '흡입제', '백신',
  '감기약', '항생제', '진통제', '해열제', '소화제', '변비약', '수면제',
  '한약', '한약재', '탕약',
  '비타민제', '영양제', '건강기능식품 알약',
];

// 유해 폐기물 (전용 수거함, 지자체 수거)
// 주의: 배터리(건전지·보조배터리·충전지 등)와 조명류(형광등·LED등·전구 등)는
// 커버링에서 수거 가능하므로 제외
const HAZARDOUS_WASTE_KEYWORDS = [
  // 수은 함유 제품
  '수은체온계', '수은온도계', '수은혈압계', '폐수은', '수은',

  // 화학 도료/용제
  '폐페인트', '페인트', '시너', '신너', '솔벤트', '락카', '래커',
  '스프레이 페인트', '바니쉬', '본드 대량',

  // 농약/살충제
  '농약', '살충제', '제초제', '살균제', '쥐약', '바퀴벌레약',

  // 가연성/폭발성
  '폐 라이터', '가스라이터', '일회용 라이터',
  '부탄가스', '부탄가스통', '캠핑가스', 'LPG통', '휴대용 가스통',
  '소화기', '폐 소화기',
  '폭죽', '화약', '불꽃놀이',

  // 폐유
  '폐유', '엔진오일', '윤활유', '폐식용유 대량', '기계유',

  // 의료폐기물
  '의료폐기물', '거즈 사용', '메스', '수술용 칼날',
];

export const FALLBACK_HAZARDOUS_KEYWORDS: HazardousMatch[] = [
  ...PHARMACEUTICAL_KEYWORDS.map<HazardousMatch>((k) => ({ category: 'PHARMACEUTICAL', keyword: k })),
  ...HAZARDOUS_WASTE_KEYWORDS.map<HazardousMatch>((k) => ({ category: 'HAZARDOUS_WASTE', keyword: k })),
];

const EXPLICIT_BLOCK_KEYWORDS: HazardousMatch[] = [
  { category: 'HAZARDOUS_WASTE', keyword: '수은체온계' },
  { category: 'HAZARDOUS_WASTE', keyword: '수은온도계' },
  { category: 'HAZARDOUS_WASTE', keyword: '수은혈압계' },
  { category: 'HAZARDOUS_WASTE', keyword: '폐수은' },
];

const SERVICE_HANDLED_KEYWORDS = [
  '수은등',
  '형광등',
  '폐형광등',
  '백열등',
  '할로겐등',
  '나트륨등',
  'LED등',
  '엘이디등',
  '전구',
  '배터리',
  '건전지',
  '폐건전지',
  '보조배터리',
  '리튬배터리',
  '리튬이온',
  '충전지',
  '단추형전지',
  '단추형 전지',
  '버튼전지',
  '수은전지',
  '휴대폰배터리',
  '휴대폰 배터리',
  '노트북배터리',
  '노트북 배터리',
];

const SERVICE_HANDLED_MERCURY_CONTEXT_KEYWORDS = [
  '수은등',
  '수은전지',
  '수은 들어간 전구',
];

// 공백·구분자 변형(예: '폐 라이터' vs '폐라이터')에도 매칭되도록 정규화
function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s_\-·]/g, '');
}

function includesKeyword(normalizedText: string, keyword: string): boolean {
  return normalizedText.includes(normalize(keyword));
}

function isServiceHandledMercuryContext(normalizedText: string, keyword: string): boolean {
  return (
    normalize(keyword) === '수은' &&
    SERVICE_HANDLED_MERCURY_CONTEXT_KEYWORDS.some((contextKeyword) =>
      includesKeyword(normalizedText, contextKeyword),
    )
  );
}

export function detectHazardous(
  text: string,
  keywords: HazardousMatch[] = FALLBACK_HAZARDOUS_KEYWORDS,
): HazardousMatch | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const normalizedText = normalize(trimmed);

  for (const entry of EXPLICIT_BLOCK_KEYWORDS) {
    if (includesKeyword(normalizedText, entry.keyword)) {
      return entry;
    }
  }

  const isServiceHandled = SERVICE_HANDLED_KEYWORDS.some((keyword) => includesKeyword(normalizedText, keyword));

  for (const entry of keywords) {
    if (includesKeyword(normalizedText, entry.keyword)) {
      if (isServiceHandledMercuryContext(normalizedText, entry.keyword)) {
        continue;
      }
      return entry;
    }
  }

  if (isServiceHandled) return null;
  return null;
}
