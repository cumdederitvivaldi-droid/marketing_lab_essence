# 01 — Overview

## 한 줄

건물 폐기물(가구·가전·자재 등)을 1톤·2.5톤 트럭으로 직접 방문 수거. 카카오 상담톡(해피톡) 으로 고객 응대 → AI Phase 머신 + 상담사가 견적·예약·배차·결제까지 진행.

## 비즈니스 컨텍스트

- 고객: 이사·인테리어·생활폐기물 발생 가구
- 채널: 카카오 채널 → 해피톡 webhook (방문 sender_key)
- 상담사: 본 시스템 `/conversations` 페이지에서 응대 (3열 UI)
- 처리 단위: **conversation** = 한 카카오 세션. 보통 1세션 = 1 고객 = 1 견적 = 1 주문
- 가격: 품목별 단가 + 지역·작업인원·사다리차 고려한 견적 → confirmed → 결제 → 완료

## 고객 → 결제 시나리오

1. 고객이 카카오 채널에서 메시지 (예: "이사하는데 침대랑 쇼파 버려야 해요")
2. 해피톡이 `/api/webhook/route.ts` 로 push → sender_key 분기 → `/api/webhook/message/route.ts`
3. AI Phase 머신 시작 (Phase 1: 인사) → 자동 응답 + ai_draft 생성
4. 상담사가 `/conversations` 에서 ai_draft 검토 후 발송 (또는 직접 작성)
5. Phase 2 (정보수집): 주소·층·엘리베이터·주차·품목 수집 → `collected_info` 누적
6. Phase 3 (사양확인): 수집된 품목 사용자에게 확인. 품목 수정 시 Phase 3-1 분기
7. Phase 4 (견적): `/api/quote/calculate` 호출 → 자동 견적 메시지
8. Phase 5 (넛지): 견적 후 응답 없으면 다음날 10시 `cron/auto-nudge` 가 자동 발송
9. Phase 6 (예약접수): 고객이 예약 의사 표시 → 날짜·시간대 확정
10. Phase 7 (예약확정): `orders` row 생성 + `sendToCovering` 으로 외부 DB 동기화
11. 당일 20시 `cron/auto-payment` → NicePay 결제 링크 발송 → status `payment_requested`
12. 결제 완료 시 `cron/payment-sync` (10분) 가 polling → status `completed`
13. Phase 8 (사후관리): 완료 후 사후 응대. 회신 없으면 `auto-close-chat` 으로 자동 종료

## 상담사가 보는 화면

- `/conversations` 좌: 세션 목록 (status·태그·미읽음 뱃지)
- 중앙: 채팅 (메시지 + AI draft 카드)
- 우: 고객 패널 (collected_info, 견적, 예약, 배차 정보, 사진)
- 우측 하단: **커바니** (AI 어시스턴트 마스코트, Haiku 1줄 코칭)
- 하단: 매크로 단축, 이미지·파일 발송, 가이드 발송 (`/api/conversations/[sessionId]/send-guide`)

## 핵심 KPI

| KPI | 정의 | 출처 |
|---|---|---|
| 일별 신규 상담 | 오늘 KST 신규 conversations | `/api/dashboard/stats` |
| 견적→예약 전환율 | quote_sent → booked / quote_sent | `/api/dashboard/abc-funnel` |
| 응답시간 median | 운영시간 내 첫 user→assistant ms median | `/api/new_dashboard/cs-realtime` |
| 결제완료율 | payment_requested 중 completed | `/api/dashboard/monthly` |

## 도메인 경계

- **포함**: conversations / messages / orders (+ pickup_invoices, products, drivers, vehicles, quotes …)
- **제외**: 런치 (lunch_*) · 채널톡 (channeltalk_*) — 절대 import 금지
- **공유**: app_settings, macros, audit_logs, notifications, NicePay, Kakao Local
- **외부**: covering Supabase (단방향 sync), Google Sheets (단건_수거 미러)

## 신규 개발자 첫 진입점

| 알고 싶은 것 | 시작 파일 |
|---|---|
| 상담 채팅이 어떻게 흘러가는가 | `/api/webhook/message/route.ts` |
| AI 가 어떻게 답하는가 | `lib/ai/prompt.ts` + `lib/ai/phases.ts` |
| 견적 계산은 어떻게 하는가 | `/api/quote/calculate/route.ts` |
| 예약이 어떻게 만들어지는가 | `lib/store/orders.ts` |
| 결제 흐름 | `/api/orders/[id]/payment/route.ts` + `/api/cron/auto-payment` |
| 배차 | `lib/dispatch/{zones,time-blocks}.ts` + `/api/dispatch/*` |
