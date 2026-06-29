# yagan-large-bag-daily-report

매일 오전 08:00에 전날 야간 대형 봉투 수거 주문의 상태별 일일 리포트를 `#운영_야간수거` 채널에 발송하는 배치.

## 목적

야간 수거 운영팀이 전날 밤 처리된 대형 봉투 수거 결과를 오전 8시에 한눈에 파악하도록 한다.
상태별 건수 및 전주 동요일(WoW) 비교, 확인필요 사유, 정책미준수 사유를 포함한다.

## 실행 환경

- 실행 방식: crontab
- 실행 주기: 매일 08:00 KST (`0 8 * * *`)
- 실행 서버: covering-labs-instance (private VM, VPN 전용)

## 상태 분류 기준

| 상태 | 조건 |
|---|---|
| 수거완료 | `fulfillment.status = COMPLETED` + 아이템 FAILED 없음 |
| 확인필요(전체) | `fulfillment.status = COMPLETED` + 전체 아이템 FAILED |
| 확인필요(일부) | `fulfillment.status = COMPLETED` + 일부 아이템 FAILED |
| 사용자 취소 | `fulfillment.status = CANCELED` |
| 정책미준수 | `fulfillment.status = FAILED` + `failure_reason_code = POLICY_FAIL` |
| 미배출 | `fulfillment.status = FAILED` + `failure_reason_code = NOTFOUND_FAIL` |
| 진입 실패 | `fulfillment.status = FAILED` + `failure_reason_code = ENTER_FAIL` |

1주문에 다수 fulfillment가 있는 경우 `COMPLETED > CANCELED > FAILED` 우선순위로 최종 상태 결정.
WoW 비교는 7일 전 같은 날 기준.

## 주요 파일

| 파일 | 역할 |
|---|---|
| `src/main.py` | 진입점 — 날짜 계산, 조회, Slack 발송 조율 |
| `src/config.py` | 환경변수 로드 (`/shared/.env` 자동 적용) |
| `src/bq_client.py` | BigQuery 조회 — 상태 집계·확인필요 사유·정책미준수 사유 |
| `src/slack_client.py` | 리포트 포맷 및 Slack 전송 |

## 환경변수

| 변수명 | 용도 | 비고 |
|---|---|---|
| `SLACK_BOT_TOKEN` | covani-pickup 봇 토큰 | 기존 `/shared/.env` 재사용 |
| `YAGAN_SUGEO_SLACK_CHANNEL` | 알림 채널 ID | 기본값: `C0ABHQGEDU1` (`#운영_야간수거`) |

## 실행 방법

```bash
cd apps/private/yagan-large-bag-daily-report
pip install -r requirements.txt
python3 src/main.py
```

## 의존 서비스

- **BigQuery**: `covering-app-ccd23.secure_dataset` — `fulfillment`, `fulfillment_item`, `order_v2`, `order_line`, `product`
- **Slack API**: `chat.postMessage` (covani-pickup 봇)
- **GCP `bq` CLI**: VM에 기설치 (`google-cloud-sdk`)

## 주의사항

- `product_code = 'PICKUP_LARGE_COVERING_BAG'` 기준으로 대형 봉투 수거 주문을 식별합니다.
- `fulfillment.scheduled_start_at` 기준 전날(KST) 주문만 집계합니다.
- `fulfillment_item.failure_reason_message` 가 NULL인 아이템은 사유 집계에서 제외됩니다.
