# disposal-guide SVG plain img 전환 (next/image basePath 충돌 회피)

> 유형: Plan
> 작성일: 2026-04-30
> 상태: In Review

## Goals
- production에서 인트로 SVG가 여전히 안 보이는 문제 근본 해결
- 다른 covering-labs public 앱들과 동일한 자산 처리 패턴(plain `<img>` + `BASE_PATH` 상수)으로 통일

## Current Status Analysis
PR #165(`dangerouslyAllowSVG: true` 추가 + `unoptimized` 제거)이 머지·배포됐으나 production에서 인트로 SVG가 여전히 안 보임.

진단 결과:
- 클라이언트 HTML: `<img src="/disposal-guide/_next/image?url=%2FnoticeBoardGraphic.svg&w=256&q=75">`
- 해당 URL 응답: **400 Bad Request**
- 즉 `dangerouslyAllowSVG`를 활성화해도 next/image의 image optimizer는 basePath와 함께 사용 시 `url` 파라미터의 basePath 누락으로 SVG를 거부함 (Next.js 14.2.x 알려진 패턴)

reference: 다른 public 앱들(`large-coveringbag-order`, `covering-invite`)은 next/image를 쓰지 않고 plain `<img>` + `BASE_PATH` 상수 prefix 패턴 사용. 동일하게 통일해서 image optimizer 우회.

## Implementation Plan (Phase-by-Phase Tasks)

### Phase 1. `BASE_PATH` 상수 모듈 추가
- `src/utils/basePath.ts` 신규
- production: `/disposal-guide`, dev: `''` (빈 문자열)
- `process.env.NODE_ENV` 기반 분기

### Phase 2. IntroScreen plain `<img>`로 전환
- `next/image` import 제거
- `<Image>` → `<img>`로 변경, src에 `${BASE_PATH}/noticeBoardGraphic.svg` prefix
- width/height 속성 그대로 유지 (CLS 방지)
- `priority` prop은 next/image 전용이라 제거

### Phase 3. next.config.js 정리
- `images.dangerouslyAllowSVG` + CSP 제거 (이제 next/image 미사용이라 불필요)

## Completion Criteria
- [x] `BASE_PATH` 상수 모듈 작성
- [x] IntroScreen plain `<img>` 전환
- [x] next.config.js images 설정 정리
- [x] `npx tsc --noEmit` 0건
- [x] `npx jest` 68/68 통과
- [ ] 머지·배포 후 production(`https://public-labs.covering.app/disposal-guide/`)에서 인트로 SVG 노출 확인

## 주의
- 향후 disposal-guide에 다른 자산(SVG/PNG/etc) 추가 시도 동일 패턴 사용: `<img src={\`${BASE_PATH}/asset.ext\`}>`
- next/image의 자동 최적화·priority hint 등을 잃지만, 단일 인트로 일러스트만 사용하므로 영향 미미
