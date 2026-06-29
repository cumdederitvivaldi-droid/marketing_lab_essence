# covering-spot-chatbot public VM 배포 전환 PRD

> 유형: PRD
> 작성일: 2026-05-08
> 상태: 진행중

## 진행 현황 (2026-05-08)

| Phase | 작업 | 상태 |
|---|---|---|
| 0 | 임베디드 `.git` 제거, `.env.local.example`→`.env.example` 이름 변경, 7개 참조 보정, 앱 `.gitignore` 정리 | ✅ |
| 1 | `vercel.json`, `.vercelignore`, `public/vercel.svg` 제거 | ✅ |
| 2 | `deploy.yml` 생성, README 기술스택·배포 섹션 갱신 | ✅ |
| 3 | `lib/api-base.ts` 신규 (apiUrl + fetch interceptor), `next.config.ts` basePath, 9 파일 17건 redirect/location 보정, `middleware.ts` 2건 | ✅ |
| 4 | Vercel Cron 비활성화 — vercel.json 제거로 자동 처리됨 (cron 라우트 코드는 보존) | ✅ |
| 5 | `apps/AGENTS.md` + `apps/CLAUDE.md` 의 env 레지스트리에 covering-spot-chatbot 전용 47개 변수 등록 | ✅ |
| 6 | 로컬 빌드 검증 — `react-is` 추가 + 실값 env 제거 → **73 라우트 빌드 성공, 25초, Error/Warning 0** | ✅ |
| 7 | 커밋 + 사용자 배포 키워드 대기 | ⏳ |

## 추가로 발견된 이슈 (해결 완료 / 보류)

| 이슈 | 처리 |
|---|---|
| `recharts@3.7 + React 19` 가 `react-is` peerDependency 누락 → 빌드 실패 | ✅ `react-is@^19.0.0` 명시적 dependency 추가 |
| `.env.local`(6.6KB 실값), `.env.local.test`, `.env.vercel`, `.env.vercel.check` 가 빌드 시 자동 로드되어 secret inline 위험 | ✅ 4개 파일 모두 삭제 (사용자 1Password 백업 완료) |
| Next 16 에서 `middleware` 파일 deprecated → `proxy` 권장 | ⚠️ 경고만, 동작 유지. **후속 PR 에서 마이그레이션** |
| 임베디드 `.git/` 으로 인해 git 이 디렉토리 1개만 인식했던 초기 상태 | ✅ 제거 후 464개 파일 정상 추적 |

## 확정된 의사결정 (2026-05-08, 사용자 답변)

| 항목 | 결정 |
|---|---|
| **D1. Vercel Cron 14개** | 일단 비활성화 — `vercel.json` 제거, 14개 자동화 일시 정지. cron 라우트(`app/api/cron/**`) 코드는 보존. **별도 PR 에서 cron runner 구성 예정** |
| **D2. 운영 시나리오** | Vercel → covering-labs 완전 마이그레이션. 외부 콘솔(해피톡 / 채널톡 / NicePay / Bolta / 카카오 / Slack 등) 콜백 URL 은 사용자가 별도 갱신 |
| **D3. basePath** | 정공법(B-1) — `next.config.ts` 에 `basePath: '/covering-spot-chatbot'` 추가 + 하드코드 절대 경로 grep 후 보정. middleware 매칭 검증 |
| **D4. 동봉 자산** | `docs/` 는 동봉, `migrations/` · `scripts/backoffice-scraper/` · `tools/` 는 **제외** (커밋 대상에서 빼되 로컬 보관은 사용자 자율) |
| **D5. 환경변수 레지스트리** | 본 앱이 사용하는 ~47개 env 를 `apps/AGENTS.md` + `apps/CLAUDE.md` 레지스트리에 일괄 등록. 값은 PR 에 절대 포함하지 않음 (VM 에서 별도 주입) |
| **env 백업** | 1Password 등에 백업 완료 — Phase 0 안전 |

## 목표

Vercel 배포용으로 작성된 거대 Next.js 앱 `apps/public/covering-spot-chatbot/`을 covering-labs 의 public VM (`covering-labs-public`) 배포 시스템(GitHub Actions → `/shared/apps/` → PM2 + nginx + crontab) 위에서 안정적으로 동작시킬 수 있는 상태로 만든다.

