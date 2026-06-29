# Disposal Guide BottomBar Keyboard QA Fix

> 유형: 플랜
> 작성일: 2026-05-14
> 상태: 검토중

## 목표

iOS 인앱 WKWebView에서 `ItemDescriptionScreen` 자동 포커스 후 키보드가 올라올 때 BottomBar CTA가 viewport 밖으로 사라지지 않게 한다.

## 범위

- 이 작업은 ENG-3061 QA 추가 이슈 1인 BottomBar 키보드 offset 보정만 다룬다.
- 변경 대상은 `BottomBar`, `useKeyboardOffset`, 관련 계산 테스트다.
- ENG-3061의 다른 요구사항인 추천 로직, 결과 화면 UI, 피드백 테이블 경로 수정은 이 PR 범위에 포함하지 않는다.

## 현황 분석

- `BottomBar`는 `position: fixed`와 `bottom: keyboardOffset`으로 키보드 위 배치를 시도한다.
- `useKeyboardOffset`은 `window.innerHeight - visualViewport.height - visualViewport.offsetTop`을 그대로 반환한다.
- WKWebView 호스트가 WebView frame을 줄이거나 contentInset/input accessory bar가 섞이면 offset이 과대 계산될 수 있다.
- 과대 offset이 그대로 들어가면 CTA가 키보드 위가 아니라 화면 위쪽 밖으로 이동할 수 있다.

## 구현 계획

1. keyboard offset 계산을 순수 함수로 분리하고 회귀 테스트를 추가한다. 완료
2. `BottomBar`가 측정한 floating 카드 높이를 hook에 전달한다. 완료
3. raw offset은 유지하되, BottomBar top이 visual viewport 위로 벗어나지 않도록 상한을 둔다. 완료
4. `ItemDescriptionScreen` 플로우를 WebKit에서 확인한다. 완료

## 변경 파일

- `apps/public/disposal-guide/src/hooks/useKeyboardOffset.ts`
- `apps/public/disposal-guide/src/hooks/useKeyboardOffset.test.ts`
- `apps/public/disposal-guide/src/components/BottomBar.tsx`
- `works/plan/2026-05-14-covering-labs-disposal-guide-bottom-bar-keyboard.md`

## QA 기록

- peer 검토: raw offset 유지 + BottomBar 실제 높이 기반 clamp 방향 합의, 첫 프레임 race 방어를 위해 layout effect 측정 보강
- 단위 테스트: 정상 raw offset, 과대 offset clamp, `offsetTop` 처리, custom margin, oversized element, legacy raw 동작, 비정상 viewport 값 방어 확인
- WebKit QA: `ItemDescriptionScreen`에서 `건너뛰기` BottomBar 좌표 측정
  - baseline: `top 770 / bottom 844`
  - normal keyboard resize: `top 446 / bottom 520`
  - offsetTop keyboard: `top 526 / bottom 600`
  - overestimated keyboard offset: `top 8 / bottom 82`

## 완료 기준

- `npm run typecheck` 통과
- `npm run lint` 통과
- `npm test -- --runInBand` 통과
- `npm run build` 통과
- WebKit QA: 일반 viewport, 키보드 축소 시뮬레이션, 과대 offset 시뮬레이션에서 BottomBar CTA가 viewport 안에 남는지 확인
