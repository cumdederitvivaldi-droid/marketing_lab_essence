# covering-spot

커버링 방문수거 마케팅 단일 웹사이트 (Next.js)

## 목적

대형폐기물 수거 서비스 "커버링"의 브랜드 소개 및 유입 랜딩 페이지. 홈에서 서비스·가격·후기를 보여주고, 모든 CTA는 카카오톡 채널로 연결되어 문의·예약을 받는다.

## 실행 환경

- **런타임**: Next.js 16 (App Router) + React 19
- **호스팅**: 임의의 Node/Next 서버 (Vercel 또는 자체 인스턴스). 빌드 후 `npm start` 로 구동 가능
- **폰트**: Pretendard (`public/fonts/` local font)

## 주요 파일

| 파일 | 역할 |
|------|------|
| `src/app/page.tsx` | 홈페이지 — Hero, TrustBar, ItemsCarousel, Process, Pricing, ItemPrices, Compare, FAQ, CTASection 조합 |
| `src/app/booking/page.tsx` | `/booking` 접근 시 카카오 안전 브릿지(`/kakao`)로 server-side redirect |
| `src/app/kakao/page.tsx` | Android WebView에서 Kakao `/chat` 직접 진입을 피하는 상담 브릿지 |
| `src/app/api/og/route.tsx` | OG 이미지 동적 생성 (edge runtime) |
| `src/app/layout.tsx` | 전역 메타데이터, AnalyticsProvider, ExperimentProvider 연결 |
| `src/app/robots.ts`, `sitemap.ts` | SEO 메타 |
| `src/components/sections/` | 홈 섹션 컴포넌트 (Hero, Pricing, FAQ, Compare 등) |
| `src/components/layout/` | Nav, Footer, FloatingCTA |
| `src/components/ui/CTALink.tsx` | 모든 카카오 CTA 단일 진입점 — 클릭 시 Mixpanel `[CLICK] SpotHomeScreen_cta` + Meta Pixel `Lead` 이벤트 발생 |
| `src/components/analytics/AnalyticsProvider.tsx` | Mixpanel, Meta Pixel 스크립트 주입 + 페이지뷰/스크롤 뎁스 트래킹 |
| `src/lib/analytics.ts` | `track()` 함수 — Mixpanel로 이벤트 전송 |
| `src/lib/constants.ts` | `KAKAO_CHANNEL_URL`, `KAKAO_CHAT_URL`, `KAKAO_BRIDGE_PATH`, `KAKAO_BRIDGE_URL`, 사이트 메타 상수 |
| `src/lib/format.ts` | `formatPriceWon()` 가격 포맷 유틸 |
| `src/config/experiments.ts` + `src/contexts/ExperimentContext.tsx` | A/B 테스트 정의 및 variant 쿠키 기반 적용 |
| `src/data/` | 정적 마케팅 데이터 (price-data, carousel-items, faq-data, compare-data 등) |
| `scripts/deploy-prod.sh` | dev → main 머지 배포 스크립트 |


| 위치 | 하드코딩된 값 |
|------|---------------|
| `src/components/analytics/AnalyticsProvider.tsx` (`MIXPANEL_TOKEN`) | Mixpanel 프로젝트 토큰 |
| `src/components/analytics/AnalyticsProvider.tsx` (`META_PIXEL_ID`) | Meta Pixel ID |
| `src/lib/constants.ts` (`KAKAO_CHANNEL_URL`, `KAKAO_CHAT_URL`, `KAKAO_BRIDGE_PATH`, `KAKAO_BRIDGE_URL`) | 카카오톡 채널/상담/안전 브릿지 URL |
| `src/lib/constants.ts` (`SITE_URL`) | 프로덕션 도메인 |


## 의존 서비스

| 서비스 | 용도 | 연동 방식 |
|--------|------|-----------|
| Mixpanel | 이벤트 트래킹 | 클라이언트 JS SDK (토큰 하드코딩) |
| Meta Pixel | 광고 리타겟팅 / 전환 측정 | 클라이언트 fbq, Lead 이벤트 (ID 하드코딩) |
| 카카오톡 채널 | 고객 문의 · 예약 접수 | 내부 안전 브릿지(`/kakao`) 후 외부 URL 연결 |

## 주의사항

- **백엔드 없음**: 이 레포는 정적 랜딩 + OG 이미지만 서빙한다. 예약 접수, DB, 어드민, 배차, 결제 등은 별도 시스템(또는 사람 운영)이 담당. 새 기능 추가 시 "외부 연동만으로 되는가" 먼저 따져볼 것.
- **카카오 채널 URL 변경**: `src/lib/constants.ts`의 `KAKAO_CHANNEL_URL` 하드코딩. 채널 주소 변경 시 상수 업데이트 → 재배포.
- **Android WebView 안전 조건**: 홈 CTA와 `/booking`은 Kakao `/chat`로 직접 이동하지 않고 `/kakao` 브릿지를 거친다.
- **Meta Pixel Lead 이벤트**: `CTALink` 컴포넌트 클릭 시에만 발생. 새 CTA도 이 컴포넌트를 통해 추가해야 Lead 이벤트가 함께 발생.
- **정적 데이터**: `src/data/price-data.ts`, `faq-data.ts` 등 모든 콘텐츠는 코드에 인라인. 가격·FAQ 수정은 코드 수정 → 배포 사이클.
- **pretendard 폰트**: `public/fonts/`에 woff2 파일 직접 배치. npm 패키지는 쓰지 않는다.
- **A/B 테스트 확장**: 새 실험은 `src/config/experiments.ts`에 정의 → variant는 쿠키(`ab_<name>`)에 저장되어 `useExperiment()` 훅으로 조회.
- **트래킹 토큰 로테이션**: Mixpanel/Meta Pixel ID가 하드코딩이므로 변경 시 `AnalyticsProvider.tsx` 상수를 수정하고 배포해야 한다.
