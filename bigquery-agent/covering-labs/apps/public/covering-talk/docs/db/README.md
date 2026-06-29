# DB 스키마 인덱스

> 도메인별 분할된 7개 문서. 작업할 도메인 문서만 보면 된다.
> 단일 진본은 [`migrations/`](../../migrations) 의 SQL. 본 문서들은 가독성용.

## 빠른 매트릭스

| 도메인 | 문서 | 테이블 수 | 비고 |
|---|---|---|---|
| 방문수거 | [`visit.md`](visit.md) | 11 + 외부 1 | conversations · messages · orders · products · drivers · vehicles · quotes · quote_items · ladder_fees · region_prices · pickup_invoices · ~~bookings~~ (legacy) · ext: CoveringBooking |
| 런치 | [`lunch.md`](lunch.md) | 5 | lunch_vendors · lunch_invoices · lunch_orders · lunch_conversations · lunch_messages |
| 채널톡 | [`channeltalk.md`](channeltalk.md) | 4 | backoffice_requests · backoffice_cache · channeltalk_reply_logs · category_prompts (+ pgvector embeddings) |
| 대시보드 | [`dashboard.md`](dashboard.md) | 7 | dashboard_settings · dashboard_notes · dashboard_insights · dashboard_p5_reasons · dashboard_churn_reasons · dashboard_complaints · cs_presence_log |
| 공유 | [`shared.md`](shared.md) | 7 | app_settings · macros · consultation_tags · audit_logs · notifications · service_areas · dhero_deliveries |
| 마이그레이션 | [`migrations.md`](migrations.md) | 41 | 번호순 ledger + 부트스트랩 SQL |
| 관계도 | [`ERD.md`](ERD.md) | — | 도메인별 Mermaid ER 다이어그램 |

## 외부 데이터 소스

| 소스 | 위치 | 용도 |
|---|---|---|
| Covering 외부 Supabase | `lib/covering/client.ts` `sendToCovering` | 방문수거 order 단방향 동기화 (활성) |
| Google Sheets | `cron/daily-sheet-push`, `cron/lunch-sheet-push` | 운영팀 시트 동기화 (5분) |
| 채널톡 Open/Desk API | `lib/channeltalk/*` | 채널톡 메시지·세션 (DB 저장 안 함) |

## 변경 시 동기화

1. `migrations/NNN_xxx.sql` 추가
2. 해당 도메인 `docs/db/<domain>.md` 의 테이블 카탈로그 갱신
3. [`migrations.md`](migrations.md) 의 ledger 에 1행 추가
4. 외래키·관계 변경 시 [`ERD.md`](ERD.md) 갱신
5. 새 테이블이 도메인 경계 모호하면 [`../architecture/domains.md`](../architecture/domains.md) `## 모호 / 검증 권장` 섹션에도 등록
