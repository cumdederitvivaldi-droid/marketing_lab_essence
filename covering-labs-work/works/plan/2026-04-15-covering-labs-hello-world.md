# hello-world 웹사이트 플랜

> 유형: PRD
> 작성일: 2026-04-15
> 상태: 완료

## 목표

Next.js 기반의 간단한 Hello World 웹사이트를 생성하고 배포한다.

## 현황 분석

- 기존 앱: `hello-batch`, `hello-nextjs`, `_dashboard`, `_template`
- 새 앱 이름: `hello-world` (URL: `https://labs.covering.app/hello-world`)
- 타입: `nextjs` (화면이 있는 웹 페이지)

## 구현 계획

### 단계별 작업

- [x] works/plan PRD 문서 생성
- [x] `apps/hello-world/` 디렉토리 및 파일 생성
  - `deploy.yml`
  - `package.json`
  - `tsconfig.json`
  - `tailwind.config.js`
  - `postcss.config.js`
  - `app/globals.css`
  - `app/layout.tsx`
  - `app/page.tsx`
- [ ] 브랜치 생성 및 PR 제출 (사용자 요청 시)

## 변경 파일 목록

- `works/plan/2026-04-15-covering-labs-hello-world.md` (신규)
- `apps/hello-world/deploy.yml` (신규)
- `apps/hello-world/package.json` (신규)
- `apps/hello-world/tsconfig.json` (신규)
- `apps/hello-world/tailwind.config.js` (신규)
- `apps/hello-world/postcss.config.js` (신규)
- `apps/hello-world/app/globals.css` (신규)
- `apps/hello-world/app/layout.tsx` (신규)
- `apps/hello-world/app/page.tsx` (신규)

## 완료 기준

- `apps/hello-world/` 파일 구성 완료
- Hello World 텍스트가 화면에 표시되는 Next.js 페이지
- `https://labs.covering.app/hello-world` 로 접근 가능 (배포 후)
