# 런치 (Lunch) — 도메인 가이드

> 도시락 폐기물 정기 수거. 카카오 상담톡(해피톡 별도 채널) + 벤더 단위 운영 + Bolta 세금계산서.
> 방문수거와 **DB·채널·AI·UI 모두 분리**.

## Part 인덱스

| # | 문서 | 한 줄 |
|---|---|---|
| 01 | [`01-overview.md`](01-overview.md) | 비즈니스 컨텍스트 · 벤더 운영 모델 · KPI |
| 02 | [`02-ui.md`](02-ui.md) | `/lunch` 단일 페이지 + 3 탭 (Orders/Invoices/Chat) + 모달 |
| 03 | [`03-ai.md`](03-ai.md) | 4단계 경량 Phase + `<order_data>` 파싱 + 톤 규칙 |
| 04 | [`04-api.md`](04-api.md) | API 라우트 카탈로그 (~22개) |
| 05 | [`05-data.md`](05-data.md) | 5 테이블 + Bolta 발행 + Google Sheets 미러 |
| 06 | [`06-integrations.md`](06-integrations.md) | 해피톡(런치) · NicePay · Bolta · Google Sheets |
| 07 | [`07-operations.md`](07-operations.md) | 3 cron · 모니터링 · 정산 사이클 |
| 08 | [`08-gotchas.md`](08-gotchas.md) | 알려진 함정 + 진단 SQL |

## 빠른 진입

- 처음 보는 사람: 01 → 02 → 03 순
- 자동결제·정산 트러블: 07 → 08
- 세금계산서 (Bolta) 이슈: 06 → 08
- DB: [`../../db/lunch.md`](../../db/lunch.md)

## 관련 문서

- [`../visit/README.md`](../visit/README.md) — 방문수거와 비교 시
- [`../../architecture/cron.md`](../../architecture/cron.md) — 11 cron 통합
- [`../../db/lunch.md`](../../db/lunch.md) — 테이블 컬럼 상세
