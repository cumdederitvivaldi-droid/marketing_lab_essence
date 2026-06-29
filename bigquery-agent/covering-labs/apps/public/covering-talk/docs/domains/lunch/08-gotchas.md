# 08 — 알려진 함정 + 디버깅 가이드

## 자주 깨지는 것들

### 1. 같은 사장님에게 결제 안내 메시지 N번
- **증상**: 한 사장님 카카오에 같은 시간 안내 메시지 여러 개
- **원인**: `cron/lunch-auto-payment` 가 session_id 단위 묶음 처리를 안 함 (그룹화 누락)
- **확인**:
  ```sql
  -- 같은 세션에 여러 lunch_orders 가 있는데 각각에 대해 안내가 갔는지
  SELECT session_id, COUNT(*) AS orders, MIN(payment_ids->-1->>'sentAt') AS first_sent
  FROM lunch_orders
  WHERE date = ((NOW() AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '1 day')::date::text
    AND status = 'payment_requested'
  GROUP BY session_id HAVING COUNT(*) > 1;
  ```
- **확인 코드**: `app/api/cron/lunch-auto-payment/route.ts` 의 sessionGroups 로직

### 2. Bolta 발행 실패 — 사업자등록번호
- **증상**: `lunch_invoices.status = "failed"`, error_message = "사업자번호 형식 오류" 류
- **원인**: `lunch_vendors.business_number` 가 9자리 / 11자리 / 하이픈 포함 등 비정상
- **수정**: 10자리 숫자로 정규화 후 재발행
  ```sql
  UPDATE lunch_vendors SET business_number = REGEXP_REPLACE(business_number, '[^0-9]', '', 'g')
  WHERE LENGTH(REGEXP_REPLACE(business_number, '[^0-9]', '', 'g')) = 10;
  ```

### 3. `<order_data>` 자동파싱이 안 됨
- **증상**: AI 응답에 `<order_data>` 가 없음 / 파싱 실패
- **원인 후보**:
  - AI 가 정보 부족 판단 → 질문 더 함 (정상)
  - JSON 형식 오류 (드물게)
  - `lunch-prompt.ts` 의 응답 스키마 가이드 약함
- **확인**: `lunch_messages.content` 직접 보고 `<order_data>` 태그 검색
  ```sql
  SELECT id, content FROM lunch_messages
  WHERE role = 'assistant' AND content LIKE '%<order_data>%'
  ORDER BY created_at DESC LIMIT 10;
  ```
- **수정 위치**: 클라이언트 파서 (`components/lunch/LunchChatView.tsx`) + 프롬프트 보강

### 4. `serial_number` 충돌
- **증상**: `lunch_messages` INSERT 시 UNIQUE 위반
- **원인**: 해피톡이 같은 메시지를 두 번 webhook → ON CONFLICT DO NOTHING 으로 처리 정상
- **확인 SQL**:
  ```sql
  SELECT serial_number, COUNT(*) FROM lunch_messages
  GROUP BY serial_number HAVING COUNT(*) > 1;
  -- 정상 시 0 row (UNIQUE 가 막음)
  ```
- 만약 NULL serial 인 메시지가 중복 들어오면 → webhook idempotency 강화 필요

### 5. 같은 lunch_order 에 결제 링크 중복
- **증상**: payment_ids 배열에 reqId 가 너무 많음
- **원인**: lunch-auto-payment 가 같은 order 를 반복 처리 (skip 조건 누락)
- **확인**:
  ```sql
  SELECT order_number, vendor_name, jsonb_array_length(payment_ids) AS reqs
  FROM lunch_orders WHERE jsonb_array_length(payment_ids) > 2 ORDER BY reqs DESC;
  ```
- **방지**: cron 의 "payment_ids 가 비어있는 건만" 조건이 정상 작동하는지 확인

### 6. invoice_issued = true 인데 invoice_id 가 NULL
- **증상**: 정산 완료처럼 보이는데 어느 invoice 와 연결됐는지 모름
- **원인**: 발행 흐름 중 invoice INSERT 후 lunch_orders.invoice_id 매핑 단계 실패
- **수정**:
  ```sql
  -- 누락 매핑 복원 (vendor + period 매칭)
  UPDATE lunch_orders lo
  SET invoice_id = li.id
  FROM lunch_invoices li
  WHERE lo.invoice_issued = true AND lo.invoice_id IS NULL
    AND lo.vendor_id = li.vendor_id
    AND li.period = TO_CHAR(lo.date::date, 'YYYY-MM');
  ```

