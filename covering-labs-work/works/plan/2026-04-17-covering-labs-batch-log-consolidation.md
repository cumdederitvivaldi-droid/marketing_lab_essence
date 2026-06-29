# PRD: 배치 로그 파일 통합 — vehicle-dispatch-monitor

> 유형: 플랜
> 작성일: 2026-04-17
> 상태: 완료


---

## 배경

`vehicle-dispatch-monitor` 앱의 대시보드에서 로그 파일이 2개로 표시되는 문제:
- `monitor.log` — `monitor.py` 내부 Python `FileHandler`가 생성
- `backoffice_api.log` — `security.py` `RotatingFileHandler`가 생성 (API 감사 로그)

다른 배치 앱(`large-bag-delivery-batch`, `flarelane-d7-retention`)은 모두 `batch.log` 단일 파일만 사용.  
crontab은 이미 `>> logs/batch.log 2>&1`로 stdout 리다이렉션 중이나, Python 내부 로깅이 별도 파일을 추가로 생성함.

## 수정 내용

### 1. `monitor.py` — FileHandler 파일명 변경
- `monitor.log` → `batch.log`

### 2. `security.py` — backoffice_api.log RotatingFileHandler 제거
- `_log_api_call()`에서 `logger.info(log_line)` 으로 이미 메인 로거에 기록
- `audit_logger`의 `RotatingFileHandler`는 중복, 제거
- 결과: 보안 감사 이벤트가 `batch.log`에 통합

### 3. GCP VM 기존 파일 정리
- `/shared/apps/vehicle-dispatch-monitor/logs/monitor.log` 삭제
- `/shared/apps/vehicle-dispatch-monitor/logs/backoffice_api.log` 삭제

## 전수 조사 결과

| 앱 | 로그 파일 | 이상 없음 |
|---|---|---|
| vehicle-dispatch-monitor | `monitor.log`, `backoffice_api.log` → **수정 필요** | - |
| large-bag-delivery-batch | `batch.log` | ✓ |
| flarelane-d7-retention | `batch.log` | ✓ |
| new-region-weekly-monitor | (없음, 정상) | ✓ |
| today-sugeo-region-sync | (없음, 정상) | ✓ |

## 더미 데이터 조사 결과

- `flarelane-d7-retention`: `sample_payloads/sample_errors` — 실제 런타임 요약 텔레메트리, 더미 아님
- 기타 배치 앱: 더미 데이터 없음
- vehicle-dispatch-monitor: 더미 데이터 없음

## 대시보드 토글 검증 결과

`crontab-io.ts` + `cron-toggle.ts` 분석:
- 읽기 → 순수 함수 변환 → 쓰기 → 재확인(confirmation) 구조 ✓
- 앱별 직렬 잠금(`withAppLock`) — 더블클릭 안전 ✓
- `#[DISABLED]` prefix 방식, idempotent ✓
- 앱 미존재 시 404 에러 ✓
- 기능 이상 없음

## GCP VM 권한 상태

- `logs/` 디렉토리: `drwxrwxr-x`, owner=SA, group=covering-dev ✓
- 로그 파일: `-rw-rw-r--` ✓
- 이상 없음
