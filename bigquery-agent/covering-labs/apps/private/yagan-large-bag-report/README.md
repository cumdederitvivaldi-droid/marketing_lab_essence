# yagan-large-bag-report

매일 22:00에 당일 예정된 대형 봉투 수거 주문 수를 `#운영_야간수거` 채널에 알림하는 배치.

## 목적

야간 운영팀이 당일 밤 처리해야 할 대형 봉투 수거 건수를 22시에 사전 파악할 수 있도록 한다.

## 실행 환경

- 실행 방식: crontab
- 실행 주기: 매일 22:00 KST (`0 22 * * *`)
- 실행 서버: covering-labs-instance (private VM, VPN 전용)

## 주요 파일

| 파일 | 역할 |
|---|---|
| `src/main.py` | 진입점 |
| `src/config.py` | 환경변수 로드 (`/shared/.env` 자동 적용) |
| `src/bq_client.py` | `bq` CLI로 BigQuery 조회 |
| `src/query.sql` | 대형 봉투 수거 주문 집계 쿼리 |
| `src/slack_client.py` | Slack `chat.postMessage` 전송 |

## 환경변수

| 변수명 | 용도 | 비고 |
|---|---|---|
| `SLACK_BOT_TOKEN` | covani-pickup 봇 토큰 | 기존 `/shared/.env` 재사용 |
| `YAGAN_SUGEO_SLACK_CHANNEL` | 알림 채널 ID | 기본값: `C0ABHQGEDU1` (`#운영_야간수거`) |

## 실행 방법

```bash
cd apps/private/yagan-large-bag-report
pip install -r requirements.txt
python3 src/main.py
```

## 의존 서비스

- **BigQuery**: `covering-app-ccd23.secure_dataset` — `fulfillment`, `order_v2`, `order_line`, `product`
- **Slack API**: `chat.postMessage` (covani-pickup 봇)
- **GCP `bq` CLI**: VM에 기설치 (`google-cloud-sdk`)

## 주의사항

- `product_code = 'PICKUP_LARGE_COVERING_BAG'` 기준으로 대형 봉투 수거 주문을 식별합니다.
- `fulfillment.scheduled_start_at` 기준 당일(KST) 주문만 집계합니다.
