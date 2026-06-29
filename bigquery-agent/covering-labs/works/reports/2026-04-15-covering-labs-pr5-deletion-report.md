# PR #5 삭제 항목 전체 리포트

> PR: `feat/2026-04-14-code-integration` → `main`
> 작성일: 2026-04-15
> 목적: GCP 서버에서 실행 가능한 배치 앱만 남기고, 운영 불가·범위 외 항목 전면 정리

---

## 왜 올리면 안 되는 것들인가 — 기준

이 레포의 배포 대상은 **GCP Ubuntu Linux VM에서 crontab(batch) 또는 PM2(nextjs/nestjs)로 실행되는 앱**으로 제한됩니다.
아래 기준 중 하나라도 해당하면 제거 대상입니다:

| 기준 | 설명 |
|---|---|
| **macOS 전용** | launchd, scutil, osascript, Homebrew, `/Users/` 하드코딩 등 macOS에서만 동작하는 코드·설정 |
| **GCP 배포 불가** | Playwright, OS 레벨 패키지 설치 필요, systemd 의존 등 GCP Ubuntu VM 환경에서 실행 불가 |
| **서빙 수단 없음** | 결과물을 로컬 파일시스템에만 저장하고 외부에서 열람할 방법이 없는 앱 |
| **레포 범위 외** | 이 레포는 GCP 서버 운영 앱만 관리. Vercel 배포 프로덕트, Google Apps Script, 로컬 개발 도구는 별도 관리 대상 |
| **deploy.yml 없음** | 배포 시스템 진입점이 없어 deploy-app.sh가 처리 불가 |
| **중복·stale** | 동일 기능의 파일이 두 곳에 존재하거나, 비활성화된 기능의 잔재 |

---

## 1. 앱 전체 삭제

### `apps/codex-claude-bridge/` (17개 파일)

**이유**: deploy.yml 없음 + 로컬 Claude-Codex 브릿지 개발 도구. GCP 서버에서 실행할 용도가 없으며 배포 시스템 진입점 자체가 없음.

```
.claude-plugin/plugin.json
.gitignore / .mcp.json
README.md / architecture.svg / screenshot.png
bridge-claude / bridge-codex / bridge-server.ts
claude-mcp.ts / codex-mcp.ts / covering-bridge.ts
room-dashboard / role-templates.ts / server.ts
package.json
docs/superpowers/specs/2026-04-12-multi-room-bridge-design.md
```

---

### `apps/invite-prototype/` (34개 파일)

**이유**: Supabase 기반 외부 초대 프로토타입. Vercel에 직접 배포하는 독립 서비스로 GCP 서버 운영과 무관. `.plist` 파일 포함 — macOS launchd 전용.

```
app/ (api, invite, r/ 라우트)
lib/supabase.ts
public/ (svg 에셋)
supabase/
scripts/com.invite-prototype.match-batch.plist  ← macOS launchd
deploy.yml / next.config.ts / package.json / bun.lock
AGENTS.md / CLAUDE.md / README.md / .gitignore
.local-invite-store.json
```

---

### `apps/schema-graph/` (38개 파일)

**이유**: BQ 스키마 관계도 HTML을 GCP VM 로컬 파일시스템에만 저장. 서빙 수단(nginx 연동, GCS 업로드 등)이 없어 배포 후 생성 결과물을 열람할 방법이 없음. `.playwright-cli/` 25개 파일 포함 — 로컬 아티팩트. `systemd/` 포함 — GCP Ubuntu에서 sudo 없어 사용 불가.

**재배포 조건**: GCS 버킷 업로드(`gsutil cp`) 또는 nginx static 디렉토리(`/var/www/html/`) 저장 후 nginx 서빙으로 전환 필요.

```
generate_schema_graph.py / schema_config.py / event_dictionary_data.py
requirements.txt / deploy.yml
assets/ (d3.js 등 번들)
.playwright-cli/ (25개 — 로컬 Playwright 아티팩트)
systemd/ (serve.service, serve.timer — sudo 필요, GCP 불가)
```

---

### `apps/threads-monitor/` (15개 파일)

