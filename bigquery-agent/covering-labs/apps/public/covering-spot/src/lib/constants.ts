export const BASE_PATH = "/covering-spot";
export const KAKAO_CHANNEL_URL = "https://pf.kakao.com/_bxgWhX";
export const KAKAO_CHAT_URL = `${KAKAO_CHANNEL_URL}/chat`;
export const KAKAO_BRIDGE_PATH = "/kakao";
export const KAKAO_BRIDGE_URL = `${BASE_PATH}${KAKAO_BRIDGE_PATH}`;
// 카카오 비즈메시지 직접 채팅 진입 URL — 안드로이드 인앱 포함 모든 환경에서 카카오톡 앱 직접 열림.
// extra 파라미터로 진입 위치(web_hero/web_price/...)를 광고/CRM 식별값으로 전달.
export const KAKAO_BIZ_CHAT_URL = "https://bizmessage.kakao.com/chat/open/@커버링스팟";
export const SITE_URL = "https://public-labs.covering.app/covering-spot";
export const SITE_NAME = "커버링 방문수거";

// Meta Pixel ID — 클라이언트 공개값. layout <head> 와 AnalyticsProvider 가 공유.
export const META_PIXEL_ID = "887855856225518";

// 네이버 전환 추적(CTS) AccountId — 네이버 광고주시스템에서 발급받은 값.
// 키가 바뀔 수 있으므로 교체 시 이 상수만 수정하면 됨. (추후 env 로 이관 예정)
export const NAVER_WA_ID = "s_52ecf911042a";
// wcs.inflow() 에 넣을 1차 도메인 (host 만, 프로토콜/서브경로 없음).
export const NAVER_INFLOW_DOMAIN = "public-labs.covering.app";
export const SITE_TITLE = "커버링 방문수거 | 대형폐기물 수거 예약 - 서울·경기·인천";
export const SITE_DESC =
  "소파, 침대, 냉장고 등 대형폐기물 방문수거 전문. 온라인 즉시 견적, 추가비용 없는 확정가. 서울·경기·인천 전 지역 당일수거 가능.";
