# Cron 작업 가이드

> ⚠️ **마이그레이션 안내 (2026-05-13)** — 본문은 Vercel Cron 가정으로 작성됐다. covering-labs 이관 이후 cron 호출 주체(외부 runner · `apps/private/covering-talk-cron/` batch 등) 가 별도 PR 에서 설계될 예정. 본문 갱신 전이라도 path · 스케줄 · 비즈니스 정보는 그대로 유효.

> Vercel Cron 으로 등록된 14개 백그라운드 작업.
> 등록 위치: [`vercel.json`](../../vercel.json)
> Vercel 의 cron 시간은 **UTC 기준**. 아래 KST 는 환산값.

## 한눈에 보기

| # | Path | KST | 시스템 | 한 줄 요약 |
|---|---|---|---|---|
| 1 | `auto-close-chat` | 2분 | 채널톡 | 회신 없는 상담 자동 종료 + 자동 배차 + backoffice_requests GC |
| 2 | `daily-sheet-push` | 5분 | 방문수거 | orders → Google Sheet "단건_수거" 동기화 |
| 3 | `lunch-sheet-push` | 5분 | 런치 | lunch_orders → "단건_수거" + "단건_정산" 양 시트 동기화 |
| 4 | `payment-sync` | 10분 | 방문수거 | NicePay 결제 상태 polling → orders / conversations 갱신 |
| 5 | `lunch-payment-sync` | 10분 | 런치 | NicePay 결제 상태 polling → lunch_orders 갱신 |
| 6 | `classify-complaints` | 5분 | 대시보드 | 최근 7일 user 메시지 Haiku 배치 분류 → 캐시 |
| 7 | `auto-nudge` | 매일 10:00 | 방문수거 | 전날 견적 발송 후 응답 없는 건에 넛지 메시지 |
| 8 | `auto-reminder` | 매일 18:00 | 방문수거 | 익일 수거 예정 건에 리마인드 메시지 |
| 9 | `tomorrow-pickup-slack` | 매일 18:00 | 방문수거 | 익일 수거 일정 Slack 브리핑 (담당자 멘션) |
| 10 | `auto-payment` | 매일 20:00 | 방문수거 | 당일 confirmed 건 NicePay 결제 링크 발송 + status payment_requested 전환 |
| 11 | `lunch-auto-payment` | 매일 15:00 | 런치 | 전일 confirmed + link_pay 건 NicePay 결제 링크 발송 |
| 12 | `brand-message-scheduler` | 1분 | 실험실 | scheduled/sending 캠페인 1개 선택 → 1000건씩 분산 발송 |
| 13 | `brand-message-conversion` | 5분 | 실험실 | 발송 후 7일 이내 캠페인의 phone 매칭으로 orders 전환 backfill |
| 14 | `nps-daily` | 매일 12:00 | 방문수거 | 전일 결제완료 건에 NPS 4-버튼 송출 (phone 평생 1회 가드) |
| 15 | `auto-cancel` | 30분 | 방문수거 | §6.1 — 방문 12h 전까지 미결제 자동 취소 (feature flag `prepayment_enabled` ON 시) |

---

## 1. `auto-close-chat` — 채널톡 자동 종료

| 속성 | 값 |
|---|---|
| Path | `/api/cron/auto-close-chat` |
| Schedule | `*/2 * * * *` (UTC) → 2분마다 |
| Tag | `CS-CRON-001` |
| 코드 | [`app/api/cron/auto-close-chat/route.ts`](../../app/api/cron/auto-close-chat/route.ts) (~452 줄) |
| 의존 | `lib/channeltalk/client`, `lib/channeltalk/auto-tag`, `lib/supabase/client` |

