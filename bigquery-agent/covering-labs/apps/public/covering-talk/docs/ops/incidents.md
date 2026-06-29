# 인시던트 (Incidents)

> ⚠️ **마이그레이션 안내 (2026-05-13)** — Vercel 콘솔 / 함수 로그 / Cron 로그 등 일부 절차는 더 이상 유효하지 않다. covering-labs 이관 후 PM2 / Cloud Logging 기반 절차는 후속 PR 에서 갱신 예정. 인시던트 분류·원인·고객 대응 내용은 그대로 유효.

> 자주 발생하는 장애 + 즉시 대응 절차. 도메인별 08-gotchas.md 의 핵심을 통합.

## 인시던트 우선순위

| 등급 | 정의 | 대응 시간 |
|---|---|---|
| P0 | 모든 도메인 다운 (Vercel / Supabase 다운) | 즉시 |
| P1 | 한 도메인 전체 다운 (방문 발송 불가, 채널톡 응대 불가 등) | 5분 |
| P2 | 일부 기능 / 일부 사용자만 영향 (백오피스 다운, 결제 일부 실패) | 30분 |
| P3 | 통계 / 모니터링만 영향 (대시보드 인사이트 안 나옴) | 1일 |

## 자주 발생 인시던트

### I-001 — 백오피스 스크래퍼 다운 (P2)

**증상**: `/api/backoffice/lookup` 504 폭주, 채널톡 AI 추천에 백오피스 정보 inline 안 됨.

**진단**:
```sql
SELECT status, COUNT(*) FROM backoffice_requests
WHERE created_at > NOW() - INTERVAL '10 minutes' GROUP BY status;
```
pending > 5 + completed = 0 → 다운.

**대응**:
1. 운영팀에게 알림 (스크래퍼 머신 재시작 요청)
2. 회로 차단기 (클라이언트 측, 3회 실패 → 5분 skip) 가 폭주 차단
3. 그동안 상담사가 admin.covering.app 직접 보고 답변

**복구 후**: pending row 정리 (5분+ 자동 정리 또는 수동).

---

### I-002 — Anthropic 한도 초과 (P1)

**증상**: 모든 AI 호출 401/429. 방문/런치 답변 안 만들어짐, 채널톡 추천 안 만들어짐, 대시보드 인사이트·분류 멈춤.

**진단**: Anthropic 콘솔 → 사용량 / 에러.

**대응**:
1. 한도 상향 요청 (Anthropic 영업)
2. 단기: 캐시 hit 률 개선 (대시보드 인사이트 hash 검증)
3. 모델 다운그레이드 임시 적용 (Sonnet → Haiku)
4. 상담사가 직접 답변으로 우회

---

### I-003 — NicePay 결제 polling 정지 (P2)

**증상**: orders / lunch_orders 의 status 가 `payment_requested` 에서 `completed` 로 안 넘어감.

**진단**:
```sql
-- 1시간 이상 payment_requested 인 건
SELECT order_number, customer_name, status,
       (payment_ids->-1->>'sentAt')::timestamptz AS sent
FROM orders
WHERE status = 'payment_requested'
  AND (payment_ids->-1->>'sentAt')::timestamptz < NOW() - INTERVAL '1 hour';
```

**대응**:
1. NicePay 콘솔 → 해당 reqId 직접 확인 (수동)
2. 결제 완료된 게 확인되면 DB 직접 업데이트
   ```sql
   UPDATE orders SET status = 'completed' WHERE id = '...';
   ```
3. cron/payment-sync 로그 확인 — 실행 정상인지

---

### I-004 — 해피톡 InvalidSession 폭주 (P3)

**증상**: 여러 세션이 동시에 -502 발생.

**원인**: 해피톡 콘솔 측 일시적 이슈 또는 카카오 채널 만료.

**대응**:
- 시스템이 자동으로 status `closed` 전환 → 신규 메시지 받으면 새 session 생성
- 운영팀에게 패턴 공유 (특정 시간대 집중 발생 시)

---

### I-005 — Vercel function timeout (P2)

**증상**: `cron/auto-payment` 또는 `webhook/message` 가 60s timeout 으로 끊김.

**진단**: Vercel Functions 로그 → "Function execution timed out".

**대응**:
1. 처리량 한도 줄이기 (배치 사이즈)
2. maxDuration 한도 상향 (Vercel Pro 플랜이면 가능)
3. 페이징 / split 처리

---

### I-006 — 자동결제 cron 누락 (P1)

**증상**: 당일 confirmed 건이 결제 링크 못 받음.

**진단**:
```sql
-- 오늘 confirmed 인데 payment_ids 비어있는 건
SELECT order_number, customer_name FROM orders
WHERE date = (NOW() AT TIME ZONE 'Asia/Seoul')::date::text
  AND status = 'confirmed'
  AND (jsonb_array_length(payment_ids) = 0 OR payment_ids IS NULL);
```

**대응**:
1. cron 수동 실행: 브라우저로 `/api/cron/auto-payment` 직접 호출 (운영팀 권한)
2. 또는 단건 발송: `/api/orders/[id]/payment` POST
3. cron 로그 확인 (Vercel Functions)

---

### I-007 — 런치 결제 안내 중복 (P2)

**증상**: 한 사장님에게 같은 시간 안내 메시지 N번.

