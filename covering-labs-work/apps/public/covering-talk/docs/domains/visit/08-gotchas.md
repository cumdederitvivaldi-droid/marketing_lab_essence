# 08 — 알려진 함정 + 디버깅 가이드

## 자주 깨지는 것들

### 1. `InvalidSessionException (-502)` — 채팅 자동 종료
- **증상**: 상담사가 답변 발송 시 "세션이 만료되었습니다" 류 에러
- **원인**: 고객이 카카오 채팅창 닫음 → 해피톡 세션 만료
- **처리**: send/route.ts 가 자동 감지 → `conversations.status = "closed"` + 에러 응답
- **관련 코드**: `app/api/conversations/[sessionId]/{send,send-image,send-file}/route.ts`

### 2. 백오피스 스크래퍼 죽었을 때
- **증상**: 채널톡 카드에 "외부 정보 조회 실패" 또는 504 timeout
- **원인**: `scripts/backoffice-scraper/` 가 별도 머신에서 polling 중 — 그 머신 다운
- **확인**:
  ```sql
  SELECT status, COUNT(*), MIN(created_at) AS oldest
  FROM backoffice_requests
  WHERE created_at > NOW() - INTERVAL '1 hour'
  GROUP BY status;
  ```
  pending 누적 + completed 0 → 스크래퍼 다운
- **복구**: 운영팀이 스크래퍼 재시작
- **회로 차단기**: 클라이언트 (`app/channeltalk/page.tsx`) 가 3회 실패 시 5분 skip

### 3. AI draft 가 안 만들어짐
- **증상**: ai_draft NULL 인 conversations 가 누적
- **확인**:
  ```sql
  SELECT session_id, current_phase, ai_draft IS NULL AS no_draft, updated_at
  FROM conversations
  WHERE updated_at > NOW() - INTERVAL '1 hour'
    AND status NOT IN ('closed', 'completed', 'cancelled')
  ORDER BY updated_at DESC LIMIT 50;
  ```
- **원인 후보**:
  - Anthropic API rate limit / 키 만료
  - phase 가 enum 외 값으로 설정 (`/api/conversations/[sessionId]/phase` 디버그 변경 후 잔존)
  - webhook/message 처리 중 throw — Vercel function 로그 확인
- **재생성**: `/api/conversations/[sessionId]/regenerate` POST

### 4. 견적이 음수 or 비현실적
- **증상**: `quotes.total` < 0 또는 1억원+
- **원인**: `collected_info.items` 에 음수 quantity, 또는 products 단가가 잘못
- **확인**:
  ```sql
  SELECT q.id, q.session_id, q.total, q.items_total, q.ladder_fee
  FROM quotes q
  WHERE q.total < 0 OR q.total > 100000000
  ORDER BY q.created_at DESC LIMIT 20;
  ```
- **수정**: products 단가 점검 + `/api/quote/calculate` 가드 보강

### 5. 결제 링크가 카카오로 안 감
- **증상**: orders.status = `payment_requested` 인데 고객이 못 받음
- **원인**: 해피톡 sendType=2 (이미지+버튼) 발송 실패
- **확인**:
  ```sql
  SELECT order_number, customer_name,
         payment_ids->-1->>'reqId' AS req_id,
         payment_ids->-1->>'sentAt' AS sent_at,
         payment_ids->-1->>'payUrl' AS pay_url
  FROM orders
  WHERE status = 'payment_requested' AND date = CURRENT_DATE::text;
  ```
- **재발송**: `/api/orders/[id]/payment` POST (재발송)

### 6. 자동종료 cron 이 살아있는 상담을 닫음
- **증상**: 활성 상담이 갑자기 status = `closed`
- **원인**: `cron/auto-close-chat` 의 closing 패턴 매칭에 상담사 평소 답변 (예: "감사합니다")이 걸림
- **확인**: `lib/channeltalk/auto-tag.ts` 와 `app/api/cron/auto-close-chat/route.ts` 의 `CLOSING_GREETING_PATTERNS`
- **완화**: 패턴을 더 specific 하게 ("*별도의 회신이 없을 경우, 상담이 종료됩니다" 같은 명시 문구만)

### 7. 같은 order 에 결제 링크 중복 발송
- **증상**: 한 고객에게 같은 결제 링크 2~3번 갑니다
- **원인**: payment-nudge 와 auto-payment 양쪽이 같은 order 대상으로 발송
- **확인**:
  ```sql
  SELECT order_number, jsonb_array_length(payment_ids) AS req_count
  FROM orders
  WHERE jsonb_array_length(payment_ids) > 1
  ORDER BY req_count DESC LIMIT 20;
  ```
- **방지**: 두 cron 의 대상 status 가 겹치지 않게 (auto-payment 는 confirmed 만, nudge 는 payment_requested 만)

