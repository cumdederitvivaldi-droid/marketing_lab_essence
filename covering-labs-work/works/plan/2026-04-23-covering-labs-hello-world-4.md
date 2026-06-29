# hello-world-4 앱 추가 플랜

> 유형: 플랜
> 작성일: 2026-04-23
> 상태: 완료

## 목표

`apps/public/hello-world-4/` 에 Next.js 앱을 생성하여 `covering-labs-public` VM에 공개 배포한다.
접속 주소: `https://public-labs.covering.app/hello-world-4`

## 현황 분석

- `apps/public/hello-world-3/` 가 이미 존재하며 동일한 구조로 배포 중
- public 앱은 nextjs/nestjs 타입만 허용 (batch 금지)
- 외부 공개용이므로 VPN 불필요

## 구현 계획

### 단계별 작업

- [x] works/plan PRD 생성
- [x] `apps/public/hello-world-4/` 디렉토리 + 필수 파일 생성
- [x] README.md 작성
- [x] 빌드 확인
- [x] 브랜치 생성 + 커밋
- [x] push + PR 생성 (#110)

## 변경 파일 목록

- `works/plan/2026-04-23-covering-labs-hello-world-4.md` (신규)
- `apps/public/hello-world-4/deploy.yml` (신규)
- `apps/public/hello-world-4/package.json` (신규)
- `apps/public/hello-world-4/tsconfig.json` (신규)
- `apps/public/hello-world-4/tailwind.config.js` (신규)
- `apps/public/hello-world-4/postcss.config.js` (신규)
- `apps/public/hello-world-4/app/globals.css` (신규)
- `apps/public/hello-world-4/app/layout.tsx` (신규)
- `apps/public/hello-world-4/app/page.tsx` (신규)
- `apps/public/hello-world-4/README.md` (신규)

## 완료 기준

- [ ] `https://public-labs.covering.app/hello-world-4` 접속 가능
- [ ] GitHub Actions 배포 성공
- [ ] PM2 online 확인
