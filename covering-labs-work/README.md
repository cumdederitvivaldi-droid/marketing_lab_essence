# covering-labs

covering.app 팀 공용 GCP 서버입니다. 배치 스크립트, Next.js 앱, NestJS API를 GitHub push 한 번으로 자동 배포할 수 있습니다.

---

## 소개

| 항목 | 값 |
|---|---|
| GCP 프로젝트 | `covering-app-ccd23` |
| 인스턴스 | `covering-labs-instance-20260306-050059` |
| 존 | `asia-northeast3-a` (서울) |
| 머신 | `e2-medium` (vCPU 2, RAM 4GB, 디스크 30GB) |
| OS | Ubuntu 24.04 LTS |
| 외부 IP | `34.64.177.181` |
| 공개 도메인 | `https://labs.covering.app` (HTTPS, SSL 자동 갱신) |

**`@covering.app` 구성원이면 누구나 SSH 접속 가능합니다.**

---

## 바로 시작하기

```bash
gcloud compute ssh --zone "asia-northeast3-a" \
  covering-labs-instance-20260306-050059 \
  --project "covering-app-ccd23"
```

gcloud CLI가 없다면 `docs/01_시작하기.md`를 참고하세요.

---

## 앱 배포하기

### 배포 흐름

1. `apps/[앱이름]/` 폴더에 `deploy.yml` + 코드 작성
2. `git push` → GitHub Actions가 VM에 자동 배포
3. `https://labs.covering.app/[앱이름]` 으로 접속

### 앱 타입

| 타입 | 용도 | 주요 필드 |
|---|---|---|
| `batch` | Python 정기 실행 스크립트 (cron) | `name`, `description`, `type`, `schedule`, `command` |
| `nextjs` | Next.js 웹 UI | `name`, `description`, `type` |
| `nestjs` | NestJS REST API 서버 | `name`, `description`, `type` |

### deploy.yml 예시

**batch:**
```yaml
name: my-batch
description: 매일 슬랙에 리포트 전송
type: batch
schedule: "0 9 * * *"
command: python src/main.py
```

**nextjs / nestjs:**
```yaml
name: my-app
description: 내부 관리 대시보드
type: nextjs
```

상세 파일 구성은 `apps/AGENTS.md`를 참고하세요.

---

## 접속 주소

| 항목 | 주소 |
|---|---|
| 서버 루트 | `https://labs.covering.app` |
| 배포된 앱 | `https://labs.covering.app/[앱이름]` |
| 모니터링 대시보드 | `https://labs.covering.app/_dashboard` (VPN 필수) |

---

## 모니터링 대시보드

`https://labs.covering.app/_dashboard` 에서 배포된 앱 목록, 상태, 로그를 확인할 수 있습니다.

로그 조회, Slack 알림 설정은 `docs/05_감사와_모니터링.md`를 참고하세요.

---

## 권한 구조

| 그룹 | 대상 | SSH | sudo | 로그 조회 |
|---|---|---|---|---|
| `jun@covering.app` | 관리자 | ✅ | ✅ | ✅ |
| `dev@covering.app` | 개발팀 | ✅ | ✅ | ✅ |
| `all@covering.app` | 전체 구성원 | ✅ | ❌ | ❌ |

권한 세부 사항은 `docs/04_권한과_보안.md`를 참고하세요.

---

## 비개발자를 위한 AI 개발 플로우

코딩을 몰라도 AI(Claude Code, Codex 등)에게 요청하면 앱을 만들고 배포할 수 있습니다.

### 전체 플로우

```
1. AI에게 요청
      ↓
2. [자동] UserPromptSubmit 훅 실행 (보안·정책 사전 검증)
      ↓
3. AI가 코드 작성
      ↓
4. [자동] PreToolUse(Edit/Write) 훅 실행 (파일 수정 전 검증)
         - 수정 금지 파일 차단 (deploy.yml, scripts/ 등)
         - deploy.yml 규칙 검증
         - 보안 스캔 (하드코딩 키, 시크릿 탐지)
         - ENV 레지스트리 확인 (미등록 환경변수 경고)
      ↓
5. [자동] PostToolUse(Edit/Write) 훅 실행 (파일 수정 후 알림)
         - README 누락 경고
         - PRD 문서 업데이트 알림
      ↓
6. AI가 git 명령 실행
      ↓
7. [자동] PreToolUse(Bash) 훅 실행 (셸 명령 실행 전 검증)
         - git add 시 시크릿 파일 탐지 (*.pem, *key*, .env 등)
         - 위험 명령 차단 (rm -rf, DROP TABLE, force push 등)
         - PR 생성 전 main 동기화 체크 / 브랜치 이름 정책 검증
         - release-file-guard (정책 문서·CSV·로그 파일 혼입 차단)
      ↓
8. PR 생성 → CodeRabbit 자동 코드 리뷰
      ↓
9. [자동] GitHub Actions — critical-detect, ai-pr-guardrail
         - CodeRabbit critical 코멘트 감지 시 `critical-detected` 라벨 추가
         - PR 정책 위반 시 차단 + Slack(#개발팀_커버링랩스) 알림
      ↓
10. 담당자 승인 → main 머지 → 자동 배포
      ↓
11. [자동] deploy.yml GitHub Actions 실행
         - VM에 앱 배포
         - 배포 성공/실패 결과를 Slack(#개발팀_커버링랩스) 알림
```

