# 런치 DB 스키마

> 도시락 폐기물 정기 수거 시스템. 채널·결제·세금계산서 모두 방문수거와 분리.
> 진본: 내부 Supabase. Google Sheets 는 외부 운영팀 미러링용.

## 테이블 한눈

| 테이블 | 용도 | 주요 코드 |
|---|---|---|
| `lunch_vendors` | 런치 지점 마스터 (사업자 정보 포함) | `lib/store/lunch-vendors.ts` |
| `lunch_invoices` | 월별/단건 세금계산서 발행 이력 (Bolta) | `lib/store/lunch-invoices.ts` |
| `lunch_orders` | 런치 주문 (수거+정산 통합) | `lib/store/lunch-orders.ts` |
| `lunch_conversations` | 런치 채팅 세션 | `lib/store/lunch-conversations.ts` |
| `lunch_messages` | 런치 채팅 메시지 | (위와 동일) |

---

## 1. `lunch_vendors` — 지점 마스터

| 컬럼 | 타입 | 기본 | 설명 |
|------|------|------|------|
| id | UUID PK | gen_random_uuid() | |
| name | TEXT UNIQUE NOT NULL | | 지점명 = 신청자 |
| address | TEXT | '' | 기본 수거주소 |
| owner_phone | TEXT | '' | 사장님 (= 결제자) |
| settlement_type | TEXT | 'link_pay' | `link_pay` / `monthly_invoice` / `tax_invoice` |
| memo | TEXT | '' | |
| is_active | BOOLEAN | true | |
| **세금계산서 발행용** | | | |
| business_number | TEXT | '' | 사업자등록번호 10자리 |
| representative_name | TEXT | '' | 대표자명 |
| tax_email | TEXT | '' | 세금계산서 수신 이메일 |
| business_type | TEXT | '' | 업태 |
| business_item | TEXT | '' | 종목 |
| created_at / updated_at | TIMESTAMPTZ | now() | |

## 2. `lunch_invoices` — 세금계산서 발행 이력 (m013_tax)

| 컬럼 | 타입 | 기본 | 설명 |
|------|------|------|------|
| id | UUID PK | gen_random_uuid() | |
| vendor_id | UUID FK → lunch_vendors | | |
| vendor_name | TEXT NOT NULL | | 비정규화 |
| period | TEXT NOT NULL | | YYYY-MM 또는 단건 키 |
| supply_cost | INT | 0 | 공급가액 |
| tax | INT | 0 | 세액 |
| total_amount | INT | 0 | 합계 |
| order_count | INT | 0 | 포함 주문 건수 |
| issuance_key | TEXT | | Bolta 발행 식별 키 |
| nts_transaction_id | TEXT | | 국세청 승인번호 |
| bolta_customer_key | TEXT | | Bolta 고객 키 |
| invoice_type | TEXT | 'monthly' | `single` / `monthly` |
| status | TEXT | 'pending' | pending / issued / failed / cancelled |
| issued_at | TIMESTAMPTZ | | |
| error_message | TEXT | | 실패 시 |
| description | TEXT | '' | |
| created_at / updated_at | TIMESTAMPTZ | now() | |

**제약**: `UNIQUE (vendor_id, period)` — 동일 벤더+월 중복 방지.

## 3. `lunch_orders` — 주문

| 컬럼 | 타입 | 기본 | 설명 |
|------|------|------|------|
| id | UUID PK | gen_random_uuid() | |
| order_number | TEXT UNIQUE NOT NULL | | 8자리 영숫자 |
| status | TEXT | 'confirmed' | confirmed / cancelled / payment_requested / completed |
| vendor_id | UUID FK → lunch_vendors | | |
| vendor_name | TEXT NOT NULL | | 비정규화 |
| date | TEXT NOT NULL | | YYYY-MM-DD |
| pickup_time | TEXT | '' | |
| box_count | TEXT | '' | 도시락 개수 |
| pickup_address | TEXT | '' | |
| site_contact | TEXT | '' | 현장 담당자 |
| notes | TEXT | '' | 특이사항 |
| is_picked_up | BOOLEAN | false | 수거완료 |
| sorting_price | INT | 0 | 선별가격 |
| total_amount | INT | 0 | 부가세 포함 |
| settlement_type | TEXT | 'link_pay' | |
| invoice_issued | BOOLEAN | false | 매출발행 |
| payment_ids | JSONB | '[]' | NicePay 결제 이력 |
| session_id | TEXT | | lunch_conversations 연결 |
| invoice_id | UUID FK → lunch_invoices (nullable) | | |
| **배차** | | | |
| driver_name / driver_phone / driver_memo | TEXT | '' | |
| is_dispatched | BOOLEAN | false | |
| dispatched_at | TIMESTAMPTZ | | |
| created_at / updated_at | TIMESTAMPTZ | now() | |