### 8. 배차 슬롯 케파 초과
- **증상**: 같은 시간대에 차량 적재량 넘는 예약이 들어감
- **원인**: app_settings.dispatch_capacity / abc_capacity 설정과 실제 차량 max_cube 불일치
- **확인**:
  ```sql
  SELECT date, time_slot, COUNT(*), SUM(total_volume) AS sum_cube
  FROM orders WHERE status IN ('confirmed', 'payment_requested', 'completed')
    AND date >= CURRENT_DATE::text
  GROUP BY date, time_slot
  HAVING SUM(total_volume) > 6  -- 임의 임계값
  ORDER BY date, time_slot;
  ```

### 9. 사다리차 선결제 — ghost Order 배차 노출
- **패턴**: `/api/orders/[id]/ladder-prepayment` (CS-ORD-010) 가 부모 정보 복사한 새 Order 를 생성하여 NicePay 링크 발송. memo prefix `[사다리차선결제] 원본 #...` 로 식별.
- **증상**: 결제 전까지 dispatch / 일정 / 익일 리마인드 / Slack 브리핑에 ghost row 1건 추가 (date 부모와 동일).
- **현재 정책**: polling 으로 결제완료 시 status 즉시 전환되어 ghost 윈도우 짧음 (분 단위). 별도 cron 필터 없음.
- **확인**:
  ```sql
  SELECT order_number, customer_name, date, total_price, status, created_at
  FROM orders WHERE memo LIKE '[사다리차선결제]%' AND status != 'completed'
  ORDER BY created_at DESC;
  ```
- **장기 시각화 시 cron 필터 추가**: `auto-reminder` / `tomorrow-pickup-slack` / `dispatch` 쿼리에 `memo NOT LIKE '[사다리차선결제]%'` 추가.

## 자주 사용하는 SQL

### 오늘 KPI
```sql
WITH today AS (
  SELECT (NOW() AT TIME ZONE 'Asia/Seoul')::date AS today_kst
)
SELECT
  (SELECT COUNT(*) FROM conversations
   WHERE created_at::date = (SELECT today_kst FROM today) - INTERVAL '15 hours' + INTERVAL '15 hours') AS new_sessions,
  (SELECT COUNT(*) FROM orders WHERE status = 'confirmed') AS confirmed_pending,
  (SELECT COUNT(*) FROM orders WHERE status = 'payment_requested') AS payment_pending,
  (SELECT COUNT(*) FROM orders WHERE status = 'completed' AND date = (SELECT today_kst::text FROM today)) AS completed_today;
```

### Phase 별 분포 + 이탈 의심
```sql
SELECT current_phase, COUNT(*),
       AVG(EXTRACT(EPOCH FROM (NOW() - updated_at))/3600) AS avg_hours_idle
FROM conversations
WHERE status NOT IN ('closed', 'completed', 'cancelled')
GROUP BY current_phase
ORDER BY COUNT(*) DESC;
```

### Reply 분류 (오늘)
```sql
SELECT sent_by, reply_kind, COUNT(*),
       AVG(draft_char_overlap) AS avg_overlap,
       AVG(responded_in_ms) AS avg_resp_ms
FROM messages
WHERE role = 'assistant'
  AND created_at >= (NOW() AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '15 hours' + INTERVAL '15 hours'
  AND reply_kind IS NOT NULL
GROUP BY sent_by, reply_kind
ORDER BY sent_by, COUNT(*) DESC;
```

### 미배차 (수거 임박)
```sql
SELECT order_number, customer_name, date, time_slot, total_volume
FROM orders
WHERE date IN (CURRENT_DATE::text, (CURRENT_DATE + INTERVAL '1 day')::text)
  AND status = 'confirmed'
  AND (driver_id = '' OR driver_id IS NULL)
ORDER BY date, time_slot;
```

### Covering 동기화 누락
```sql
-- orders 에 [커버링: ID] 메모 없는 confirmed 건
SELECT order_number, customer_name, status, created_at, memo
FROM orders
WHERE status IN ('confirmed', 'payment_requested', 'completed')
  AND (memo NOT LIKE '%[커버링:%' OR memo IS NULL)
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

## 새 함정 발견 시

1. 본 문서 "자주 깨지는 것들" 에 추가
2. 진단 SQL 같이 첨부
3. 회피·복구 절차 명시
4. 코드 측 가드 보강 가치 있으면 PR / 이슈로 처리

## 디버깅 체크리스트 (장애 발생 시)

- [ ] Vercel Functions 로그 — 최근 5분 에러 (`[send]`, `[Webhook]`, `[Order]` 등 prefix grep)
- [ ] Supabase Dashboard → Logs — 동일 시간대 SQL 에러
- [ ] `/api/new_dashboard/cs-realtime` 응답 — 처리량·큐깊이·overnight 비정상값
- [ ] 해피톡 콘솔 → 발송 이력
- [ ] NicePay 콘솔 → 결제 상태 (수동 확인 필요 시)
- [ ] Cron 실행 로그 (Vercel Functions → 해당 cron 함수)
