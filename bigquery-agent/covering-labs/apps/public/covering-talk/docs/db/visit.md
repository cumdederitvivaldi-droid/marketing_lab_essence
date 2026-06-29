# 방문수거 DB 스키마

> 건물 폐기물 방문 수거 시스템 — 카카오 상담톡(해피톡) 기반.
> 진본: 내부 Supabase. 외부 covering Supabase 는 단방향 동기화 (sendToCovering 만).

## 테이블 한눈

| 테이블 | 용도 | 주요 코드 |
|---|---|---|
| `conversations` | 상담 세션 (Phase·collected_info·견적·예약 메타) | `lib/store/conversations.ts` |
| `messages` | 채팅 메시지 (assistant/user/system + reply_kind) | (위와 동일) |
| `orders` | 주문 (예약/배차/결제 통합, 2026-04-08 진본 전환) | `lib/store/orders.ts` |
| `products` | 품목 마스터 313건 | `lib/utils/product-search.ts` |
| `drivers` | 기사 마스터 | `lib/store/drivers.ts` |
| `vehicles` | 차량 마스터 (default_driver 매핑) | `lib/store/vehicles.ts` |
| `quotes` | 견적 메인 | `app/api/quote/calculate/route.ts` |
| `quote_items` | 견적 품목 (FK quotes) | (위와 동일) |
| `ladder_fees` | 사다리차 요금 마스터 | `lib/dispatch/zones.ts` |
| `region_prices` | 지역별 가격 마스터 | `lib/dispatch/zones.ts` |
| `pickup_invoices` | 방문수거 단건 세금계산서 (migration 020) | `lib/store/pickup-invoices.ts` |
| `nps_responses` | NPS 설문 응답 (phone UNIQUE, 평생 1회 가드) | `lib/store/nps.ts` |
| ~~`bookings`~~ | **레거시** — 코드 이관 완료, DB 테이블만 잔존 (DROP 보류) | — |

---

## 1. `conversations` — 상담 세션

| 컬럼 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| session_id | TEXT | PK | 해피톡 세션 ID |
| user_key | TEXT | NOT NULL | 해피톡 userKey |
| sender_key | TEXT | NOT NULL | 해피톡 senderKey |
| phone | TEXT | | 전화번호 |
| name | TEXT | | 고객명 |
| status | TEXT | 'pending' | 상담 상태 (아래 enum 참조) |
| assignee | TEXT | | 담당 상담사 |
| tags | TEXT[] | '{}' | 태그 |
| memo | TEXT | '' | 메모 |
| needs_human | BOOLEAN | false | 상담사 개입 필요 |
| unread_count | INT | 0 | 미읽은 메시지 수 |
| ai_draft | TEXT | | AI 초안 (검토 후 전송) |
| quote | JSONB | | 견적 데이터 |
| booking | JSONB | | 예약 데이터 |
| current_phase | TEXT | | Phase (`phase_1`~`phase_8`, `closed`) |
| collected_info | JSONB | | `{address, district, floor, elevator, parking, items, ...}` |
| phase_history | JSONB | '[]' | Phase 전환 이력 |
| created_at / updated_at | TIMESTAMPTZ | NOW() | |

**status enum**: `pending`, `quote_sent_nudge`, `quote_sent_no_nudge`, `nudge_sent`, `wrong_inbound`, `night_pickup`, `booked`, `cancelled`, `needs_check`, `no_response`, `completed`, `payment_check`

**Phase 정의**: [`lib/ai/phases.ts`](../../lib/ai/phases.ts)

## 2. `messages` — 채팅 메시지

| 컬럼 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| id | TEXT | PK | 메시지 ID |
| session_id | TEXT | FK → conversations | |
| role | TEXT | NOT NULL | `user` / `assistant` / `system` / `ai_draft` |
| content | TEXT | NOT NULL | 본문 |
| message_type | TEXT | 'text' | text / image / file |
| image_url | TEXT | | |
| sent_by | TEXT | | 발신자 (상담사 이름) |
| is_edited | BOOLEAN | false | |
| reply_kind | TEXT | | (assistant only, m026) `ai_auto` / `ai_assist` / `human` |
| responded_in_ms | INT | | (assistant only, m026) 직전 user 메시지로부터 ms |
| draft_char_overlap | REAL | | (m026) AI draft 대비 송신본 일치 비율 0.0~1.0 |
| created_at | TIMESTAMPTZ | NOW() | |

