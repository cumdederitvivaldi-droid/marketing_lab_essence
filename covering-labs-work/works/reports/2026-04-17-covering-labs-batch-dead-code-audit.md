# 배치 앱 Dead Code 전수 감사 보고서

> 유형: 분석
> 작성일: 2026-04-17
> 범위: flarelane-d7-retention, large-bag-delivery-batch, vehicle-dispatch-monitor, new-region-weekly-monitor
> 기준 commit: `e2b4280` (PR #32 머지 이후 main)

## 요약

AST 기반 unused imports + 정의 vs 호출 참조 그래프 + entry point 도달성 분석으로 전수 조사.

| 유형 | 발견 | 실제 제거 대상 | 보존 (의도된 설계) |
|---|---|---|---|
| Unused imports | 2건 | 2건 | 0건 |
| Unused functions | 3건 | 0건 | 3건 (false positive) |
| Orphan modules | 2건 | 0건 | 2건 (실험 설계상 유지) |
| Duplicate defs | 4개 이름 | 0건 | 4개 (boilerplate/entry point 특성) |

**실제 제거**: 2건 (slack_notifier.py `io`, test_changes.py `call`)

---

## US-001: Unused Imports

| 파일 | import | 판정 | 조치 |
|---|---|---|---|
| `apps/large-bag-delivery-batch/src/slack_notifier.py:3` | `io` | ✅ 진짜 미사용 — 파일 전체에 `io` 참조 없음 | 제거 |
| `apps/vehicle-dispatch-monitor/test_changes.py:18` | `call` (unittest.mock) | ✅ 진짜 미사용 — grep 0건 | 제거 |

## US-002: Unused Functions — 모두 False Positive

AST scan 이 다음 패턴을 놓쳐 false positive 발생. 실측 grep 으로 재검증:

| 파일 | 함수 | 실제 호출 여부 | 판정 |
|---|---|---|---|
| `flarelane-d7-retention/src/run_addorder_signal_batch.py` | `build_event` | `emit_to_flarelane(..., build_event, ...)` 로 callable 인자 전달 (L285) | 사용 중 |
| `large-bag-delivery-batch/src/schedule_watchdog.py` | `run` | `from schedule_watchdog import run as run_watchdog` import alias → `run_watchdog(args.slot)` 호출 | 사용 중 |
| `vehicle-dispatch-monitor/channeltalk.py` | `SendResult` | `from channeltalk import SendResult` + `SendResult.SUCCESS`, `SendResult.AUTH_ERROR` 사용 | 사용 중 |

교훈: AST `Call(func=Name)` 만 집계하면 (1) callable 인자 전달, (2) `import ... as ALIAS` 별칭, (3) 클래스 상수/enum 접근 을 놓친다.

## US-003: Orphan Modules

| 앱 | 모듈 | 상태 | 판정 |
|---|---|---|---|
| flarelane-d7-retention | `run_addorder_signal_batch` | `deploy.yml` command 에 없음 | **의도된 orphan** — ENG-1559 benefit journey(PCT50/FIXED5000) 수동 실행용 |
| flarelane-d7-retention | `flarelane_api` | `run_addorder_signal_batch` 에서만 import | **의도된 orphan** — 위와 함께 사용 |

`deploy.yml` 은 single command 구조라 한 앱에서 여러 cron 을 등록할 수 없음. 미사용 batch 를 주기 실행하려면 별도 앱으로 분리하거나 wrapper 스크립트가 필요하지만 이는 이번 범위 외.

## US-004: Duplicate Defs — 의도된 boilerplate

| 이름 | 발견 위치 | 판정 |
|---|---|---|
| `_load_env_file` | 3개 앱의 `config.py` (flarelane, large-bag, vehicle-dispatch) | boilerplate 패턴 — 공통 라이브러리 추출 가능하지만 앱 간 결합 늘어남. 현재 독립성 유지가 단순 |
| `_require` | 2개 앱 `config.py` | 동일 |
| `main` | 각 앱 entry point | entry point 특성상 자연스러운 중복 |
| `run` | 3개 `schedule_watchdog.py` / `server_monitor.py` / `server_watchdog_check.py` | 각각 다른 스크립트의 entry |

현재 이 작업 범위에서는 consolidation 진행 안 함.

## US-005: 제거 실행 및 검증

### 제거된 파일
- `apps/large-bag-delivery-batch/src/slack_notifier.py`: `import io` 삭제
- `apps/vehicle-dispatch-monitor/test_changes.py`: `from unittest.mock import ..., call` 에서 `call` 삭제

### 검증 결과
- `python3 -m py_compile` 통과 (0건)
- `apps/vehicle-dispatch-monitor/test_changes.py`: **77 tests passed** in 0.17s (회귀 없음)

## 주의사항

이 감사는 **정적 분석 + 참조 그래프 기반**이라 다음은 탐지 불가:
- `getattr(mod, "name")` 처럼 동적으로 참조되는 코드
- 문자열 기반 import (`importlib.import_module(...)`)
- 외부 cron/GitHub Actions workflow 에서 직접 실행되는 스크립트

현재 앱들은 위 패턴을 사용하지 않으므로 이번 결과는 신뢰 가능.
