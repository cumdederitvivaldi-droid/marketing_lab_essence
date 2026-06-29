# 01 — Overview

## 한 줄

도시락 매장(=벤더) 의 정기 수거. 매일 수거건이 발생하고, 결제 방식(링크페이/월말정산/세금계산서)에 따라 일별·월별로 처리. 방문수거와 달리 **벤더 단위 운영** + **세금계산서(Bolta) 통합**.

## 비즈니스 컨텍스트

- 벤더 = 도시락 매장 (예: "카페 ABC 강남점", "도시락마을 종로점")
- 1 vendor = 1 사장님(owner_phone) = 1 카카오 채널 세션
- 정산 방식 (`settlement_type`):
  - `link_pay` — NicePay 결제 링크 (당일~익일)
  - `monthly_invoice` — 월말 통합 청구
  - `tax_invoice` — 세금계산서 발행 (Bolta)
- 운영팀이 매일 수거 진행 → DB + Google Sheets 양쪽 기록
- 상담사는 `/lunch` 페이지의 채팅 탭으로 사장님 응대

## 벤더 → 정산 시나리오

### Day 1 — 수거 진행
1. 운영팀이 lunch_orders 등록 (수동 또는 채팅 자동파싱)
2. 기사 배차 → `is_dispatched = true`
3. 실 수거 → `is_picked_up = true`, status `confirmed`
4. `cron/lunch-sheet-push` (5분) → 단건_수거 시트 갱신

### Day 2 — 결제 (link_pay 인 경우)
1. KST 15시 `cron/lunch-auto-payment` 실행
2. 전일 `confirmed + link_pay` 건 조회 → NicePay 결제 링크 생성
3. session_id 단위로 묶어 안내 메시지 1회만 발송 (중복 방지)
4. status → `payment_requested`
5. 10분마다 `cron/lunch-payment-sync` 가 polling
6. 결제 완료 → status `completed` + tid/paidAt 기록

### 월말 — 세금계산서 (tax_invoice 인 경우)
1. 해당 월 lunch_orders 합계 산출
2. `lunch_invoices` row 생성 (period = "YYYY-MM")
3. Bolta API 로 발행 요청 → `issuance_key` + `nts_transaction_id` 받음
4. `lunch_invoices.status = issued`
5. `lunch_orders.invoice_id` 매핑 + `invoice_issued = true`

### monthly_invoice (월말 통합 청구)
1. 한 달치 합산 → 사장님께 청구서 발송 (별도 시스템 — 본 시스템 외)
2. 결제는 외부 계좌이체 등으로 처리
3. `cron/lunch-sheet-push` 가 단건_정산 시트에 매출발행/정산완료 기록

## 채팅 탭 — 사장님 응대

- `/lunch` 의 "채팅" 탭 → 방문수거 conversations 와 비슷한 3열 레이아웃
- 사장님이 카카오 채널로 메시지 (예: "내일 추가 수거 요청합니다")
- AI 가 4단계 Phase 로 응답
  - `idle` — 일반 안내
  - `order` — 주문 의사 감지 → 정보 수집
  - `confirm` — 주문 확정
  - `inquiry` — 질의응답 (정산·일정 등)
- AI 가 주문 의사 파악 시 `<order_data>{...}</order_data>` JSON 태그 응답 → 클라이언트가 파싱해 주문 모달 자동채움

## 핵심 KPI

| KPI | 정의 | 출처 |
|---|---|---|
| 일별 수거 건수 | 오늘 KST `is_picked_up = true` lunch_orders | 시트 + DB |
| 결제 완료율 | (결제 발송 → 완료) / 결제 발송 | `/api/cron/lunch-payment-sync` 결과 |
| 미정산 합계 | settlement_type = monthly_invoice 중 invoice_issued=false 의 total_amount 합 | `/api/lunch/payment/check-unsettled` |
| 세금계산서 발행률 | issued / pending+issued | `lunch_invoices.status` |

## 도메인 경계

- **포함**: lunch_vendors, lunch_invoices, lunch_orders, lunch_conversations, lunch_messages
- **제외**: 방문수거 (conversations, orders 등) · 채널톡 — 절대 import 금지
- **공유**: NicePay client, Kakao Local, audit_logs, app_settings

## 신규 개발자 첫 진입점

| 알고 싶은 것 | 시작 파일 |
|---|---|
| 채팅이 어떻게 흘러가는가 | `/api/webhook/lunch/message/route.ts` |
| AI Phase 머신 | `lib/ai/lunch-ai.ts` + `lib/ai/lunch-prompt.ts` |
| 주문 자동파싱 (`<order_data>`) | `lib/ai/lunch-prompt.ts` 의 system prompt + 클라이언트 파서 (`components/lunch/LunchChatView.tsx`) |
| 자동결제 흐름 | `/api/cron/lunch-auto-payment/route.ts` |
| 세금계산서 발행 | `lib/bolta/client.ts` + `/api/lunch/invoices/issue/route.ts` |
