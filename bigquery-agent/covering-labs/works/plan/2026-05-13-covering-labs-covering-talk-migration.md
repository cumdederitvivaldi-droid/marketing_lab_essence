# covering-talk Vercel → covering-labs public 마이그레이션 플랜

> 유형: 플랜
> 작성일: 2026-05-13
> 상태: 진행중

## 목표

기존 Vercel 에 배포되어 있던 `covering-spot-chatbot` 앱을 covering-labs 의 public VM (`covering-labs-public`) 으로 이관한다. 이관 시 디렉토리 이름은 `covering-talk` 로 변경되며, 배포 후 접속 주소는 `https://public-labs.covering.app/covering-talk` 가 된다.

## 현황 분석

### 신규 디렉토리 상태

- 경로: `apps/public/covering-talk/`
- 정적 사실
  - public 타입은 `nextjs`/`nestjs` 만 허용 → `nextjs` 단일 앱이라 정합.
  - 옛 디렉토리 `apps/public/covering-spot-chatbot/` 은 이미 `git rm` 대기 상태 (working tree 에서 삭제됨).
- 발견된 문제 (배포 차단 또는 운영 리스크)
  1. **네스티드 `.git/` 존재** → covering-labs 깃이 디렉토리 전체를 untracked 1줄 (`?? apps/public/covering-talk/`) 로만 인식. 제거 전엔 파일이 PR 에 포함되지 않는다.
  2. **`deploy.yml` 미존재** → GitHub Actions `deploy-public` 잡이 앱을 인식 못 함.
  3. **Vercel 잔재**: `vercel.json`, `.vercel/`, `.vercelignore`, `.env.vercel`, `.env.vercel.check`. 마지막 두 개에는 실제 운영 키 값이 포함됨.
  4. **`.env.local.example` 보안 위반**: `SWEETTRACKER_PROFILE_KEY` / `SWEETTRACKER_USERID` 가 평문으로 박혀있음 (`docs/09_보안_규약.md` 위반).
  5. **`next.config.ts` 가 비어있음** → `scripts/deploy-app.sh` 의 basePath 자동 주입 로직(`next.config.js/ts/mjs` 부재 시에만 생성) 우회되어 basePath 미적용 위험.
  6. **`package.json` `name` 필드가 옛 이름** (`covering-spot-chatbot`).
  7. **`.code-review-graph/`** 가 `.gitignore` 에 누락.
  8. **Vercel Cron 11개** 가 `vercel.json` 에만 정의 → Vercel 떠나면 호출 주체 없음. 이번 PR 에서는 미설정으로 결정 (사용자 확인 완료).
  9. 내부 문서 (`README.md`, `CLAUDE.md`, `docs/`) 가 옛 이름·Vercel 배포 가정 기준으로 작성됨.

### 의존성·인프라

- npm 패키지: 옛 앱 그대로 (Next.js 16, React 19, Supabase, Anthropic SDK 등). 변경 없음.
- 환경변수: 옛 앱과 동일 키 세트. 라벨(앱 이름) 만 갱신.
- 외부 콘솔 (해피톡 webhook · NicePay return URL · 채널톡 Native Function · Slack 등): Vercel 도메인 박혀있음. 운영자 직접 갱신 필요 — URL 체크리스트만 정리해 README 에 첨부.

## 구현 계획

### 1단계 — 정리 (보안·git 정합성)

- [x] PRD 작성
- [ ] `apps/public/covering-talk/.git/` 제거 (네스티드 git 해제)
- [ ] Vercel 잔재 제거: `vercel.json`, `.vercel/`, `.vercelignore`, `.env.vercel`, `.env.vercel.check`
- [ ] `.env.local.example` 의 SWEETTRACKER 하드코딩 값 제거 (빈값)
- [ ] `.gitignore` 에 `.code-review-graph/` 추가

### 2단계 — covering-labs 배포 정합

- [ ] `deploy.yml` 생성 (`name: covering-talk`, `type: nextjs`)
- [ ] `next.config.ts` 에 `basePath: "/covering-talk"` 추가 (production only — disposal-guide 패턴)
- [ ] `package.json` `name` → `covering-talk`

### 3단계 — 내부 이름 통일

