> 유형: PRD
> 작성일: 2026-05-18
> 상태: 확정

# yagan-seonbyeol-report — 야간 기사 도착지별 선별장 리포트 배치

## 목적

매일 23:00 KST에 당일 배차된 야간 기사님의 도착지(선별장)별 기사 수와 배차된 봉투 수를 `#운영팀_선별` 채널에 리포트.
선별 운영팀이 당일 밤 선별장별 작업량을 사전에 파악하도록 한다.

## 실행 시점

- **크론**: `0 23 * * *` (매일 23:00 KST)

## 조회 조건

- `fulfillment.scheduled_start_at` DATE = 오늘 (KST)
- `fulfillment.rider_id IS NOT NULL` (배차된 건만)
- `fulfillment.status != 'CANCELED'`
- `order_v2.status != 'CANCELED'`, `order_v2.deleted_at IS NULL`
- `rider.final_destination` 기준으로 도착지 분류

## 도착지 매핑

| 선별장 값 | 표시 지역 |
|---|---|
| 선별장A, 선별장E | 남양주 |
| 선별장B, 선별장D | 인천 |
| 선별장C | 화성 |
| 선별장F | 세종 |
| 기타/미지정 | 미지정 |

## Slack 메시지 형식

```text
🏭 야간 선별 리포트 — 2026-05-18 23:00 기준

도착지별 기사 현황

📍 남양주 (선별장A, E)
  기사 5명 | 봉투 120건

📍 인천 (선별장B, D)
  기사 3명 | 봉투 80건

📍 화성 (선별장C)
  기사 2명 | 봉투 45건

📍 세종 (선별장F)
  기사 1명 | 봉투 20건

합계: 기사 11명 | 봉투 265건
```

## 파일 구성

| 파일 | 역할 |
|---|---|
| `deploy.yml` | cron `0 23 * * *`, type: batch |
| `src/main.py` | 진입점 |
| `src/config.py` | 환경변수 로드 |
| `src/bq_client.py` | BigQuery 조회 |
| `src/query.sql` | 도착지별 기사 수·봉투 수 집계 쿼리 |
| `src/slack_client.py` | Slack 리포트 전송 |
| `README.md` | 앱 설명 |

## 환경변수

| 변수명 | 비고 |
|---|---|
| `SLACK_BOT_TOKEN` | 기존 `/shared/.env` 재사용 |
| `SEONBYEOL_SLACK_CHANNEL` | 신규 — `#운영팀_선별` 채널 ID, VM에서 추가 필요 |
