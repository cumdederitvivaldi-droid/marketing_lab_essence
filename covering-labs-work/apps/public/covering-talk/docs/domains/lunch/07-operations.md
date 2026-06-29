# 07 — 운영 (Cron · 모니터링 · 정산 사이클)

> ⚠️ **마이그레이션 안내 (2026-05-13)** — Vercel Cron 가정으로 작성된 본문. covering-labs 이관 이후 cron 호출 주체는 별도 PR 에서 정의. path · 스케줄 · 비즈니스 정보는 그대로 유효.

## Cron (런치 관련 3개)

| Path | KST | 영향 | 상세 |
|---|---|---|---|
| `lunch-sheet-push` | 5분 | lunch_orders → 단건_수거 + 단건_정산 시트 동기화 | [cron.md §3](../../architecture/cron.md#3-lunch-sheet-push--런치-시트-동기화) |
| `lunch-auto-payment` | 매일 15:00 | 전일 confirmed + link_pay → 결제 링크 발송 + status 전환 | [cron.md §11](../../architecture/cron.md#11-lunch-auto-payment--런치-자동-결제-요청) |
| `lunch-payment-sync` | 10분 | NicePay polling → 결제 완료 entry 마킹 | [cron.md §5](../../architecture/cron.md#5-lunch-payment-sync--런치-결제-상태-동기화) |

전체 cron 요약: [`../../architecture/cron.md`](../../architecture/cron.md)

## 정산 사이클

### Daily — 일별 수거 + 결제

```
Day N (수거 진행)
├─ 운영팀 lunch_orders 등록 (수동 / 채팅 자동파싱)
├─ 기사 배차 (driver_name)
├─ 실 수거 (is_picked_up = true)
└─ status = "confirmed"

Day N+1 (자동결제, link_pay 만)
└─ KST 15:00 lunch-auto-payment
   ├─ 전일 confirmed + link_pay 조회
   ├─ NicePay 결제 링크 생성
   ├─ 카카오톡 안내 (session_id 단위 1회)
   └─ status → "payment_requested"

Day N+1 ~ N+? (결제 polling)
└─ 10분마다 lunch-payment-sync
   ├─ payment_requested 전체 polling
   ├─ 완료 발견 → tid/paidAt 기록
   └─ status → "completed"
```

### Monthly — 세금계산서 발행 (tax_invoice 만)

```
월말
├─ 운영팀이 발행 후보 확인 (Invoices 탭)
│   - 해당 월 lunch_orders WHERE settlement_type=tax_invoice, invoice_issued=false
├─ 일괄 발행 / 단건 발행
│   - lunch_invoices INSERT (period="YYYY-MM")
│   - Bolta API 호출 → issuance_key
│   - lunch_orders.invoice_id + invoice_issued=true
└─ 비동기 발행 완료 → nts_transaction_id, status=issued
```

### Monthly — 월말 통합 청구 (monthly_invoice 만)

본 시스템 외 (수동 청구). lunch_orders 의 invoice_issued 만 체크 표시 → 단건_정산 시트에 반영.

## 배포

방문수거와 동일:
- main push → Vercel 자동 빌드
- 환경변수 변경 → 재배포 필요
- Cron 변경 (`vercel.json`) → 24시간 내 적용
- 빌드 타임 로드: `lib/ai/lunch-policy.md` 수정 시 빌드 후 배포 필수

## 모니터링

### 정산 누락 의심
```sql
-- 어제 수거 + link_pay 인데 결제 링크 안 간 건
SELECT order_number, vendor_name, total_amount, payment_ids
FROM lunch_orders
WHERE date = ((NOW() AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '1 day')::date::text
  AND settlement_type = 'link_pay'
  AND status = 'confirmed'
  AND (jsonb_array_length(payment_ids) = 0 OR payment_ids IS NULL);
```

발견 시 `cron/lunch-auto-payment` 가 실패했거나 누락. 수동 재발송: `?resendNotice=YYYY-MM-DD` 옵션.

### Bolta 발행 실패
```sql
SELECT vendor_name, period, total_amount, error_message
FROM lunch_invoices
WHERE status = 'failed'
ORDER BY created_at DESC LIMIT 20;
```

대부분 사업자등록번호 / 세금이메일 오기재. `lunch_vendors` 정보 갱신 후 재발행.

### 채팅 - 미응답 누적
```sql
SELECT lc.vendor_name, lc.unread_count, lc.updated_at
FROM lunch_conversations lc
WHERE lc.unread_count > 0 AND lc.status = 'active'
  AND lc.updated_at < NOW() - INTERVAL '2 hours'
ORDER BY lc.updated_at;
```

### 시트 동기화 누락
```sql
-- 시트 동기화 시작일(2026-04-08) 이후 created_at 기준 row 수 vs 시트 row 수 비교 (수동)
SELECT date, COUNT(*) FROM lunch_orders
WHERE created_at >= '2026-04-08'
GROUP BY date ORDER BY date DESC LIMIT 7;
```

수동으로 시트 row 수와 비교 → 차이 나면 cron/lunch-sheet-push 로그 확인.

## 운영 알림

### Slack
- 별도 alert 채널 없음 (방문수거의 `#수거-내일` 같은 자동 브리핑 없음)
- 추가 검토 가치 있음

### 사내 알림 (notifications)
- 멘션·배정 → 방문수거와 같은 폴링 시스템

## 배포 영향 — 변경 시 주의

| 변경 영역 | 영향 |
|---|---|
| `lib/ai/lunch-prompt.ts` | 즉시 다음 호출부터 새 프롬프트 |
| `lib/ai/lunch-policy.md` | **빌드 타임 로드** — 빌드 후 배포 필수 |
| `app/api/webhook/lunch/message/route.ts` | 메인 webhook — 회귀 위험 |
| `lib/bolta/client.ts` | 세금계산서 발행 영향 — Bolta API 스펙 변경 시 |
| `cron/lunch-auto-payment` 시간 변경 | KST 15시 = UTC 6시. vercel.json 갱신 |
| `app_settings` lunch 관련 키 | 즉시 반영 |

## 트래픽 패턴

- 평일 9-18시 운영 — 수거 작업·정산 처리
- 채팅 인입은 9-22시 골고루
- 자동결제는 15시 1회 → 그 직후 cs-realtime 큐 잠시 spike
