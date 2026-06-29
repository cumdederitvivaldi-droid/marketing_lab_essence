# 방문수거 §6.1 100% 선결제 정책 — Hand-off

**시행일**: 2026-05-11 19:52 KST  
**작업자**: 김원빈 + Claude  
**상태**: 운영 중 (`prepayment_enabled = true`)

---

## 1. 정책 개요

오늘 이전: 수거 후 결제. `payment_requested = 수거 끝, 결제 대기`.  
오늘 이후: 예약 즉시 결제. `payment_requested = 결제 대기 (수거 전)`.

같은 status 값의 의미가 cutoff 이전/이후로 다르므로 **모든 status 분기 로직은 cutoff 기준으로 동작**.

### 신규 상태 흐름

```
confirmed
  ↓ (예약 확정 즉시 NicePay 링크 발급, 카톡 메시지에 inline 임베드)
payment_requested  ── (방문 12h 전 미결제) ──> cancelled (자동취소)
  ↓ (고객 결제 완료, payment-sync 10분 주기 polling)
prepaid (선결제완료, 수거 대기)
  ↓ (수거일 20:00 KST, prepaid-complete cron)
completed (전체 완료)
```

### 기존 데이터 (cutoff 이전)

`payment_requested` 의미가 다름 — 수거는 끝났고 결제만 대기 중. payment-sync 가 결제완료 감지 시 `completed` 로 전이 (cutoff 비교로 자동 분기).

---

## 2. Feature flag 운영

| 키 | 값 | 의미 |
|---|---|---|
| `prepayment_enabled` | `true` | 전체 ON/OFF 마스터 스위치. OFF 면 신규 흐름 전체 비활성, OLD 흐름으로 복귀 |
| `prepayment_cutoff_iso` | `2026-05-11 10:52:03+00` | 이 시각 이후 `created_at` 인 주문만 신규 흐름. 이전 주문은 OLD 흐름 |

### 즉시 OFF (롤백)
```sql
UPDATE app_settings SET value='false', updated_at=now() WHERE key='prepayment_enabled';
```
- 예약확정 즉시 결제링크 발송 중단 → 기존 20시 cron (auto-payment) 만 작동
- payment-sync 결제완료 시 `completed` 로 마무리 (기존 흐름)
- auto-cancel cron no-op
- 챗 예약확정 메시지에서 `{{결제정보}}` placeholder 자동 제거 → 기존 형식과 동일

### 재시작
```sql
UPDATE app_settings SET value='true', updated_at=now() WHERE key='prepayment_enabled';
-- 필요 시 cutoff 재설정:
UPDATE app_settings SET value=to_jsonb(now()::text), updated_at=now()
  WHERE key='prepayment_cutoff_iso';
```

---

## 3. 주요 파일

### 정책 진본
- `lib/ai/pickup-policy.md` §6.1, §6.2 — 정책 문서. AI 프롬프트·커바니가 이 문서 참조.

### Order status enum
- `lib/store/orders.ts`
  - `OrderStatus` 타입에 `"prepaid"` 추가
  - `ORDER_STATUS_LABELS`, `ORDER_STATUS_COLORS` 매핑
  - `migrations/044_orders_status_prepaid.sql` — DB CHECK 제약 갱신

### 선결제 헬퍼
- `lib/payments/issue-prepayment-link.ts` — NicePay 링크 발급 + (옵션) 안내 메시지 발송
  - **3회 retry** (1s, 2s backoff)
  - 실패 시 audit_logs 기록 (description prefix=`선결제 링크 발급 실패`)
  - `payLimitDate` 최대 **7일 cap** (NicePay 제약)
- `lib/orders/visit-start-time.ts` — timeSlot 파싱. "오전 9시", "오후 1시", "13:00" 등 다양한 표기 지원
- `lib/store/app-settings.ts` — `getPrepaymentEnabled()`, `getPrepaymentCutoffIso()` + 60s 캐시

### 발송 경로
- `app/api/conversations/[sessionId]/send/route.ts`
  - booking signature 감지 시 `prepareBookingOrderForPrepayment` → `issuePrepaymentLink({sendNotification:false})` → `{{결제정보}}` placeholder 치환
  - **링크 발급 실패 시 500 반환** (결제정보 없는 메시지가 고객에게 가지 않게)
  - 후처리는 `after()` 로 background — 모달 응답 ~300ms

### 메시지 템플릿 (`{{결제정보}}` placeholder)
- `lib/utils/workflow-config.ts:62` — `DEFAULT_BOOKING_CONFIRM`
- `app/settings/page.tsx:44` — settings UI default
- `app/api/webhook/message/route.ts:1010, 1121` — Phase 7→8 자동 draft
- `lib/ai/prompt-blocks.ts:258, 339, 354` — AI 프롬프트 안내
- `lib/ai/prompt.ts:200` — v1 레거시
- `components/conversations/MessageInput.tsx:163` — 예약확정 모달 트리거 텍스트

