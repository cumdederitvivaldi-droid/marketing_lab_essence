# DB 스키마 (구 단일 문서) — 폐기 예정

> 본 문서는 2026-04-27 부 도메인별 분할로 대체됐다.
> 새 위치: [`README.md`](README.md) 인덱스 + `visit.md` / `lunch.md` / `channeltalk.md` / `dashboard.md` / `shared.md`.
> 본 파일은 일시적 호환성 안내만 남기며, 다음 정리 사이클에 삭제 예정.

## 새 문서 매핑

| 기존 섹션 | 새 위치 |
|---|---|
| `1.1 conversations` ~ `1.5b vehicles`, `1.10 products`~`1.14 region_prices` | [`visit.md`](visit.md) |
| `1.6 lunch_vendors` ~ `1.8 lunch_messages`, `1.6-1 lunch_invoices`, `1.7 lunch_orders` | [`lunch.md`](lunch.md) |
| `1.19 category_prompts`, `1.20 backoffice_requests`, `1.25 channeltalk_reply_logs` | [`channeltalk.md`](channeltalk.md) |
| `1.22 dashboard_settings`, `1.23 dashboard_notes`, `1.24 dashboard_insights` (+ m024~031, m032) | [`dashboard.md`](dashboard.md) |
| `1.15 app_settings`, `1.16 macros`, `1.17 consultation_tags`, `1.18 audit_logs`, `1.21 notifications` | [`shared.md`](shared.md) |
| `2. Covering 외부 DB`, `3. Google Sheets` | 각 도메인 문서의 외부 연동 섹션 |
| `ER 다이어그램` | [`ERD.md`](ERD.md) (Mermaid 4개 도메인) |
| `스키마 파일 위치` (마이그레이션 ledger) | [`migrations.md`](migrations.md) |

## 인덱스 / 카테고리 매트릭스

[`README.md`](README.md) 참조.
