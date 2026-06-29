# CLAUDE.md — covering-labs AI 세션 가이드

> 이 파일은 Claude Code가 세션 시작 시 자동으로 읽는 파일입니다.
> 작업 전 반드시 아래 인덱스에 따라 관련 문서를 읽으세요.

---

## 절대 수정 금지 파일 (사용자 승인 없이)

아래 파일을 수정하면 **전체 배포 시스템이 멈추거나 보안 사고가 발생**합니다.
수정이 필요한 이유가 생기면 **반드시 작업을 멈추고 사용자에게 먼저 확인**하세요.

### 절대 금지 (사용자 명시적 승인 없이)

| 파일 | 수정 시 영향 |
|---|---|
| `.github/workflows/deploy.yml` | 모든 앱 자동 배포 중단 |
| `scripts/deploy-app.sh` | nextjs/nestjs/batch 배포 전체 파괴 |
| `scripts/undeploy-app.sh` | 앱 삭제 흐름 파괴 |
| `.gitignore` | `.env`/키 파일 커밋 → 보안 사고 |

### 수정 전 반드시 사용자에게 확인

| 파일/디렉토리 | 수정 시 영향 |
|---|---|
| `apps/_template/` | 신규 앱 기반 구조 오염 |
| `apps/private/_dashboard/` | 운영 모니터링 대시보드 파괴 |
| `.hooks/`, `.codex/hooks.json`, `.codex/config.toml`, `.claude/settings.json` | AI 도구 검증 훅 파괴 |
| `CLAUDE.md` / `AGENTS.md` / `apps/AGENTS.md` / `apps/CLAUDE.md` / `works/AGENTS.md` / `works/CLAUDE.md` / `GEMINI.md` | AI 지침 오염 |

**작업 범위 원칙**: 사용자 요청은 `apps/private/[앱이름]/` 또는 `apps/public/[앱이름]/` 하위에서만 처리한다. `scripts/`, `.github/`, `.hooks/`, `.codex/`, `_template/`은 건드리지 않는다.

> 상세 규칙 → [`AGENTS.md` — "수정 금지 / 수정 전 반드시 확인이 필요한 파일"](AGENTS.md)

---

## 필수 선행 독서

**모든 작업 전, 아래 파일을 반드시 읽으세요:**

| 파일 | 내용 | 언제 읽는가 |
|---|---|---|
| [`AGENTS.md`](AGENTS.md) | 프로젝트 전체 — 권한, 인프라, 배포 시스템, AI 주의사항 | 항상 |
| [`apps/AGENTS.md`](apps/AGENTS.md) | 앱 생성/배포 — 타입 선택, 파일 구성, 디버깅 | 앱 관련 작업 시 |
| [`works/AGENTS.md`](works/AGENTS.md) | works/ 문서 규칙 — 파일명, 헤더, 상태값 | works/ 문서 생성/수정 시 |

---

## 파일 위치 인덱스

```text
covering-labs/
├── CLAUDE.md                    이 파일 — Claude Code 세션 시작 시 자동 로드
├── AGENTS.md                    AI 가이드 전체 — 인프라/권한/배포 시스템
├── GEMINI.md                    Gemini AI용 세션 가이드 (CLAUDE.md와 동일)
├── apps/
│   ├── AGENTS.md                앱 생성 AI 가이드 (타입 선택 + 파일 구성 + 배포)
│   ├── CLAUDE.md                apps/AGENTS.md와 동일 (Claude Code용)
│   ├── README.md                비개발자용 간략 가이드
│   ├── _template/               앱 타입별 예시 코드 (수정 금지)
│   ├── private/                 VPN 전용 앱 (covering-labs-instance)
│   └── public/                  공개 앱 (covering-labs-public)
├── docs/
│   ├── 00_목차.md                전체 목차, 서버 개요, 빠른 시작
│   ├── 01_시작하기.md             gcloud 설치, SSH 접속, 트러블슈팅
│   ├── 02_이용_가이드.md          GitHub 연동, 파일 전송, crontab, tmux, 자동 배포
│   ├── 03_서비스_가이드.md         Sheets, BigQuery, Cloud Storage (코드 포함)
│   ├── 04_권한과_보안.md          권한 매트릭스, 디렉토리, 스코프, 방화벽
│   ├── 05_감사와_모니터링.md       로그 조회, 대시보드, Slack 알림
│   ├── 06_서버_관리.md            자동 세팅, dev 그룹, 재부팅, 스크립트
│   ├── 07_인프라_관리.md          IAM, 스코프, BQ ACL, 인스턴스 생성, 방화벽, VPN
│   ├── 08_비개발자_가이드.md       비개발자 전용 가이드 (AI 활용, 앱 요청, 확인법)
│   ├── 09_보안_규약.md            보안 규약 (인증·민감정보·데이터 노출·웹 보안)
│   ├── 10_출고_전_파일_필터_설치.md release-file-guard 설치 및 검증 가이드
│   └── 11_비개발자_API_인프라_범위.md 비개발자 허용/차단 API·인프라 범위 정의
└── works/
    ├── AGENTS.md                작업 기록 AI 가이드 (파일 저장 규칙, 네이밍, 템플릿)
    ├── CLAUDE.md                works/AGENTS.md와 동일 (Claude Code용)
    ├── plan/                    플랜, PRD, ADR
    └── reports/                 분석 보고서, 조사 결과
```

