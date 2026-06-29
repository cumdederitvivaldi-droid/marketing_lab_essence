> 유형: PRD
> 작성일: 2026-04-30
> 상태: 확정

# yagan-rider-alert — 야간기사 미완료 알림 배치

## 목적

당일 배차된 야간기사님 중 22:20 기준으로 수거 완료 건이 단 1건도 없는 기사를
`#운영_야간수거` 채널에 자동으로 알림.
운영팀이 22시 20분에 즉시 해당 기사에게 연락하거나 대응 조치를 취할 수 있도록 한다.

## 실행 시점 및 조건

- **트리거**: 매일 22:20 KST (`20 22 * * *`)
- **대상**: 당일(`CURRENT_DATE('Asia/Seoul')`) 수거 예정인 fulfillment에 배차된 기사 (개인·기업·봉투배송 전체)
  - `fulfillment.rider_id IS NOT NULL`
  - `fulfillment.status != 'CANCELED'`
- **조건**: 위 대상 기사 중 오늘 `COMPLETED` 또는 `FAILED` 건이 0인 기사만 추출 (성공·실패 모두 완료로 인정)

## Slack 메시지 형식

### 미완료 기사 있을 때

```text
🚨 야간기사 수거 미완료 알림 — 2026-04-30 22:20 기준

당일 배차 중 수거 완료 건이 없는 기사님: *3명*

🛵 *미완료 기사님 목록*
• 홍길동 (배차 3건)
• 김영희 (배차 2건)
• 이철수 (배차 5건)
```

### 전원 완료 시

```text
✅ 야간기사 수거 미완료 알림 — 2026-04-30 22:20 기준

당일 배차된 모든 기사님이 1건 이상 수거를 완료했습니다.
```

## 앱 구성

| 파일 | 역할 |
|---|---|
| `deploy.yml` | cron `20 22 * * *`, type: batch |
| `src/main.py` | 진입점 — 조회·알림 오케스트레이션 |
| `src/config.py` | 환경변수 로드 (`/shared/.env` 자동 적용) |
| `src/bq_client.py` | bq CLI로 BigQuery 조회 |
| `src/query.sql` | 미완료 기사 추출 쿼리 |
| `src/slack_client.py` | Slack `chat.postMessage` 전송 |

## 환경변수

| 변수명 | 용도 | 비고 |
|---|---|---|
| `SLACK_BOT_TOKEN` | covani-pickup 봇 토큰 | 기존 `/shared/.env` 재사용 |
| `YAGAN_SUGEO_SLACK_CHANNEL` | 알림 채널 ID | 기본값: `C0ABHQGEDU1` (`#운영_야간수거`) — yagan-sugeo-report와 공유 |