**분류 임계값**: `lib/utils/reply-classify.ts`. `overlap ≥ 1.0` → ai_auto, `≥ 0.6` → ai_assist, 그 외 → human.

## 3. `orders` — 주문

2026-04-08 부 외부 covering DB → 내부 `orders` 단일 진본 전환. 모든 신규 flow 가 여기 기록.

| 컬럼 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| id | UUID | PK gen_random_uuid() | |
| order_number | TEXT | UNIQUE NOT NULL | 8자리 영숫자 |
| session_id | TEXT | | conversations 연결 |
| status | TEXT | 'confirmed' | confirmed / cancelled / payment_requested / completed |
| customer_name | TEXT | NOT NULL | |
| phone | TEXT | NOT NULL | 010-XXXX-XXXX |
| address | TEXT | '' | |
| date | TEXT | NOT NULL | YYYY-MM-DD |
| time_slot | TEXT | '' | |
| floor | INT | | |
| has_elevator / has_parking / has_ground_access / need_ladder | BOOLEAN | | 현장 조건 |
| ladder_fee | INT | 0 | |
| crew_size | INT | 1 | |
| items | JSONB | '[]' | `[{category, name, displayName, price, quantity, volume}]` |
| total_volume | NUMERIC(8,3) | 0 | |
| total_price | INT | 0 | |
| payment_ids | JSONB | '[]' | 결제 이력 `[{reqId, payUrl, sentAt, tid, paidAt}]` (NicePay polling 결과 누적) |
| driver_id / driver_name / driver_phone | TEXT | '' | 배차 |
| route_order | INT | 0 | |
| is_dispatched | BOOLEAN | false | |
| dispatched_at | TIMESTAMPTZ | | |
| memo | TEXT | '' | (covering 동기화 시 `[커버링: ID]` 패턴 누적) |
| photos | JSONB | '[]' | |
| channel | TEXT | NULL | 유입 채널 — `블로그/카페` / `커버링앱` / `SNS` / `지인 추천` (예약확정 후 4-버튼 설문, phone 단위 자동 상속) |
| created_at / updated_at | TIMESTAMPTZ | now() | |

**커버링 외부 DB 동기화**: 답변 발송 시 `lib/covering/client.ts:sendToCovering` 가 외부 Supabase 의 `bookings` 테이블에 단방향 INSERT, 결과 ID 를 본 테이블 `memo` 에 `[커버링: <uuid>]` 로 기록.

## 4. `products` — 품목 마스터 (313건)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL PK | |
| category | TEXT NOT NULL | |
| name | TEXT NOT NULL | |
| display_name | TEXT | UI 표시명 |
| item_group | TEXT | 그룹화 |
| aliases | TEXT[] | 검색 별칭 |
| width / depth / height / volume | REAL | 치수 |
| unit_price | INT | 단가 |
| weight | REAL | |

품목 임베딩: `product_embeddings` (migration 002). 검색은 `lib/utils/product-search.ts` (Voyage AI).

## 5. `drivers` — 기사 마스터

| 컬럼 | 타입 | 기본 | 설명 |
|------|------|------|------|
| id | UUID PK | gen_random_uuid() | |
| name | TEXT NOT NULL | | |
| phone | TEXT | '' | |
| memo | TEXT | '' | |
| is_active | BOOLEAN | true | |
| sort_order | INT | 0 | |
| created_at / updated_at | TIMESTAMPTZ | now() | |

## 6. `vehicles` — 차량 마스터 (m014, m019)

| 컬럼 | 타입 | 기본 | 설명 |
|------|------|------|------|
| id | UUID PK | gen_random_uuid() | |
| plate_number | TEXT UNIQUE NOT NULL | | 차량번호 |
| vehicle_type | TEXT NOT NULL | | `2.5톤` / `1톤 탑차` / `1톤 저상탑차` |
| max_cube | NUMERIC | 0 | 최대 적재 m³ |
| memo | TEXT | '' | |
| is_active | BOOLEAN | true | |
| default_driver_id | UUID FK → drivers (m019) | | 자동배차 시 같이 배정 |
| created_at / updated_at | TIMESTAMPTZ | now() | |

## 7. `quotes` — 견적

| 컬럼 | 타입 | 기본 | 설명 |
|------|------|------|------|
| id | TEXT PK | gen_random_uuid() | |
| session_id | TEXT FK → conversations | | |
| region | TEXT | | |
| workers | INT | 1 | |
| base_price / items_total / ladder_fee / subtotal / tax / total | INT | 0 | |
| status | TEXT | 'draft' | |
| created_at / updated_at | TIMESTAMPTZ | NOW() | |

