# disposal-guide 결과 페이지 비방문수거 CTA 링크 변경

> 유형: Plan
> 작성일: 2026-04-30
> 상태: Complete

## Goals
- 결과 페이지에서 방문수거 외 추천(`LARGE_COVERING_BAG` / `GENERAL_BAG_SINGLE` / `GENERAL_BAG_MULTIPLE`) 시 클릭되는 CTA 링크를 새 트래킹 URL로 변경

## Current Status Analysis
현재 `DisposalGuideApp.tsx` 의 `onCta` 핸들러:
- `VISIT_PICKUP` → `https://abr.ge/7sx2me`
- 그 외 → `https://covering.app`

비방문수거 추천 시 일반 covering.app 홈으로만 가서 트래킹 분리 안 됨.

## Implementation Plan (Phase-by-Phase Tasks)

### Phase 1. CTA URL 교체
- `DisposalGuideApp.tsx` `onCta` 핸들러에서 비방문수거 분기 URL 을 `https://covering.app` → `https://abr.ge/wn79bl` 로 교체
- 방문수거 분기(`https://abr.ge/7sx2me`) 는 그대로 유지

## Completion Criteria
- [x] CTA URL 교체 완료
- [x] `npx tsc --noEmit` 0건
- [x] `npx jest` 68/68 통과
- [ ] 머지·배포 후 결과 페이지에서 비방문수거 CTA 클릭 시 새 URL 로 이동 확인 (사용자 QA)
