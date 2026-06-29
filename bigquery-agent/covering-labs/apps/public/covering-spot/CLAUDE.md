# CLAUDE.md — covering-spot

## 프로젝트 개요
- 커버링스팟 **마케팅 단일 웹사이트** (Next.js 16 / React 19)
- 홈페이지 + 카카오톡 리다이렉트 (`/booking` → `KAKAO_CHAT_URL`)
- 백엔드/DB/어드민/예약 폼 전부 없음. 고객 문의는 카카오톡으로 일원화
- 애널리틱스: **Mixpanel + Meta Pixel (Lead 이벤트)** — 토큰/ID 모두 코드에 하드코딩 (공개 ID)
- GitHub: https://github.com/beige-ian/covering-spot

## 구조
- `src/app/page.tsx` — 홈 (Hero, TrustBar, Pricing, ItemsCarousel, Process, ItemPrices, Compare, FAQ, CTASection)
- `src/app/booking/page.tsx` — 카카오톡 채널 redirect
- `src/app/api/og/route.tsx` — OG 이미지 (edge runtime)
- `src/app/robots.ts`, `sitemap.ts`
- `src/app/layout.tsx` — Pretendard 폰트, AnalyticsProvider, ExperimentProvider
- `src/components/{sections,layout,ui,analytics}`
- `src/data/` — 정적 마케팅 데이터 (price-data, compare-data, faq-data 등)
- `src/lib/` — `analytics.ts`, `constants.ts`, `format.ts` (3개만)
- `src/config/experiments.ts` + `src/contexts/ExperimentContext.tsx` — A/B 테스트

## 환경변수
없음. 모든 트래킹 ID 하드코딩:
- Mixpanel Token / Meta Pixel ID: `src/components/analytics/AnalyticsProvider.tsx` 상단 상수
- Kakao 채널 URL / 사이트 도메인: `src/lib/constants.ts`

## 배포
1. dev 브랜치에서 작업 → commit → push (Dev 자동 배포)
2. `bash scripts/deploy-prod.sh` 실행 (dev → main 머지)
- main 직접 push 금지 (pre-push hook 차단)

## 새 기능 추가 체크리스트
- 백엔드 없이 클라이언트만으로 해결 가능한가?
- 카카오 CTA 추가 → `CTALink` 컴포넌트 통해 연결 (자동으로 Lead 이벤트 발생)
- 새 페이지 추가 시 `sitemap.ts` 갱신
- 콘텐츠(가격/FAQ) 수정 → `src/data/*.ts` 직접 편집
- A/B 테스트 → `src/config/experiments.ts` 정의 + `useExperiment()` 훅 사용
