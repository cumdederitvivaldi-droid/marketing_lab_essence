# yagan-seonbyeol-report

매일 23:00 KST에 당일 배차된 야간 기사님의 도착지(선별장)별 기사 수와 봉투 수를 `#운영팀_선별` 채널에 리포트하는 배치.

## 목적

선별 운영팀이 매일 밤 23시에 선별장별 당일 작업량(기사 수·봉투 수)을 한눈에 파악할 수 있도록 한다.
`rider.final_destination` 기준으로 도착지를 지역(남양주·인천·화성·세종)으로 묶어 표시한다.

## 실행 환경

- 실행 방식: crontab
- 실행 주기: 매일 23:00 KST (`0 23 * * *`)
- 실행 서버: covering-labs-instance (private VM, VPN 전용)

## 도착지 매핑

| 선별장 값 | 표시 지역 |
|---|---|
| 선별장A, 선별장E | 남양주 |
| 선별장B, 선별장D | 인천 |
| 선별장C | 화성 |
| 선별장F | 세종 |

## 주요 파일

| 파일 | 역할 |
|---|---|
| `src/main.py` | 진입점 — BigQuery 조회 + Slack 전송 |
| `src/config.py` | 환경변수 로드 (`/shared/.env` 자동 적용) |
| `src/bq_client.py` | BigQuery 도착지별 기사 수·봉투 수 조회 |
| `src/query.sql` | 집계 쿼리 |
| `src/slack_client.py` | 리포트 포맷 및 Slack 전송 |

## 환경변수

| 변수명 | 용도 | 비고 |
|---|---|---|
| `SLACK_BOT_TOKEN` | Slack 봇 토큰 | 기존 `/shared/.env` 재사용 |
| `SEONBYEOL_SLACK_CHANNEL` | `#운영팀_선별` 채널 ID | **VM에서 직접 추가 필요** |

> `SEONBYEOL_SLACK_CHANNEL` 값은 Slack 채널 설정에서 채널 ID(C로 시작)를 확인 후
> VM에서 `sudo -u sa_109369409955768144646 nano /shared/.env` 로 추가하세요.

## 실행 방법

```bash
cd apps/private/yagan-seonbyeol-report
pip install -r requirements.txt
python3 src/main.py
```

## 의존 서비스

- **BigQuery**: `covering-app-ccd23.secure_dataset` — `fulfillment`, `order_v2`, `rider`
- **Slack API**: `chat.postMessage` (covani-pickup 봇)
- **GCP `bq` CLI**: VM에 기설치 (`google-cloud-sdk`)

## 주의사항

- `rider.final_destination` 컬럼이 NULL인 기사는 `미지정`으로 분류됩니다.
- 스케줄 시간은 KST 기준입니다.
- `SEONBYEOL_SLACK_CHANNEL` 미설정 시 배치가 즉시 실패합니다.
