# 대시보드 (New Dashboard) — 도메인 가이드

> 신규 관리자 대시보드 (`/new_dashboard`). KR · Customer Journey · Health Check · Traffic · CS Realtime + AI 인사이트.
> 다른 3 도메인의 데이터를 read-only 로 통합 — 자체 운영 데이터는 presence + complaint 분류만.

## Part 인덱스

| # | 문서 | 한 줄 |
|---|---|---|
| 01 | [`01-overview.md`](01-overview.md) | 대시보드 목적 · 5 섹션 (KR/Journey/Health/Traffic/CS Realtime) · 권한 |
| 02 | [`02-ui.md`](02-ui.md) | `/new_dashboard` 레이아웃 + 컴포넌트 · 모달 · 메모 시스템 |
| 03 | [`03-ai.md`](03-ai.md) | 인사이트(Sonnet) · P5/Churn 사유 분류(Haiku) · 불만 분류 cron |
| 04 | [`04-api.md`](04-api.md) | API 라우트 카탈로그 + 캐시 전략 |
| 05 | [`05-data.md`](05-data.md) | 7 테이블 + read-only 의존 테이블 |
| 06 | [`06-integrations.md`](06-integrations.md) | Anthropic 만 (외부 푸시 연동 없음) |
| 07 | [`07-operations.md`](07-operations.md) | classify-complaints cron · 캐시 만료 · 모니터링 |
| 08 | [`08-gotchas.md`](08-gotchas.md) | 알려진 함정 + 진단 SQL + presence 디버깅 |

## 빠른 진입

- 처음 보는 사람: 01 → 02 → 03
- presence 안 보이는 문제: 08 → 03
- 불만 분류 정확도: 03 → 07
- DB: [`../../db/dashboard.md`](../../db/dashboard.md)

## 관련 문서

- [`../visit/README.md`](../visit/README.md) / [`../lunch/README.md`](../lunch/README.md) / [`../channeltalk/README.md`](../channeltalk/README.md) — 데이터 소스
- [`../../db/dashboard.md`](../../db/dashboard.md) — 7 테이블 컬럼
- [`../../architecture/cron.md`](../../architecture/cron.md) — classify-complaints
