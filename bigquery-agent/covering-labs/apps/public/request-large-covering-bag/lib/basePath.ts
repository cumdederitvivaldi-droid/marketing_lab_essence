/**
 * request-large-covering-bag는 production에서 /request-large-covering-bag subpath로 서빙됨.
 * public/ 자산을 plain <img>나 <a>로 참조할 때 이 prefix 필요.
 *
 * next/image는 사용하지 않음 — basePath + image optimizer 조합에서 _next/image?url=...
 * 의 url 파라미터에 basePath가 누락돼 400 응답이 발생하는 알려진 이슈가 있음.
 * (disposal-guide, large-coveringbag-order, covering-invite, covering-spot 도 동일 패턴)
 */
export const BASE_PATH = process.env.NODE_ENV === "production" ? "/request-large-covering-bag" : "";