## 8. `quote_items` — 견적 품목

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL PK | |
| quote_id | TEXT FK → quotes (CASCADE) | |
| product_id | INT FK → products | |
| category, name, display_name | TEXT | |
| width / depth / height / volume / weight | REAL | |
| unit_price / quantity / subtotal | INT | |

## 9. `ladder_fees` — 사다리차 요금

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL PK | |
| type | TEXT NOT NULL | 사다리차 종류 |
| under_1h | INT | 1시간 미만 |
| h1 ~ h7 | INT | 1~7시간 요금 |

## 10. `region_prices` — 지역별 가격

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL PK | |
| region | TEXT UNIQUE | |
| price_1 / price_2 / price_3 | INT | 가격 단계 |

## 11. `pickup_invoices` — 단건 세금계산서 (m020)

방문수거 일회성 세금계산서 발행 이력. 구체 컬럼은 [`migrations/020_add_pickup_invoices.sql`](../../migrations/020_add_pickup_invoices.sql) 참조.

## 12. `nps_responses` — NPS 설문 응답 (m036)

방문수거 결제완료 (`orders.status='completed'`) 다음날 12:00 KST 자동 발송되는 4-버튼 NPS 설문의 응답 적재. **phone UNIQUE → 평생 1회 가드** (재예약 고객도 한 번만 묻기).

| 컬럼 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| id | UUID | PK gen_random_uuid() | |
| phone | TEXT | NOT NULL UNIQUE | 평생 1회 키 — race-safe DB 가드 |
| order_id | UUID | FK orders(id) ON DELETE SET NULL | 발송 시점 매칭된 주문 |
| session_id | TEXT | | conversations 연결 |
| customer_name | TEXT | | 발송 시점 스냅샷 |
| sent_at | TIMESTAMPTZ | now() NOT NULL | NPS 메시지 송출 시각 |
| score_bucket | TEXT | NULL | `1~2점` / `3점` / `4점` / `5점` (미응답이면 NULL) |
| responded_at | TIMESTAMPTZ | NULL | 점수 버튼 클릭 시각 |
| feedback_text | TEXT | NULL | 자유 피드백 (점수 응답 후 30분 이내 자유 텍스트만 수집) |
| feedback_at | TIMESTAMPTZ | NULL | |
| created_at | TIMESTAMPTZ | now() | |

발송 로직: 일일 cron (`/api/cron/nps-daily`, 매일 12:00 KST) 또는 일회성 bulk (`/api/lab/nps/bulk-send`). 응답 처리는 `/api/webhook/message` 가 phone 으로 row 찾아 score / feedback 저장.

## ~~`bookings`~~ — 레거시 (DROP 보류)

2026-04-27 코드 측 100% 정리 완료. 모든 라우트/store 삭제, UI 의 `/bookings` 도 내부적으로 `/api/orders/*` 호출. **테이블 자체는 Supabase 에 잔존** (DROP 보류). 신규 코드에서 참조 금지.

---

## 외부 DB — `CoveringBooking`

`lib/covering/client.ts` 가 외부 Supabase 의 `bookings` 테이블에 PostgREST 로 INSERT. 컬럼은 위 `orders` 와 매핑됨 (snake_case ↔ camelCase). 자세히는 `lib/covering/client.ts:sendToCovering`.

활성 함수: `sendToCovering` 1개. 그 외 함수(get/update/delete)는 2026-04-27 dead chain 정리로 모두 제거.

## 관련 마이그레이션

| 번호 | 파일 | 영향 |
|---|---|---|
| 002 | `002_product_embeddings_table.sql` | products 임베딩 |
| 013 | `013_add_dispatch_fields.sql` | drivers 신규 + orders 배차 필드 |
| 014 | `014_split_drivers_vehicles.sql` | vehicles 분리 |
| 019 | `019_vehicle_default_driver.sql` | vehicles.default_driver_id |
| 020 | `020_add_pickup_invoices.sql` | pickup_invoices |
| 026 | `026_cs_realtime.sql` | messages.{reply_kind, responded_in_ms, draft_char_overlap} |
| 035 | `035_orders_channel.sql` | orders.channel (유입 채널) |
| 036 | `036_nps_responses.sql` | nps_responses (NPS 평생 1회 적재) |
| init | `create-bookings-table.sql` | bookings (legacy) |
