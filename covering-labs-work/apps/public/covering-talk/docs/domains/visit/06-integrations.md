# 06 — 외부 연동

| 서비스 | 모듈 | 인증 | 푸시·풀 | 비고 |
|---|---|---|---|---|
| 해피톡 (방문 채널) | `lib/happytalk/client.ts` + `send-message.ts` | `HT_CLIENT_ID/SECRET` + `SENDER_KEY` | webhook push (수신), API call (발송) | 콘솔: 해피톡 운영자 페이지 |
| NicePay | `lib/nicepay/client.ts` (공유) | `NICEPAY_*` | API call only (push 없음 → cron polling) | 양 시스템 공유 |
| Dhero (두발히어로 배송) | `lib/dhero/client.ts` | `DHERO_*` | API call | 방문수거 전용 |
| Slack | `cron/tomorrow-pickup-slack` 직접 | `SLACK_BOT_TOKEN`, `SLACK_PICKUP_CHANNEL_ID` | API call | 익일 수거 브리핑 |
| Kakao Local | `lib/kakao/local.ts` (공유) | `KAKAO_REST_API_KEY` | API call | 주소 정규화 |
| Covering 외부 Supabase | `lib/covering/client.ts` | `COVERING_SUPABASE_*` | PostgREST INSERT (단방향) | sendToCovering 만 활성 |
| Google Sheets | `cron/daily-sheet-push` | `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` | Sheets API call | 단건_수거 미러 |

---

## 해피톡 (HappyTalk)

### 인입
- `/api/webhook/route.ts` 가 모든 인입 받음 → `sender_key` 로 분기:
  - `process.env.SENDER_KEY` (방문) → `/api/webhook/message`
  - `process.env.LUNCH_SENDER_KEY` (런치) → `/api/webhook/lunch/message`
- `/api/webhook/metadata` — 사용자 메타데이터 수신 (이름·전화)
- `/api/webhook/session-end` — 세션 종료 알림

### 발송
- `lib/happytalk/client.ts` 의 `sendMessage`, `sendImage`, `sendFile`, `sendImageMessage`, `sendPlainMessage`
- `lib/happytalk/send-message.ts` — `sendSplitMessage` (긴 메시지 자동 분할)
- 주요 호출처: `/api/conversations/[sessionId]/send*`, `cron/auto-*`

### 자주 발생 에러
- **InvalidSessionException (-502)** — 카카오 채팅창 닫힘. send route 가 자동 감지 → conversations.status = `closed`
- 인증 실패 — `HT_CLIENT_ID/SECRET` 만료. 콘솔에서 재발급 → Vercel env 갱신

### 콘솔 / 자격증명
- 콘솔 URL: 해피톡 관리자 페이지 (운영팀 보유)
- env 변경 시 Vercel 재배포 필요

---

## NicePay (결제)

### 양 시스템 공유 클라이언트
`lib/nicepay/client.ts` — `createPaymentLink`, `queryPaymentStatus`, `deactivatePaymentLink` 3개 함수 + `nicepayPayUrl(reqId)` 헬퍼 (알림톡 노출 URL: `https://web.nicepay.co.kr/smart/slo.jsp?rid={reqId}` — `rid` = `reqId` 동일).

### 방문수거 사용 라우트
- `/api/orders/[id]/payment` — 결제 링크 생성 (단건 / 재발송)
- `/api/orders/[id]/ladder-prepayment` — 사다리차 선결제 (별도 Order + 토글 차감)
- `/api/orders/batch-payment` — 일괄
- `/api/orders/payment-nudge` — 넛지 (이미지 + 텍스트, latest reqId 있으면 본문에 결제 링크 라인 자동 삽입)
- `/api/cron/auto-payment` (20:00) — 당일 confirmed → 자동 발송
- `/api/cron/payment-sync` (10분) — 결제 상태 polling

### 흐름
1. `createPaymentLink` 호출 → `{reqId, payUrl}` 반환
2. orders.payment_ids JSONB 배열에 `{reqId, payUrl, sentAt}` push
3. 카카오 톡으로 payUrl 발송 (sendType=2 이미지)
4. cron/payment-sync 가 reqId 모두 polling — 완료 entry 발견 시 `tid, paidAt` 추가 + status `completed`
5. UI 에서 `nicepayPayUrl(reqId)` 로 결제 페이지 URL 조립 → 결제 모달의 "📋 링크" 복사 버튼·안내 메시지 / 넛지 본문 자동 삽입 / 사다리차 모달 발송 후 표시

