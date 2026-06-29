# disposal-guide 인트로 SVG basePath 누락 hotfix

> 유형: 플랜
> 작성일: 2026-04-29
> 상태: 검토중

## Goals
- production(`https://public-labs.covering.app/disposal-guide/`)에서 인트로 일러스트(SVG)가 404로 안 보이는 문제 즉시 해결
- 향후 SVG 추가 시에도 자동으로 basePath prefix 적용되도록 표준 설정 정착

## Current Status Analysis
PR #163 머지 후 production에서 인트로 SVG가 404. 원인 진단:

- `<Image>` 컴포넌트에 `unoptimized` prop이 켜져 있음
- `unoptimized` 시 next/image는 src를 그대로 사용 → basePath 자동 prefix 미적용
- production HTML: `<img src="/noticeBoardGraphic.svg">` (basePath 없음)
- 실제 파일 경로: `/disposal-guide/noticeBoardGraphic.svg`
- → 404, 일러스트 영역 빈 칸

dev 환경에서는 basePath 가 빈 문자열이라 `/noticeBoardGraphic.svg`가 그대로 동작 → 로컬 검증 시 발견 안 됨.

## Implementation Plan (Phase-by-Phase Tasks)

### Phase 1. next.config.js images 설정 추가

```js
images: {
  dangerouslyAllowSVG: true,
  contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
}
```

`dangerouslyAllowSVG`는 외부 사용자 업로드 SVG가 아니라 자체 `public/` 자산에만 사용하므로 안전. CSP로 SVG 내부 스크립트 실행 차단.

### Phase 2. IntroScreen `unoptimized` prop 제거

next/image의 정상 최적화 경로(`_next/image?url=...`)를 사용하도록 복원. 이 경로는 basePath 자동 prefix 처리됨.

### Phase 3. 회귀 확인
- dev 로컬: 이미지 정상 노출
- production: 머지·배포 후 `https://public-labs.covering.app/disposal-guide/`에서 SVG 노출 확인

## Completion Criteria
- [x] `next.config.js`에 `images.dangerouslyAllowSVG` 추가
- [x] IntroScreen `unoptimized` prop 제거
- [x] `npx tsc --noEmit` 0건
- [x] `npx jest` 68/68 통과
- [ ] PR 머지 후 production에서 인트로 SVG 시각 확인 (사용자 QA)

## 주의
- 이 수정은 SVG 한정. PNG/JPG 등은 영향 없음
- `dangerouslyAllowSVG`는 외부 사용자 업로드 SVG를 받아 next/image로 처리할 경우엔 위험. 현재 disposal-guide는 자체 자산만 사용
