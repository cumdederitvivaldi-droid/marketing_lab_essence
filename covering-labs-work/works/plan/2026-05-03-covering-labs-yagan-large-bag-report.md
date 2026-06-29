> 유형: PRD
> 작성일: 2026-05-03
> 상태: 확정

# yagan-large-bag-report — 야간 대형 봉투 수거 주문 수 22시 알림 배치

## 목적

매일 22:00에 당일 예정된 대형 봉투 수거 주문 수를 `#운영_야간수거` 채널에 알림.
야간 운영팀이 당일 밤 처리해야 할 대형 봉투 수거 건수를 사전에 파악할 수 있도록 한다.

## 실행 시점

- **크론**: `0 22 * * *` (매일 22:00 KST)

## 조회 조건

- `fulfillment.scheduled_start_at` DATE = 오늘 (KST)
- `product.product_code = 'PICKUP_LARGE_COVERING_BAG'`
- `order_v2.status != 'CANCELED'`, `order_v2.deleted_at IS NULL`
- `fulfillment.status != 'CANCELED'`

## Slack 메시지 형식

```text
📦 야간 대형 봉투 수거 현황 — 2026-05-03 22:00 기준

오늘 예정된 대형 봉투 수거: *45건*
• 완료: 2건 / 미완료: 43건
```

## 파일 구성

| 파일 | 역할 |
|---|---|
| `deploy.yml` | cron `0 22 * * *`, type: batch |
| `src/main.py` | 진입점 |
| `src/config.py` | 환경변수 로드 |
| `src/bq_client.py` | BigQuery 조회 |
| `src/query.sql` | 대형 봉투 수거 주문 집계 쿼리 |
| `src/slack_client.py` | Slack 알림 전송 |

## 환경변수

| 변수명 | 비고 |
|---|---|
| `SLACK_BOT_TOKEN` | 기존 `/shared/.env` 재사용 |
| `YAGAN_SUGEO_SLACK_CHANNEL` | 기본값 `C0ABHQGEDU1` 재사용 |