### 단계별 훅 요약

| 단계 | 트리거 시점 | 주요 훅 | 역할 |
|---|---|---|---|
| **UserPromptSubmit** | AI에게 메시지 보낼 때마다 | `security-keyword-guard` `app-purpose-guard` `release-file-guard` | 요청 자체에 보안 키워드 포함 여부, 앱 목적 범위 체크 |
| **PreToolUse (Edit/Write)** | AI가 파일을 수정하기 직전 | `protected-file-guard` `deploy-yml-guard` `security-check` `env-var-registry-check` | 보호 파일 차단, deploy.yml 규칙, 하드코딩 시크릿 탐지 |
| **PostToolUse (Edit/Write)** | AI가 파일을 수정한 직후 | `readme-missing-guard` | README 누락 경고, PRD 업데이트 알림 |
| **PreToolUse (Bash)** | AI가 셸 명령을 실행하기 직전 | `git-add-secret-guard` `dangerous-command-guard` `pr-policy-guard` `release-file-guard` | 시크릿 커밋 방지, 위험 명령 차단, PR 정책/브랜치 이름 검증 |
| **GitHub Actions** | PR 생성·push·머지 이후 | `critical-detect` `ai-pr-guardrail` `deploy.yml` | CodeRabbit critical 탐지, PR 정책 위반, 배포 자동화 |

### 실제 프롬프트 예시

**배치 (정기 자동화) 앱 만들기:**
```
매일 오전 9시에 구글 시트(https://docs.google.com/spreadsheets/d/XXX)의
'판매' 시트를 읽어서 전날 총 매출을 계산하고,
슬랙 #일일리포트 채널에 "어제 매출: N원" 형태로 보내주는 배치 앱을 만들어줘.
앱 이름은 daily-sales-report로 해줘.
```

**Next.js 웹 대시보드 만들기:**
```
우리 팀 OKR 현황을 보여주는 웹 대시보드를 만들어줘.
구글 시트(https://docs.google.com/spreadsheets/d/YYY)에서 데이터를 읽어서
각 목표별 달성률을 막대 차트로 표시해줘.
앱 이름은 okr-dashboard로 해줘.
```

**기존 앱 수정:**
```
daily-sales-report 앱에서 매출액을 원화(₩) 포맷(콤마 포함)으로 표시하도록 수정하고
다시 배포해줘.
```

**API 키·시크릿이 필요한 경우:**
```
(AI가 "어떤 환경변수가 필요한지" 알려주면)
→ 이미 등록된 공통 변수는 docs/12_환경변수_가이드.md 에서 먼저 확인
→ 없는 경우 jun@covering.app에게 "서버 /shared/.env에 변수명=값 추가 부탁드려요" 요청
→ 추가 완료 후 AI에게 "환경변수 추가됐어, 계속 진행해줘"
```

### 배포 후 확인 방법

