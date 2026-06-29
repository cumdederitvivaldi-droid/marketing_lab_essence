# 01 — Overview

## 한 줄

3 시스템(방문/런치/채널톡) 의 운영 데이터를 통합해 **KR / Customer Journey / Health Check / Traffic / CS Realtime** 5개 섹션으로 시각화하는 신규 관리자 대시보드. 자체 데이터는 `cs_presence_log` (출석) + `dashboard_*` (메모/캐시) 만.

## 비즈니스 컨텍스트

- 사용자: 강성진·유대현·김원빈 (ADMIN_DASHBOARD_ALLOWED_USERS)
- 페이지: `/new_dashboard`
- 사용 패턴: 매일 아침 KPI 확인 + 이상 탐지 + 셀별 메모로 토론 + AI 인사이트 받기
- 데이터 권한: 읽기 only (다른 도메인 테이블은 SELECT 만)

## 5개 섹션

### 1. KR (Key Results — 월간 목표)
- KR1: 월 매출 (`kr1_target` = 3억)
- KR2: 처리 가능 매출 (현재 hardcoded — 산출 로직 미구현)
- KR3: 커버링앱 외 트래픽 매출 비중 (현재 hardcoded)
- 목표 vs 실적 게이지·진행률 표시

### 2. Customer Journey Map
방문수거 Phase 1~8 funnel:
- 각 phase 진입자 수 + 다음 phase 전환율
- 이탈 (`churn`) — Phase 진입 후 24시간 무전이 (`churn_window_hours`)
- 재진입 (`reentry`) — 이탈 후 14일 이내 재발화 (`reentry_window_days`)
- 셀별 메모 + AI 인사이트 (Sonnet)

### 3. Health Check
서비스 건강도 임계값 모니터링:
- 미수거 (`no_pickup_threshold` 3.0%)
- 취소율 (`cancel_threshold` 3.0%)
- 미결제 (`no_payment_threshold` 2.0%)
- 불만 (`complaint_threshold` 5건)
- NPS (`nps_threshold` 60pt)

### 4. Traffic
트래픽 분포 — 채널별·지역별·시간대별 인입.

### 5. CS Realtime (실시간 상담사 현황)
- 큐 깊이 (방문/런치/채널톡 각각)
- 처리량 (1시간 답변 수)
- First Response Time (median, 운영시간 내)
- AI breakdown (`ai_auto / ai_assist / human`)
- 상담사 카드 (presence 색상 + 오늘 답변 수 + 근무시간 + 시스템별 분리)

자세한 데이터 흐름: [`03-ai.md`](03-ai.md), [`04-api.md`](04-api.md).

## 권한

`/new_dashboard` 접근 가능자: 환경에서 하드코딩된 ADMIN_DASHBOARD_ALLOWED_USERS:
```
const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);
```

다른 사용자가 접근 시 `/api/new_dashboard/*` 가 403. 추가 권한 부여 시 본 set 갱신.

## 캐시 전략

3 종류:
1. **메모리 (process-level)** — `lib/dashboard/cache.ts` 의 csReportCache, churnReasonsCache 등
2. **DB 캐시** — `dashboard_insights` (Sonnet, 30분 TTL), `dashboard_p5_reasons` (Haiku, on-demand)
3. **클라이언트 prefetch** — `lib/cache/prefetch.ts` 가 페이지 진입 시 background fetch

목표: Sonnet/Haiku 호출 비용 절감 + 즉시 반응성.

## 권한 시각화

상담사 카드 색상 (08-gotchas 의 presence 디버깅 참조):
- 🟢 online — 5분 내 활동 OR 5분 내 답변
- 🟡 idle — 5-15분 무활동
- ⚪ away — 15분+ 무활동
- ⚫ offline — presence 채널 없음 + 답변도 없음

**보강 (2026-04-27)**: 외부 도구(채널톡 데스크앱·해피톡 콘솔·모바일) 로 답변하는 상담사도 lastReplyAt 5분 내면 "online (외부 도구 답변)" 으로 표시.

## 도메인 경계

- **포함**: dashboard_settings, dashboard_notes, dashboard_insights, dashboard_p5_reasons, dashboard_churn_reasons, dashboard_complaints, cs_presence_log
- **읽기 only**: conversations, messages, lunch_*, channeltalk_reply_logs, orders, lunch_orders 등
- **공유**: app_settings (counselor:* 키), notifications, audit_logs
- **외부**: Anthropic API (Sonnet 인사이트 + Haiku 분류) 만. 외부 push 없음.

## 신규 개발자 첫 진입점

| 알고 싶은 것 | 시작 파일 |
|---|---|
| 대시보드 메인 화면 구성 | `app/new_dashboard/page.tsx` |
| CS Realtime 컴포넌트 | `app/new_dashboard/components/CsRealtimeSection.tsx` |
| 상담사 KPI 집계 | `app/api/new_dashboard/cs-realtime/route.ts` |
| AI 인사이트 (Sonnet) | `lib/dashboard/insight.ts` + `/api/new_dashboard/insight` |
| 불만 분류 cron | `app/api/cron/classify-complaints/route.ts` + `lib/dashboard/complaint-classify.ts` |
| Customer Journey funnel | `lib/dashboard/funnel.ts` + `lib/dashboard/operators.ts` |
| Health Check 임계값 | `dashboard_settings` 테이블 (m021 시드) |
| presence (출석) 시스템 | `lib/hooks/useCsRealtimePresence.ts` + `/api/cs-realtime/heartbeat` |