**진단**:
```sql
SELECT session_id, COUNT(*) AS orders FROM lunch_orders
WHERE date = ((NOW() AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '1 day')::date::text
  AND status = 'payment_requested'
GROUP BY session_id HAVING COUNT(*) > 1;
```

**원인**: `cron/lunch-auto-payment` 의 session_id 묶음 처리 누락.

**대응**:
1. 사장님에게 사과 메시지
2. 코드 수정 (session_id 단위 그룹화 보강)

---

### I-008 — Bolta 세금계산서 발행 실패 (P3)

**증상**: `lunch_invoices.status = "failed"` 누적.

**진단**:
```sql
SELECT vendor_name, period, total_amount, error_message
FROM lunch_invoices WHERE status = 'failed' ORDER BY created_at DESC LIMIT 20;
```

**원인**: 보통 사업자번호 형식 오류.

**대응**:
1. 벤더 정보 (`lunch_vendors.business_number`) 정규화
2. 재발행 (`/api/lunch/invoices/issue` POST)

---

### I-009 — Channeltalk Desk Cookie 만료 (P3)

**증상**: 메시지 삭제 (`/api/channeltalk/chats/[chatId]/delete-message`) 가 401/403.

**대응**:
1. desk.channel.io 재로그인 → DevTools 쿠키 추출
2. Vercel env `CHANNELTALK_DESK_COOKIE` 갱신
3. 재배포

**예방**: 캘린더 30일 알림.

---

### I-010 — Supabase 다운 (P0)

**증상**: 모든 도메인이 DB 접근 못함.

**대응**:
1. Supabase 콘솔 → Status 확인
2. PITR (Point-in-Time Recovery) 필요 시 콘솔에서 시점 복원
3. 운영팀 알림 — 외부 콜백 지연 안내

---

### I-011 — 대시보드 presence 카드 안 보임 (P3)

**증상**: 옆자리 상담사가 일하고 있는데 카드는 offline.

**자세히는**: [`../domains/dashboard/08-gotchas.md`](../domains/dashboard/08-gotchas.md) §1.

**1순위 원인**: 그 상담사가 우리 웹사이트 안 쓰고 외부 도구로 답변. 2026-04-27 보강 후 lastReplyAt 5분 내면 "외부 도구 답변" 으로 표시.

---

### I-012 — Cron 등록 실패 / 누락 (P2)

**증상**: vercel.json 에 등록한 cron 이 실행 안 됨.

**대응**:
1. Vercel 콘솔 → Functions → 해당 cron 함수 존재 확인
2. 등록 후 24시간 대기 (Vercel 정책)
3. 시간 표현 검증 (UTC 기준)

---

### I-013 — Webhook 메시지 누락 (P2)

**증상**: 카카오 메시지가 우리 시스템에 안 옴.

**진단**:
```sql
-- 최근 1시간 신규 conversations / messages 수
SELECT COUNT(*) FROM messages WHERE created_at > NOW() - INTERVAL '1 hour';
```

**원인**:
- 해피톡 webhook URL 변경됐는데 콘솔 갱신 안 함
- 해피톡 일시적 이슈
- `/api/webhook/route.ts` 의 sender_key 분기 버그

**대응**:
1. 해피톡 콘솔 → webhook 설정 확인
2. Vercel Functions 로그 (`/api/webhook` 호출 이력)
3. 직접 webhook 테스트 (curl 로 해피톡 페이로드 시뮬레이션)

---

### I-014 — JWT 로그아웃 폭주 (P2)

**증상**: 모든 사용자가 갑자기 로그아웃됨.

**원인**: `JWT_SECRET` 변경됨 (env 갱신 후 재배포).

**대응**: 사용자 재로그인 안내. 변경 사실 운영팀에 사전 공유 필수.

---

### I-015 — Google Sheets API 한도 초과 (P3)

**증상**: `cron/daily-sheet-push` / `cron/lunch-sheet-push` 가 일시적 fail.

**대응**: 대부분 다음 cycle 에서 catch up. 1시간 이상 지속 시 GCP 콘솔에서 한도 확인.

---

## 인시던트 발생 시 일반 절차

1. **확인** — 사용자 보고 vs 모니터링 자동 alert vs 우연 발견
2. **분류** — P0~P3 등급 결정
3. **대응** — 위 매트릭스 참조
4. **복구** — 정상 동작 확인 후 종료
5. **사후 보고** (P0~P1):
   - 발생 시각 / 영향 범위 / 원인 / 대응 / 재발 방지
   - 운영팀 + 영향받은 사용자 공유
6. **재발 방지** — 코드 가드 / 모니터링 추가 / PR · 이슈로 추적

## 운영 알림 채널

- Slack: `#수거-내일` (방문 익일 브리핑만)
- Slack: `#장애-알림` (자동 alert 채널 — 미설정, 검토 가치)
- 사내 알림 (notifications 테이블) — 멘션·배정만
- 이메일: 별도 alert 없음

검토 가치: Health Check 임계 초과 / 백오피스 다운 / Anthropic 한도 80%+ 자동 Slack alert.

## 인시던트 기록

장애 별 history 보관 위치: (현재 미정 — Notion / Linear 등 검토 가치).

기본 기록 항목:
- 발생일시 + 복구일시 (KST)
- 영향 범위 (도메인 / 사용자 수)
- 원인 (해피톡 다운 / 코드 버그 / 외부 의존)
- 대응 (직접 조치 / 자동 복구 / 사용자 안내)
- 재발 방지 (코드 가드 / 모니터링)
