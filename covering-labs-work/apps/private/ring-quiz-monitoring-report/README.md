# 링퀴즈 일일 모니터링 리포트

## 목적

링퀴즈 전환, 추천 품질 guardrail, 수기 검색어, 선택값, 피드백을 매일 Slack으로 발송하는 private batch 앱입니다.

## 실행 환경

- Python 3
- covering-labs private VM
- GCP Application Default Credentials 또는 VM 서비스 계정

## 주요 파일

- `src/main.py`: BigQuery 조회, 리포트 포맷, Slack 발송
- `src/summary.sql`: 전환, 피드백, 추천 품질 요약
- `src/keywords.sql`: 수기 검색어 Top 목록
- `src/dimensions.sql`: 추천 결과와 사용자 선택값 분포
- `deploy.yml`: 매일 09:00 KST batch 스케줄

## 환경변수

- `SLACK_BOT_TOKEN`: Slack 발송용 봇 토큰
- `RING_QUIZ_MONITOR_SLACK_CHANNEL`: 리포트를 보낼 채널. 없으면 `PRODUCT_LABS_SLACK_CHANNEL`, `FLARELANE_MONITOR_SLACK_CHANNEL`, `COVERING_LABS_SLACK_CHANNEL`, `SLACK_CHANNEL`, `C0ARXKB2Y9L` 순서로 사용합니다.
- `ENV_FILE`: 공유 env 파일 경로. 기본값은 `/shared/.env`입니다.

## 실행 방법

```bash
python3 src/main.py --dry-run
python3 src/main.py --report-date 2026-05-24 --dry-run
```

## 의존 서비스

- BigQuery `covering-app-ccd23.mixpanel.mp_master_event`
- Slack `chat.postMessage`

## 주의사항

- `--dry-run` 또는 `--no-slack` 옵션은 BigQuery 조회와 리포트 출력만 수행하고 Slack 발송은 하지 않습니다.
- `SLACK_BOT_TOKEN`은 `/shared/.env` 또는 앱 로컬 `.env`에서만 읽고 로그에 출력하지 않습니다.
- 기본 채널은 실험실 리포트 채널이며 운영 환경에서는 앱별 채널 환경변수로 변경할 수 있습니다.
