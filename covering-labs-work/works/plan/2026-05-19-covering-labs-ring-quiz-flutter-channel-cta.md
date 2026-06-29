# 링퀴즈 최종 CTA 앱 이동 처리 플랜

> 유형: 플랜
> 작성일: 2026-05-19
> 상태: 완료

## 목표

링퀴즈 결과 화면의 최종 CTA 클릭 시 앱 웹뷰에서 `FlutterChannel` 메시지를 보내 앱 화면 이동을 트리거한다. 일반 브라우저에서는 기존 동작이 깨지지 않게 유지한다.

## 현황 분석

- `ResultScreen`은 방문수거 CTA는 부모 `onCta`로 넘기고, 봉투 CTA는 웹뷰 종료 유틸을 호출한다.
- 앱에서 필요한 계약은 `{ "action": "RING_QUIZ_CTA", "ctaType": ... }` 문자열 메시지다.
- 일반 봉투 추천 결과가 `GENERAL_BAG_SINGLE`, `GENERAL_BAG_MULTIPLE`로 나뉘어 있어 둘 다 앱 계약의 `COVERING_BAG`으로 매핑해야 한다.

## 구현 계획

- [x] `Window.FlutterChannel` 타입 선언을 추가한다.
- [x] 추천 결과별 CTA 타입 매핑과 메시지 발송 유틸을 추가한다.
- [x] 결과 CTA 클릭 시 FlutterChannel 발송이 성공하면 기존 URL/닫기 fallback을 실행하지 않도록 한다.
- [x] FlutterChannel이 없는 일반 브라우저에서는 기존 방문수거 URL, 봉투 웹뷰 종료 fallback을 유지한다.
- [x] 타입체크와 관련 테스트를 실행한다.

## 완료 기준

- 일반 봉투 CTA는 `ctaType: "COVERING_BAG"` 메시지를 보낸다.
- 대형 봉투 CTA는 `ctaType: "LARGE_COVERING_BAG"` 메시지를 보낸다.
- 카카오톡 견적 CTA는 `ctaType: "VISIT_PICKUP"` 메시지를 보낸다.
- 일반 브라우저에서는 `FlutterChannel`이 없어도 오류가 나지 않는다.

## 변경 파일

- `apps/public/disposal-guide/global.d.ts`: `Window.FlutterChannel` 타입 선언 추가.
- `apps/public/disposal-guide/src/lib/ringQuizCtaBridge.ts`: 추천 결과별 CTA 타입 매핑과 FlutterChannel 메시지 발송 유틸 추가.
- `apps/public/disposal-guide/src/lib/ringQuizCtaBridge.test.ts`: CTA 타입 매핑, JSON 메시지, 브라우저 fallback 테스트 추가.
- `apps/public/disposal-guide/src/screens/ResultScreen.tsx`: 최종 CTA 클릭 시 FlutterChannel 메시지를 먼저 보내고, 없을 때만 기존 fallback 실행.

## 검증 결과

- `npm run typecheck` 통과.
- `npm test -- ringQuizCtaBridge.test.ts closeDisposalGuide.test.ts --runInBand` 통과. 2개 suite, 14개 test 통과.
- `npm test -- --runInBand` 통과. 14개 suite, 170개 test 통과.
- `npm run lint` 통과.
- `npm run build` 통과.
