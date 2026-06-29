// 커버링에서 일반 봉투로 수거 가능하지만, 분리배출/포장 안내가 필요한 품목.
// itemDescription에서 키워드 매칭되면 결과 화면에 caution으로 노출.

export type SpecialItemCategory = 'BATTERY' | 'LAMP' | 'GLASS_FRAGILE';

export interface SpecialItemNotice {
  category: SpecialItemCategory;
  message: string;
}

const BATTERY_KEYWORDS = [
  '배터리', '건전지', '폐건전지', '보조배터리', '리튬배터리', '리튬이온',
  '충전지', '단추형 전지', '버튼전지', '수은전지', '휴대폰 배터리', '노트북 배터리',
];

const LAMP_KEYWORDS = [
  '형광등', '폐형광등', '백열등', '할로겐등', '수은등', '나트륨등', 'LED등', '전구',
];

const GLASS_FRAGILE_KEYWORDS = [
  '거울', '액자', '유리', '도자기', '깨진 유리', '깨진 도자기',
];

const NOTICES: { keywords: string[]; notice: SpecialItemNotice }[] = [
  {
    keywords: BATTERY_KEYWORDS,
    notice: {
      category: 'BATTERY',
      message: '배터리·건전지는 폭발 위험이 있어요. 단자에 절연 테이프를 감싸 분리배출하면 더 안전해요.',
    },
  },
  {
    keywords: LAMP_KEYWORDS,
    notice: {
      category: 'LAMP',
      message: '형광등·전구는 깨지지 않게 신문지로 감싸 담아주세요.',
    },
  },
  {
    keywords: GLASS_FRAGILE_KEYWORDS,
    notice: {
      category: 'GLASS_FRAGILE',
      message: '거울·유리·도자기는 신문지로 감싸 안전하게 포장해 주세요.',
    },
  },
];

export function detectSpecialItem(text: string): SpecialItemNotice | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  for (const entry of NOTICES) {
    if (entry.keywords.some((k) => lower.includes(k.toLowerCase()))) {
      return entry.notice;
    }
  }
  return null;
}

// 날카로운 물건 (유리·거울·도자기 등) 여부 — 결과 화면 SHARP_WRAP 카드 노출 조건
export function isSharpItem(text: string): boolean {
  return detectSpecialItem(text)?.category === 'GLASS_FRAGILE';
}
