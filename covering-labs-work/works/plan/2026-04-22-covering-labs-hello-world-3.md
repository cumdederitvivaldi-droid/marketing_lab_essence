# hello-world-3 앱 추가 플랜

> 유형: 플랜
> 작성일: 2026-04-22
> 상태: 완료

## 목표

`apps/public/hello-world-3/` 에 Next.js 앱을 생성하여 `covering-labs-public` VM에 공개 배포한다.
접속 주소: `https://public-labs.covering.app/hello-world-3`

## 현황 분석

- `apps/public/hello-world-2/` 가 이미 존재하며 동일한 구조로 배포 중
- public 앱은 nextjs/nestjs 타입만 허용 (batch 금지)
- 외부 공개용이므로 VPN 불필요

## 구현 계획

### 단계별 작업

- [x] works/plan PRD 생성
- [x] `apps/public/hello-world-3/` 디렉토리 생성
- [x] 필수 파일 생성 (deploy.yml, package.json, tsconfig.json, tailwind, postcss, app/*)
- [x] README.md 작성
- [x] 브랜치 생성 + 커밋
- [x] push + PR 생성 (#100)
- [x] PR 머지 + GitHub Actions 배포 성공

## 변경 파일 목록

- `works/plan/2026-04-22-covering-labs-hello-world-3.md` (신규)
- `apps/public/hello-world-3/deploy.yml` (신규)
- `apps/public/hello-world-3/package.json` (신규)
- `apps/public/hello-world-3/tsconfig.json` (신규)
- `apps/public/hello-world-3/tailwind.config.js` (신규)
- `apps/public/hello-world-3/postcss.config.js` (신규)
- `apps/public/hello-world-3/app/globals.css` (신규)
- `apps/public/hello-world-3/app/layout.tsx` (신규)
- `apps/public/hello-world-3/app/page.tsx` (신규)
- `apps/public/hello-world-3/README.md` (신규)
- `AGENTS.md` (수정 — public VM SA 유저 문서화)

## 완료 기준

- [x] `https://public-labs.covering.app/hello-world-3` 접속 가능 (HTTP 200)
- [x] GitHub Actions 배포 성공
- [x] PM2 online 확인

## 배포 후 발견된 장애 및 조치

### 원인
`covering-labs-public` VM의 `/shared/` 소유자가 잘못 설정되어 GitHub Actions SCP 실패.

| 구분 | 문제 | 조치 |
|---|---|---|
| `/shared/` 소유자 | `root` 소유 → deploy SA 쓰기 불가 | `chown -R sa_102262643810051855747:covering-dev /shared/` |
| SA 유저 혼동 | AGENTS.md에 private VM SA(`sa_109369409955768144646`)만 문서화 | public VM SA(`sa_102262643810051855747`)를 AGENTS.md에 추가 |
| PM2 startup | VM 재부팅 시 앱 자동 복구 미설정 | `pm2 startup systemd` + `pm2 save` 설정 |
| 홈 디렉토리 | `sa_102262643810051855747` 홈 없음 | `mkhomedir_helper` 실행 |
| `undeploy-app.sh` | 실행권한 없음 (`-rw-r--r--`) | `chmod +x /shared/scripts/undeploy-app.sh` |