환경변수 값 자체는 본 작업 범위에서 제외한다 (사용자가 별도로 `/shared/.env` 또는 앱 디렉토리 `.env`에 채워 넣을 예정). 본 작업은 코드/설정/구조 정합성만 책임진다.

## 현황 분석

### 앱 성격
- **4 도메인 통합**: 방문수거 / 런치 / 채널톡 / 신규 대시보드 (각 독립)
- **API 라우트 수**: `app/api/` 하위 36개 디렉토리 + 그 안에 다수 라우트 (README 기준 149개)
- **Vercel Cron 14개**: `vercel.json`에 11개 + 추가로 `brand-message-scheduler` / `brand-message-conversion` / `nps-daily` 가 `/api/cron/`에 존재 (총 14개)
- **인증**: `middleware.ts`로 전체 라우트 JWT 검증 (`/login`, `/api/auth/*`, `/api/webhook/*`, `/api/cron/*`만 공개)
- **외부 의존**: Supabase, Anthropic, OpenAI, Voyage, 해피톡 (방문/런치 별), 채널톡, NicePay, Bolta, Dhero, Google Sheets, Slack, Kakao Local, SweetTracker — env var ~47개

### 기술 스택 vs covering-labs 표준
| 항목 | 본 앱 | covering-labs nextjs 템플릿 |
|---|---|---|
| Next.js | **16.1.6** | 14.x |
| React | **19.2.3** | 18.3 |
| Tailwind | **4.x** (`@tailwindcss/postcss`) | 3.x |
| TS jsx | `react-jsx` (=automatic) | `preserve` |
| 빌드 결과 | 일반 (server) | 일반 (server) |

> Next 16 + React 19 + Tailwind 4 는 deploy-app.sh 의 `npm install --legacy-peer-deps && npx next build && pm2 start npm -- start` 흐름에서 그대로 굴러갈 가능성이 높음 (PM2 가 `next start` 를 띄우는 구조). 단, **basePath 자동 주입이 작동하지 않음** (이미 `next.config.ts` 가 존재하므로 deploy-app.sh 의 basePath 자동 생성 분기가 스킵됨).

### git / 디렉토리 위생 상태 (위험 항목)
- 앱 디렉토리 전체가 **Untracked** — `git ls-files apps/public/covering-spot-chatbot/` 결과 0건
- 디렉토리에 실제 존재하는 위생 위반 후보:
  - `.env.local` (실제 값 포함, 약 6.6KB)
  - `.env.local.test`
  - `.env.vercel`, `.env.vercel.check`
  - `.next/` (빌드 산출물)
  - `node_modules/`
  - `tsconfig.tsbuildinfo`
  - `.vercel/` (Vercel 프로젝트 링크)
  - `.code-review-graph/`
  - `.omc/`
  - `package-lock.json` (이건 OK — 커밋 대상)
- 앱 자체 `.gitignore` 는 `.env*`, `.next`, `node_modules`, `.vercel`, `.omc`, `*.tsbuildinfo` 등을 막고 있어 **저장소 루트 `.gitignore`만 잘 동작하면 보안 사고는 회피됨**. 단, 앱 디렉토리 `.gitignore` 가 저장소 루트의 `.gitignore` 와 충돌하지 않는지 한 번 확인 필요.

### Vercel ↔ covering-labs public VM 차이로 발생하는 호환 이슈

