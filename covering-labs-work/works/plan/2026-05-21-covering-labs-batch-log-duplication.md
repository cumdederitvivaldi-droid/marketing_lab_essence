> 유형: 플랜
> 작성일: 2026-05-21
> 상태: 확정

# batch.log 중복 로그 제거

## 배경

운영 batch 앱의 `logs/batch.log`에서 모든 로그 라인이 두 번 기록되는 현상.

## 원인

- `apps/AGENTS.md` / `apps/CLAUDE.md` 표준 템플릿이 `logging.basicConfig`에 `StreamHandler()`와 `FileHandler(batch.log)`를 동시에 등록.
- `scripts/deploy-app.sh:145` 가 crontab을 `>> logs/batch.log 2>&1` 로 등록.
- 같은 한 줄이 (1) `FileHandler` 로 batch.log 에 직접 기록 (2) `StreamHandler` → stdout → cron redirect → batch.log 로 또 기록 = 중복.

## 해결

표준 템플릿과 18개 운영 batch 앱에서 `logging.StreamHandler()` 라인 제거. `FileHandler` 만 유지.

- StreamHandler 라인을 떼도 cron이 stderr를 batch.log 로 redirect 하므로 traceback 등 비-logger 출력은 그대로 보존됨.
- `vehicle-dispatch-monitor` 는 StreamHandler 단독 사용으로 중복 원인 아님 → 손대지 않음.
- `new-region-weekly-monitor` 는 FileHandler 단독으로 추가하는 별도 패턴 → 손대지 않음.

## 대상 파일

- `apps/AGENTS.md`, `apps/CLAUDE.md` (batch 표준 템플릿 블록)
- 18개 앱의 main.py (auth-verification-monitor, regular-covering-bag-monitoring-report, ohu-seonbyeol-report, yagan-large-bag-report, flarelane-governance-sync, yagan-sugeo-report, covering-invite-batch, yagan-rider-gap-alert, voc-monitor, flarelane-live-monitoring, airbridge-ads-cost-sync, large-waste-monitoring-report, web2form-alimtalk-batch, yagan-seonbyeol-report, d7-crm-monitoring, yagan-rider-alert, yagan-large-bag-daily-report, aarrr-data-slack-report)

## 검증

- grep `StreamHandler` 잔존 0건 (제외 대상 vehicle-dispatch-monitor 제외)
- 배포 후 운영 batch.log 라인 수가 절반으로 감소하는지 확인
