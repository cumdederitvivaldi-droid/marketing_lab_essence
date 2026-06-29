/** 가격 + "원" 접미사 (예: 225000 → "225,000원") */
export function formatPriceWon(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}