---

## 질문 유형별 참조 문서

| 질문 유형 | 읽어야 할 문서 |
|---|---|
| 앱 만들기, 배포, 타입 선택 | [`apps/AGENTS.md`](apps/AGENTS.md) |
| **앱 개발 순서** (구현 → 테스트 → LSP → 빌드) | [`apps/AGENTS.md`](apps/AGENTS.md) → "개발 순서" |
| **민감 정보** (API 키, 키 파일, 환경변수) | [`apps/AGENTS.md`](apps/AGENTS.md) → "민감 정보 처리 규칙" |
| **공통 환경변수 목록** | [`apps/AGENTS.md`](apps/AGENTS.md) → "환경변수 레지스트리" / [`docs/12_환경변수_가이드.md`](docs/12_환경변수_가이드.md) |
| 서버 접속, SSH 문제 | [`docs/01_시작하기.md`](docs/01_시작하기.md) |
| 코드 올리기, crontab, 자동 배포 | [`docs/02_이용_가이드.md`](docs/02_이용_가이드.md) |
| Sheets / BigQuery / Storage / AWS 내부 서비스 | [`docs/03_서비스_가이드.md`](docs/03_서비스_가이드.md) |
| 권한, 누가 뭘 할 수 있는지 | [`docs/04_권한과_보안.md`](docs/04_권한과_보안.md) |
| 로그, 모니터링, Slack 알림 | [`docs/05_감사와_모니터링.md`](docs/05_감사와_모니터링.md) |
| 서버 재부팅, 스크립트, 설정 | [`docs/06_서버_관리.md`](docs/06_서버_관리.md) |
| IAM, 스코프, 방화벽, VPN | [`docs/07_인프라_관리.md`](docs/07_인프라_관리.md) |
| 비개발자 AI 활용, 앱 요청하는 법, 배포 후 확인법 | [`docs/08_비개발자_가이드.md`](docs/08_비개발자_가이드.md) |
| 보안 규약 확인, 보안 위반 감지, 인증·데이터·XSS 규칙 | [`docs/09_보안_규약.md`](docs/09_보안_규약.md) |
| release-file-guard 설치, 파일 필터 설정 | [`docs/10_출고_전_파일_필터_설치.md`](docs/10_출고_전_파일_필터_설치.md) |
| **비개발자 허용/차단 API·인프라 범위** | [`docs/11_비개발자_API_인프라_범위.md`](docs/11_비개발자_API_인프라_범위.md) |

---

## 해야 할 것 / 하지 말아야 할 것

### ✅ 해야 할 것

- 작업 시작 전 `AGENTS.md` 읽기
- 앱 관련 작업 전 `apps/AGENTS.md` 읽기
- 작업 전 `works/plan/`에 PRD 문서 생성
- 코드 완성 후 로컬 빌드/테스트로 동작 확인
- 커밋 후 사용자 확인 기다리기
- PR 생성 시 `.github/PULL_REQUEST_TEMPLATE.md` 기반으로 body 작성
- 모든 PR 리뷰 스레드 수정 또는 댓글+resolve 처리

### ❌ 하지 말아야 할 것

- 사용자 지시 없이 자동으로 `git push` / `gh pr create` 실행
- main 브랜치에 직접 push
- API 키, 비밀번호, 토큰을 코드에 하드코딩
- `.env` 파일을 git add/commit
- 절대 수정 금지 파일 수정 (`.github/workflows/`, `scripts/deploy-app.sh` 등)
- `apps/_template/`, `apps/private/_dashboard/` 수정
- PR 리뷰 스레드를 resolve 없이 작업 종료
- BigQuery INSERT/DELETE/CREATE TABLE 실행

---

## 개발 기본 흐름 (PR 자동 생성 금지)

**AI는 작업 완료 직후 자동으로 `git push` / `gh pr create` 를 실행해서는 안 됩니다.**
작업이 끝나면 로컬 커밋까지만 하고 **반드시 멈추고 사용자 확인을 기다리세요.**

### 기본 흐름

```text
1. 브랜치 생성 (feat|fix|docs/YYYY-MM-DD-{slug})
2. 코드 구현
3. 로컬 테스트/실행/빌드로 동작 확인
4. 커밋 (git commit)
5. ⛔ STOP — 여기서 멈추고 사용자에게 보고
6. 사용자가 명시적 배포 키워드를 말하면 그때 push + PR 생성
```

### 명시적 배포 키워드 (이 키워드 없이는 push/PR 금지)

- "배포 준비해줘" / "배포해줘" / "배포해"
- "PR 올려줘" / "PR 올려" / "PR 만들어줘"
- "push 해줘" / "푸시해줘"
- "올려줘" (문맥상 배포 의미가 명확할 때)

