/** 가격 + "원" 접미사 (예: 225000 → "225,000원") */
export function formatPriceWon(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

/**
 * 전화번호 입력 자동 포맷팅 (010-XXXX-XXXX).
 * 숫자만 추출 → 길이별 하이픈 삽입. 11자 초과는 절단.
 * 서버가 한 번 더 정규화하므로 입력 도중 raw 값을 그대로 전송해도 OK.
 */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