### 7. 시트 동기화 row 수 불일치
- **증상**: 단건_수거 시트 row 수 < lunch_orders 신규 수
- **원인**: cron/lunch-sheet-push 가 5분마다 돌지만 batch 처리 한계 (Vercel maxDuration)
- **확인**: Vercel Functions 로그 → "rows updated: N" 메시지
- **복구**: 다음 cron 실행에서 자동 catch up (보통 1-2 cycle 내 회복)

### 8. AI 가 마크다운/이모지 발송 (위반)
- **증상**: 카카오에 `**굵게**` 또는 `😊` 같은 게 그대로 보임
- **원인**: lunch-prompt 의 자가 검수 통과 못 함
- **수정**: `lunch-prompt.ts` 의 negative example 추가 + 발송 직전 sanitizer 추가 (구현 검토)

## 자주 사용하는 SQL

### 오늘 한 줄 요약
```sql
WITH today AS (SELECT (NOW() AT TIME ZONE 'Asia/Seoul')::date AS d)
SELECT
  (SELECT COUNT(*) FROM lunch_orders WHERE date = (SELECT d::text FROM today)) AS orders_today,
  (SELECT COUNT(*) FROM lunch_orders WHERE date = (SELECT d::text FROM today) AND is_picked_up) AS picked_up,
  (SELECT COUNT(*) FROM lunch_orders WHERE date = (SELECT d::text FROM today) AND status = 'completed') AS paid_today,
  (SELECT COUNT(*) FROM lunch_conversations WHERE unread_count > 0 AND status = 'active') AS unread_chats;
```

### 결제 발송 → 미완료 (link_pay)
```sql
SELECT order_number, vendor_name, total_amount,
       (payment_ids->-1->>'sentAt')::timestamptz AS sent,
       NOW() - (payment_ids->-1->>'sentAt')::timestamptz AS elapsed
FROM lunch_orders
WHERE status = 'payment_requested' AND settlement_type = 'link_pay'
ORDER BY (payment_ids->-1->>'sentAt')::timestamptz LIMIT 50;
```

### 발행 후보 (이번 달 tax_invoice)
```sql
SELECT vendor_name, COUNT(*) AS orders, SUM(total_amount) AS total,
       MIN(date) AS first_pickup, MAX(date) AS last_pickup
FROM lunch_orders
WHERE settlement_type = 'tax_invoice'
  AND invoice_issued = false
  AND date >= TO_CHAR(NOW() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-01')
GROUP BY vendor_name
ORDER BY total DESC;
```

### Reply 분류 (런치 오늘)
```sql
SELECT sent_by, reply_kind, COUNT(*),
       AVG(draft_char_overlap) AS avg_overlap
FROM lunch_messages
WHERE role = 'assistant'
  AND created_at >= (NOW() AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '15 hours' + INTERVAL '15 hours'
  AND reply_kind IS NOT NULL
GROUP BY sent_by, reply_kind ORDER BY sent_by;
```

### 벤더별 정산 방식 분포
```sql
SELECT settlement_type, COUNT(*) AS vendors
FROM lunch_vendors WHERE is_active GROUP BY settlement_type;
```

### 미발행 invoice 누적 (월말 작업 후보)
```sql
SELECT vendor_name, period, COUNT(*) AS pending
FROM lunch_invoices
WHERE status = 'pending' GROUP BY vendor_name, period
ORDER BY period DESC, vendor_name;
```

## 디버깅 체크리스트 (장애 발생 시)

- [ ] Vercel Functions 로그 — `[Lunch]`, `[lunch-auto-payment]`, `[Webhook]` prefix
- [ ] Supabase Logs — 동일 시간대
- [ ] `cron/lunch-auto-payment` 마지막 실행 결과 (Functions → 함수)
- [ ] `cron/lunch-payment-sync` 누적 처리량
- [ ] Bolta 콘솔 발행 이력
- [ ] 해피톡 콘솔 (런치 채널) 발송 이력
- [ ] Google Sheet 단건_수거 / 단건_정산 row 수 vs DB