1. **Slack `#개발팀_커버링랩스`** 채널에서 배포 완료 알림 확인
2. `https://labs.covering.app/[앱이름]` 접속 (AWS Client VPN `covering-vpn-v2` 연결 필수)
3. 에러 발생 시: [GitHub Actions 로그](https://github.com/covering-app/covering-labs/actions)에서 실패 단계 복사 → AI에게 붙여넣기

> 상세 가이드 → [`docs/08_비개발자_가이드.md`](docs/08_비개발자_가이드.md)

---

## 문서 목록

| 문서 | 내용 |
|---|---|
| [`docs/00_목차.md`](docs/00_목차.md) | 전체 목차, 서버 스펙 |
| [`docs/01_시작하기.md`](docs/01_시작하기.md) | gcloud 설치, SSH 접속 |
| [`docs/02_이용_가이드.md`](docs/02_이용_가이드.md) | GitHub 연동, 자동 배포, crontab, tmux |
| [`docs/03_서비스_가이드.md`](docs/03_서비스_가이드.md) | Google Sheets, BigQuery, Cloud Storage |
| [`docs/04_권한과_보안.md`](docs/04_권한과_보안.md) | 권한 매트릭스, 방화벽 |
| [`docs/05_감사와_모니터링.md`](docs/05_감사와_모니터링.md) | 로그 조회, 대시보드, Slack 알림 |
| [`docs/06_서버_관리.md`](docs/06_서버_관리.md) | 사용자 관리, 재부팅, 스크립트 |
| [`docs/07_인프라_관리.md`](docs/07_인프라_관리.md) | IAM, 방화벽, VPN (관리자용) |
| [`docs/08_비개발자_가이드.md`](docs/08_비개발자_가이드.md) | 비개발자 전용: AI에게 요청하는 법 |
| [`docs/09_보안_규약.md`](docs/09_보안_규약.md) | 보안 규약: 인증·민감정보·데이터 노출·웹 보안 규칙 |
| [`docs/10_출고_전_파일_필터_설치.md`](docs/10_출고_전_파일_필터_설치.md) | 비개발자용 `release-file-guard` 설치/검증 가이드 |
| [`apps/AGENTS.md`](apps/AGENTS.md) | 앱 생성 상세 가이드 (AI/개발자용) |

---

## GitHub 라벨 체계

PR에 자동 또는 수동으로 붙는 라벨 목록과 용도입니다.

### AI 사용 여부 (PR 생성 시 필수 1개 선택)

| 라벨 | 용도 |
|---|---|
| `ai-generated` | AI가 코드를 전부 생성한 PR |
| `ai-assisted` | AI 보조를 받아 작성한 PR |
| `no-ai` | AI 미사용 PR |

### 변경 유형 (PR 생성 시 필수 1개 선택)

| 라벨 | 용도 |
|---|---|
| `normal-change` | 일반 변경 PR |
| `post-release-fix` | 머지 후 발견된 문제를 고친 후속 수정 PR — 원인 PR 번호 필수 |
| `hotfix` | 장애 대응 긴급 수정 PR — 원인 PR 번호 필수 |

### 자동 부착 라벨 (GitHub Actions)

| 라벨 | 부착 시점 | 의미 |
|---|---|---|
| `critical-detected` | CodeRabbit이 critical 이슈 탐지 | 머지 전 반드시 검토 필요 |
| `pre-merge-fixed` | critical 코멘트 resolve 후 push 확인 | critical 이슈가 머지 전 수정 완료 |
| `had-followup` | `post-release-fix` / `hotfix` PR이 원인 PR을 지목할 때 원인 PR에 자동 부착 | 이 PR이 머지된 후 후속 수정이 발생했음 |

### 기본 GitHub 라벨

| 라벨 | 용도 |
|---|---|
| `bug` | 버그 리포트 |
| `enhancement` | 기능 추가 요청 |
| `documentation` | 문서 개선 |
| `question` | 문의·토론 |
| `duplicate` | 중복 이슈/PR |
| `invalid` | 잘못된 이슈/PR |
| `wontfix` | 대응하지 않기로 결정 |
| `good first issue` | 입문자에게 적합한 이슈 |
| `help wanted` | 추가 도움이 필요한 이슈 |

---

## KR3 — AI PR 이슈 사전 차단율

### 정의

> CodeRabbit이 critical 이슈를 탐지했을 때, 해당 이슈가 **머지 후 후속 수정(post-release-fix / hotfix) 없이 해결된 비율**

목표: **≥ 80%**

### 계산 방식

```text
KR3 = 차단된 PR 수 / (차단된 PR 수 + 미차단된 PR 수) × 100
```

| 구분 | 라벨 조건 | 의미 |
|---|---|---|
| **차단된 PR** | `critical-detected` ✅ + `had-followup` ❌ | critical이 탐지됐지만 머지 후 추가 수정 없이 완결 |
| **미차단된 PR** | `critical-detected` ✅ + `had-followup` ✅ | critical이 탐지됐으나 머지 후 후속 수정 PR이 발생 |

집계 대상: 지정 기간(기본 7일) 내 **머지된 PR** 중 `critical-detected` 라벨이 있는 PR

### 리포트

- 매주 **월요일 오전 10시 (KST)** GitHub Actions `weekly-blocking-report`가 자동 집계
- 결과는 Slack `#개발팀_커버링랩스` 채널에 전송
- 수동 실행: Actions → `Weekly Blocking Rate Report` → `Run workflow` → `days_back` 입력

### 예시

| 주간 머지 PR | critical-detected | had-followup | 분류 |
|---|---|---|---|
| #10 | ✅ | ❌ | 차단됨 |
| #11 | ✅ | ✅ | 미차단 (후속 수정 발생) |
| #12 | ✅ | ❌ | 차단됨 |
| #13 | ❌ | — | 집계 제외 |

```text
KR3 = 2 / (2 + 1) × 100 = 67%  →  ⚠️ 목표 미달
```
