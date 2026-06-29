# 공유 DB 스키마

> 모든 도메인이 공유하는 인프라 테이블.
> 어느 한 도메인 전용이 아니라 시스템 경계를 가로지름.

## 테이블 한눈

| 테이블 | 용도 | 주요 코드 |
|---|---|---|
| `app_settings` | 전역 앱 설정 (key/value JSONB) — AI provider, 차량 케파, ABC 케파 등 | `lib/store/app-settings` (분산), `lib/dispatch/zones.ts` |
| `macros` | 매크로 템플릿 (전 도메인 공유 가능) | `lib/store/macros.ts` (없으면 직접 supabase) |
| `consultation_tags` | 상담 태그 마스터 (상위 카테고리 + 태그명) | `lib/store/...` |
| `audit_logs` | 감사 로그 (orders / lunch_orders CRUD 자동 기록) | `lib/store/audit-logs.ts` |
| `notifications` | 커버링톡 내부 알림 (멘션/배정) | `lib/hooks/useNewConversationNotifier.ts` |
| `service_areas` (m006) | 행정동 마스터 — 채널톡 AI 가 서비스 가능 여부 판단 | `lib/channeltalk-ai/service-area.ts` |
| `dhero_deliveries` | 두발히어로 배송 이력 캐시 | `lib/dhero/client.ts` |

---

## 1. `app_settings`

| 컬럼 | 타입 | 기본 | 설명 |
|------|------|------|------|
| key | TEXT PK | | |
| value | JSONB | 'false' | 숫자/불리언/객체 모두 허용 |
| updated_at | TIMESTAMPTZ | NOW() | |

**주요 키:**
- `ai_provider` — `"anthropic"` | `"openai"` (provider 전환)
- `dispatch_capacity` — 차량 적재량/슬롯 한도 `{truck1t, truck1tLow, truck25t, maxPerSlot}`
- `abc_capacity` — ABC 타임 블록 케파. 우선순위 `closedDates > dates > holidays(sun) > 요일 > default`:
  ```json
  {
    "default":     { "A": 8, "B": 8, "C": 8 },
    "mon":         { "A": 6, "B": 6, "C": 6 },
    "sat":         { "A": 6, "B": 6, "C": 6 },
    "sun":         { "A": 6, "B": 6, "C": 6 },
    "holidays":    ["2026-05-05"],
    "dates":       { "2026-04-25": { "A": 4, "B": 8, "C": 8 } },
    "closedDates": ["2026-05-06"]
  }
  ```
- `counselor:<이름>` — 상담사 활성 여부·역할 (대시보드 카드 노출 결정)

## 2. `macros`

| 컬럼 | 타입 | 기본 | 설명 |
|------|------|------|------|
| id | SERIAL PK | | |
| name | TEXT NOT NULL | | |
| content | TEXT NOT NULL | | |
| category | TEXT | '일반' | |
| sort_order | INT | 0 | |
| is_active | BOOLEAN | true | |
| created_at / updated_at | TIMESTAMPTZ | NOW() | |

**임베딩**: `macro_embeddings` (m004) — 채널톡 AI 가 매크로 후보 검색 시 사용.

## 3. `consultation_tags`

| 컬럼 | 타입 | 기본 | 설명 |
|------|------|------|------|
| id | SERIAL PK | | |
| tag | TEXT UNIQUE NOT NULL | | (예: `미수거/누락`) |
| description | TEXT | '' | |
| category | TEXT | '' | 상위 (예: `미수거`) |
| is_active | BOOLEAN | true | |
| created_at / updated_at | TIMESTAMPTZ | NOW() | |

**시드**: `tools/channeltalk-ai/seed-consultation-tags.ts`.

## 4. `audit_logs`

2026-04-17 활성화. orders / lunch_orders CRUD 시 자동 기록.

| 컬럼 | 타입 | 기본 | 설명 |
|------|------|------|------|
| id | BIGSERIAL PK | | |
| created_at | TIMESTAMPTZ | now() | |
| entity_type | TEXT NOT NULL | | `order`, `lunch_order`, ... |
| entity_id | TEXT NOT NULL | | |
| action | TEXT NOT NULL | | `create` / `update` / `delete` / `payment` |
| changes | JSONB | '{}' | diff |
| description | TEXT | | |
| user_id | INT NOT NULL | | |
| user_name | TEXT NOT NULL | | |

**기록 모듈**: `lib/store/audit-logs.ts:auditStore.log(...)`. 호출처: orders/lunch-orders store 의 update/delete 메서드.

## 5. `notifications`

상담사 간 멘션/배정 알림. 30초 polling.

| 컬럼 | 타입 | 기본 | 설명 |
|------|------|------|------|
| id | UUID PK | gen_random_uuid() | |
| recipient | TEXT NOT NULL | | 수신자 (상담사 이름) |
| sender | TEXT NOT NULL | | 발신자 |
| type | TEXT | 'mention' | `mention` / `assign` / `system` |
| chat_id | TEXT | | 관련 채널톡 chatId |
| message_preview | TEXT | | 100자 |
| read | BOOLEAN | FALSE | |
| created_at | TIMESTAMPTZ | now() | |

**인덱스**: `idx_notifications_recipient_read` (recipient, read, created_at DESC).

## 6. `service_areas` (m006)

서비스 가능 행정동 마스터. 채널톡 AI 가 "ㅇㅇ구 서비스 됩니까" 류 질문에 답할 때 참조.

컬럼 상세는 [`migrations/006_service_areas.sql`](../../migrations/006_service_areas.sql) 참조.

**시드**: `tools/channeltalk-ai/seed-service-areas.ts` + 1회성 추가 `add-new-service-areas-20260330.ts`.

## 7. `dhero_deliveries`

두발히어로 배송 이력 — 외부 API 결과 캐시. `lib/dhero/client.ts` 가 사용.

컬럼 상세는 [`migrations/dhero_deliveries.sql`](../../migrations/dhero_deliveries.sql) 참조.

---

## 관련 마이그레이션

| 번호 / 파일 | 영향 |
|---|---|
| 005 | `005_consultation_tags.sql` |
| 006 | `006_service_areas.sql` |
| init | `create-app-settings-table.sql` |
| init | `create-macros-table.sql` |
| init | `create-audit-logs.sql` |
| init | `create-notifications-table.sql` |
| init | `dhero_deliveries.sql` |
