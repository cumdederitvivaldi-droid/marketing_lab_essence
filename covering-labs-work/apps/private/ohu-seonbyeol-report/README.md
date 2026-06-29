# ohu-seonbyeol-report

매일 오후 4시(KST) 야간 기사 도착지별 인원 현황을 Slack에 리포트합니다.

## 목적

야간 선별 시작 전 사전 준비를 위해 당일 배차된 야간 기사님 수를 도착지(선별장)별로 집계해 `#운영팀_선별` 채널에 전송합니다.

## 실행 환경

- 실행 방식: cron
- 실행 주기: 매일 오후 4시 (KST) — `0 16 * * *`
- 실행 서버: covering-labs-instance (private VM)

## 주요 파일

| 파일 | 역할 |
|---|---|
| `src/main.py` | 진입점 — BQ 조회 후 Slack 전송 |
| `src/bq_client.py` | BigQuery CLI로 도착지별 기사 수 조회 |
| `src/slack_client.py` | 지역별 합산 및 Slack 메시지 전송 |
| `src/query.sql` | 당일 배차 야간 기사 도착지별 집계 쿼리 |
| `src/config.py` | 환경변수 로드 |

## 환경변수

| 변수명 | 설명 |
|---|---|
| `SLACK_BOT_TOKEN` | Slack 봇 토큰 (공유 변수) |
| `SEONBYEOL_SLACK_CHANNEL` | 전송 채널 (`#운영팀_선별`) |
| `GCP_PROJECT` | GCP 프로젝트 ID (기본값: `covering-app-ccd23`) |

## 실행 방법

```bash
python3 src/main.py
```

## 의존 서비스

- BigQuery: `secure_dataset.rider`
- Slack API: `chat.postMessage`

## 주의사항

- `yagan-seonbyeol-report`(23:00)와 동일한 채널·도착지 매핑을 사용하는 사전 현황 리포트입니다.
- 봉투 수 없이 기사 수만 집계합니다.
