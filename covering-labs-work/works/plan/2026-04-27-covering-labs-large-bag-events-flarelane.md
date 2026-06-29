# 대형 커버링 봉투 이벤트 계측 플랜

> 유형: 플랜
> 작성일: 2026-04-27
> 상태: 완료

## 목표

대형 커버링 봉투 랩스 화면에서 기존 80L 봉투와 같은 제품 구매 이벤트 네이밍 컨벤션을 사용하고, FlareLane에도 핵심 퍼널 이벤트를 적재한다.

## 현황 분석

- 기존 랩스 화면은 `[ROUTE] RequestLargeCoveringBag` 중심으로 계측되어 제품 구매 퍼널 이벤트와 연결하기 어렵다.
- 대형 폐기물 결제 전에는 대형 커버링 봉투 화면 인지가 필요하므로, `ProductPurchaseScreen` 진입 여부를 명확히 측정해야 한다.
- FlareLane API 키는 클라이언트에 노출하면 안 되므로 서버 프록시 또는 제출 API에서 전송해야 한다.

## 구현 계획

- 랩스 진입/완료 화면 이벤트를 `[ROUTE] ProductPurchaseScreen`, `[ROUTE] ProductPurchaseCompleteScreen`으로 정리한다.
- 신청 결과 이벤트는 `[EVENT] ProductPurchaseResult`로 성공, 최근 신청 차단, 일반 오류를 구분한다.
- 클라이언트 route 이벤트는 `/api/flarelane-track` 프록시를 통해 FlareLane으로 보낸다.
- 신청 결과 이벤트는 `/api/submit` 서버 처리 결과 기준으로 FlareLane에 보낸다.
- 최근 신청 사전 확인에서 차단된 경우도 `/api/check-recent` 서버 처리 결과 기준으로 FlareLane에 보낸다.
- FlareLane 전송 데이터에서 이름, 전화번호, 주소 등 개인정보성 필드는 제외한다.

## 변경 파일

- `apps/public/large-coveringbag-order/src/lib/analytics.ts`
- `apps/public/large-coveringbag-order/src/server/flarelane.ts`
- `apps/public/large-coveringbag-order/app/api/flarelane-track/route.ts`
- `apps/public/large-coveringbag-order/app/api/check-recent/route.ts`
- `apps/public/large-coveringbag-order/app/api/submit/route.ts`
- `apps/public/large-coveringbag-order/src/api/sheets.ts`
- `apps/public/large-coveringbag-order/src/screens/Landing.tsx`
- `apps/public/large-coveringbag-order/src/screens/Complete.tsx`

## 완료 기준

- `npm run build`가 성공한다.
- 운영 환경에는 `NEXT_PUBLIC_MIXPANEL_TOKEN`, `FLARELANE_PROJECT_ID`, `FLARELANE_API_KEY`가 설정되어 있어야 한다.
