# 채널톡 (Channeltalk) — 도메인 가이드

> 일반 고객지원 (80L/220L 봉투, 구독, 배송 등). 채널톡 플랫폼 기반 — **DB 저장 없음**.
> AI 추천 파이프라인이 핵심 (분류 → RAG → 생성 → 톤).

## Part 인덱스

| # | 문서 | 한 줄 |
|---|---|---|
| 01 | [`01-overview.md`](01-overview.md) | 비즈니스 컨텍스트 · 채널톡 vs 해피톡 비교 · 84+ 카테고리 |
| 02 | [`02-ui.md`](02-ui.md) | `/channeltalk` 3열 + 8 컴포넌트 + 분석 페이지 |
| 03 | [`03-ai.md`](03-ai.md) | 4단계 AI 파이프라인 (분류 → RAG → 생성 → 톤) |
| 04 | [`04-api.md`](04-api.md) | API 라우트 + 채널톡 Open/Desk API 매핑 |
| 05 | [`05-data.md`](05-data.md) | 부가 4 테이블 + RAG 임베딩 + 매니저 ID 매핑 |
| 06 | [`06-integrations.md`](06-integrations.md) | 채널톡 Open/Desk API · 백오피스 스크래퍼 · Voyage AI |
| 07 | [`07-operations.md`](07-operations.md) | 자동 종료/배차 cron · 백오피스 모니터링 |
| 08 | [`08-gotchas.md`](08-gotchas.md) | 알려진 함정 + 백오피스 다운 · circuit breaker |

## 빠른 진입

- 처음 보는 사람: 01 → 02 → 03
- AI 파이프라인 이해: 03 → 06 (Voyage)
- 백오피스 장애: 08 → 07
- DB: [`../../db/channeltalk.md`](../../db/channeltalk.md)

## 관련 문서

- [`../visit/README.md`](../visit/README.md) — 방문수거와 비교
- [`../../db/channeltalk.md`](../../db/channeltalk.md) — 부가 테이블 컬럼
- [`../../../tools/channeltalk-ai/README.md`](../../../tools/channeltalk-ai/README.md) — AI 학습/시드 파이프라인
