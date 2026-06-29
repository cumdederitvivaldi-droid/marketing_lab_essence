# 방문수거 (Visit / Pickup) — 도메인 가이드

> 건물 폐기물 방문 수거 — 카카오 상담톡(해피톡) 채널 기반 견적·예약·배차·결제·CS.
> 본 도메인의 진본은 내부 Supabase. 외부 covering DB 는 `sendToCovering` 단방향 동기화만.

## Part 인덱스

| # | 문서 | 한 줄 |
|---|---|---|
| 01 | [`01-overview.md`](01-overview.md) | 비즈니스 컨텍스트 · 고객·상담사 시나리오 · 핵심 KPI |
| 02 | [`02-ui.md`](02-ui.md) | 6개 페이지 맵 + 핵심 컴포넌트 + 커바니 |
| 03 | [`03-ai.md`](03-ai.md) | 9단계 Phase 머신 · 프롬프트 · 분류 임계값 · 임베딩 |
| 04 | [`04-api.md`](04-api.md) | API 라우트 카탈로그 (~70개) |
| 05 | [`05-data.md`](05-data.md) | DB 테이블 + 외부 Sheet/Covering 동기화 |
| 06 | [`06-integrations.md`](06-integrations.md) | 해피톡 · NicePay · Dhero · Kakao Local · Slack · Covering · Google Sheets |
| 07 | [`07-operations.md`](07-operations.md) | 7개 Cron · 모니터링 · 배포 영향 |
| 08 | [`08-gotchas.md`](08-gotchas.md) | 알려진 함정 + 디버깅 가이드 + 자주 쓰는 SQL |

## 빠른 진입

- 처음 보는 사람: 01 → 02 → 03 순
- API 추가/수정: 04 → [`../../api/tags.md`](../../api/tags.md)
- DB 스키마: [`../../db/visit.md`](../../db/visit.md)
- 장애 대응: 08 → 07 → 06
- 외부 콘솔 자격증명 / 로테이션: 06

## 관련 문서

- [`../../architecture/overview.md`](../../architecture/overview.md) — 시스템 전체 경계
- [`../../architecture/domains.md`](../../architecture/domains.md) — 도메인 매핑
- [`../../architecture/cron.md`](../../architecture/cron.md) — 11 cron 통합
- [`../../db/visit.md`](../../db/visit.md) — 테이블 컬럼 상세
- [`../../db/ERD.md`](../../db/ERD.md) — ER 다이어그램