### 사다리차 선결제 (CS-ORD-010)
정책: 사다리차 비용은 본 수거 전 선결제. 본 견적에 이미 포함된 경우 부모 totalPrice 에서 차감 (이중 청구 방지).
- 새 Order 생성 (memo prefix `[사다리차선결제] 원본 #{원본orderNumber}`)
- sessionId 부모와 연결 — CustomerPanel "지난 예약" 에 함께 표시
- date 부모와 동일 (배차/일정 cron 노출 가능 — 결제완료 즉시 status 전환되어 ghost 윈도우 짧음)
- 토글 ON: `parent.totalPrice -= amount` PATCH (audit 기록)

### 환경변수
- `NICEPAY_MID`, `NICEPAY_MERCHANT_KEY`, `NICEPAY_USR_ID`

### 주의
- **NicePay → 우리 서버 webhook push 없음**. 우리가 polling. 라우트 URL 변경해도 외부 영향 0.
- 같은 order 에 여러 reqId 누적 가능 (재발송) — payment-sync 가 모두 확인.

---

## Dhero (두발히어로 배송)

방문수거 일부 건 외부 배송 API 로 등록. `lib/dhero/client.ts`.

- 라우트: `/api/dhero/deliveries`, `/api/dhero/deliveries/create`
- 캐시: `dhero_deliveries` 테이블
- 환경변수: `DHERO_API_URL`, `DHERO_TOKEN`, `DHERO_SPOT_CODE`
- **공식 스펙**: [`../../api-specs/dhero-delivery-api-2024-07-31.pdf`](../../api-specs/dhero-delivery-api-2024-07-31.pdf) (PDF)

---

## Slack 브리핑

`cron/tomorrow-pickup-slack` (KST 18시):
- 내일 수거 예정 orders 시간대순 정렬
- 담당자 (`<@U07865TB7F1>` 유대현, `<@U0AAF0BJEUX>` 김원빈) 멘션
- 채널: `SLACK_PICKUP_CHANNEL_ID` (fallback `C0AENH7JW2Y`)
- env: `SLACK_BOT_TOKEN`

---

## Kakao Local (주소 정규화)

`lib/kakao/local.ts` — 양 시스템 공유. 주소 텍스트 → 시·구·동 + lat/lng.

- 라우트: `/api/address/normalize`
- env: `KAKAO_REST_API_KEY`
- 사용처: 방문 quote 계산, 런치 vendor 등록, district-resolver

---

## Covering 외부 Supabase (단방향 sync)

방문수거 답변 발송 시 외부 covering DB 의 `bookings` 테이블에 INSERT.

- 함수: `lib/covering/client.ts:sendToCovering`
- 호출처: `/api/conversations/[sessionId]/send/route.ts:187, 346` 두 곳
- 동작: 신규 order INSERT 또는 기존 order 매핑
- 결과 ID 보존: `orders.memo` 에 `[커버링: <uuid>]` 패턴 누적 (양방향 추적용)
- env: `COVERING_SUPABASE_URL`, `COVERING_SUPABASE_KEY` (비우면 throw)

### 2026-04-27 대규모 정리
- dead chain 6개 라우트 + 미사용 함수 8개 삭제
- `lib/covering/client.ts` 418 → 161줄 (62%↓)
- `sendToCovering` 1개 함수만 활성

---

## Google Sheets (단건_수거)

운영팀이 시트로 보는 미러. 진본은 DB.

- Cron: `cron/daily-sheet-push` (5분)
- Sheet ID env: `GOOGLE_SHEET_ID`
- Service account: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`
- 동기화 시작일: 2026-04-08 (그 전 데이터는 시트에 안 들어감)
- 폐기 예정 (운영상 어쩔 수 없이 유지 — H2 결정)

---

## 인증 토큰 로테이션 권장 주기

| 서비스 | 권장 주기 | 메커니즘 |
|---|---|---|
| 해피톡 (HT_*) | 6개월 | 콘솔에서 재발급 |
| NicePay | 변경 시만 | 결제 계약 변경 시 |
| Dhero | 6개월 | 두발히어로 운영팀 문의 |
| Slack Bot Token | 1년 | Slack App 설정 |
| Kakao REST API | 변경 없음 | 키 노출 시만 |
| Covering Supabase | 변경 시만 | DB 마이그레이션 시 |
| Google Service Account | 키 노출 시만 | GCP 콘솔에서 재발급 |
