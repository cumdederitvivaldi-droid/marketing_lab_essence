# disposal-guide BottomBar CTA 키보드 위로 띄우기

> 유형: 플랜
> 작성일: 2026-05-11
> 상태: 완료

## Goals
- 모바일에서 텍스트 입력 필드(`ItemDescriptionScreen`)에 포커스 시 소프트 키보드가 올라오면 `BottomBar` 의 CTA 버튼이 키보드에 가려지지 않고 위로 떠올라 항상 보이도록 한다.

## Current Status Analysis
- `BottomBar` 는 `position: fixed; bottom: 0` 으로 layout viewport 하단에 고정됨
- iOS Safari 의 fixed 요소는 layout viewport 기준이라 키보드가 올라오면 그 영역이 가려짐
- 사용자가 입력 도중 CTA(`작성 완료`, `건너뛰기`)를 누르려면 키보드를 닫아야만 보였음
- production 영향: `https://public-labs.covering.app/disposal-guide` 의 인용 단계

## Implementation Plan (Phase-by-Phase Tasks)

### Phase 1. `useKeyboardOffset` 훅 추가 (BottomBar 내부)
- `window.visualViewport` API 사용 (iOS 13+, Chrome Android 모두 지원)
- `resize` / `scroll` 이벤트로 키보드 높이 계산: `window.innerHeight - vv.height - vv.offsetTop`
- 키보드 닫힘 시 0, 열림 시 키보드 px 높이

### Phase 2. CTA 컨테이너 동적 `bottom` 적용
- 기존 `bottom-0` Tailwind 클래스 제거
- `` style={{ bottom: `${keyboardOffset}px` }} `` 로 동적 적용
- `transition-[bottom] duration-150 ease-out` 으로 부드러운 이동

## Completion Criteria
- [x] `useKeyboardOffset` 훅 작성
- [x] `BottomBar` 에서 동적 offset 적용
- [x] `npx tsc --noEmit` 0건
- [x] `npx jest` 75/75 통과
- [ ] iOS Safari / Chrome Android 실기기에서 input focus → CTA가 키보드 위로 부드럽게 이동하는지 확인 (사용자 QA)

## 주의
- UI 한정 수정. 서버·라우팅·데이터 로딩 변경 없음.
- BottomBar 가 사용되는 다른 화면(Intro/Category/Length/Result)에도 동일 동작 적용되나, 텍스트 입력이 있는 ItemDescription 외엔 키보드가 안 떠 offset 항상 0 → 변화 없음.
- `visualViewport` 미지원 구형 브라우저는 키보드 시 기존 동작(가려짐)으로 fallback.
