# yagan-rider-alert

당일 배차된 야간기사 중 22:20 기준 수거 완료 건이 없는 기사를 `#운영_야간수거` 채널에 알림하는 배치.

## 목적

매일 22:20에 BigQuery를 조회하여, 오늘 배차된 야간기사 중 수거 완료 건이 단 1건도 없는 기사를
Slack `#운영_야간수거` 채널에 리포트합니다. 운영팀이 즉시 해당 기사에게 연락하거나 대응 조치를
취할 수 있도록 합니다.

## 실행 환경

- 실행 방식: crontab
- 실행 주기: 매일 22:20 KST (`20 22 * * *`)
- 실행 서버: covering-labs-instance (private VM, VPN 전용)

## 주요 파일

| 파일 | 역할 |
|---|---|
| `src/main.py` | 진입점 — 조회·알림 오케스트레이션 |
| `src/config.py` | 환경변수 로드 (`/shared/.env` 자동 적용) |
| `src/bq_client.py` | `bq` CLI로 BigQuery 조회 |
| `src/query.sql` | 미완료 기사 추출 쿼리 |
| `src/slack_client.py` | Slack `chat.postMessage` 전송 |

## 환경변수

| 변수명 | 용도 | 비고 |
|---|---|---|
| `SLACK_BOT_TOKEN` | covani-pickup 봇 토큰 | 기존 `/shared/.env` 재사용 |
| `YAGAN_SUGEO_SLACK_CHANNEL` | 알림 채널 ID | 기본값: `C0ABHQGEDU1` (`#운영_야간수거`) — yagan-sugeo-report와 공유 |

## 실행 방법

```bash
cd apps/private/yagan-rider-alert
pip install -r requirements.txt
python3 src/main.py
```

## 의존 서비스

- **BigQuery**: `covering-app-ccd23.secure_dataset` — `fulfillment`, `order_v2`, `order`, `rider`
- **Slack API**: `chat.postMessage` (covani-pickup 봇)
- **GCP `bq` CLI**: VM에 기설치 (`google-cloud-sdk`)

## 주의사항

- `covani-pickup` 봇이 `#운영_야간수거` 채널에 초대되어 있어야 합니다 (yagan-sugeo-report와 동일 채널).
- `YAGAN_SUGEO_SLACK_CHANNEL`은 yagan-sugeo-report와 공유하는 환경변수이며, 기본값 `C0ABHQGEDU1`을 그대로 사용합니다.
- 대상 기사 조건: 오늘 수거 예정 개인주문 fulfillment에 배차된 기사 (`rider_id IS NOT NULL`, `status NOT IN ('CANCELED', 'FAILED')`).
- 전원 완료 시에도 슬랙 메시지를 전송합니다 (확인 용도).