### Cron
| cron | schedule | 역할 |
|---|---|---|
| `auto-cancel` | `*/30 * * * *` | 방문 12h 전 미결제 주문 자동 취소. 4중 가드: flag/cutoff/created_at/visit date today-or-tomorrow |
| `prepaid-complete` | `0 11 * * *` (20시 KST) | 수거일 종료 시점에 `prepaid → completed` 자동 전이 |
| `payment-sync` (기존) | `*/10 * * * *` | NicePay polling. flag ON + cutoff 이후 created_at 인 주문은 결제완료 시 `prepaid`, 아니면 기존대로 `completed` |
| `auto-payment` (기존) | `0 11 * * *` (20시 KST) | 당일 confirmed 인 주문에 결제링크 발송 (fallback). 새 정책에서도 즉시 발송 실패 시 backstop 역할 |
| `tomorrow-pickup-slack` (기존) | 매일 18:00 KST | 익일 수거 브리핑. 신규 정책으로 어제 슬랙 ~ 오늘 슬랙 사이 자동취소된 "오늘 수거건" 도 스레드에 보고 |

### UI 표시 위치
- `app/bookings/page.tsx` — 통계 카드. 정산완료 = `completed + prepaid` 합산.
- `components/conversations/CustomerPanel.tsx` — 우측 패널 상태 매핑 + 예약 수정 모달 status 드롭다운에 "선결제완료" 옵션
- `components/PaymentModal.tsx` — `booking.status==='prepaid'` 일 때 "수거 완료 처리" 버튼 노출 (수동 prepaid → completed)
- `app/new_dashboard/components/OrdersDetailModal.tsx` — props.status 타입에 prepaid 추가
- `app/dispatch/**` — 활성 주문 필터에 prepaid 포함

### Dashboard 분기
- `lib/dashboard/health.ts` — 미결제율 분모/취소율 분모에 prepaid 포함
- `lib/dashboard/revenue.ts` — KR1 매출 = `completed + prepaid` (선결제 입금 분 매출 인정)
- `lib/dashboard/daily-funnel.ts` — `ACTIVE_ORDER_STATUSES` 에 prepaid 추가
- `app/api/new_dashboard/analytics/route.ts` — P7 일정확정 / P8 수거완료 분기. P8 churn 에 `선결제완료` 키워드 추가
- `app/api/new_dashboard/{price-tiers,region-conversion,promo-cap-impact,conversion-time,response-time}/route.ts` — `ACTIVE_STATUSES` 에 prepaid 추가

### Migration
- `migrations/043_prepayment_feature_flag.sql` — `app_settings.prepayment_enabled = false` seed
- `migrations/044_orders_status_prepaid.sql` — `orders_status_check` CHECK 제약에 `prepaid` 추가

---

## 4. 발생한 사고 + 대응 (2026-05-11)

### 사고 1: 자동취소 cron 이 OLD 주문 34건 잘못 취소

**원인**: 초기 `auto-cancel` cron 이 `cutoff` 비교 없이 모든 `payment_requested` 주문을 검사. OLD 데이터에서 `payment_requested = 수거 끝, 결제 대기` 의미라 자동취소되면 안 되는 건이 취소됨.

**증상**: 34건 자동 취소 + 카톡 "예약 자동 취소" 안내 발송 (수거 이미 끝난 고객들에게).

**대응**:
1. `prepayment_enabled = false` 즉시 OFF
2. 34건 status 모두 `payment_requested` 로 원복 (Node 스크립트 일괄 PATCH)
3. 29명 (session 있는 케이스) 정정 사과 카톡 발송 — 강산 1명은 별도 처리 (사용자 지시)
4. cron 코드 수정: `cutoffIso` 미설정 시 skip + `created_at >= cutoff` 필터 추가

**커밋**: `93797267` fix(auto-cancel): cutoff 가드 추가

### 사고 2: timeSlot 파서 버그로 강산 5/12 주문 잘못 취소

**원인**: `parseVisitStartTime` 함수가 "오후 1:00~오후 4:00" 의 "오후 1:00" 을 `01:00` (오전 1시) 로 잘못 파싱. → deadline 이 ~12시간 일찍 계산 → cron 이 미래 visit 주문을 cancel.

**증상**: 강산 5/12 13:00 방문 주문이 5/11 21:00 KST cron 으로 cancelled.

**대응**:
1. 파서 다시 작성 — `오전/오후` prefix 가 있으면 우선 적용. 17개 테스트 케이스 통과.
2. 강산 주문 status 원복
3. 추가 방어 가드: `auto-cancel` cron query 에 `date IN (today, tomorrow)` 필터 추가 — 파서 실패해도 미래 visit 잘못 cancel 방지