**비즈니스 동작**
1. 채널톡 열린 상담 중 마무리 인사("*별도의 회신이 없을 경우, 상담이 종료됩니다") 보낸 후 N분간 회신 없는 건 → `closeChat`
2. 채널톡 신규 상담에 자동 태깅(`autoTagChat`) + 담당자 자동 배정
3. 차량번호 자동 응답 — 운영시간 외 (밤 9:30+) 차량번호 문의 시 표준 안내 + `snoozeChat` 으로 보류 후 배차 완료 시 자동 답변
4. **부수 효과**: `backoffice_requests` 5분+ stale row GC (채널톡 백오피스 큐 정리)

**실패 시 영향**
- 회신 없는 상담이 계속 열림 → 상담사 inbox 누적, 통계 왜곡
- 채널톡 신규 상담에 자동 태그 안 됨 → AI 분류 카테고리 누락

**관련 코드**
- 자동 태깅 로직: `lib/channeltalk/auto-tag.ts`
- closing 패턴: 본 파일 상수 `CLOSING_GREETING_PATTERNS`

---

## 2. `daily-sheet-push` — 방문수거 시트 동기화

| 속성 | 값 |
|---|---|
| Path | `/api/cron/daily-sheet-push` |
| Schedule | `*/5 * * * *` → 5분마다 |
| Tag | `CS-CRON-002` |
| 코드 | [`app/api/cron/daily-sheet-push/route.ts`](../../app/api/cron/daily-sheet-push/route.ts) (~303 줄) |
| 의존 | `googleapis`, `lib/supabase/client`, `lib/store/orders` |

**비즈니스 동작**
1. orders 테이블에서 status ∈ {confirmed, payment_requested, completed, cancelled} 조회 (`SYNC_START_DATE = 2026-04-08` 부터)
2. `미확인`/`미등록`/빈 이름 제외
3. Google Sheet `단건_수거` 탭에 upsert (order_number 기준)
4. 컬럼 매핑: 일자·신청자·시간·주소·전화·메모·운반비·최종금액·배차완료·수거완료·주문번호

**환경변수**: `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_GID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`

**실패 시 영향**: 외부 운영팀이 시트로만 보는 상태 데이터가 stale. 실시간 운영에는 영향 없음 (DB 가 진본).

**예정**: 추후 폐기 예정 (CLAUDE.md 의 데드라인은 stale)

---

## 3. `lunch-sheet-push` — 런치 시트 동기화

| 속성 | 값 |
|---|---|
| Path | `/api/cron/lunch-sheet-push` |
| Schedule | `*/5 * * * *` → 5분마다 |
| Tag | `CS-CRON-003` |
| 코드 | [`app/api/cron/lunch-sheet-push/route.ts`](../../app/api/cron/lunch-sheet-push/route.ts) (~228 줄) |

**비즈니스 동작**
- `단건_수거` 시트: 수거 진행 정보 (방문수거와 같은 형식)
- `단건_정산` 시트: 정산 방식별 (`link_pay` → 링크페이, `monthly_invoice` → 월말정산, `tax_invoice` → 세금계산서 발행) + 발행 상태

**예정**: 위와 동일 — 추후 폐기 예정

---

## 4. `payment-sync` — 방문수거 결제 상태 동기화

| 속성 | 값 |
|---|---|
| Path | `/api/cron/payment-sync` |
| Schedule | `*/10 * * * *` → 10분마다 |
| Tag | `CS-ETC-025` (legacy 카테고리) |
| 코드 | [`app/api/cron/payment-sync/route.ts`](../../app/api/cron/payment-sync/route.ts) |
| 의존 | `lib/nicepay/client`, `lib/store/orders` |

**비즈니스 동작**
1. orders 중 `status = "payment_requested"` 조회
2. 각 order 의 `payment_ids` (jsonb 배열) 의 모든 reqId 에 대해 NicePay `queryPaymentStatus`
3. 결제완료 entry 발견 → entry 에 tid/paidAt 기록, order status `completed`, conversation status `completed`

**왜 polling 인가**
- NicePay 가 우리 서버로 webhook push 하지 않음 (콘솔에 등록된 notify URL 없음)
- 양 시스템(방문/런치) 결제 모두 polling 패턴

---

## 5. `lunch-payment-sync` — 런치 결제 상태 동기화

