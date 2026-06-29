# 배치 타임존 전수 점검 및 수정 플랜

> 유형: 플랜
> 작성일: 2026-04-17
> 상태: 완료

## 목표

배포된 모든 배치 앱의 크론 스케줄, 타임존 코드, description이 일치하도록 수정한다.

## 현황 분석

VM 타임존: KST (Asia/Seoul) — `apps/AGENTS.md` "batch 스케줄 시간은 KST 기준" 근거.

### 발견된 문제

| 앱 | 파일 | 문제 | 심각도 |
|---|---|---|---|
| flarelane-d7-retention | `run_d7_event_batch.py` | `ImportError` — bq_helper에 없는 8개 상수 import (experiment_config로 이동됨). 배치 전혀 실행 안 됨 | 치명 |
| flarelane-d7-retention | `run_d7_event_batch.py` | `Path`, `requests`, `config`, `ARM_CONTROL`, `ARM_FIXED5000`, `kst_today_string`, `run_bq_command/query`, `normalize_rows` 누락 | 치명 |
| flarelane-d7-retention | `run_d7_event_batch.py` | SQL `TIME(11, 5, 0)` → assigned_at 11:05 KST, 크론은 09:05 KST — 2시간 불일치 | 고 |
| flarelane-d7-retention | `bq_helper.py` | `kst_today_string()`이 `datetime.now().astimezone()` 사용 — VM 로컬 타임존 의존 | 중 |
| vehicle-dispatch-monitor | `monitor.py` | `run_loop()`에서 `datetime.now()` naive 사용 — OPERATION_START/END 비교가 VM 타임존 의존 | 중 |
| large-bag-delivery-batch | `deploy.yml` | description에 시간 미기재 | 낮 |
| new-region-weekly-monitor | `deploy.yml` | description에 시간 미기재 | 낮 |
| new-region-weekly-monitor | `src/main.py` | `DEFAULT_BQ_BIN = "/Users/wjh/..."` 로컬 Mac 경로 하드코딩 — VM에서 실행 실패 가능 | 고 |

## 구현 계획

### 단계별 작업

- [x] 분석 완료
- [ ] `flarelane-d7-retention/src/run_d7_event_batch.py` imports 수정 + SQL TIME 수정
- [ ] `flarelane-d7-retention/src/bq_helper.py` kst_today_string 명시적 KST 사용
- [ ] `vehicle-dispatch-monitor/monitor.py` run_loop KST 명시적 사용
- [ ] `large-bag-delivery-batch/deploy.yml` description 시간 추가
- [ ] `new-region-weekly-monitor/deploy.yml` description 시간 추가
- [ ] `new-region-weekly-monitor/src/main.py` DEFAULT_BQ_BIN 수정

## 완료 기준

- [x] `run_d7_event_batch.py` ImportError 없이 실행 가능 (module import 테스트 통과)
- [x] 모든 배치의 크론, description, 코드 내 시간이 KST 기준으로 일치
- [x] VM 타임존에 의존하지 않는 명시적 KST timezone 사용
- [x] unused imports 제거 (AST 기반 전수 점검 — 추가 제거 항목 없음)

## 2차 정리: Dead code 제거

| 파일 | 제거 내용 | 사유 |
|---|---|---|
| `flarelane-d7-retention/src/run_d7_event_batch.py` | `REMINDER_EVENT_SOURCE` import | 파일 내 미사용 |
| `flarelane-d7-retention/src/run_addorder_signal_batch.py` | `import config` | 파일 내 미사용 (flarelane_api가 내부에서 import) |
| `large-bag-delivery-batch/src/main.py` | `classify_status`, `summarize_failures` import | main에서 사용 안 함 (slack_notifier/delivery_monitor 내부에서만 사용) |
| `large-bag-delivery-batch/src/delivery_monitor.py` | `SPREADSHEET_ID`, `SHEET_GID`, `is_delivered` import | 파일 내 미사용 |

## 검증 결과

- Python AST 기반 unused imports 검사: 4개 배치 앱, 28개 Python 파일 전수 점검 — 잔존 미사용 import 없음
- `run_d7_event_batch.py` + `run_addorder_signal_batch.py`: 모듈 import 시뮬레이션 통과
- `bq_helper.kst_today_string()` 실제 호출: `2026-04-17` 정상 반환
- 모든 수정 파일 구문 검사 통과

## 3차: VM 점검 및 런타임 버그 수정 (2026-04-17 추가)

### VM 점검 결과
- VM 타임존: **KST (Asia/Seoul, UTC+9)** — 기존 naive `datetime.now()` 코드가 VM 환경 덕에 우연히 동작 중
- SA 유저 홈 (`/home/sa_113995973298337322457/`) 정상, `/shared/.env` 그룹 권한으로 읽기 가능
- `bq` CLI는 `/snap/bin/bq` (snap), cron PATH에 `/snap/bin` 포함 필요
- 4개 배치 모두 cron 등록 완료
- `new-region-weekly-monitor`는 한 번도 실행된 적 없음 (월요일 10시 스케줄, batch.log 없음)

### 런타임 버그 수정

| 파일 | 수정 내용 | 심각도 |
|---|---|---|
| `new-region-weekly-monitor/src/main.py` | `load_dotenv()`가 앱 디렉토리 대신 `/shared/.env`에서 로드하도록 변경 | CRITICAL |
| `vehicle-dispatch-monitor/sheets.py` | 5개 naive `datetime.now()` → `datetime.now(KST)` | HIGH |
| `vehicle-dispatch-monitor/monitor.py` | `date.today()` → `datetime.now(KST).date()` (pickup 날짜 비교용) | HIGH |
| `vehicle-dispatch-monitor/security.py` | 감사 로그 naive `datetime.now()` → `datetime.now(KST)` | HIGH |
| `new-region-weekly-monitor/requirements.txt` | 신규 생성 (deploy-app.sh가 pip install 스킵 방지) | MEDIUM |

### 후속 조치 필요 (이번 PR 제외)
- `large-bag-delivery-batch/config.py`, `flarelane-d7-retention/config.py` 모듈 임포트 시점 `_require()` → lazy로 리팩터 (현재 env는 설정되어 있어 동작 중)
- `run_addorder_signal_batch.py` 스케줄 등록 (별도 deploy.yml 앱 신설 또는 wrapper 필요)
- `large-bag-delivery-batch` watchdog 모드 스케줄 등록 (현재 `--mode register`만 cron 등록)
- `slack_notify.py` 상태 파일 `~/.vehicle_dispatch_slack.json` → `$APP_DIR/logs/`로 이동
- `flarelane DATA_DIR` → `$APP_DIR/data/`로 이동 (SA 홈 의존 제거)