## 4. `lunch_conversations` — 채팅 세션

방문수거 conversations 와 완전 분리. 해피톡 채널은 별도 (LUNCH_SENDER_KEY).

| 컬럼 | 타입 | 기본 | 설명 |
|------|------|------|------|
| session_id | TEXT PK | | 해피톡 세션 ID |
| user_key | TEXT NOT NULL | | |
| sender_key | TEXT NOT NULL | | |
| vendor_id | UUID FK → lunch_vendors (nullable) | | |
| vendor_name | TEXT | '' | 비정규화 |
| phone | TEXT | '' | 사장님 연락처 |
| status | TEXT | 'active' | `active` / `closed` / `needs_check` |
| assignee | TEXT | | |
| tags | TEXT[] | '{}' | |
| memo | TEXT | '' | |
| unread_count | INT | 0 | |
| ai_draft | TEXT | | (m016) AI 초안 |
| ai_phase | TEXT | 'idle' | (m016) `idle` / `order` / `confirm` / `inquiry` |
| ai_order_data | TEXT | | (m017) AI 파싱 주문 데이터 JSON — 주문 등록 모달 자동채움 |
| created_at / updated_at | TIMESTAMPTZ | NOW() | |

## 5. `lunch_messages` — 채팅 메시지

| 컬럼 | 타입 | 기본 | 설명 |
|------|------|------|------|
| id | TEXT PK | | |
| session_id | TEXT FK → lunch_conversations CASCADE | | |
| role | TEXT NOT NULL | | user / assistant / system |
| content | TEXT NOT NULL | | |
| message_type | TEXT | 'text' | |
| image_url | TEXT | | |
| sent_by | TEXT | | |
| is_edited | BOOLEAN | false | |
| serial_number | TEXT UNIQUE (nullable) | | (m018) `${sessionId}_${serial}` 중복 방지 |
| reply_kind | TEXT | | (m026) `ai_auto` / `ai_assist` / `human` |
| responded_in_ms | INT | | (m026) |
| draft_char_overlap | REAL | | (m026) |
| created_at | TIMESTAMPTZ | NOW() | |

**RPC**: `get_last_messages` (m015) — 대화별 마지막 메시지 1건 fetch (목록 화면용).

---

## Google Sheets 미러

운영팀이 시트로 보는 데이터. 실시간 운영의 진본 아님 — `cron/lunch-sheet-push` (5분) 가 lunch_orders → 시트 push.

| 시트명 | 컬럼 |
|---|---|
| `단건_수거` | 순번·날짜·신청자(vendor_name)·수거시간·도시락개수·수거주소·사장님연락처·현장담당자·특이사항·배차·기사연락처·운송가격·선별가격·최종정산·배차완료·수거완료·정산요청 |
| `단건_정산` | 순번·날짜·신청자·정산요청·정산금액·수거완료·매출발행·정산완료·비고 |

**Sheet ID**: `1Y8ztdzT-Y08-XOkKSX-jryLJFT4r1ID4nuzRcN9ddTU` (env: `GOOGLE_SHEET_ID`)

---

## 관련 마이그레이션

| 번호 | 파일 | 영향 |
|---|---|---|
| 011 | `011_create_lunch_tables.sql` | lunch_vendors, lunch_orders 신규 |
| 012 | `012_create_lunch_chat_tables.sql` | lunch_conversations, lunch_messages |
| 013 | `013_add_tax_invoice_tables.sql` | lunch_invoices + 벤더 사업자 정보 |
| 015 | `015_lunch_get_last_messages.sql` | get_last_messages RPC |
| 016 | `016_lunch_ai_fields.sql` | ai_draft / ai_phase |
| 017 | `017_lunch_ai_order_data.sql` | ai_order_data |
| 018 | `018_lunch_message_serial.sql` | serial_number |
| 026 | `026_cs_realtime.sql` | reply_kind / responded_in_ms / draft_char_overlap |
