# 05 — 데이터 (DB + Sheets + Bolta)

> 컬럼·타입·인덱스 상세는 [`../../db/lunch.md`](../../db/lunch.md). 본 문서는 운영 관점.

## 진본 (내부 Supabase)

| 테이블 | 라이프 | 비고 |
|---|---|---|
| `lunch_vendors` | 마스터 (운영팀 등록·수정) | 사업자 정보 = Bolta 발행용 |
| `lunch_invoices` | 무기한 | 월별 / 단건 세금계산서 이력 (UNIQUE vendor_id+period) |
| `lunch_orders` | 무기한 | 일별 수거 + 정산 통합 (payment_ids JSONB 누적) |
| `lunch_conversations` | 무기한 | 사장님 채팅 세션 (vendor_id 매핑) |
| `lunch_messages` | 무기한 | 메시지 + reply_kind 분류 + serial_number 중복 방지 |

## Status enum

### `lunch_orders.status`
- `confirmed` — 수거 확정 (배차 진행 가능)
- `payment_requested` — 결제 링크 발송됨
- `completed` — 결제 완료
- `cancelled` — 취소

### `lunch_conversations.status`
- `active` — 진행 중
- `closed` — 종료
- `needs_check` — 상담사 확인 필요

### `lunch_invoices.status`
- `pending` — 발행 대기
- `issued` — 발행 완료 (issuance_key + nts_transaction_id 보유)
- `failed` — 발행 실패 (error_message 보유)
- `cancelled` — 발행 취소

### `settlement_type` (lunch_vendors / lunch_orders)
- `link_pay` — NicePay 결제 링크 (당일~익일 자동결제 cron 대상)
- `monthly_invoice` — 월말 통합 청구 (자동결제 제외)
- `tax_invoice` — 세금계산서 발행 (Bolta)

## 외부 동기화

### Google Sheets (단건_수거 + 단건_정산)
- Cron: `cron/lunch-sheet-push` (5분)
- Sheet ID env: `GOOGLE_SHEET_ID` (방문수거와 동일 sheet, 다른 탭)
- 시트 2개:
  - **`단건_수거`** — 일별 수거 진행 (방문수거와 같은 시트, 같은 컬럼 형식)
  - **`단건_정산`** — 정산 방식별 + 발행 상태 (런치 전용 탭)
- `SETTLEMENT_MAP`:
  - `link_pay` → "링크페이"
  - `monthly_invoice` → "월말정산"
  - `tax_invoice` → "세금계산서 발행"

### Bolta (세금계산서)
- 클라이언트: `lib/bolta/client.ts`
- 라우트: `/api/lunch/invoices/issue` 가 Bolta API 호출
- 발행 정보: `lunch_invoices` 의 `issuance_key`, `nts_transaction_id` 컬럼
- 벤더 사업자 정보 필요: `business_number` (10자리), `representative_name`, `tax_email`, `business_type`, `business_item`

## 결제 데이터 (`payment_ids` JSONB)

방문수거 orders 와 동일 패턴:

```json
[
  {
    "reqId": "nicepay_req_uuid_1",
    "payUrl": "https://...nicepay.com/...",
    "sentAt": "2026-04-27T15:00:00Z"
  },
  {
    "reqId": "nicepay_req_uuid_2",
    "payUrl": "https://...nicepay.com/...",
    "sentAt": "2026-04-28T10:30:00Z",
    "tid": "nicepay_tid",
    "paidAt": "2026-04-28T11:00:00Z"
  }
]
```

`cron/lunch-payment-sync` 가 모든 reqId 의 상태를 polling 후 paid entry 발견 시 `tid` + `paidAt` 추가.

## 감사 로그 (audit_logs)

lunch_orders / lunch_invoices CRUD 자동 기록:
- `entity_type` = `lunch_order`, `lunch_invoice`
- `action` = create / update / delete / payment / issue / cancel

## 자주 쓰는 SQL

### 오늘 수거 진행
```sql
SELECT vendor_name, pickup_time, box_count, status, settlement_type
FROM lunch_orders
WHERE date = (NOW() AT TIME ZONE 'Asia/Seoul')::date::text
ORDER BY pickup_time;
```

### 미정산 합계 (월말 청구 후보)
```sql
SELECT vendor_name, settlement_type, COUNT(*) AS orders, SUM(total_amount) AS total
FROM lunch_orders
WHERE invoice_issued = false
  AND settlement_type IN ('monthly_invoice', 'tax_invoice')
  AND date >= (NOW() AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '30 days'
GROUP BY vendor_name, settlement_type
ORDER BY total DESC;
```

### 결제 발송 후 미완료 (link_pay)
```sql
SELECT order_number, vendor_name, total_amount,
       jsonb_array_length(payment_ids) AS reqs,
       payment_ids->-1->>'sentAt' AS last_sent
FROM lunch_orders
WHERE status = 'payment_requested'
  AND settlement_type = 'link_pay'
ORDER BY (payment_ids->-1->>'sentAt')::timestamptz;
```

### 세금계산서 발행 이력 (이번 달)
```sql
SELECT vendor_name, period, total_amount, status, issued_at
FROM lunch_invoices
WHERE period = TO_CHAR(NOW() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')
ORDER BY status, issued_at DESC;
```

### 채팅 - 응답 대기 중
```sql
SELECT lc.session_id, lc.vendor_name, lc.unread_count,
       lm.content AS last_message, lm.created_at
FROM lunch_conversations lc
JOIN LATERAL (
  SELECT content, created_at FROM lunch_messages
  WHERE session_id = lc.session_id ORDER BY created_at DESC LIMIT 1
) lm ON true
WHERE lc.unread_count > 0 AND lc.status = 'active'
ORDER BY lc.unread_count DESC, lm.created_at DESC;
```
