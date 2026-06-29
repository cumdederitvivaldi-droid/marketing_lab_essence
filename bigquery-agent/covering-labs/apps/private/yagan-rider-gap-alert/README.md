# yagan-rider-gap-alert

야간기사 완료 후 30분간 다음 완료 없으면 `#운영_야간수거` 채널에 해당 기사를 알림하는 배치.

## 목적

매 5분마다 BigQuery를 조회하여, 수거·봉투배송 성공·실패 이후 30분 이상 다음 완료 건이
없는 야간기사를 Slack `#운영_야간수거` 채널에 알림합니다.
중복 알림 방지를 위해 세션 상태를 파일로 관리하며, 매일 22:00에 상태를 초기화합니다.

## 실행 환경

- 실행 방식: crontab
- 실행 주기: 매 5분 (`*/5 22-23,0-7 * * *`) — 크론 실행: 22:00~07:55 KST / 추적 시작: 22:30 (22:00~22:29는 배차 완료 대기 구간으로 스킵)
- 실행 서버: covering-labs-instance (private VM, VPN 전용)

## 주요 파일

| 파일 | 역할 |
|---|---|
| `src/main.py` | 진입점 — 조회·상태관리·알림 오케스트레이션 |
| `src/config.py` | 환경변수 로드 (`/shared/.env` 자동 적용) |
| `src/bq_client.py` | `bq` CLI로 BigQuery 조회 |
| `src/query.sql` | 30분 이상 간격 기사 추출 쿼리 |
| `src/slack_client.py` | Slack `chat.postMessage` 전송 |
| `src/state_manager.py` | 야간 세션 상태 관리 및 중복 알림 방지 |
| `state/alert_state.json` | 런타임 상태 파일 (gitignore됨) |

## 세션 & 상태 관리

- **야간 세션**: 22:00~다음날 08:00을 하나의 세션으로 관리
  - 22:00~23:59 → session_date = 당일
  - 00:00~07:59 → session_date = 전날 (같은 야간 세션)
- **리셋**: 매일 22:00 최초 실행 시 자동 초기화
- **중복 방지**: 동일 rider_id + last_completed_time 조합은 재알림 생략
  - 새 완료 이후 또 30분 멈추면 → last_completed_time이 달라져서 재알림

## 환경변수

| 변수명 | 용도 | 비고 |
|---|---|---|
| `SLACK_BOT_TOKEN` | covani-pickup 봇 토큰 | 기존 `/shared/.env` 재사용 |
| `YAGAN_SUGEO_SLACK_CHANNEL` | 알림 채널 ID | 기본값: `C0ABHQGEDU1` (`#운영_야간수거`) |

## 실행 방법

```bash
cd apps/private/yagan-rider-gap-alert
pip install -r requirements.txt
python3 src/main.py
```

## 의존 서비스

- **BigQuery**: `covering-app-ccd23.secure_dataset` — `fulfillment`, `rider`
- **Slack API**: `chat.postMessage` (covani-pickup 봇)
- **GCP `bq` CLI**: VM에 기설치 (`google-cloud-sdk`)

## 주의사항

- `fulfillment.updated_at` 필드 기준으로 마지막 완료 시각을 산출합니다.
  필드명이 다를 경우 `src/query.sql`을 수정하세요.
- `state/alert_state.json`은 `.gitignore`에 추가되어야 합니다 (런타임 상태 파일).
- 봉투 배송 포함: `company_id`·`ord.name` 필터 없이 모든 fulfillment 대상입니다.