**이유**: Playwright 브라우저 자동화 + OS 레벨 패키지(chromium, libgbm 등) 15개 이상 의존. GCP VM에 OS 패키지 직접 설치 불가(apt-get 권한 없음). `systemd/` 포함.

```
모니터링 스크립트 일체
systemd/ (service, timer)
scripts/
requirements.txt (playwright 포함)
```

---

### `apps/work-dashboard/` (34개 파일)

**이유**: 로컬 개발자 전용 대시보드. Claude/Codex 세션, Linear 이슈, 로컬 문서 경로(`~/covering-spot/docs`, `~/.claude/projects`)를 직접 읽는 구조. GCP 서버에서 의미있는 데이터를 읽을 수 없음.

```
app/ (Next.js 라우트 — API, 페이지)
lib/dashboard-data.ts    ← 로컬 경로 스캔
lib/session-counts.ts    ← 로컬 Claude 세션 파일 읽기
data/ (로컬 캐시 데이터)
task-state/ (로컬 태스크 상태)
scripts/cleanup_linear_workdashboard_comments.py
package.json / tsconfig.json / next.config.ts / tailwind.config.ts
```

---

## 2. 앱 내 개별 파일 삭제

### `apps/vehicle-dispatch-monitor/` — 34개 파일 삭제 (앱은 유지)

#### macOS 전용

| 파일 | 이유 |
|---|---|
| `com.covering.server-monitor.plist` | macOS launchd plist |
| `com.dispatch.server-monitor.plist` | macOS launchd plist |
| `launchd/com.covering.auto-deploy.plist` | macOS launchd |
| `launchd/com.covering.fail-photo-bot.plist` | macOS launchd |
| `launchd/com.covering.vehicle-dispatch.plist` | macOS launchd |
| `fail-photo-bot.service` | systemd — GCP sudo 없음 |

#### systemd (GCP sudo 없음)

| 파일 | 이유 |
|---|---|
| `systemd/ab-test-refresh.service` | systemd 사용 불가 |
| `systemd/ab-test-refresh.timer` | systemd 사용 불가 |
| `systemd/auto-deploy.service` | systemd 사용 불가 |
| `systemd/auto-deploy.timer` | systemd 사용 불가 |
| `systemd/fail-photo-bot-daily.service` | systemd 사용 불가 |
| `systemd/fail-photo-bot-daily.timer` | systemd 사용 불가 |
| `systemd/vehicle-dispatch.service` | systemd 사용 불가 |
| `systemd/vehicle-dispatch.timer` | systemd 사용 불가 |

#### GitHub Actions (Vercel/macOS 기반, GCP 운영과 무관)

| 파일 | 이유 |
|---|---|
| `.github/workflows/dispatch-monitor.yml` | Vercel 기반 수동 테스트용 — GCP crontab으로 대체 |
| `.github/workflows/final-check.yml` | 동일 |
| `.github/workflows/server-watchdog.yml` | 동일 |

#### 불필요 스크립트

| 파일 | 이유 |
|---|---|
| `run_monitor.sh` | bash wrapper — monitor.py에 ALLOWED_HOST 체크 내장, 불필요 |
| `run_fail_photo_bot.sh` | 삭제된 루트 fail_photo_bot.py 참조 |
| `auto_deploy.sh` | 앱 내 git pull/restart — deploy 시스템이 담당 |
| `scripts/auto_deploy.sh` | 동일 |
| `scripts/refresh_ab_test.sh` | AB test 2026-04-01 비활성화 — stale |
| `scripts/run_fail_photo_bot_daemon.sh` | crontab 1회성 실행에 데몬 불필요 |
| `scripts/setup_gcp.sh` | 초기 VM 세팅 스크립트 — 1회성, sudo 필요 |
| `scripts/setup_gcp_nosudo.sh` | 동일 (nosudo 버전) |
| `scripts/create_test_inquiry.py` | QA 전용 로컬 테스트 스크립트 |

#### 중복 파일

| 파일 | 이유 |
|---|---|
| `fail_photo_bot.py` (루트) | `fail_photo_bot/fail_photo_bot.py`와 diverged 중복 |
| `fail_photo_bot/backoffice_auth.py` | 루트 `backoffice_auth.py`와 diverged 중복 |
| `fail_photo_bot/config.py` | 루트 `config.py`와 diverged 중복 |
| `fail_photo_bot/security.py` | 루트 `security.py`와 중복 |

