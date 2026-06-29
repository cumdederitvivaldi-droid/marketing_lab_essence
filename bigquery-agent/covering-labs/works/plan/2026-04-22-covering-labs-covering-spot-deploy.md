# covering-spot 배포 준비 — Cursor Bot 이슈 해결

> 유형: 플랜
> 작성일: 2026-04-22
> 상태: 완료


## 배경

직전 커밋(`cf100c5`)에서 covering-spot 앱을 모노레포로 편입했지만, 원본 풀스택 프로젝트에서 단일 마케팅 웹으로 전환하는 과정에서 정리되지 않은 레거시 파일과 모노레포 배포 파이프라인 설정 누락이 발견됨.

Cursor Bot 리뷰 결과 5개 이슈:

| # | 심각도 | 파일 | 문제 |
|---|---|---|---|
| 1 | High | `apps/public/covering-spot/deploy.yml` | 파일 부재 → 모노레포 자동 배포 실패 |
| 2 | High | `apps/public/covering-spot/next.config.ts` | `basePath` 누락 → 서브경로 배포 시 모든 라우트/자산 404 |
| 3 | Medium | `apps/public/covering-spot/.claude-rules` | 다른 개발자 macOS 로컬 경로(`/Users/wjh/...`) 심볼릭 링크 노출 |
| 4 | Medium | `apps/public/covering-spot/next.config.ts` | `typescript.ignoreBuildErrors: true` → 프로덕션 빌드에서도 타입 오류 무시 (주석은 "로컬 빌드" 전용이라 명시하지만 실제는 전체 적용) |
| 5 | Low | `.github/workflows/*.yml`, `scripts/deploy-prod.sh` | 존재하지 않는 Supabase/BigQuery/Vercel/Python 스크립트 참조 (레거시 풀스택 잔재) |

**배포 대상 확정**: `https://public-labs.covering.app/covering-spot` (모노레포 public VM 서브경로).

## 목표

1. `apps/public/covering-spot/deploy.yml` 생성 → 루트 `scripts/deploy-app.sh` 가 `type: nextjs` 로 빌드/배포하도록 설정
2. 개인 정보 유출(`wjh` 사용자명, iCloud 경로) 제거
3. 동작 안 하는 레거시 워크플로우 전량 삭제 (covering-spot CLAUDE.md 문서 상태 "백엔드/DB/어드민 없음" 과 일치)

## 변경 사항

### 신규

- `apps/public/covering-spot/deploy.yml` — `name/description/type: nextjs`

### basePath 반영 + 타입체크 활성화 (High + Medium 이슈 해결)

- `next.config.ts` — `basePath: "/covering-spot"` 추가, `typescript.ignoreBuildErrors: true` 블록 제거 (타입 오류 0건 확인 후 안전 제거)
- `src/lib/constants.ts` — `BASE_PATH` 상수 추가, `SITE_URL` 을 `https://public-labs.covering.app/covering-spot` 로 변경
- `src/app/layout.tsx` — `metadata.metadataBase = new URL(SITE_URL)` 추가 (OG/manifest URL 자동 resolve + 빌드 경고 제거)
- `src/components/sections/Hero.tsx` — raw `<img src="/images/logo.png">` → `${BASE_PATH}` prefix
- `src/components/layout/Footer.tsx` — raw `<img>` 동일 처리
- `src/app/global-error.tsx` — raw `<a href="/">` → `href="/covering-spot/"` (RootError 바깥이라 `next/link` 쓸 수 없음)
- `public/manifest.json` — `start_url`/`scope`/`icons[].src` 에 `/covering-spot/` prefix

### 삭제

- `apps/public/covering-spot/.claude-rules` (깨진 심볼릭 링크, 개인 경로 노출)
- `apps/public/covering-spot/.github/workflows/deploy.yml` (Vercel 배포, 더 이상 사용 안 함)
- `apps/public/covering-spot/.github/workflows/deploy-dev.yml` (Vercel Dev 배포, dev 브랜치 없음)
- `apps/public/covering-spot/.github/workflows/sync-bookings.yml` (Supabase→BQ, 스크립트 없음)
- `apps/public/covering-spot/.github/workflows/cron-expire-short-quotes.yml` (API `/api/cron/...` 없음)
- `apps/public/covering-spot/.github/workflows/cron-pending-delay-alert.yml` (API `/api/cron/...` 없음)
- `apps/public/covering-spot/.github/workflows/cron-dhero-delay-alert.yml` (`scripts/monitor_pending_delays.py` 없음)
- `apps/public/covering-spot/scripts/deploy-prod.sh` (dev→main 병합 스크립트, 모노레포에서 불필요)
- `apps/public/covering-spot/vercel.json` (빈 `{}`, Vercel 배포 안 함)

## 검증

1. `git ls-files apps/public/covering-spot/` 확인 → 삭제 파일 모두 staged 상태
2. `apps/public/covering-spot/deploy.yml` 가 hello-world-2/3 와 동일한 포맷 (`type: nextjs`)
3. 로컬 clean build (`rm -rf .next && npm run build`) — exit 0, metadataBase 경고도 해소
4. release-file-guard 스킬로 민감 파일/레거시 잔재 최종 스크리닝
5. `git commit` 까지만 수행, PR/푸시는 사용자 명시 배포 키워드 후 진행

## 보류 사항 (이번 커밋 범위 밖)

- **`src/components/ui/AdminLogo.tsx`**: 어디서도 import 안 되고 `/admin/dashboard` 라우트도 앱에 없음 → 데드코드. basePath 미적용이지만 실제 로드 경로 없음. 별도 PR에서 삭제 권고.
- **`public/sw.js`**: service worker 등록 코드가 앱에 없음 → 현재 로드되지 않음. PWA 활성화 시 `/covering-spot/` scope 와 navigation 경로 정비 필요.

## 배포 이후 기대 동작

PR 머지 시 `.github/workflows/deploy.yml` 의 `deploy-public` 잡이 `apps/public/covering-spot/` 변경을 감지하고 `scripts/deploy-app.sh nextjs covering-spot` 을 호출 → covering-labs-public VM 에 PM2 로 배포, `https://public-labs.covering.app/covering-spot` 로 공개.
