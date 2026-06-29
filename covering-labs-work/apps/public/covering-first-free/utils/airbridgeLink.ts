/**
 * 첫 결제 0원 랜딩 CTA Airbridge 원링크.
 *
 * 매 클릭마다 다른 링크가 필요한 친구초대(invite_code별 unique) 케이스와 달리,
 * 이 랜딩은 모든 유저 동일한 앱 진입 링크라 Airbridge 콘솔/API로 한 번 만들어둔
 * shortUrl을 그대로 사용 (V2 진입점 배너 3종과 동일 패턴, 메모리 reference_airbridge_tracking_link_api 참고).
 *
 * 등록 정보 (2026-05-20, POST /v1/tracking-links):
 *   trackingLinkId  = 524918479
 *   shortId         = etbk2c
 *   channel         = first_free_landing
 *   campaign        = first_free_v1
 *   ad_group        = first_free_v1
 *   ad_creative     = first_free_cta
 *   deeplinkUrl     = covering://?campaign=first_free_v1
 *   isReengagement  = OFF
 *
 * 원링크 변경/A-B 분기 추가 필요 시 Airbridge 콘솔에서 별도 발급 후 상수 교체.
 */
export const AIRBRIDGE_ONELINK = 'https://link.covering.app/etbk2c';

export function getAirbridgeOnelink(): { link: string; mode: 'onelink' } {
  return { link: AIRBRIDGE_ONELINK, mode: 'onelink' };
}
