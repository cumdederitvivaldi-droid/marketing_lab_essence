# 대형 봉투 사이즈 예시 레이아웃 회귀 수정

> 유형: Plan
> 작성일: 2026-04-23
> 상태: 검토중

## Linear Source

- 이슈: `ENG-2656`
- 링크: `https://linear.app/covering/issue/ENG-2656/대형-커버링봉투-covering-labs-public-앱-이관-및-6개-airbridge-링크-발급`
- 담당: 함정훈

## 목표

- `public-labs` 이관 후 깨진 `실제 대형 봉투 사이즈 예시` 섹션 레이아웃을 원본과 같게 복구한다.
- 같은 원인으로 흐트러진 수거 가능/불가능 일러스트 레이어도 함께 복구한다.

## 왜 지금

- 운영 배포 직후 랜딩 핵심 설명 구간이 원본과 다르게 보이면 바로 신뢰 저하로 이어진다.
- 단순 스타일 문제가 아니라 Tailwind 버전 차이로 생긴 구조적 회귀라서, 지금 한 번 정리해야 같은 패턴의 재발을 막을 수 있다.

## 문제 정의

- 원본 `figma-26q2`는 Tailwind 4 기반이라 `col-1`, `row-1` 같은 grid shorthand 클래스가 동작한다.
- 이관 대상 `covering-labs` 앱은 Tailwind 3 기반이라 같은 클래스가 무시되고, 겹쳐야 할 레이어가 자동 배치로 흩어진다.
- 그 결과 `실제 대형 봉투 사이즈 예시` 카드와 `수거 가능/불가능` 일러스트가 원본보다 어긋나 보인다.

## 작업 계약

- In scope:
  - `실제 대형 봉투 사이즈 예시` 섹션 레이아웃 복구
  - 같은 grid shorthand를 쓰는 `BagIllustrations` 레이어 복구
  - 로컬 build/lint 및 모바일 스크린샷 재검증
- Out of scope:
  - 문구/카피 변경
  - 다른 섹션 구조 개편
  - 배포/운영 반영
- Done means:
  - 로컬 모바일 캡처 기준으로 사이즈 예시 카드와 수거 일러스트가 원본 배치와 동일하게 보인다.
  - `npm run build`, `npm run lint`가 통과한다.
- Verification:
  - `npm run build`
  - `npm run lint`
  - `http://127.0.0.1:3307/` 모바일 캡처
- Risks:
  - 수동 배치 이미지가 많은 구간이라 부분 수정으로 다른 레이어가 어긋날 수 있다.

## 구현 계획

### 단계별 작업

- [x] 원본/이관본 UI 캡처 비교
- [x] 원인 확인: Tailwind 4 grid shorthand 사용
- [x] `Landing.tsx`, `BagIllustrations.tsx`를 Tailwind 3 호환 클래스로 교체
- [x] 로컬 build/lint 재검증
- [x] 로컬 모바일 스크린샷으로 복구 확인
- [x] PR 생성

## 변경 파일

- `apps/public/large-coveringbag-order/src/screens/Landing.tsx`
- `apps/public/large-coveringbag-order/src/components/BagIllustrations.tsx`
- `works/plan/2026-04-23-covering-labs-large-bag-layout-regression-fix.md`

## 검증 기록

- `npm run build`
  - 결과: 통과
- `npm run lint`
  - 결과: 통과
- `Chromium --headless ... http://127.0.0.1:3307/`
  - 결과: `실제 대형 봉투 사이즈 예시`와 `수거 가능/불가능` 일러스트가 원본 `figma-26q2` 캡처와 같은 배치로 복구됨
  - 결과: `봉투에 담아서 손잡이 꼭 묶기` 설명 문구 줄바꿈을 `담겨야 하고` 뒤에서 고정했고, `3배` 텍스트 뒤 파란 측정선이 비치지 않도록 흰 배경으로 정리함

## PR

- `#112` `fix: restore large bag size example layout`

## 완료 기준

- 랜딩 핵심 일러스트 구간이 원본과 같은 시각 구조로 돌아온다.
- 회귀 원인이 코드와 문서에 남아서 같은 Tailwind 4 shorthand가 다시 들어와도 바로 잡을 수 있다.
