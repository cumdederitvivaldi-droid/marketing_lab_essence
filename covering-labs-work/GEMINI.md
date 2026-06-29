# GEMINI.md — covering-labs AI 세션 가이드

> 이 파일은 AI 에이전트(Gemini, Codex 등)가 세션 시작 시 읽는 가이드 파일입니다.
> 작업 전 반드시 아래 인덱스에 따라 관련 문서를 읽으세요.

---

## 절대 수정 금지 파일 (사용자 승인 없이)

아래 파일을 수정하면 **전체 배포 시스템이 멈추거나 보안 사고가 발생**합니다.
수정이 필요한 이유가 생기면 **반드시 작업을 멈추고 사용자에게 먼저 확인**하세요.

| 파일 | 수정 시 영향 |
|---|---|
| `.github/workflows/deploy.yml` | 모든 앱 자동 배포 중단 |
| `scripts/deploy-app.sh` | nextjs/nestjs/batch 배포 전체 파괴 |
| `scripts/undeploy-app.sh` | 앱 삭제 흐름 파괴 |
| `.gitignore` | `.env`/키 파일 커밋 → 보안 사고 |
| `apps/_template/` | 신규 앱 기반 구조 오염 |
| `apps/private/_dashboard/` | 운영 모니터링 대시보드 (private 앱 전용) — 수정 시 전체 현황 파악 불가 |
| `.hooks/`, `.codex/hooks.json`, `.codex/config.toml`, `.claude/settings.json` | AI 도구 검증 훅 — deploy.yml 규칙·보안·ENV 레지스트리 강제 |
| `CLAUDE.md` / `AGENTS.md` / `apps/AGENTS.md` / `GEMINI.md` | AI 지침 오염 |

**작업 범위 원칙**: 사용자 요청은 `apps/private/[앱이름]/` 또는 `apps/public/[앱이름]/` 하위에서만 처리한다. `scripts/`, `.github/`, `.hooks/`, `.codex/`, `_template/`은 건드리지 않는다.

> 상세 규칙 → [`AGENTS.md` — "수정 금지 / 수정 전 반드시 확인이 필요한 파일"](AGENTS.md)

---

## 필수 선행 독서

**모든 작업 전, 아래 두 파일을 반드시 읽으세요:**

| 파일 | 내용 | 언제 읽는가 |
|---|---|---|
| [`AGENTS.md`](AGENTS.md) | 프로젝트 전체 — 권한, 인프라, 배포 시스템, AI 주의사항 | 항상 |
| [`apps/AGENTS.md`](apps/AGENTS.md) | 앱 생성/배포 — 타입 선택, 파일 구성, 디버깅 | 앱 관련 작업 시 |

---

## 문서 인덱스

### 운영 가이드 (`docs/`)

| 문서 | 핵심 내용 |
|---|---|
| [`docs/00_목차.md`](docs/00_목차.md) | 전체 목차, 서버 개요, 빠른 시작 |
| [`docs/01_시작하기.md`](docs/01_시작하기.md) | gcloud 설치, SSH 접속, known_hosts 트러블슈팅 |
| [`docs/02_이용_가이드.md`](docs/02_이용_가이드.md) | GitHub 연동, 파일 전송, crontab, tmux, 자동 배포 |
| [`docs/03_서비스_가이드.md`](docs/03_서비스_가이드.md) | Google Sheets, BigQuery, Cloud Storage 사용 코드 |
| [`docs/04_권한과_보안.md`](docs/04_권한과_보안.md) | 권한 매트릭스, 디렉토리 접근 제어, 방화벽 |
| [`docs/05_감사와_모니터링.md`](docs/05_감사와_모니터링.md) | 로그 조회, 대시보드, Slack 알림 |
| [`docs/06_서버_관리.md`](docs/06_서버_관리.md) | 자동 세팅, dev 그룹, 재부팅, 스크립트 |
| [`docs/07_인프라_관리.md`](docs/07_인프라_관리.md) | IAM, 스코프 변경, 인스턴스 생성, 방화벽, VPN |
| [`docs/08_비개발자_가이드.md`](docs/08_비개발자_가이드.md) | 비개발자 전용 가이드: AI에게 요청하는 법, 확인법 |
| [`docs/09_보안_규약.md`](docs/09_보안_규약.md) | 보안 규약: 인증·민감정보·데이터 노출·웹 보안 규칙 |
| [`docs/10_출고_전_파일_필터_설치.md`](docs/10_출고_전_파일_필터_설치.md) | release-file-guard 설치 및 검증 가이드 |

### 작업 기록 (`works/`)

| 경로 | 내용 |
|---|---|
| [`works/AGENTS.md`](works/AGENTS.md) | works/ 파일 저장 규칙, 네이밍, 템플릿 |
| `works/plan/` | PRD, 플랜, ADR |
| `works/reports/` | 분석 보고서, 조사 결과 |

---

## 질문 유형별 참조 문서

| 질문 유형 | 읽어야 할 문서 |
|---|---|
| 앱 만들기, 배포, 타입 선택 | `apps/AGENTS.md` |
| **앱 개발 순서** (구현 → 테스트 → LSP → 빌드) | `apps/AGENTS.md` → "개발 순서" |
| **민감 정보** (API 키, 키 파일, 환경변수) | `apps/AGENTS.md` → "민감 정보 처리 규칙" |
| 서버 접속, SSH 문제 | `docs/01_시작하기.md` |
| 코드 올리기, crontab, 자동 배포 | `docs/02_이용_가이드.md` |
| Sheets / BigQuery / Storage | `docs/03_서비스_가이드.md` |
| 권한, 누가 뭘 할 수 있는지 | `docs/04_권한과_보안.md` + `AGENTS.md` |
| 로그, 모니터링, Slack 알림 | `docs/05_감사와_모니터링.md` |
| 서버 재부팅, 스크립트, 설정 | `docs/06_서버_관리.md` |
| IAM, 스코프, 방화벽, VPN | `docs/07_인프라_관리.md` + `AGENTS.md` |
| 비개발자 AI 활용, 앱 요청하는 법, 배포 후 확인법 | `docs/08_비개발자_가이드.md` |
| 보안 규약 확인, 보안 위반 감지, 인증·데이터·XSS 규칙 | `docs/09_보안_규약.md` |

---

## 배포 워크플로우 (PR 필수)

**main 브랜치에 직접 push 금지.** 반드시 아래 절차를 따르세요.

### 브랜치 네이밍

```
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

```
PR 생성 → CodeRabbit 자동 코드 리뷰
    → 코멘트 없음 + 담당자 1인 승인 + 미해결 대화 없음 → 머지 + 브랜치 삭제 + 자동 배포
    → 코멘트 있음 → 미해결 대화 resolve 전까지 머지 차단
```

> PR 템플릿: `.github/PULL_REQUEST_TEMPLATE.md`

---

## Works PRD 규칙

코드/문서/인프라를 수정하는 작업이라면 시작 전 `works/plan/` 에 플랜 문서를 생성하세요.

```
파일명: {YYYY-MM-DD}-covering-labs-{task-slug}.md
위치:   works/plan/   (PRD, 플랜)
        works/reports/ (분석, 조사)
```

파일을 수정하면 해당 작업의 PRD 문서에도 변경 내용을 반영하세요.
자세한 규칙은 `AGENTS.md` → "Works PRD 작성 규칙" 섹션과 `works/AGENTS.md` 참조.