- [ ] `README.md`: 제목, 배포 섹션 (Vercel → covering-labs public VM), `vercel.json` 참조 제거
- [ ] `CLAUDE.md` (앱 내부): 제목·헤더의 "Covering Spot Chatbot" 표시 갱신
- [ ] `docs/**` 의 `covering-spot-chatbot` / "Covering Spot Chatbot" 문자열 일괄 치환

### 4단계 — 보호 파일 라벨 갱신 (사용자 승인 완료)

- [ ] `apps/AGENTS.md`: "covering-spot-chatbot 전용 변수" 섹션 라벨 + `사용 앱` 컬럼 → `covering-talk`
- [ ] `apps/CLAUDE.md`: 동일

### 5단계 — 검증

- [ ] `npm install`
- [ ] `npx tsc --noEmit` 오류 0
- [ ] `npm run build` 성공
- [ ] `git status` 로 `.env.local`, `.env.vercel*`, `node_modules/`, `.next/`, `.code-review-graph/` 가 무시되는지 재확인

### 6단계 — 커밋 (push 보류)

- [ ] 브랜치 `feat/2026-05-13-covering-talk-migration`
- [ ] 옛 디렉토리 `git rm -r apps/public/covering-spot-chatbot/`
- [ ] 신 디렉토리 `git add apps/public/covering-talk/`
- [ ] 커밋 후 사용자 명시 키워드 대기

## 후속 작업 (별도 PR / 운영)

1. **Vercel Cron 11개 대체** — `apps/private/covering-talk-cron/` batch 앱 신설하여 `curl` + `CRON_SECRET` 로 `/api/cron/*` 호출.
2. **외부 콘솔 URL 재등록** — README 의 "운영자 체크리스트" 섹션 참조.
3. **docs/* 본문 갱신** — 6개 파일에 마이그레이션 헤더는 추가됨. 본문(Vercel 콘솔·`vercel.json` 등 참조) 은 후속 PR 에서 covering-labs 기준으로 재작성.
4. **`docs/ops/environment.md`** — `CRON_SECRET`, `NEXT_PUBLIC_KAKAO_MAP_KEY` 추가 누락 여부 확인.
5. **webhook self-fetch 제거** — `app/api/webhook/route.ts` 는 sub-route 로 self-fetch 위임. 미들웨어 인증·헤더 forward 가 일관됐으나 장기적으로 직접 핸들러 함수 호출 리팩토링 권장.
6. **timing-safe 비교** — `crypto.timingSafeEqual` 로 CRON_SECRET·HT_CLIENT_* 비교 하드닝.

## 보안 보강 (2026-05-13, code-reviewer 진단 후 추가)

이번 PR 진행 중 code-reviewer 에이전트 진단으로 발견·처리한 항목:

- **(critical)** `app/new_dashboard/components/RegionMapInner.tsx:85` Kakao Map JS key 평문 fallback 제거 → `process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ?? ""`. **노출된 키 `e6f1d60dce814d6e059aa0752e921418` 는 Kakao 콘솔에서 즉시 로테이션 필요.**
- **(high)** `middleware.ts` 에 `/api/cron/*` `CRON_SECRET` + `/api/webhook/*` `HT-Client-Id/Secret` 헤더 검증 추가. webhook 헤더 일관 forward 를 위해 `route.ts` 에 `forward` 헬퍼 도입.
- **(high)** `next.config.ts` 의 `basePath` 를 `NODE_ENV` 분기에서 무조건 `/covering-talk` 로 변경 (PM2 wrapper 의 NODE_ENV 미설정 위험 제거).
- **(medium)** `app/api/webhook/route.ts` 의 `console.log` 에서 LUNCH_SENDER_KEY 평문 노출 제거 (match boolean 만 로깅).
- **(low)** 보호 파일 env registry 와 `.env.local.example` 에 `NEXT_PUBLIC_KAKAO_MAP_KEY` 등록.

## 완료 기준

- GitHub Actions `deploy-public` 잡이 covering-talk 를 인식하고 `covering-labs-public` 에 배포 성공
- `https://public-labs.covering.app/covering-talk` 접속 시 로그인 화면 정상 응답
- 옛 디렉토리 흔적 없음, 커밋 히스토리에 비밀 키 누출 없음
