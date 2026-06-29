# flarelane-d7-retention-monitor

ENG-1559 D7 리텐션 실험의 Slack 모니터 전용 batch 앱입니다.

## 목적

- `09:00`, `18:00 KST` 두 번 실험 상태를 Slack에 정기 발송합니다.
- FlareLane live readback이 안 되더라도 BQ 기준 배정 / 쿠폰 / 재주문 그래프는 반드시 보냅니다.
- 기존 로컬 맥북 crontab 의존을 없애고 `covering-labs private VM`에서 운영합니다.

## 실행 환경

- 실행 방식: cron batch
- 실행 주기: 매일 `09:00`, `18:00 KST`
- 실행 서버: GCP private VM

## 주요 파일

| 파일 | 역할 |
|---|---|
| `src/main.py` | BigQuery 집계, optional live readback, Slack 발송 |
| `deploy.yml` | 배포 스케줄과 실행 명령 |
| `requirements.txt` | Python 의존성 |

## 환경변수

| 환경변수 | 필수 | 설명 |
|---|---|---|
| `SLACK_BOT_TOKEN` | 필수 | Slack 봇 토큰 |
| `ENG1559_MONITOR_SLACK_CHANNEL` | 선택 | 기본값 `C0ARXKB2Y9L` |
| `FLARELANE_PROJECT_ID` | 선택 | live readback 시 사용 |
| `ENG1559_FLARELANE_CONSOLE_BEARER` | 선택 | 있으면 FlareLane live friendtalk 카운터 조회 시도 |
| `BQ_BIN` | 선택 | BigQuery CLI 경로 |
| `ENV_FILE` | 선택 | 기본 `/shared/.env` |

## 실행 예시

```bash
python3 src/main.py --dry-run
python3 src/main.py
```

## 동작 방식

- 기본값은 `BQ 기준 모니터`입니다.
- bearer가 있으면 `MSG_ONLY/PCT50/FIXED5000` 3개 여정의 live friendtalk sent/click/fail 카운터를 같이 읽습니다.
- bearer가 없거나 live readback이 실패하면, Slack 본문에 `[주의] FlareLane live 미조회`를 붙이고 BQ 기준 그래프만 보냅니다.
- VM에서 Python이 `/shared/.env` 를 직접 읽지 못하는 경우에는 bash source fallback으로 env를 로드합니다.

## 주의사항

- 이 앱은 `변경 있을 때만`이 아니라 정해진 시각마다 항상 발송합니다.
- Slack API가 일시적으로 실패하면 내부 retry 후 종료합니다.
