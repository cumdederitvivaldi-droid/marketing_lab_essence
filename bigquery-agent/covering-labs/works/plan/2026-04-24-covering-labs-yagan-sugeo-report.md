> 유형: 플랜
> 작성일: 2026-04-24
> 상태: 완료

# 야간 수거 리포트 배치 — yagan-sugeo-report

## 개요

매일 오전 8시에 BigQuery에서 당일 야간 수거 주문(오전 8시 이후 수거 예정)을 조회하고,
슬랙 `#운영_야간수거` 채널에 리포트를 자동 전송하는 배치를 구현합니다.

## 구현 내용

- **앱명**: `yagan-sugeo-report`
- **타입**: `batch`
- **스케줄**: `0 8 * * *` (매일 오전 8시 KST)
- **배포 서버**: covering-labs-instance (private VM)

## 데이터 소스

- BigQuery `covering-app-ccd23.secure_dataset`
  - `order_v2` + `fulfillment` + `order_address_snapshot` + `service_region`
- 조건: `DATE(scheduled_start_at) = 오늘` AND `EXTRACT(HOUR) >= 8`

## 리포트 형식

```
🌙 야간 수거 리포트 — YYYY-MM-DD (오전 8시 기준)

📦 오전 8시 이후 수거 예정: N건
• ✅ 완료: A건  • 🔄 진행중: B건  • ⏳ 대기: C건  • ❌ 실패: D건  • 🚫 취소: E건

📋 수거 목록
• HH:MM | 상태아이콘 #주문번호 | 시/구
…
```

## 신규 환경변수

| 변수명 | 용도 |
|---|---|
| `YAGAN_SUGEO_SLACK_CHANNEL` | `#운영_야간수거` 채널 ID (VM `/shared/.env` 에 추가 필요) |

`SLACK_BOT_TOKEN`은 기존 변수 재사용.

## 배포 후 체크리스트

- [ ] `/shared/.env`에 `YAGAN_SUGEO_SLACK_CHANNEL=<채널ID>` 추가
- [ ] `covani-pickup` 봇을 `#운영_야간수거` 채널에 초대
- [ ] apps/AGENTS.md 환경변수 레지스트리에 `YAGAN_SUGEO_SLACK_CHANNEL` 추가
