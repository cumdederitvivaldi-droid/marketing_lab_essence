# request-large-covering-bag — 대형 커버링 봉투 신청 안내 웹뷰

> 유형: PRD
> 작성일: 2026-05-10
> 상태: 초안

## 목적

커버링 앱에서 수거 신청 시 "대형 커버링 봉투(220L)"를 함께 신청할 때 노출되는
모달 웹뷰 화면을 Next.js 기반 public 사이트로 배포한다.

기존에 Figma Make로 작성된 정적 디자인 코드(Vite + React + Tailwind v4)를
covering-labs 표준(Next.js 14 App Router + Tailwind v3) 으로 컨버전하여
앱에서 `iframe` / `WebView` 형태로 임베드해 사용한다.

## 범위

- **단일 페이지** (`/request-large-covering-bag`)
- **모바일 기준** (`viewport: width=device-width, initial-scale=1`)
- 정적 화면 — 사용자 입력/네트워크 호출 없음
- 외부 API/DB 의존 없음

## 비범위

- 봉투 신청 비즈니스 로직 (앱 측에서 처리)
- 결제·배송 연동
- 다국어, 다크모드

## 출처(원본)

- 원본 zip: `/Users/seojahyeon/Downloads/RequestLargeCoveringBag.zip`
- 원본 진입점: `src/app/App.tsx` → `<MediumPickUpBagInstImg />` 한 컴포넌트만 렌더링
- **포함**: `MediumPickUpBagInstImg` (Contents + 안내 카드 + GoToProductPage 이미지)
- **제외**: `Frame1321315399`, `Frame1321315399-2001-81` (zip에 들어 있지만 진입점에서 import 되지 않은 미사용 시안 — 사용자 지시로 제거)
- **제외**: 사용되지 않은 shadcn UI 컴포넌트 전체 (`src/app/components/ui/*`)
- **제외**: MUI / Radix / motion 등 미사용 의존성

## 기술 스택

| 항목 | 값 |
|---|---|
| 프레임워크 | Next.js 14 (App Router) |
| 언어 | TypeScript |
| 스타일 | Tailwind CSS v3 (postcss + autoprefixer) |
| 폰트 | Pretendard Variable (CDN) |
| 배포 타입 | `nextjs` (public) |
| 디렉토리 | `apps/public/request-large-covering-bag/` |

## 변환 시 주요 결정사항

1. **Vite → Next.js 14**: `index.html` + `src/main.tsx` 제거, `app/layout.tsx` + `app/page.tsx`로 재구성
2. **Tailwind v4 → v3**: covering-labs 표준 따라 다운그레이드. `@theme inline`, `@custom-variant dark`, `oklch(...)` 등 v4 전용 문법 제거. 기존 컴포넌트는 인라인 hex 색상(예: `bg-[#eef2f6]`)을 사용하므로 색상 영향 없음
3. **`figma:asset/*` import → `public/` 경로**: `vite.config.ts`의 `figmaAssetResolver` 플러그인 의존성 제거. 이미지는 `public/figma-assets/318f1d1f5feb0cb4e2aec6bbf8c452c65e835a46.png` 로 이동, `<img src="/request-large-covering-bag/figma-assets/...png" />` 형태로 참조 (배포 스크립트가 `basePath`를 자동 적용)
4. **`@/` 별칭**: `tsconfig.json`의 `paths`에 `@/*: ["./*"]` 유지
5. **컴포넌트 위치**: `src/imports/` → `components/` 로 평탄화
6. **미사용 시안 삭제**: `Frame1321315399.tsx`, `Frame1321315399-2001-81.tsx`, `svg-pneinl4itg.ts`, `svg-rtnzz352sf.ts`, `src/assets/318...png` (중복) 제거
7. **`next.config.js`는 작성하지 않음** — 배포 스크립트가 `basePath`/`assetPrefix`를 자동 생성

## 디렉토리 구조 (목표)

```text
apps/public/request-large-covering-bag/
├── README.md
├── deploy.yml
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── next-env.d.ts
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── MediumPickUpBagInstImg/
│   │   ├── MediumPickUpBagInstImg.tsx
│   │   └── MediumPickUpBagInst_img.tsx
│   └── GoToProductPage1/
│       └── GoToProductPage1.tsx
└── public/
    └── figma-assets/
        └── 318f1d1f5feb0cb4e2aec6bbf8c452c65e835a46.png
```

## 의존성

**dependencies**
- `next ^14.2.0`
- `react ^18.3.0`
- `react-dom ^18.3.0`

**devDependencies**
- `@types/node`, `@types/react`, `typescript ^5`
- `tailwindcss ^3`, `postcss ^8`, `autoprefixer ^10`

> Figma Make zip의 다른 deps(MUI, Radix, motion, recharts 등)은 사용하지 않으므로 전부 제외.

## 환경변수

해당 사항 없음 (정적 페이지).

## 접속 URL

- public VM 배포 후 URL: `https://public-labs.covering.app/request-large-covering-bag`
- (앱 측 WebView/iframe `src` 로 사용)

## 검증 절차

1. `npm install`
2. `npx tsc --noEmit` — 오류 0건
3. `npm run build` — 성공
4. `npm run dev` 후 모바일 viewport에서 시각 확인 (선택)

## 배포

- 사용자 명시적 배포 키워드("배포해줘 / PR 올려줘 / push 해줘") 전까지 **로컬 커밋까지만** 진행
- 명시적 키워드 수신 후: 브랜치 push → `gh pr create` (PR 템플릿 + AI 라벨 + 변경 유형 라벨)

## 위험·주의사항

- 폴더명 = URL 경로 = 앱 식별자 → 한 번 정하면 변경 불가
- public VM은 site-to-site VPN 미연결 — 내부 AWS 리소스/Admin API 접근 불가 (이번 앱은 정적이라 영향 없음)
- 이미지 자산 경로는 `basePath` 적용 시 `/request-large-covering-bag/...` 로 prefix됨. 배포 후 한 번 실제 도메인에서 이미지 노출 확인 필요

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-05-10 | 초안 작성 |
| 2026-05-11 | CodeRabbit 리뷰 반영 — viewport 줌 허용(`userScalable: true`, `maximumScale: 5`), `lucide-react` 표준 의존성 추가, 헤더에서 title을 첫 줄로 이동 |