| 이슈 | 영향 | 처리 방향 |
|---|---|---|
| **basePath** — public VM 은 nginx 가 `https://public-labs.covering.app/covering-spot-chatbot/` 로 라우팅. 앱 입장에서 모든 경로가 `/covering-spot-chatbot` prefix 아래에 위치 | `next.config.ts` 에 basePath 미설정 시 정적 자산 (`/_next/...`) 이 nginx 단에서 404. 또한 `middleware.ts` 의 `pathname === "/login"` 같은 정확 매칭이 더 이상 동작 안 함 (실제는 `/covering-spot-chatbot/login` 이 됨 — 단, Next 자체는 basePath 자동 stripping 적용) | `next.config.ts` 에 `basePath: '/covering-spot-chatbot'` 추가. 미들웨어 매칭 검증 |
| **Vercel Cron** — vercel.json 의 `crons` 는 covering-labs 환경에서 **전혀 동작하지 않음** | 14개 자동화(자동결제, sheet push, 자동종료, 분류, 자동넛지, NPS 등) 전부 정지 | **별도 의사결정 필요** (아래 § 미해결 의사결정) |
| **Vercel OIDC / Vercel-only env** | `VERCEL_OIDC_TOKEN` 등은 covering-labs 에서 주입 불가 | 사용 코드 있으면 분기 또는 비활성화 |
| **public VM은 site-to-site VPN 미연결** | 내부 AWS 리소스/Admin API 는 접근 불가. 외부 SaaS (Supabase, Anthropic, Slack, 해피톡, 채널톡, NicePay 등) 는 모두 외부 인터넷 호출이라 OK | 별도 조치 불필요 |
| **빌드 메모리 / 디스크** | 의존성이 거대 (OpenAI + Anthropic + Voyage + xlsx + recharts + radix-ui + googleapis 등) → `npx next build` 가 무거울 가능성 | 1차 시도 후 OOM 발생하면 그때 대응 |
| **Vercel 잔재 파일** | `vercel.json`, `.vercelignore`, `.vercel/`, `.env.vercel*` | 레포 정리 (커밋 대상에서 제외) |

### deploy-app.sh 동작 재확인
```
1. /shared/.env source
2. next.config.{js,ts,mjs} 없으면 basePath 자동 생성 → ⚠️ 본 앱은 이미 next.config.ts 존재 → 자동 주입 스킵됨
3. npm install --legacy-peer-deps --silent
4. PORT=$PORT npx next build
5. pm2 start npm --name <app> -- start  (= next start, PORT 주입)
6. update_nginx
```
→ 결론: **basePath 는 우리가 직접 next.config.ts 에 박아 넣어야 한다.**

---

## 구현 계획 (단계별 작업)

### Phase 0 — 보안/위생 (사용자 확인 필수, 환경변수 값은 절대 커밋 금지)
- [ ] 앱 디렉토리에 실재하는 `.env.local`, `.env.local.test`, `.env.vercel`, `.env.vercel.check` 의 **실제 값을 사용자가 안전한 곳(1Password 등)에 백업**했는지 확인
- [ ] 저장소 루트 `.gitignore` 와 앱 자체 `.gitignore` 가 모두 `.env*` / `.next/` / `node_modules/` / `.vercel/` / `tsconfig.tsbuildinfo` / `.code-review-graph/` / `.omc/` 를 차단하는지 검증 (`git status --ignored apps/public/covering-spot-chatbot/`)
- [ ] `release-file-guard` 스킬로 커밋 전 파일 필터 검증

### Phase 1 — Vercel 잔재 제거 (D1, D2 결정 후 처리)
- [ ] D1=A/B/C 인 경우: `vercel.json` 삭제 또는 보존하되 무시
- [ ] `.vercel/`, `.vercelignore` 디렉토리/파일 (커밋 안 하지만 로컬에서 삭제할지 결정)
- [ ] `public/vercel.svg` (선택)
- [ ] 코드 내 `process.env.VERCEL_*` 사용처 grep 후 처리

### Phase 2 — covering-labs 배포 메타파일 추가
- [ ] `apps/public/covering-spot-chatbot/deploy.yml` 생성
  ```yaml
  name: covering-spot-chatbot
  description: "방문수거/런치/채널톡/대시보드 통합 상담 플랫폼"
  type: nextjs
  ```
- [ ] 앱 루트 `README.md` 를 covering-labs `apps/AGENTS.md` § "README 필수 규칙" 에 맞게 보강 (목적 / 실행 환경 / 주요 파일 / 환경변수 / 실행 방법 / 의존 서비스 / 주의사항). 기존 README 는 유익한 내용 많으니 머리에 covering-labs 운영 섹션 추가 후 보존.

### Phase 3 — basePath 적용 (D3 결정 후)
- D3 = B-1 (basePath 정공) 가정:
  - [ ] `next.config.ts` 에 `basePath: '/covering-spot-chatbot'` + (필요 시) `assetPrefix` 추가, `output` 은 default 유지
  - [ ] 절대 경로 fetch/Link grep — `grep -r "fetch('/api"`, `grep -r "href=\"/"` 검사 후 수정 (Next `Link` / `useRouter` 는 자동 처리되지만 `fetch` 는 자동 처리 안 됨)
  - [ ] `middleware.ts` matcher 검증 — Next 미들웨어는 basePath 적용된 path 가 들어옴. `pathname === "/login"` 같은 비교는 그대로 동작하는지 1회 검증
  - [ ] 카카오 OAuth redirect_uri / NicePay return URL 등 외부 콜백 URL 은 절대 URL 로 등록되어 있을 가능성 → 외부 서비스 콘솔에서 새 도메인 등록 필요 (사용자 작업)