사용자가 위 키워드 **없이** "완료/구현/고쳐줘/만들어줘" 등으로 끝낸 경우
→ **커밋까지만 하고 PR을 만들지 말 것**. 결과를 보고하고 사용자 승인을 기다리세요.

## 배포 워크플로우 (PR 필수)

**main 브랜치에 직접 push 금지.** 반드시 아래 절차를 따르세요.

### 브랜치 네이밍

```text
feat/YYYY-MM-DD-{slug}   ← 신규 앱 또는 기능 추가
fix/YYYY-MM-DD-{slug}    ← 버그 수정
docs/YYYY-MM-DD-{slug}   ← 문서 업데이트
```

### 배포 절차 (사용자가 "배포해줘"라고 하면)

```bash
# 1. 브랜치 생성
git checkout -b feat/$(date +%Y-%m-%d)-앱이름

# 2. 변경사항 커밋
git add apps/앱이름/
git commit -m "feat: 앱이름 추가/수정"

# 3. 브랜치 push
git push origin feat/$(date +%Y-%m-%d)-앱이름

# 4. PR 생성
gh pr create --title "feat: 앱이름" --body "변경 내용 설명"
```

### PR 이후 자동 흐름

```text
PR 생성 → CodeRabbit 자동 코드 리뷰
    → 문제없음: 리뷰 확인 후 사용자 승인 → 머지 + 브랜치 삭제 + GitHub Actions 자동 배포
    → 코멘트 있음: 미해결 대화 resolve 전까지 머지 차단
```

> PR 템플릿: `.github/PULL_REQUEST_TEMPLATE.md`

---


## ⚠️ PR 생성 시 필수 체크박스 (위반 시 CI 차단)

**`gh pr create` 실행 시 아래 섹션을 body에 반드시 포함해야 합니다.**
누락 시 `AI PR Guardrail` CI가 실패하고 Slack 알림이 발송됩니다.

```markdown
## 🤖 AI 사용 여부 (필수 선택)

- [x] `ai-generated`
- [ ] `ai-assisted`
- [ ] `no-ai`

## 🚨 후속 수정 여부 (필수 선택 — 정확히 1개)

- [x] `normal-change`
- [ ] `post-release-fix`
- [ ] `hotfix`

## 🔗 후속 수정 PR인 경우 필수 입력

원인 PR: N/A
문제 코드/파일: N/A
```

### 선택 규칙
- AI가 작성한 코드 → `ai-generated` 선택 (체크)
- 일반 변경 → `normal-change` 선택 (체크)
- `post-release-fix` / `hotfix` 선택 시 → `원인 PR: #번호` 필수 (N/A 불가)
- 각 섹션에서 정확히 1개만 `[x]`로 체크

> ⚠️ **Cross-repo 주의**: covering-labs 디렉토리 밖(예: `/Users/jun/Desktop/covering`)에서 `gh api`로 PR 생성 시 `.hooks/`가 실행되지 않습니다. 이 경우에도 위 체크박스를 수동으로 포함해야 합니다.
> PR 전체 템플릿: `.github/PULL_REQUEST_TEMPLATE.md`

---

## PR 리뷰 해결 의무 규칙

사용자가 "리뷰 해결해줘", "코멘트 처리해줘" 등을 요청하면 아래 절차를 반드시 따릅니다.

```text
1. 미해결 스레드 전체 조회 (GraphQL reviewThreads, isResolved: false)
2. 각 스레드별 판단:
   ┌─ 수정 필요 → 코드/문서 수정 → 커밋 → resolveReviewThread
   └─ 수정 불필요 → PR에 이유 댓글 → resolveReviewThread
3. 완료 후 미해결 스레드 0건인지 재확인
```

- **resolve 없이 작업 종료 금지** — 스레드가 남으면 머지 차단
- **댓글 없이 resolve 금지** — 수정하지 않는 경우 반드시 이유를 남긴 후 resolve
- 상세 규칙 → [`AGENTS.md` — "PR 리뷰 해결 의무 규칙"](AGENTS.md)

---

## Works PRD 규칙

코드/문서/인프라를 수정하는 작업이라면 시작 전 `works/plan/` 에 플랜 문서를 생성하세요.

```text
파일명: {YYYY-MM-DD}-covering-labs-{task-slug}.md
위치:   works/plan/   (PRD, 플랜)
        works/reports/ (분석, 조사)
```

### 문서 헤더 필수

```markdown
> 유형: PRD | 플랜 | 분석
> 작성일: YYYY-MM-DD
> 상태: 초안 | 검토중 | 확정 | 완료
```

파일을 수정하면 해당 작업의 PRD 문서에도 변경 내용을 반영하세요.
자세한 규칙은 [`AGENTS.md` — "Works PRD 작성 규칙"](AGENTS.md) 섹션과 [`works/AGENTS.md`](works/AGENTS.md) 참조.