| 속성 | 값 |
|---|---|
| Path | `/api/cron/lunch-payment-sync` |
| Schedule | `*/10 * * * *` |
| Tag | `CS-ETC-056` (legacy) |
| 코드 | [`app/api/cron/lunch-payment-sync/route.ts`](../../app/api/cron/lunch-payment-sync/route.ts) |

**비즈니스 동작**
1. lunch_orders 중 `status = "payment_requested"` & `settlement_type = "link_pay"` 조회 (날짜 무관)
2. `payment_ids` 누적된 reqId 모두 polling — 고객이 재발송 링크 중 어느 것으로 결제했는지 모름
3. 결제완료 → tid/paidAt 기록 + order status `completed`
4. **lunch_conversations 상태는 건드리지 않음** (상담 종료는 상담사 판단 영역)

---

## 6. `classify-complaints` — 불만 사전 분류

| 속성 | 값 |
|---|---|
| Path | `/api/cron/classify-complaints` |
| Schedule | `*/5 * * * *` |
| Tag | `CS-CRON-011` |
| 코드 | [`app/api/cron/classify-complaints/route.ts`](../../app/api/cron/classify-complaints/route.ts) |
| 의존 | `lib/dashboard/complaint-classify`, Anthropic Haiku |

**비즈니스 동작**
1. 최근 7일 messages (role=user, 6자+) 중 미분류 row 만 조회
2. Haiku 배치 분류 (BATCH_SIZE=30 × MAX_BATCHES=10 = 최대 300건/회)
3. 결과를 `complaint_classifications` 테이블에 UPSERT (`session_id, message_id` PK)
4. 대시보드 진입 시 캐시 hit 으로 즉시 표시

**제약**: Vercel maxDuration 60초 안에 완료해야 함. 1회당 300건 한도.

---

## 7. `auto-nudge` — 견적 넛지 자동 발송

| 속성 | 값 |
|---|---|
| Path | `/api/cron/auto-nudge` |
| Schedule | `0 1 * * *` (UTC) → KST 10:00 |
| Tag | `CS-NTF-014` (legacy) |
| 코드 | [`app/api/cron/auto-nudge/route.ts`](../../app/api/cron/auto-nudge/route.ts) |
| 의존 | `lib/store/conversations`, `lib/happytalk/send-message` |

**비즈니스 동작**
1. 어제 견적 발송된 (`status = quote_sent_nudge`) conversations 조회
2. 표준 넛지 메시지 분할 발송 (sendSplitMessage)
3. 발송 후 status 변경

---

## 8. `auto-reminder` — 익일 리마인드

| 속성 | 값 |
|---|---|
| Path | `/api/cron/auto-reminder` |
| Schedule | `0 9 * * *` → KST 18:00 |
| Tag | `CS-NTF-013` |
| 코드 | [`app/api/cron/auto-reminder/route.ts`](../../app/api/cron/auto-reminder/route.ts) |

**비즈니스 동작**
1. orders 중 내일 수거 예정 + 활성 상태 조회
2. 표준 리마인드 메시지 (`[자동발송] 내일 방문수거 예약이 잡혀 있어 안내드립니다`) 발송

---

## 9. `tomorrow-pickup-slack` — 익일 수거 Slack 브리핑

| 속성 | 값 |
|---|---|
| Path | `/api/cron/tomorrow-pickup-slack` |
| Schedule | `0 9 * * *` → KST 18:00 |
| Tag | `CS-CRON-004` |
| 코드 | [`app/api/cron/tomorrow-pickup-slack/route.ts`](../../app/api/cron/tomorrow-pickup-slack/route.ts) |
| 의존 | `SLACK_BOT_TOKEN`, `SLACK_PICKUP_CHANNEL_ID` |

**비즈니스 동작**
1. 내일 수거 예정 orders 시간대순 정렬
2. 담당자(유대현·김원빈) 멘션 포함 Slack 메시지 작성
3. 지정 채널로 발송

