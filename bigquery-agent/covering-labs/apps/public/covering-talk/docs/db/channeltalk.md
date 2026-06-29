# 채널톡 DB 스키마

> 채널톡 메시지·세션 자체는 **채널톡 플랫폼 소유** — 우리 DB 에 저장 안 함.
> 본 도메인의 DB 는 (1) AI 추천 부가 데이터, (2) 백오피스 스크래퍼 브릿지, (3) 분류 카운트만.

## 테이블 한눈

| 테이블 | 용도 | 주요 코드 |
|---|---|---|
| `backoffice_requests` | Vercel ↔ 로컬 Puppeteer 스크래퍼 통신 큐 (Realtime 브릿지) | `app/api/backoffice/lookup/route.ts` |
| `backoffice_cache` | 백오피스 조회 결과 24시간 캐시 | (위와 동일) |
| `channeltalk_reply_logs` | 채널톡 송신 로그 — AI 분류 (`ai_auto`/`ai_assist`/`human`) 만 기록 | `app/api/channeltalk-ai/suggest/send/route.ts` |
| `category_prompts` | 채널톡 AI 카테고리별 프롬프트 + 정책 섹션 매핑 | `lib/channeltalk-ai/category-prompts.ts` |

부가 (RAG 임베딩, 도메인 공유):
- `consultation_embeddings` (m003) — Q&A 임베딩
- `macro_embeddings` (m004) — 매크로 172건 임베딩
- `service_areas` (m006) — 서비스 가능 행정동 (방문수거와 공유 가능, channeltalk-ai/service-area.ts 가 사용)

---

## 1. `backoffice_requests` (m008, m010)

Vercel serverless 에서 로컬 Puppeteer 스크래퍼로 큐잉. Supabase Realtime 으로 스크래퍼가 polling.

| 컬럼 | 타입 | 기본 | 설명 |
|------|------|------|------|
| id | UUID PK | gen_random_uuid() | |
| phone | TEXT NOT NULL | | 조회할 고객 전화번호 |
| status | TEXT | 'pending' | `pending` → `processing` → `completed` / `error` |
| result | JSONB | | 스크래핑 결과 (고객 정보 + 주문 내역) |
| error_message | TEXT | | |
| created_at | TIMESTAMPTZ | now() | |
| completed_at | TIMESTAMPTZ | | |
| (m010) request_type | TEXT | 'lookup' | `lookup` / `order_detail` |
| (m010) url | TEXT | | order_detail 시 admin.covering.app URL |

**라이프사이클**: 클라이언트가 lookup 호출 → row INSERT → 스크래퍼가 pending 폴링 → 처리 → result 채움 → 클라이언트가 polling 으로 결과 수신 후 row DELETE. 5분+ 된 stale row 는 `cron/auto-close-chat` (2분 주기) 가 GC.

## 2. `backoffice_cache`

같은 phone 24시간 내 재조회 시 즉시 반환.

| 컬럼 | 타입 | 기본 | 설명 |
|------|------|------|------|
| phone | TEXT PK | | 정규화된 전화번호 |
| result | JSONB NOT NULL | | userInfo + orders 등 |
| cached_at | TIMESTAMPTZ | now() | TTL 24h 기준 |

**조회 패턴**: `lookup/route.ts` 가 먼저 cached_at > now-24h 로 조회, hit 시 즉시 반환. miss 시에만 backoffice_requests 큐 사용.

## 3. `channeltalk_reply_logs` (m026)

채널톡은 외부 시스템이라 메시지 본문 DB 저장 없음. 분류 통계만 별도 누적.

| 컬럼 | 타입 | 기본 | 설명 |
|------|------|------|------|
| id | BIGSERIAL PK | | |
| chat_id | TEXT NOT NULL | | 채널톡 chatId |
| manager_name | TEXT NOT NULL | | 송신 담당자 |
| reply_kind | TEXT NOT NULL | | `ai_auto` / `ai_assist` / `human` |
| draft_char_overlap | REAL | | AI 추천 대비 송신본 일치 비율 0.0~1.0 |
| sent_at | TIMESTAMPTZ | NOW() | |

**인덱스**: `idx_ct_reply_logs_sent_at` (sent_at DESC), `idx_ct_reply_logs_manager` (manager_name, sent_at DESC), `idx_ct_reply_logs_chat` (chat_id, sent_at DESC).

## 4. `category_prompts` (m007)

채널톡 AI 추천 — 84개 카테고리(2026-04 기준)별 프롬프트 규칙.

| 컬럼 | 타입 | 기본 | 설명 |
|------|------|------|------|
| id | SERIAL PK | | |
| category_id | TEXT UNIQUE NOT NULL | | 식별자 (예: `이용_배출품목`) |
| category_name | TEXT NOT NULL | | 표시명 |
| parent_category | TEXT | | 상위 (서비스이용/구독/배송 …) |
| prompt_rules | TEXT NOT NULL | | 카테고리별 답변 규칙 |
| policy_sections | TEXT[] | '{}' | 참조할 정책문서 섹션 목록 |
| ai_scope_note | TEXT | | AI 답변 범위 참고 |
| created_at / updated_at | TIMESTAMPTZ | now() | |
| updated_by | TEXT | | 수정자 |

**시드**: `tools/channeltalk-ai/seed-category-prompts.ts`. 정책 섹션 원본은 `tools/channeltalk-ai/policy-document.md`.

---

## 임베딩 테이블 (도메인 공유)

채널톡 AI 추천 RAG 의 인용 후보. `lib/ai/voyage.ts` 가 임베딩 생성.

| 테이블 | 용도 | Migration |
|---|---|---|
| `consultation_embeddings` | 과거 Q&A 페어 — 카테고리 분류 + 답변 추천에 인용 | 003 |
| `macro_embeddings` | CS 매크로 172건 — 답변 후보 | 004 |
| `service_areas` | 행정동 마스터 — 서비스 가능 여부 검증 | 006 |

자세한 컬럼은 각 migration SQL 참조.

---

## 관련 마이그레이션

| 번호 | 파일 | 영향 |
|---|---|---|
| 003 | `003_consultation_embeddings.sql` | 채널톡 AI Q&A 임베딩 |
| 004 | `004_macro_embeddings.sql` | 매크로 임베딩 |
| 006 | `006_service_areas.sql` | 서비스 지역 |
| 007 | `007_category_prompts.sql` | 카테고리별 프롬프트 |
| 008 | `008_backoffice_requests.sql` | 스크래퍼 브릿지 큐 |
| 010 | `010_backoffice_order_detail.sql` | 주문 상세 스크래핑 지원 |
| 026 | `026_cs_realtime.sql` | channeltalk_reply_logs 신규 |
| init | `backoffice_cache.sql` | 24h 캐시 |
