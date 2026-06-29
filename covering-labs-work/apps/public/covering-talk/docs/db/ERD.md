# ER 다이어그램

> 도메인별 핵심 테이블 관계. 정확한 컬럼은 각 도메인 문서 참조.

## 방문수거

```mermaid
erDiagram
  conversations ||--o{ messages : "1:N session_id"
  conversations ||--o{ quotes : "1:N session_id"
  conversations ||--o{ orders : "1:N session_id"
  quotes ||--o{ quote_items : "1:N quote_id"
  quote_items }o--|| products : "N:1 product_id"
  orders }o..o| drivers : "driver_id (string)"
  vehicles }o..o| drivers : "default_driver_id"
  orders ||--o{ pickup_invoices : "1:N (단건 발행)"

  orders {
    uuid id PK
    text order_number UK
    text session_id FK
    text status
    jsonb items
    jsonb payment_ids "결제 이력 누적"
    text driver_id
  }
  conversations {
    text session_id PK
    text current_phase
    jsonb collected_info
    jsonb phase_history
  }
```

`orders.memo` 에 `[커버링: <uuid>]` 패턴으로 외부 covering Supabase 의 `bookings` row 와 연결 (sendToCovering 의 단방향 동기화).

## 런치

```mermaid
erDiagram
  lunch_vendors ||--o{ lunch_orders : "1:N vendor_id"
  lunch_vendors ||--o{ lunch_invoices : "1:N vendor_id"
  lunch_vendors ||--o{ lunch_conversations : "1:N vendor_id"
  lunch_invoices ||--o{ lunch_orders : "1:N invoice_id"
  lunch_conversations ||--o{ lunch_messages : "1:N session_id (CASCADE)"
  lunch_orders }o..o| lunch_conversations : "session_id (nullable)"

  lunch_vendors {
    uuid id PK
    text name UK
    text settlement_type
    text business_number "Bolta 발행용"
  }
  lunch_orders {
    uuid id PK
    text order_number UK
    uuid vendor_id FK
    uuid invoice_id FK
    jsonb payment_ids
  }
  lunch_invoices {
    uuid id PK
    uuid vendor_id FK
    text period "YYYY-MM"
    text issuance_key "Bolta key"
  }
```

## 채널톡

```mermaid
erDiagram
  backoffice_requests }o..|| backoffice_cache : "phone (lookup)"
  channeltalk_reply_logs }|..|| consultation_embeddings : "RAG 인용 (런타임)"
  category_prompts ||--|{ macro_embeddings : "정책 + 매크로 RAG"

  backoffice_requests {
    uuid id PK
    text phone
    text status "pending → processing → completed / error"
    jsonb result
  }
  backoffice_cache {
    text phone PK
    jsonb result
    timestamptz cached_at "TTL 24h"
  }
  channeltalk_reply_logs {
    bigserial id PK
    text chat_id
    text manager_name
    text reply_kind "ai_auto / ai_assist / human"
    real draft_char_overlap
  }
  category_prompts {
    serial id PK
    text category_id UK
    text prompt_rules
    text_array policy_sections
  }
```

채널톡 메시지·세션 자체는 채널톡 플랫폼 소유.

## 대시보드

```mermaid
erDiagram
  dashboard_settings ||--o{ dashboard_insights : "key=kr_target 등 참조"
  dashboard_notes }|..|| dashboard_complaints : "셀 단위 메모로 연결 (논리)"
  cs_presence_log }|..|| messages : "user_name = sent_by"
  cs_presence_log }|..|| lunch_messages : "user_name = sent_by"
  cs_presence_log }|..|| channeltalk_reply_logs : "user_name = manager_name"

  dashboard_settings {
    text key PK
    jsonb value
  }
  dashboard_notes {
    uuid id PK
    text section "journey/kr/health/traffic"
    text cell_key
    text content
    boolean resolved
  }
  dashboard_insights {
    uuid id PK
    text period_key
    text journey_hash
    text insight_text
  }
  cs_presence_log {
    bigserial id PK
    text user_name
    text page
    text system "visit/lunch/channeltalk/admin"
    timestamptz recorded_at "1분 heartbeat"
  }
```

대시보드는 다른 도메인 테이블을 read 만 함 — 외래키는 명시적이지 않고 (user_name = sent_by 같은 join 키만 존재).

## 공유

```mermaid
erDiagram
  app_settings {
    text key PK
    jsonb value
  }
  macros {
    serial id PK
    text name
    text content
  }
  consultation_tags {
    serial id PK
    text tag UK
  }
  audit_logs {
    bigserial id PK
    text entity_type
    text entity_id
    text action
    jsonb changes
  }
  notifications {
    uuid id PK
    text recipient
    text sender
    text type "mention/assign/system"
    boolean read
  }
```

`audit_logs` 가 orders / lunch_orders 의 CRUD 를 추적 (entity_type 으로 구분).
