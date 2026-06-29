# Disposal Guide Bedding Policy Fix Plan

> 유형: 플랜
> 작성일: 2026-05-14
> 상태: 검토중

## 목표

ENG-3061 추가 QA 정정에 따라 이불·의류·잡화 단독 케이스에서 방문수거를 줄이고, 길이가 150cm 이하이면 봉투 추천으로 안내되도록 추천 로직을 보정한다.

## 현황 분석

- 운영은 현재 fallback config를 사용하므로 코드의 기본 추천 룰 변경이 즉시 반영된다.
- `SPLITTABLE_ONLY`는 이불·의류·잡화 단독 또는 이불·의류·잡화 + 일반 카테고리 혼합만 해당한다.
- 현재 BEDDING 단독 `AROUND_80`/`OVER_80_UNDER_140` + 15~25kg + UNKNOWN은 여러 장으로 추천된다.
- 현재 BEDDING 단독 또는 BEDDING + GENERAL `OVER_140_UNDER_150` + OVER_25/HARD_TO_LIFT는 방문수거로 추천된다.

## 구현 계획

### 단계별 작업

- [ ] 추천 정책 테스트를 먼저 추가하고 실패를 확인한다.
- [ ] `recommend.ts`의 BEDDING 단독 UNKNOWN fallback을 대형 봉투로 분리한다.
- [ ] `defaultGuideConfig.ts` 룰 40/50에서 `SPLITTABLE_ONLY`를 방문수거 룰에서 제외한다.
- [ ] Supabase seed의 추천 룰 JSON도 같은 조건으로 동기화한다.
- [ ] 로컬 테스트, typecheck, build, lint를 수행한다.
- [ ] peer 코드리뷰와 운영 QA 후 배포한다.

## 완료 기준

- BEDDING 단독 목표 매트릭스의 변경 셀이 모두 기대값과 일치한다.
- BEDDING + GENERAL 고중량/고난도 케이스는 방문수거가 아니라 대형 봉투로 안내된다.
- 가전·가구, 기타, OVER_150 방문수거 경로는 기존 동작을 유지한다.
- Linear ENG-3061에 변경 내용, QA 시나리오, 운영 배포 URL을 보고한다.