**커밋**: 
- `7c6ceebd` fix(prepayment): NicePay retry + timeSlot 파싱 버그
- `e6099a4e` fix(auto-cancel): visit 날짜 sanity guard

### 사고 3 (보강): NicePay 발급 일시 실패 → 결제정보 없는 메시지 발송

**원인**: 첫 NicePay API 호출 실패 시 retry 없이 catch → 결제 블록 없는 OLD 형식 메시지가 고객에게 발송. 사용자가 PaymentModal 수동 발송으로 사후 처리.

**증상**: 배지우 (328122973) 케이스 — 결제 링크 없는 예약완료 메시지 발송.

**대응**:
1. `issuePrepaymentLink` 에 **3회 retry** (1s, 2s backoff)
2. 모든 retry 실패 시 audit_logs 기록 (운영 식별 가능)
3. `send/route.ts` — `isBookingMessage && enabled && link 실패` 시 **500 반환** (메시지 발송 차단). 사용자가 토스트 보고 재시도. 주문은 이미 confirmed 상태로 남아 있어 재시도 시 helper 가 재사용 + link 재발급.

**커밋**: `7c6ceebd`

### 사고 4 (보강): payLimitDate NicePay 7일 제약

**원인**: NicePay `payLimitDate` 최대 발급일+7일. 방문이 7일 이상 후면 `visit - 12h` 가 7일 초과 → NicePay 거부.

**대응**: `payLimitDate` 를 7일로 cap. 방문이 더 멀면 link 가 먼저 만료될 수 있으며 운영자 수동 재발송 or fallback cron 필요.

**커밋**: `d90330f6`

---

## 5. 운영 체크리스트

### 일일 운영
- [ ] `/bookings` 통계 카드 — 정산완료 / 결제요청 / 진행예정 정상 표시 확인
- [ ] 익일 18시 슬랙 브리핑 — 익일 수거 + 자동취소 보고 정상
- [ ] `audit_logs` 에 "선결제 링크 발급 실패" 로그 없는지 주기 점검

### NicePay 만료 임박 (방문 7일 이상 후 주문)
- [ ] 추가 작업 후보: 매일 만료 임박 link 자동 재발급 cron — 현재 미구현. 7일 이내 결제 안 한 고객은 운영자 수동 재발송 필요

### 사고 발생 시 즉시 OFF
```sql
UPDATE app_settings SET value='false' WHERE key='prepayment_enabled';
```

### 영향 식별 (잘못 취소된 주문 추적)
```sql
SELECT entity_id, description, created_at FROM audit_logs
WHERE description LIKE '자동취소:%' AND user_name = 'system'
  AND created_at >= '2026-05-11T00:00:00Z'
ORDER BY created_at;
```

### 발급 실패 식별
```sql
SELECT entity_id, description, created_at, changes FROM audit_logs
WHERE description LIKE '선결제 링크 발급 실패%' AND user_name = 'system'
ORDER BY created_at DESC;
```

---

## 6. 알려진 한계 / TODO

- **7일 이상 후 방문 link 만료**: 현재 운영자 수동 재발송 필요. 자동 재발급 cron 후속 작업으로.
- **Vercel cron deploy propagation race**: 새 deploy Ready 직후 fire 되는 cron 이 이전 코드 사용할 수 있음. 4중 가드로 방어 중이나, 완전 차단은 cron schedule 을 `*/30 * * * *` 같은 fixed time 대신 offset 시간(예: `7,37 * * * *`) 으로 변경하면 추가 안전. 일단 미적용.
- **외부 covering DB 동기화**: 신규 `prepaid` 상태는 외부 covering DB 로 동기화 안 함. cancel 도 동기화 안 함. 필요 시 후속 추가.
- **`prepaid → completed` 자동 전이 시점**: 현재 매일 20시 cron 일괄. 수거 완료 사진 업로드 등 이벤트 기반 전이로 정밀화 가능.

---

## 7. 관련 커밋 (2026-05-11)

| 커밋 | 설명 |
|---|---|
| `4a87a820` | feat(prepayment) — 정책 본체 (38 files) |
| `a9b1bd5f` | fix(conversations) — ChatArea 반응형 |
| `93797267` | fix(auto-cancel) — cutoff 가드 (사고 1) |
| `7c6ceebd` | fix(prepayment) — retry + 발송 차단 + 파서 (사고 2,3) |
| `d90330f6` | fix(prepayment) — payLimitDate 7일 cap (사고 4) |
| `e6099a4e` | fix(auto-cancel) — visit date sanity guard |

---

**문의**: 김원빈 (bin@covering.app)
