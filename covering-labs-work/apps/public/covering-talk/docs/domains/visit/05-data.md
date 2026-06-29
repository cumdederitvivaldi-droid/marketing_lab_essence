# 05 — 데이터 (DB + 외부)

> 컬럼·타입·인덱스 상세는 [`../../db/visit.md`](../../db/visit.md). 본 문서는 운영 관점 요약.

## 진본 (내부 Supabase)

| 테이블 | 데이터 라이프 | 비고 |
|---|---|---|
| `conversations` | 무기한 (status 로 진행 단계) | session_id PK · phase_history 누적 |
| `messages` | 무기한 | role·sent_by·reply_kind 로 분류 |
| `orders` | 무기한 (2026-04-08 진본) | payment_ids JSONB 배열로 결제 이력 누적 |
| `products` | 마스터 (수동 관리) | 313건 + aliases · embeddings |
| `drivers` / `vehicles` | 마스터 (운영 관리) | vehicles.default_driver_id |
| `quotes` / `quote_items` | 무기한 | conversations 별 견적 이력 |
| `ladder_fees` / `region_prices` | 마스터 (수동) | 시즌별 갱신 |
| `pickup_invoices` | 무기한 | 단건 세금계산서 |
| ~~`bookings`~~ | **read/write 없음** | DROP 보류 |

## Status enum (`conversations.status`)

| status | 의미 |
|---|---|
| `pending` | 신규 / 응답 대기 |
| `quote_sent_nudge` | 견적 발송 + 넛지 대상 |
| `quote_sent_no_nudge` | 견적 발송 + 넛지 제외 |
| `nudge_sent` | 넛지 발송 후 |
| `wrong_inbound` | 잘못 들어옴 (스팸·오타) |
| `night_pickup` | 야간 수거 안내 |
| `booked` | 예약 완료 (orders 생성) |
| `cancelled` | 취소 |
| `needs_check` | 상담사 확인 필요 |
| `no_response` | 무응답 |
| `completed` | 수거+결제 완료 |
| `payment_check` | 결제 확인 필요 |

`/api/cron/auto-*` 들이 status 기반으로 대상 선정.

## Status (`orders.status`)

| status | 의미 |
|---|---|
| `confirmed` | 예약 확정 |
| `payment_requested` | 결제 링크 발송 |
| `completed` | 결제+수거 완료 |
| `cancelled` | 취소 |

## 외부 동기화

### Covering 외부 Supabase (단방향)
- 함수: `lib/covering/client.ts:sendToCovering`
- 트리거: 방문수거 답변 발송 시 `app/api/conversations/[sessionId]/send/route.ts:187, 346` 에서 호출
- 동작: 외부 `bookings` 테이블에 INSERT → 응답 ID 를 내부 `orders.memo` 에 `[커버링: <uuid>]` 누적
- 환경변수: `COVERING_SUPABASE_URL`, `COVERING_SUPABASE_KEY` (비우면 throw)

### Google Sheets (단건_수거)
- Cron: `/api/cron/daily-sheet-push` (5분)
- Sheet ID: `GOOGLE_SHEET_ID` (env)
- 시트명: `단건_수거`
- 동기화 대상: status ∈ {confirmed, payment_requested, completed, cancelled}, `SYNC_START_DATE = 2026-04-08` 부터
- 컬럼 매핑: 일자·신청자·시간·주소·전화·메모·운반비·최종금액·배차완료·수거완료·주문번호
- 운영팀이 시트로 보는 운영 데이터 — 진본은 DB

## 감사 로그 (audit_logs)

orders / pickup_invoices CRUD 시 자동 기록 (2026-04-17 활성화):
- `entity_type` = `order`, `pickup_invoice`
- `action` = create / update / delete / payment
- `changes` = JSONB diff
- 기록 모듈: `lib/store/audit-logs.ts:auditStore.log(...)`

UI: `components/AuditLogPanel.tsx` + `/api/audit-logs`.

## 임베딩

- `product_embeddings` (m002) — 품목 검색 (Voyage AI)
- `consultation_embeddings` (m003) — 채널톡 RAG (방문수거에서는 사용 안 함)

생성: `tools/channeltalk-ai/embed-*.ts` (채널톡 데이터 기반이라 도메인 외)

## 캐시·prefetch

- `lib/utils/product-cache.ts` — products 메모리 캐시 (1회 fetch 후 process 동안 유지)
- 클라이언트 측 prefetch: 대시보드는 `lib/cache/prefetch.ts`. 방문수거 conversations 페이지는 SSE (`/api/conversations/updates`) 로 실시간.

## SQL 자주 쓰는 패턴

자세히는 [`08-gotchas.md`](08-gotchas.md). 핵심 몇 개:

```sql
-- 오늘 KST 신규 상담
SELECT COUNT(*) FROM conversations
WHERE created_at >= (NOW() - INTERVAL '15 hours')::date + INTERVAL '15 hours';

-- Phase 별 분포
SELECT current_phase, COUNT(*) FROM conversations
GROUP BY current_phase ORDER BY COUNT(*) DESC;

-- 최근 1시간 결제 진행
SELECT order_number, status, customer_name, total_price, payment_ids
FROM orders WHERE updated_at > NOW() - INTERVAL '1 hour'
AND status IN ('payment_requested', 'completed')
ORDER BY updated_at DESC;
```
