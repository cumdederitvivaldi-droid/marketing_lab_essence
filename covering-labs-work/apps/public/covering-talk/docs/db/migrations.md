# Migrations Ledger

> `migrations/` 의 41개 SQL 파일 번호순 ledger.
> 각 항목 → 도메인 + 영향 테이블 + 한 줄 요약.

## 번호 마이그레이션 (NNN_*.sql)

| # | 파일 | 도메인 | 영향 테이블 | 요약 |
|---|---|---|---|---|
| 001 | `001_pgvector_embeddings.sql` | 공유 | (extension) | pgvector 확장 + product_embeddings 기반 |
| 002 | `002_product_embeddings_table.sql` | 방문 | `product_embeddings` | 개별 키워드 임베딩 테이블 |
| 003 | `003_consultation_embeddings.sql` | 채널톡 | `consultation_embeddings` | 채널톡 Q&A 임베딩 (방문수거와 분리) |
| 004 | `004_macro_embeddings.sql` | 공유 | `macro_embeddings` | CS 매크로 172건 임베딩 |
| 005 | `005_consultation_tags.sql` | 공유 | `consultation_tags` | 상담 태그 마스터 |
| 006 | `006_service_areas.sql` | 공유 | `service_areas` | 서비스 가능 행정동 |
| 007 | `007_category_prompts.sql` | 채널톡 | `category_prompts` | 카테고리별 프롬프트 (해피톡과 분리) |
| 008 | `008_backoffice_requests.sql` | 채널톡 | `backoffice_requests` | Puppeteer 스크래퍼 브릿지 |
| 010 | `010_backoffice_order_detail.sql` | 채널톡 | `backoffice_requests` | 주문 상세 컬럼 추가 |
| 011 | `011_create_lunch_tables.sql` | 런치 | `lunch_vendors`, `lunch_orders` | 런치 코어 테이블 |
| 012 | `012_create_lunch_chat_tables.sql` | 런치 | `lunch_conversations`, `lunch_messages` | 런치 채팅 |
| 013 | `013_add_dispatch_fields.sql` | 방문 | `orders`, `drivers` (신규) | 배차 필드 + drivers 테이블 |
| 013 | `013_add_tax_invoice_tables.sql` | 런치 | `lunch_invoices`, `lunch_vendors`(컬럼) | 세금계산서 + 사업자 정보 |
| 014 | `014_split_drivers_vehicles.sql` | 방문 | `drivers`, `vehicles`(신규) | drivers ↔ vehicles 분리 |
| 015 | `015_lunch_get_last_messages.sql` | 런치 | (RPC) | 런치 대화 마지막 메시지 RPC |
| 016 | `016_lunch_ai_fields.sql` | 런치 | `lunch_conversations` | ai_draft, ai_phase 컬럼 |
| 017 | `017_lunch_ai_order_data.sql` | 런치 | `lunch_conversations` | ai_order_data 컬럼 |
| 018 | `018_lunch_message_serial.sql` | 런치 | `lunch_messages` | serial_number 중복 방지 |
| 019 | `019_vehicle_default_driver.sql` | 방문 | `vehicles` | default_driver_id 컬럼 |
| 020 | `020_add_pickup_invoices.sql` | 방문 | `pickup_invoices` (신규) | 단건 세금계산서 |
| 021 | `021_admin_dashboard.sql` | 대시보드 | `dashboard_settings` (신규) | KR/Health 임계값 시드 |
| 022 | `022_dashboard_notes.sql` | 대시보드 | `dashboard_notes` | 셀 단위 메모/토론 |
| 023 | `023_dashboard_insights.sql` | 대시보드 | `dashboard_insights` | Journey AI 인사이트 캐시 |
| 024 | `024_dashboard_p5_reasons.sql` | 대시보드 | `dashboard_p5_reasons` | P5 넛지 이탈 사유 분류 |
| 025 | `025_dashboard_churn_reasons.sql` | 대시보드 | `dashboard_churn_reasons` | phase 2/4/5/8 이탈 사유 |
| 026 | `026_cs_realtime.sql` | 공유 (visit+lunch+channeltalk) | `messages`, `lunch_messages` (컬럼), `channeltalk_reply_logs` (신규) | reply_kind / responded_in_ms / draft_char_overlap 추가 |
| 027 | `027_dashboard_complaints.sql` | 대시보드 | `dashboard_complaints` (또는 `complaint_classifications`) | 불만 분류 초기 |
| 028 | `028_complaint_none_category.sql` | 대시보드 | (위 테이블) | `none` 카테고리 추가 (FP unmark) |
| 029 | `029_complaints_split_pre_post.sql` | 대시보드 | (위 테이블) | pre/post 분리 |
| 030 | `030_complaints_two_stage_reclassify.sql` | 대시보드 | (위 테이블) | 2단계 reclassify |
| 031 | `031_complaints_stage1_strict_reclassify.sql` | 대시보드 | (위 테이블) | Stage1 strict |
| 032 | `032_cs_presence_log.sql` | 대시보드 | `cs_presence_log` (신규) | 1분 heartbeat 출석 |
| 033 | `033_brand_message.sql` | 실험실 | `brand_message_campaigns`, `brand_message_recipients` (신규) | 브랜드메시지 캠페인 + 수신자 |
| 034 | `034_brand_message_lock.sql` | 실험실 | `brand_message_campaigns` (컬럼) | `in_flight` + `last_invocation_at` — atomic lock (E109 race 방지) |
| 035 | `035_orders_channel.sql` | 방문 | `orders` (컬럼) | `channel` — 예약확정 후 고객이 선택한 유입 채널 (블로그/카페·커버링앱·SNS·지인 추천) |
| 036 | `036_nps_responses.sql` | 방문 | `nps_responses` (신규) | NPS 점수+피드백, phone UNIQUE (평생 1회 가드) |

## 초기 부트스트랩 & 유틸 SQL (번호 없음)

| 파일 | 도메인 | 영향 테이블 | 요약 |
|---|---|---|---|
| `create-bookings-table.sql` | 방문 (legacy) | `bookings` | 초기 예약 테이블 — 2026-04-08 orders 로 이관, 2026-04-27 코드 제거 (DB 잔존, DROP 보류) |
| `create-app-settings-table.sql` | 공유 | `app_settings` | 전역 설정 |
| `create-audit-logs.sql` | 공유 | `audit_logs` | 감사 로그 (2026-04-17 활성화) |
| `create-macros-table.sql` | 공유 | `macros` | 매크로 + 시드 |
| `create-notifications-table.sql` | 공유 | `notifications` | 멘션/배정 알림 |
| `add-item-group-aliases.sql` | 방문 | `products` | item_group + aliases 컬럼 |
| `add-missing-aliases.sql` | 방문 | `products` | aliases 데이터 보강 |
| `backoffice_cache.sql` | 채널톡 | `backoffice_cache` | 24h 조회 캐시 |
| `dhero_deliveries.sql` | 공유 | `dhero_deliveries` | 두발히어로 배송 이력 |

## 동기화 규칙

신규 마이그레이션 추가 시:
1. `migrations/NNN_xxx.sql` 파일 추가 (번호는 마지막+1)
2. 본 ledger 에 1행 추가
3. 해당 도메인 [`<domain>.md`](.) 의 테이블 카탈로그 갱신
4. 외래키·관계 변경 시 [`ERD.md`](ERD.md) 갱신
