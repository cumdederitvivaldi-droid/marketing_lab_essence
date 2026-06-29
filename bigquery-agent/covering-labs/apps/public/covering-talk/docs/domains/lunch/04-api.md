# 04 — API 카탈로그

> ~22 라우트. 도메인 prefix `/api/lunch/*` (chat·order·invoice·vendor) + `/api/webhook/lunch/*` + 3 cron.

## 채팅 (`/api/lunch/conversations/*`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/lunch/conversations` | 세션 목록 (RPC `get_last_messages` 사용) |
| GET / PATCH / DELETE | `/api/lunch/conversations/[sessionId]` | 단건 |
| POST | `/api/lunch/conversations/[sessionId]/send` | 텍스트 발송 (CS-EXT-019 류) |
| POST | `/api/lunch/conversations/[sessionId]/send-image` | 이미지 |
| POST | `/api/lunch/conversations/[sessionId]/send-file` | 파일 |
| POST | `/api/lunch/conversations/[sessionId]/polish` | 메시지 말다듬기 |
| POST | `/api/lunch/conversations/[sessionId]/read` | 읽음 처리 |
| POST | `/api/lunch/conversations/[sessionId]/regenerate` | AI draft 재생성 |

세 발송 라우트 모두 InvalidSession (-502) 자동 감지 → status closed.

## 주문 / 결제 (`/api/lunch/*`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET / POST | `/api/lunch` | 주문 목록 / 신규 |
| POST | `/api/lunch/payment` | 결제 링크 발송 (단건 / 일괄) |
| GET | `/api/lunch/payment/check-unsettled` | 미정산 합계 (settlement_type 별) |

세부 PATCH/DELETE 는 lunch_orders 의 store 통해 conversations API 와 비슷하게.

## 세금계산서 (`/api/lunch/invoices/*`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/lunch/invoices` | 발행 이력 목록 |
| POST | `/api/lunch/invoices/issue` | Bolta 발행 (단건 또는 월별 통합) |
| GET | `/api/lunch/invoices/[issuanceKey]` | 단건 조회 |
| POST | `/api/lunch/invoices/[issuanceKey]/cancel` | 발행 취소 (Bolta 취소 API + DB status 변경) |

`issuanceKey` = Bolta 발행 식별 키. 우리 DB 의 `lunch_invoices.issuance_key`.

## 벤더 (`/api/lunch/vendors/*`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET / POST | `/api/lunch/vendors` | 벤더 목록 / 신규 |
| GET / PATCH / DELETE | `/api/lunch/vendors/[id]` | 단건 |
| POST | `/api/lunch/vendors/[id]/cert` | 사업자등록증 등록 (Bolta customer 매핑) |

## 웹훅 (`/api/webhook/lunch/*`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/webhook/lunch` | 런치 webhook 진입점 (sender_key 검증) |
| POST | `/api/webhook/lunch/message` | 메시지 수신 + AI 응답 + serial_number 중복 방지 |
| POST | `/api/webhook/lunch/session-end` | 세션 종료 알림 (CS-EXT-019) |

`/api/webhook/route.ts` 의 메인 라우터가 sender_key 보고 여기로 분기.

## Cron

| 경로 | KST | 설명 | 코드 |
|---|---|---|---|
| `/api/cron/lunch-sheet-push` | 5분 | lunch_orders → 단건_수거 + 단건_정산 시트 동기화 | CS-CRON-003 |
| `/api/cron/lunch-auto-payment` | 매일 15:00 | 전일 confirmed + link_pay → 결제 링크 발송 | CS-ETC-055 |
| `/api/cron/lunch-payment-sync` | 10분 | NicePay 상태 polling → status 전환 | CS-ETC-056 |

자세히는 [`../../architecture/cron.md`](../../architecture/cron.md).

`lunch-auto-payment` 옵션 파라미터: `?resendNotice=YYYY-MM-DD` — 안내 메시지만 재발송.

## 공유 라우트 (런치도 사용)

- `/api/auth/*` — 인증
- `/api/macros` — 매크로 (카테고리로 런치 전용 분리 가능)
- `/api/audit-logs` — 감사 로그
- `/api/notifications` — 멘션·배정
- `/api/address/normalize` — Kakao Local 주소 정규화

## Tag 보강

| 카테고리 | 런치 라우트 |
|---|---|
| `CS-EXT-019` | `/api/webhook/lunch/session-end` |
| `CS-PAY-006` | `/api/lunch/payment` (POST) |
| `CS-PAY-007` | `/api/lunch/payment` (GET) |
| `CS-CRON-003` | `/api/cron/lunch-sheet-push` |
| `CS-ETC-055` | `/api/cron/lunch-auto-payment` |
| `CS-ETC-056` | `/api/cron/lunch-payment-sync` |
| 그 외 | 도메인 일관성 위해 향후 `CS-LUN-NNN` 신규 카테고리 검토 가능 |

전체 카탈로그: [`../../api/tags.md`](../../api/tags.md).
