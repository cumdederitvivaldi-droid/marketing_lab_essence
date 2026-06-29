# covering-invite Vercel → covering-labs 마이그레이션

> 유형: PRD
> 작성일: 2026-04-22
> 상태: 검토중

## 목표

Vercel에 배포된 친구초대 페이지(covering-invite)를 covering-labs public VM으로 이전한다.
Vite + React SPA → Next.js App Router로 전환하고, 불필요한 코드를 정리한다.

## 현황 분석

### 기존 기술스택 (Vercel)

- Vite + React 19 + Tailwind CSS v4
- Vercel Serverless Functions (api/*.js)
- vercel.json rewrites로 SSR 메타 주입

### 기존 라우팅

| URL | 동작 |
|---|---|
| `/invite/share` | 초대자 페이지 (OG 메타 SSR) |
| `/r/:inviteCode` | 피초대자 랜딩 (OG 메타 SSR) |
| `/` | SPA 기본 진입 (초대자 프리뷰) |

### 외부 연동

- Airbridge API (트래킹 링크 생성) — `AIRBRIDGE_TOKEN`
- Kakao JS SDK (공유) — `VITE_KAKAO_JAVASCRIPT_KEY`

### 정적 에셋

- `/assets/figma/` — 섹션 이미지 (PNG, SVG)
- `/fonts/` — Pretendard woff2

## 구현 계획

### 전환 대상 (Next.js App Router)

**페이지:**
- `app/invite/share/page.tsx` — 초대자 페이지 + `generateMetadata()`
- `app/r/[inviteCode]/page.tsx` — 피초대자 페이지 + `generateMetadata()`
- `app/page.tsx` — 기본 진입 (초대자 프리뷰)

**API 라우트:**
- `app/api/referral-link/route.ts` — Airbridge 트래킹 링크 (기존 api/referral-link.js)

**컴포넌트:**
- `components/ReferralInviter.tsx` — 초대자 화면
- `components/ReferralInvitee.tsx` — 피초대자 화면
- `components/ReferralRouteState.tsx` — 에러 상태 화면

**유틸:**
- `utils/referralMeta.ts` — 메타 빌더
- `utils/analytics.ts` — Mixpanel 이벤트 트래킹 (7개 이벤트)

### 코드 다이어트 (제거 완료)

- `api/referral-og/route.ts` + `buildReferralOgSvg()` — OG SVG 동적 생성 → 정적 PNG로 교체
- `ReferralFigmaGraphics.tsx` — img 래퍼 컴포넌트 → 인라인화
- `param()` / `SearchParams` 중복 — utils/types.ts로 통합
- `NEXT_PUBLIC_REFERRAL_SUPPORT_URL` — 환경변수 → 상수 하드코딩

### 환경변수

위치: public VM `/shared/apps/covering-invite/.env`

| 변수 | 용도 | 세팅 |
|---|---|---|
| `AIRBRIDGE_TOKEN` | Airbridge 트래킹 링크 API 인증 | ✅ 완료 (2026-04-23) |
| `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY` | 카카오 SDK 초기화 | ✅ 완료 (2026-04-23) |

> 카카오 개발자 콘솔 — `public-labs.covering.app` 도메인 등록 완료 (2026-04-23)
| `NEXT_PUBLIC_MIXPANEL_TOKEN` | Mixpanel 이벤트 트래킹 | ✅ 완료 (2026-04-23) |

## 완료 기준

- [x] `npm run build` 성공
- [ ] 초대자 페이지 정상 렌더링 (`/invite/share`)
- [ ] 피초대자 페이지 정상 렌더링 (`/r/:code`)
- [x] OG 메타 태그 정상 생성 (정적 PNG로 전환)
- [ ] Kakao 공유 동작 (카카오 키 세팅 후 확인)
- [ ] Airbridge 트래킹 링크 생성 동작 (토큰 세팅 후 확인)
- [x] PR 생성 및 코드 리뷰 반영

## 배포 전환 계획

1. covering-labs PR 머지 → `public-labs.covering.app/covering-invite/` 배포
2. 동작 확인 완료 후 기존 Vercel 배포 종료
