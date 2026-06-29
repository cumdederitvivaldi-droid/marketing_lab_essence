/**
 * disposal-guide는 production에서 /disposal-guide subpath로 서빙됨.
 * public/ 자산을 plain <img>나 <a>로 참조할 때 이 prefix 필요.
 *
 * next/image는 사용하지 않음 — basePath + image optimizer 조합에서 url
 * 파라미터에 basePath가 누락돼 400 응답이 발생하는 알려진 이슈가 있음.
 * (large-coveringbag-order, covering-invite 도 동일하게 plain <img>+BASE_PATH 패턴)
 */
export const BASE_PATH = process.env.NODE_ENV === 'production' ? '/disposal-guide' : '';