**환경변수**: `SLACK_BOT_TOKEN`, `SLACK_PICKUP_CHANNEL_ID` (없으면 fallback `C0AENH7JW2Y`)

---

## 10. `auto-payment` — 방문수거 자동 결제 요청

| 속성 | 값 |
|---|---|
| Path | `/api/cron/auto-payment` |
| Schedule | `0 11 * * *` → KST 20:00 |
| Tag | `CS-ETC-027` |
| 코드 | [`app/api/cron/auto-payment/route.ts`](../../app/api/cron/auto-payment/route.ts) |
| 의존 | `lib/nicepay/client`, `lib/store/orders`, `lib/happytalk/client` |

**비즈니스 동작**
1. 당일 `date=오늘 KST` & `status=confirmed` 조회
2. `payment_ids` 가 이미 있는 건은 스킵
3. NicePay `createPaymentLink` → 카카오 sendType=2 로 결제 페이지(이미지) 발송
4. status → `payment_requested`

**주의**: 결제 링크 이미지(`PAYMENT_IMAGE_URL`) 가 stale 가능성 — Supabase Storage 경로 변경 시 갱신 필요

---

## 11. `lunch-auto-payment` — 런치 자동 결제 요청

| 속성 | 값 |
|---|---|
| Path | `/api/cron/lunch-auto-payment` |
| Schedule | `0 6 * * *` → KST 15:00 |
| Tag | `CS-ETC-055` |
| 코드 | [`app/api/cron/lunch-auto-payment/route.ts`](../../app/api/cron/lunch-auto-payment/route.ts) |

**비즈니스 동작**
1. 전일 `date=어제 KST` & `status=confirmed` & `settlement_type=link_pay` 조회
2. 주문별 NicePay 결제 링크 생성 (카카오 자동 발송)
3. status → `payment_requested`
4. **session_id 단위 묶음** → 같은 세션의 여러 주문에 안내 메시지 1회만 발송

**옵션 파라미터**: `?resendNotice=YYYY-MM-DD` — 안내 메시지만 재발송

---

## 12. `auto-cancel` — 방문수거 선결제 미완료 자동 취소

| 속성 | 값 |
|---|---|
| Path | `/api/cron/auto-cancel` |
| Schedule | `*/30 * * * *` → 30분마다 |
| Tag | `CS-ETC-068` |
| 코드 | [`app/api/cron/auto-cancel/route.ts`](../../app/api/cron/auto-cancel/route.ts) |
| Feature flag | `app_settings.prepayment_enabled` — OFF 면 no-op |

**비즈니스 동작 (§6.1 100% 선결제)**
1. `app_settings.prepayment_enabled = false` 면 즉시 return (no-op).
2. `status = payment_requested` 인 모든 주문 조회.
3. 각 주문의 방문 시작 시각(`date` + `time_slot` 앞시각, KST) - 12h 가 지났으면 → `status = cancelled`.
4. session 으로 카카오톡 안내 발송: "방문 12시간 전까지 결제 미완료되어 예약이 자동으로 취소되었습니다".
5. `audit_logs.action='status_change'` 자동 기록 (description prefix=`자동취소`).
6. 매일 18시 `tomorrow-pickup-slack` 의 스레드에 오늘 자동취소된 주문이 함께 보고됨.

**롤백**: `update app_settings set value='false' where key='prepayment_enabled'` 한 줄로 즉시 비활성.

---

## Cron 추가/수정 시 체크리스트

- [ ] `vercel.json` 의 `crons` 배열에 추가
- [ ] route 파일에 `// [CS-CRON-NNN]` 또는 기존 카테고리 태그 부여
- [ ] 본 문서에 항목 추가 (path · schedule · tag · 비즈니스 동작 · 실패 시 영향)
- [ ] [`docs/api/tags.md`](../api/tags.md) 갱신
- [ ] Vercel maxDuration 60초 한도 검토 — 초과 가능성 있으면 페이징 필요
- [ ] 시간대 KST↔UTC 환산 명시 (Vercel 은 UTC)
