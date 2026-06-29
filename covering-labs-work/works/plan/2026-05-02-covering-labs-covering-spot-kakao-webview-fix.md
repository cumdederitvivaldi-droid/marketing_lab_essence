# 방문수거 카카오 상담 CTA WebView 재수정 플랜

> 유형: 플랜
> 작성일: 2026-05-02
> 상태: 완료

## 목표

Galaxy Z Fold5 등 Android WebView에서 방문수거 카카오 상담 CTA가 Kakao `/chat` 브릿지를 직접 열며 `intent://` 계열 외부 앱 scheme으로 실패하는 경로를 제거한다.

## 현황 분석

- 직전 배포는 CTA의 `_blank` 새 창 조건만 제거했다.
- covering-spot CTA와 `/booking` 경로는 여전히 `https://pf.kakao.com/_bxgWhX/chat`로 직접 이동한다.
- bulk30 페이지는 covering-spot 유입 경로이며, 실제 위험 지점은 covering-spot 카카오 상담 CTA다.

## 구현 계획

- covering-spot 내부 안전 브릿지 페이지를 추가한다.
- 홈 CTA와 `/booking` redirect를 모두 안전 브릿지로 보낸다.
- Android 환경에서는 Kakao `/chat`로 자동 이동하지 않고 채널 페이지/복사 fallback을 제공한다.
- 직접 CTA 회귀를 막는 테스트를 추가한다.

## 변경 파일

- `apps/public/covering-spot/src/components/ui/CTALink.tsx`: 홈 CTA 목적지를 Kakao `/chat`에서 `/covering-spot/kakao`로 변경
- `apps/public/covering-spot/src/app/booking/page.tsx`: 기존 `/booking` 경로도 안전 브릿지로 redirect
- `apps/public/covering-spot/src/app/kakao/page.tsx`, `src/components/kakao/KakaoBridgeClient.tsx`: Android WebView 안전 브릿지 추가
- `apps/public/covering-spot/tests/kakao-webview-regression.test.mjs`: 직접 Kakao chat 회귀 테스트 추가

## 완료 기준

- CTA 렌더링과 `/booking`이 Kakao `/chat`를 직접 가리키지 않는다.
- Android 환경 브릿지는 자동으로 Kakao `/chat`로 이동하지 않는다.
- `npm run test`, `npm run typecheck`, `npm run build`가 통과한다.
