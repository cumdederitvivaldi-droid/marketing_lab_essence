// 스윗트래커 비즈메시지 v2.29.3 타입 정의
// 실험실 전용 — 김원빈 / 강성진만 사용

export type BrandMessageType = "FT" | "FI" | "FW";

export interface BrandMessageButton {
  name: string;
  type: string;
  url_mobile?: string;
  url_pc?: string;
  scheme_android?: string;
  scheme_ios?: string;
}

export interface BrandMessageCoupon {
  name: string;
  desc?: string;
  url_mobile?: string;
  url_pc?: string;
  scheme_android?: string;
  scheme_ios?: string;
}

// 브랜드메시지 타깃팅 타입 — 발송 대상 범위 결정
//   M: 광고주 마수동 유저 (마케팅 수신 동의자) — 채널 친구 무관, 가장 넓은 도달 (화이트리스트 발신프로필만 사용 가능)
//   N: 광고주 마수동 유저 ∩ 채널 친구 (둘 다 동의)
//   I: 발송 요청 대상 ∩ 채널 친구 (default 비슷 — 친구만)
//   F: 모든 채널 친구 (구 친구톡)
export type BrandMessageTargeting = "M" | "N" | "I" | "F";

export interface BrandMessage {
  msgid: string;
  message_type: BrandMessageType;
  profile_key: string;
  receiver_num: string;
  message: string;
  reserved_time: string; // yyyyMMddHHmmss, "00000000000000" = 즉시발송
  targeting?: BrandMessageTargeting;  // 미설정 시 default "I" (친구만) — K101 대량 발생 위험
  image_url?: string;    // FW/FI
  image_link?: string;   // FW/FI 이미지 클릭 시 이동
  button1?: BrandMessageButton;
  button2?: BrandMessageButton;
  button3?: BrandMessageButton;
  button4?: BrandMessageButton;
  button5?: BrandMessageButton;
  coupon?: BrandMessageCoupon;
}

export interface SweetTrackerSendResult {
  msgid: string;
  success: boolean;            // PDF 응답 result === "Y" 여부 — 진짜 성공 판정 키
  result_code: string;         // PDF code (K000=카카오성공, M000=대체SMS성공, Exxx=요청에러)
  result_message?: string;     // PDF error
  kind?: string;               // 발송정책 (K: 카카오, M: SMS, P: 푸시)
  origin_code?: string;        // 카카오 원본 결과 코드
  origin_error?: string;       // 카카오 원본 에러
}

// Excel 파싱 결과 (parseSweetTrackerExcel 반환)
export interface ParsedRecipientRow {
  phone: string;
  message: string;
  imageUrl?: string;
  imageLink?: string;
  isWide: boolean;
  buttons: BrandMessageButton[];
  coupon?: BrandMessageCoupon;
  // 검증
  wideMessageTooLong?: boolean; // FW 텍스트 76자 초과 경고
}
