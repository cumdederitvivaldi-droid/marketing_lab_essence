# yagan-sugeo-report

야간 수거 주문을 매일 오전 8시에 Slack `#운영_야간수거` 채널로 리포트하는 배치.

## 목적

BigQuery에서 당일 오전 8시 이후 수거 예정인 주문(`fulfillment.scheduled_start_at >= 08:00 KST`)을
조회하고, 수거 시간·주문번호·지역·상태를 슬랙 운영 채널에 리포트합니다.
운영팀이 하루 야간 수거 물량을 오전 8시에 한눈에 파악할 수 있도록 합니다.

## 실행 환경

- 실행 방식: crontab
- 실행 주기: 매일 오전 8시 KST (`0 8 * * *`)
- 실행 서버: covering-labs-instance (private VM, VPN 전용)

## 주요 파일

| 파일 | 역할 |
|---|---|
| `src/main.py` | 진입점 — 조회·알림 오케스트레이션 |
| `src/config.py` | 환경변수 로드 (`/shared/.env` 자동 적용) |
| `src/bq_client.py` | `bq` CLI로 BigQuery 조회 |
| `src/query.sql` | 야간 수거 주문 조회 쿼리 |
| `src/slack_client.py` | Slack `chat.postMessage` 전송 |

## 환경변수

| 변수명 | 용도 | 비고 |
|---|---|---|
| `SLACK_BOT_TOKEN` | covani-pickup 봇 토큰 | 기존 `/shared/.env` 재사용 |
| `YAGAN_SUGEO_SLACK_CHANNEL` | 알림 채널 ID | 기본값: `C0ABHQGEDU1` (`#운영_야간수거`) |

### 신규 환경변수 추가 방법

VM에서 아래 명령으로 채널 ID를 추가하세요 (채널 이름 대신 ID 사용 권장):

```bash
sudo -u sa_109369409955768144646 nano /shared/.env
# YAGAN_SUGEO_SLACK_CHANNEL=C아무개채널ID  추가
```

채널 ID는 Slack에서 채널명 우클릭 → "채널 세부정보 보기" → 하단 채널 ID에서 확인합니다.
`covani-pickup` 봇이 `#운영_야간수거` 채널에 초대되어 있어야 합니다.

## 실행 방법

```bash
cd apps/private/yagan-sugeo-report
pip install -r requirements.txt
python3 src/main.py
```

## 의존 서비스

- **BigQuery**: `covering-app-ccd23.secure_dataset` — `order_v2`, `fulfillment`, `order_address_snapshot`, `service_region`
- **Slack API**: `chat.postMessage` (covani-pickup 봇)
- **GCP `bq` CLI**: VM에 기설치 (`google-cloud-sdk`)

## 주의사항

- 배포 후 `covani-pickup` 봇을 `#운영_야간수거` 채널에 초대해야 합니다.
- `YAGAN_SUGEO_SLACK_CHANNEL`이 미설정이면 기본값 `C0ABHQGEDU1`(`#운영_야간수거`)으로 전송됩니다. 봇이 해당 채널에 없으면 전송 실패합니다.
- BigQuery 쿼리는 `scheduled_start_at` 기준으로 당일 08:00 KST 이후를 조회합니다. 야간 수거 시간대 정의가 달라지면 `src/query.sql`의 `EXTRACT(HOUR ...)` 조건을 수정하세요.