#### 기타

| 파일 | 이유 |
|---|---|
| `docs/RECOVERY.md` | macOS/launchd/`sudo pmset` 전용 복구 절차 |
| `AGENTS.md` | 앱별 AGENTS.md — 루트 AGENTS.md로 통합 |
| `.gitignore` | 앱별 .gitignore — 루트 .gitignore로 통합 |
| `.venv` | 가상환경 바이너리 — 레포 추적 대상 아님 |

---

### `apps/eng1559/src/` — 3개 파일 삭제 (나머지는 flarelane-d7-retention으로 rename)

| 파일 | 이유 |
|---|---|
| `src/setup_eng1559_flarelane_d7_journey.py` | macOS Chrome/Safari/osascript 직접 호출 |
| `src/verify_eng1559_d7_precheck.py` | macOS 전용 검증 스크립트 |
| `src/verify_eng1559_d7_test_flow.py` | macOS 전용 테스트 플로우 |

---

### `apps/event-dictionary/` — 3개 파일 삭제 (앱은 유지)

| 파일 | 이유 |
|---|---|
| `README.md` | 한 줄짜리 — 정보 없음 |
| `.gitignore` | 앱별 .gitignore — 루트로 통합 |
| `package.json` | Node 의존성 없는 Python 앱에 불필요 |

---

## 3. products/ 전체 삭제

**이유**: 이 레포는 GCP 서버 운영 앱 전용. Vercel/외부 배포 프로덕트는 별도 레포 또는 별도 관리 대상.

| 디렉토리 | 파일 수 | 내용 |
|---|---|---|
| `products/covering-spot` | 438 | 커버링 스팟 프로덕트 (Vercel 배포) |
| `products/waste-management-landing` | 179 | 폐기물 수거 랜딩 페이지 (외부 배포) |
| `products/figma-26q2` | 142 | 26Q2 Figma 관련 자료 |
| `products/covering-invite` | 4 | 초대 프로덕트 (외부 배포) |

---

## 4. tools/ 전체 삭제

**이유**: 로컬 개발 환경 전용 도구. GCP 서버에서 실행할 용도 없음.

| 디렉토리 | 파일 수 | 내용 |
|---|---|---|
| `tools/work-dashboard-app` | 11 | 로컬 대시보드 앱 |
| `tools/warpdoc` | 9 | Warp 문서 미러 도구 |
| `tools/claude-rate-limit-bar` | 7 | Claude 레이트리밋 표시 메뉴바 앱 (macOS 전용) |
| `tools/perf-menubar-monitor` | 5 | 퍼포먼스 메뉴바 모니터 (macOS 전용) |

---

## 5. appscripts/ 전체 삭제

**이유**: Google Apps Script는 Google 서버(GAS 런타임)에서 실행. GCP VM 배포 대상이 아니며, clasp CLI로 별도 관리해야 함.

| 디렉토리 | 파일 수 | 내용 |
|---|---|---|
| `appscripts/covering-single-collection-slack` | 4 | 단일 수거 Slack 알림 GAS |
| `appscripts/channel-talk-cx` | 4 | 채널톡 CX 자동화 GAS |
| `appscripts/airbridge-ads-data` | 3 | Airbridge 광고 데이터 GAS |
| `appscripts/150L-appscript` | 3 | 150L 관련 GAS |

---

## 요약

| 카테고리 | 삭제 앱/디렉토리 수 | 삭제 파일 수 | 주요 이유 |
|---|---|---|---|
| apps (전체 삭제) | 5개 | 98개 | macOS 전용, 배포 불가, 범위 외 |
| apps (내부 파일) | — | 37개 | launchd/systemd, 중복, stale |
| products | 4개 | 763개 | Vercel/외부 배포 — 레포 범위 외 |
| tools | 4개 | 32개 | 로컬 개발 도구 |
| appscripts | 4개 | 14개 | GAS 런타임 — GCP 아님 |
| **합계** | **17개** | **약 944개** | |