### Phase 4 — Vercel Cron 처리 (D1 결정 반영)
- D1=A: `vercel.json` 삭제 + cron 라우트는 그대로 두되 외부 트리거 없음
- D1=B: private VM crontab 에 14개 항목 추가 (별도 작업, 본 PRD 에는 명령어 목록만 명시)
- D1=C: `apps/private/spot-chatbot-cron-runner/` batch 앱 1개 추가
- D1=D: 변경 없음, 다만 운영팀 공지

### Phase 5 — 환경변수 레지스트리 등록 (D5)
- [ ] `apps/AGENTS.md` 의 "현재 서버에 설정된 환경변수 레지스트리" 표에 본 앱이 사용하는 47개 env 추가 (또는 핵심만)
- [ ] **값은 본 PR 에 포함시키지 않음** — 사용자가 VM `/shared/.env` 또는 앱별 `.env` 에 직접 추가
- [ ] PR 본문에 "추가된 환경변수 목록" 명시

### Phase 6 — 로컬 빌드 검증 (커밋 전 필수)
- [ ] `cd apps/public/covering-spot-chatbot && npm install --legacy-peer-deps`
- [ ] `npx tsc --noEmit` (오류 0건 — 단, 본 앱 규모상 기존 type error 가 있을 수 있음. 발견 시 사용자 확인 후 처리)
- [ ] `npm run build` 성공 (basePath 적용된 빌드)
- [ ] (선택) `PORT=3001 npm start` 로 로컬에서 페이지 1개 응답 확인

### Phase 7 — 커밋 + 사용자 보고 (배포 키워드 대기)
- [ ] 브랜치 `feat/2026-05-08-covering-spot-chatbot-public` 생성
- [ ] `git add apps/public/covering-spot-chatbot/` (단, ignore 항목 절대 포함 안 됨을 한 번 더 확인)
- [ ] 로컬 커밋
- [ ] **여기서 멈추고 사용자 확인 대기** (CLAUDE.md "PR 자동 생성 금지" 규칙)

---

## 완료 기준

- [ ] `apps/public/covering-spot-chatbot/deploy.yml` 존재, `type: nextjs`
- [ ] `apps/public/covering-spot-chatbot/README.md` covering-labs README 규칙 충족
- [ ] `next.config.ts` 에 basePath 적용, 로컬 `npm run build` 성공
- [ ] `git status` 에서 `.env*`, `.next/`, `node_modules/`, `.vercel/`, `tsconfig.tsbuildinfo` 가 추적 후보로 보이지 않음
- [ ] Vercel Cron 14개에 대한 처리 방향이 D1 옵션 중 하나로 확정되고 반영됨
- [ ] 환경변수 레지스트리에 사용 env 목록 등록 (값 제외)
- [ ] 로컬 커밋까지 완료, 사용자 배포 키워드 대기

---

## 변경 파일 목록 (예상)

| 파일 | 작업 |
|---|---|
| `apps/public/covering-spot-chatbot/deploy.yml` | 신규 |
| `apps/public/covering-spot-chatbot/README.md` | 보강 (covering-labs 섹션 추가) |
| `apps/public/covering-spot-chatbot/next.config.ts` | basePath 추가 |
| `apps/public/covering-spot-chatbot/middleware.ts` | (검증 후 필요 시) 매칭 보강 |
| `apps/public/covering-spot-chatbot/vercel.json` | (D1 옵션 따라) 삭제/보존 |
| `apps/public/covering-spot-chatbot/.vercelignore` | (D1 옵션 따라) 삭제 |
| `apps/AGENTS.md` (루트) | env 레지스트리에 본 앱 변수 추가 |
| `apps/CLAUDE.md` (루트) | 동일 (AGENTS.md 와 동기화) |
| `apps/public/covering-spot-chatbot/app/api/cron/*` | (D1=A/B/C 따라) 인증 헤더 추가 등 보강 |
| 코드 내 `fetch('/api/...')` / `href="/..."` | grep 결과에 따라 일부 수정 |
