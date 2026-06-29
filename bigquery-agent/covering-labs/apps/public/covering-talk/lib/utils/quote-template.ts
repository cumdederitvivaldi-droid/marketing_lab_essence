import { Quote } from "@/lib/store/conversations";
import { CollectedInfo } from "@/lib/ai/phases";
import ladderFeesData from "@/lib/data/ladder-fees.json";
import { getWorkflowConfig, resolveQuote } from "./workflow-config";

const CIRCLED_NUMBERS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮"];

/**
 * 내부 DB 제품명 → 고객용 표시명 변환
 * DB에서는 "중형 냉장고"가 가장 작은 일반 냉장고지만,
 * 고객에게 "중형"이라고 하면 더 큰 걸 청구받는 느낌 → "일반"으로 표시
 */
const CUSTOMER_DISPLAY_MAP: Record<string, string> = {
  "중형": "일반",
  "중형 냉장고": "일반 냉장고",
};

function toCustomerFriendly(spec: string): string {
  // "(의자포함)" / "(의자 포함)" 제거 — 의자 포함 여부는 고객에게 불필요
  const cleaned = spec.replace(/\(의자\s?포함\)/g, "").trim();
  return CUSTOMER_DISPLAY_MAP[cleaned] ?? cleaned;
}

/**
 * 견적 품목명을 고객에게 보여줄 형식으로 변환
 * "냉장고 - 중형 냉장고" → "냉장고 (일반)"
 * "장롱 - 3자" → "장롱 (3자)"
 * "런닝머신 - 런닝머신" → "런닝머신"
 * "화장대 - 스탠딩 화장대" → "화장대"
 */
function formatItemDisplayName(fullName: string): string {
  const parts = fullName.split(" - ");
  if (parts.length < 2) return fullName;

  const category = parts[0].trim();
  const name = parts.slice(1).join(" - ").trim();

  // category와 name이 동일 (예: "런닝머신 - 런닝머신")
  if (category === name) return category;

  // name이 category를 포함 (예: "냉장고 - 중형 냉장고" → "냉장고 (일반)")
  if (name.includes(category)) {
    const spec = name.replace(category, "").trim();
    if (!spec) return category;
    return `${category} (${toCustomerFriendly(spec)})`;
  }

  return `${category} (${toCustomerFriendly(name)})`;
}

/** 사다리차 금액으로 시간 정보 역조회 */
function getLadderDurationLabel(fee: number): string | null {
  if (fee <= 0) return null;
  const timeSlots = [
    { key: "under1h", label: "기본(1시간 미만)" },
    { key: "h1", label: "1시간" },
    { key: "h2", label: "2시간" },
    { key: "h3", label: "3시간" },
    { key: "h4", label: "4시간" },
    { key: "h5", label: "5시간" },
    { key: "h6", label: "6시간" },
    { key: "h7", label: "7시간" },
  ];
  for (const row of ladderFeesData) {
    for (const slot of timeSlots) {
      if ((row as Record<string, unknown>)[slot.key] === fee) {
        return `사다리차 ${slot.label} 대여(${row.type})`;
      }
    }
  }
  return "사다리차 대여";
}

/**
 * Quote + CollectedInfo로 견적 안내 템플릿 생성
 * AI 호출 없이 결정론적으로 생성 → 견적 편집 시 즉시 반영 가능
 */
export async function generateQuoteTemplate(
  quote: Quote,
  collectedInfo?: CollectedInfo | null
): Promise<string> {
  if (!quote || quote.items.length === 0) {
    return "견적 정보가 없습니다.";
  }

  const config = await getWorkflowConfig();
  const hasLadder = (quote.ladderFee ?? 0) > 0;
  return resolveQuote(config.quote, quote.totalPrice, hasLadder);
}
