/**
 * 해피톡 serial_number 생성 유틸
 * 최대 30자, 메시지별 고유값
 */
export function generateSerialNumber(prefix = "resp"): string {
  const timestamp = Date.now().toString(36); // base36으로 짧게
  const random = Math.random().toString(36).slice(2, 8);
  const serial = `${prefix}_${timestamp}_${random}`;
  return serial.slice(0, 30);
}
