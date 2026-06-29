# disposal-guide 모바일 스크롤 + 네비게이션 정리

> 유형: 플랜
> 작성일: 2026-04-29
> 상태: 완료

## Goals
- iOS Safari를 포함한 모바일 환경에서 짧은 컨텐츠 화면의 불필요한 스크롤 제거
- 긴 컨텐츠 화면의 정상 스크롤 동작은 유지
- 디바이스 viewport에 정확히 맞춰지는 레이아웃 동작 확보
- 브라우저/디바이스 native 뒤로가기·닫기로 네비게이션 일원화 (custom 상단 바 제거)
- 인트로 히어로 이미지 SVG 교체

## Current Status Analysis
disposal-guide 앱이 모바일 기기 높이에 따라 불필요한 스크롤이 발생. 컨텐츠가 짧아 디바이스 높이에 충분히 들어가는 경우에도 스크롤 가능 영역이 생김.

원인: 레이아웃 wrapper들이 `min-h-screen`(= `min-height: 100vh`)을 사용하는데, iOS Safari에서 `100vh`는 주소창 영역까지 포함한 큰 값을 반환 → 컨텐츠 높이가 실제 viewport보다 커져 스크롤이 발생.

또한 각 단계 화면 상단에 자체 뒤로가기·닫기 버튼이 있는 헤더 영역(h-14)이 있었으나, 브라우저/디바이스 자체 네비게이션과 중복되어 시각적 노이즈가 됨.

## Implementation Plan (Phase-by-Phase Tasks)

### Phase 1. viewport 단위 교체 (`vh` → `dvh`)

| 위치 | Before | After |
|---|---|---|
| `DisposalGuideApp.tsx` outer/inner wrapper | `min-h-screen` | `min-h-dvh` |
| 각 screen wrapper (Intro/Category/RadioList/ItemDescription/LengthSlider/Result) | `min-h-screen` | `min-h-dvh` |
| `globals.css` body | `min-height: 100vh` | `min-height: 100dvh` |

`dvh`(dynamic viewport height)는 모바일 브라우저 주소창 표시/축소에 따라 실제 가용 높이로 동적으로 갱신됨.

### Phase 2. 인트로 이미지 SVG 교체

- `public/intro-illust.png` 제거
- `public/noticeBoardGraphic.svg` 추가 (4KB, viewBox 80x80)
- `IntroScreen.tsx` `<Image>` src 변경 + `unoptimized` prop 추가 (Next.js SVG 최적화 우회)

### Phase 3. 상단 바 영역 제거 + 브라우저 history 연동

- 헤더가 있던 5개 screen(Category/RadioList/ItemDescription/LengthSlider/Result)에서 h-14 헤더 div, BackIcon/CloseIcon helper, onBack/onClose props 제거 (IntroScreen은 원래 헤더 없음)
- `DisposalGuideApp.tsx`:
  - `push()`에서 `window.history.pushState({}, '')` 호출
  - `popstate` 이벤트 리스너 → 내부 history pop & state 복원
  - `pushDepthRef`로 push 횟수 추적
  - `handleRestart`에서 `window.history.go(-depth)`로 누적 entries 정리
  - `isPoppingRef` 가드 + 100ms fallback timeout으로 race 방지
- 각 screen outer wrapper에 `pt-[env(safe-area-inset-top,0px)]` 추가 (PWA fullscreen 시 status bar 영역)
- 결과 화면 닫기는 BottomBar "처음부터 다시 하기"로만 가능

### Phase 4. 회귀 확인
- 짧은 컨텐츠 화면(IntroScreen)에서 스크롤바 발생 안 함
- 긴 컨텐츠 화면(ResultScreen content phase) 정상 스크롤 유지
- 브라우저 back으로 단계별 back 동작
- 처음부터 다시 하기 후 브라우저 history 깨끗이 정리됨

## Completion Criteria
- [x] `npx tsc --noEmit` 0건
- [x] `npx jest` 68/68 통과
- [x] 모든 `min-h-screen` 사용처 → `min-h-dvh` 교체 완료
- [x] `globals.css` body `100vh` → `100dvh` 교체 완료
- [x] 인트로 이미지 SVG 교체 완료
- [x] 5개 screen 상단 바 제거 + 브라우저 history 연동 완료
- [x] 로컬 dev 서버에서 모바일 viewport 시각 확인 완료 (사용자 QA)
- [x] CodeRabbit 리뷰 코멘트 반영 (replaceState → history.go, isPoppingRef race fallback)

## 주의
- BottomBar의 fixed positioning 및 spacer 높이는 변경하지 않음
- `dvh`는 iOS 15.4+, Chrome 108+ 지원 — covering-labs 타겟 브라우저 범위 안
