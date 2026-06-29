/**
 * 주문 품목 이름 간소화.
 *
 * displayName/name에 "카테고리 - 이름 - 옵션" 풀 경로가 저장되어 있는데 배차표에서
 * 길고 중복이 많아 가독성이 떨어진다. 마지막 두 segment 기준 "이름(옵션)" 형식으로
 * 정리한다.
 *
 * 예:
 *   "가구 - 의자 - 일반형"            → "의자(일반형)"
 *   "소파 - 소파 - 1인용"             → "소파(1인용)"
 *   "가전 - 선풍기 - 선풍기(스탠드)"  → "선풍기(스탠드)"  (옵션이 이름을 포함)
 *   "기타 - 화분(대형) - 대형"         → "화분(대형)"      (이름이 옵션을 포함)
 *   "세탁기 > 세탁기(트럼)"            → "세탁기(트럼)"
 *   "접이식 책상"                      → "접이식 책상"     (단일 segment)
 */
export function simplifyItemName(
  displayName: string | null | undefined,
  name?: string | null
): string {
  const src = (displayName || name || "").trim();
  if (!src) return "";

  const parts = src
    .split(/\s*[->]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return src;

  // 연속 중복 제거 ("소파 - 소파 - 1인용" → ["소파", "1인용"])
  const uniq: string[] = [];
  for (const p of parts) {
    if (uniq[uniq.length - 1] !== p) uniq.push(p);
  }

  if (uniq.length === 1) return uniq[0];
  if (uniq.length === 2) {
    const [a, b] = uniq;
    if (b.includes(a)) return b;
    if (a.includes(b)) return a;
    return `${a}(${b})`;
  }
  // 3개 이상 — 마지막 2개 사용
  const main = uniq[uniq.length - 2];
  const opt = uniq[uniq.length - 1];
  if (opt.includes(main)) return opt;
  if (main.includes(opt)) return main;
  return `${main}(${opt})`;
}

/**
 * 품목 리스트 요약 텍스트 — 배차표 "품목" 셀용.
 * 각 아이템을 `simplifyItemName`으로 정리하고 ", "로 조인. 수량 > 1이면 "×N" 붙임.
 */
export function summarizeItems(
  items: Array<{ displayName?: string | null; name?: string | null; quantity?: number }>
): string {
  if (!items || items.length === 0) return "-";
  return items
    .map((it) => {
      const simple = simplifyItemName(it.displayName, it.name);
      const qty = it.quantity && it.quantity > 1 ? ` ×${it.quantity}` : "";
      return `${simple}${qty}`;
    })
    .filter(Boolean)
    .join(", ");
}
