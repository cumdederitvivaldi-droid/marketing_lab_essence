# 06 — 외부 연동

| 서비스 | 모듈 | 인증 | 푸시·풀 | 비고 |
|---|---|---|---|---|
| 해피톡 (런치 채널) | `lib/happytalk/lunch-client.ts` | `LUNCH_HT_CLIENT_ID/SECRET` + `LUNCH_SENDER_KEY` | webhook push (수신), API call (발송) | 방문 채널과 별도 sender_key |
| NicePay | `lib/nicepay/client.ts` (공유) | `NICEPAY_*` | API call only | 양 시스템 공유 |
| Bolta (세금계산서) | `lib/bolta/client.ts` | `BOLTA_API_KEY`, `BOLTA_CUSTOMER_KEY`, `BOLTA_SUPPLIER_*` | API call | 런치 전용 |
| Google Sheets | `lib/google/sheets.ts` + cron | `GOOGLE_*` | Sheets API call | 양 시스템 공유 (다른 탭) |
| Kakao Local | `lib/kakao/local.ts` (공유) | `KAKAO_REST_API_KEY` | API call | 주소 정규화 |

---

## 해피톡 (런치 채널)

방문수거와 **같은 클라이언트 자격증명**을 쓰지만 **다른 채널 (sender_key)**.

### 환경변수
- `LUNCH_HT_CLIENT_ID` — 방문수거의 `HT_CLIENT_ID` 와 동일 값
- `LUNCH_HT_CLIENT_SECRET` — 동일
- `LUNCH_SENDER_KEY` — **런치 전용 채널 키** (다른 값)
- `LUNCH_HAPPYTALK_API_HOST` — 일반적으로 방문과 동일 호스트

### 운영 전환 일자
2026-04-17 — 그 전에는 방문수거 채널을 같이 사용. 현재는 별도 채널.

### 인입 / 발송
- 인입: `/api/webhook` 가 sender_key 분기 → `/api/webhook/lunch/message`
- 발송: `lib/happytalk/lunch-client.ts` 의 `sendLunchPlainMessage`, `sendLunchImageMessage` 등

### InvalidSession (-502) 처리
방문수거와 동일 패턴. `/api/lunch/conversations/[sessionId]/{send,send-image,send-file}/route.ts` 에 적용. 사용자 보고 후 모두 패치 완료.

---

## NicePay (런치)

방문수거와 **같은 client.ts** 사용 (`lib/nicepay/client.ts`). 차이는 호출 라우트 + 대상 테이블만:

| 항목 | 방문 | 런치 |
|---|---|---|
| 자동결제 cron | `auto-payment` (20:00) | `lunch-auto-payment` (15:00) |
| 대상 테이블 | `orders` | `lunch_orders` |
| 대상 status | `confirmed` AND `date = today` | `confirmed` AND `settlement_type = link_pay` AND `date = yesterday` |
| 결제 polling | `payment-sync` (10분) | `lunch-payment-sync` (10분) |
| 안내 메시지 | order 단위 | session_id 단위로 묶음 (중복 방지) |

### 안내 메시지 묶기 (런치 특이점)
한 사장님이 여러 주문을 가진 경우, 결제 링크는 주문 단위로 따로 생성하되 **안내 메시지는 1회만** 발송. 그렇지 않으면 사장님이 같은 시간에 N개 메시지를 받음.

```ts
// cron/lunch-auto-payment/route.ts
const sessionGroups = groupBy(orders, "session_id");
for (const [sid, group] of sessionGroups) {
  // 각 order 마다 결제 링크 생성
  // 안내 메시지는 sid 별 1회만 발송
}
```

### 옵션: 안내만 재발송
`?resendNotice=YYYY-MM-DD` — 결제 링크는 그대로 두고 안내 메시지만 재발송 (운영 실수 보상).

---

## Bolta (세금계산서)

런치 전용. `lib/bolta/client.ts` (단일 파일).

### 환경변수
- `BOLTA_API_KEY` — Bolta API 키
- `BOLTA_CUSTOMER_KEY` — Bolta 측 고객 키 (우리 = 공급자)
- `BOLTA_SUPPLIER_*` — 공급자 (커버링) 정보

### 발행 흐름
1. `/api/lunch/invoices/issue` POST — 단건 또는 월별 통합 발행 요청
2. `lunch_invoices` row INSERT (status=pending)
3. Bolta API 호출
4. 응답 받음 → `issuance_key` 저장
5. Bolta 가 국세청 승인 처리 (비동기 가능)
6. `nts_transaction_id` 받음 → status `issued`
7. `lunch_orders.invoice_issued = true` + `invoice_id` 매핑

### 취소
- `/api/lunch/invoices/[issuanceKey]/cancel` POST
- Bolta 취소 API 호출 + `lunch_invoices.status = cancelled`
- `lunch_orders.invoice_issued = false` 복원 (재발행 가능)

### 실패
- Bolta 에러 응답 → `error_message` 저장 + `status = failed`
- 사업자등록번호 검증 실패가 가장 흔한 원인 — 벤더 정보 (`business_number` 등) 재확인

### 자격증명 / 콘솔
- Bolta 콘솔 (운영팀 보유)
- API 스펙: `/Users/wonbinkim/Desktop/chatingbot/볼타 API.json` (사용자 메모)

---

## Google Sheets (런치)

방문수거와 **같은 Spreadsheet**, 다른 탭.

### 시트 ID
- env: `GOOGLE_SHEET_ID` = `1Y8ztdzT-Y08-XOkKSX-jryLJFT4r1ID4nuzRcN9ddTU`

### 탭 2개
1. **`단건_수거`** — 방문수거와 같은 컬럼 (날짜·신청자·시간·주소·전화·금액 등). 런치 row 도 함께 들어감.
2. **`단건_정산`** — 런치 전용. `정산방식 / 정산금액 / 매출발행 / 정산완료` 등.

### Cron
- `cron/lunch-sheet-push` (5분) — `lib/google/sheets.ts` 사용
- 양 탭 모두 동시에 갱신

### 폐기 예정
운영상 어쩔 수 없이 유지. 추후 폐기 예정.

---

## Kakao Local (주소 정규화)

벤더 등록 / 채팅 자동 파싱 시 주소 → 행정동·lat/lng 변환.

- 모듈: `lib/kakao/local.ts` (공유)
- 라우트: `/api/address/normalize`
- env: `KAKAO_REST_API_KEY`

---

## 인증 토큰 로테이션

| 서비스 | 권장 주기 | 메커니즘 |
|---|---|---|
| 해피톡 (LUNCH_HT_*) | 6개월 (방문과 동기화) | 콘솔 재발급 후 양 env 동시 갱신 |
| NicePay | 변경 시만 | 결제 계약 변경 시 |
| Bolta | 6개월 | Bolta 콘솔 |
| Google Service Account | 키 노출 시만 | GCP 콘솔 |
| Kakao | 변경 없음 | — |
