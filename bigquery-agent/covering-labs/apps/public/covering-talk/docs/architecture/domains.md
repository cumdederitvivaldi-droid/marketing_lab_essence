# 도메인 인덱스

> 모든 페이지·API 라우트·컴포넌트·라이브러리를 **방문수거 / 런치 / 채널톡 / 대시보드 / 공유** 5개 도메인으로 분류한 단일 진실의 원천.
> 새 코드 작성·이동·삭제 전에 이 문서로 도메인을 확정한다.

## Golden Rule

```
방문수거 ≠ 런치 ≠ 채널톡
```

각 도메인의 코드는 **다른 도메인의 코드를 import 하면 안 된다**. 공유 모듈만 양방향 import 가능. 의심되면 [`overview.md`](overview.md) 참조.

---

## 한눈에 보기 (도메인별 카운트)

| 영역 | 방문수거 | 런치 | 채널톡 | 대시보드 | 공유 |
|---|---|---|---|---|---|
| 메인 페이지 | `app/page.tsx`, `app/conversations/` | `app/lunch/` | `app/channeltalk/` | `app/new_dashboard/` | `app/login`, `app/settings` |
| 보조 페이지 | `app/bookings`, `app/dispatch`, `app/items`, `app/templates` | — | — | — | — |
| API 라우트 | ~70 | ~22 | ~25 | ~15 | ~17 |
| Components | `components/conversations/*`, `components/dispatch/*`, `PaymentModal.tsx` | `components/lunch/*` | `components/channeltalk/*` | (대시보드 전용 컴포넌트는 `app/new_dashboard/components/` 안) | `components/ui/`, `AuditLogPanel.tsx` |
| Lib | `lib/ai/`(방문 prompt 부분), `lib/store/{conversations,orders,drivers,vehicles,pickup-invoices}`, `lib/happytalk/{client,send-message}`, `lib/dispatch/`, `lib/dhero/`, `lib/covering/`, `lib/webhook/` | `lib/ai/lunch-*`, `lib/store/lunch-*`, `lib/happytalk/lunch-client`, `lib/google/`, `lib/bolta/` | `lib/channeltalk/`, `lib/channeltalk-ai/` | `lib/dashboard/`, `lib/hooks/Cs*`·`useCounselor*`·`useCsRealtimePresence`, `lib/cache/prefetch` | `lib/{supabase,auth,utils,nicepay,session,kakao,theme,tracking,data}/`, `lib/store/audit-logs`, `middleware.ts` |
| DB 테이블 (전용) | `conversations`, `messages`, `orders`, `products`, `drivers`, `vehicles`, `quotes` (외부 covering 동기화) | `lunch_conversations`, `lunch_messages`, `lunch_orders`, `lunch_vendors`, `lunch_invoices` | (없음) `backoffice_requests`, `backoffice_cache`, `channeltalk_reply_logs` | `cs_presence_log`, `complaint_classifications` | `audit_logs`, `app_settings`, `macros`, `consultation_tags`, `notifications`, `region_prices`, `ladder_fees` |
| 외부 연동 | 해피톡(방문), NicePay, Dhero, Slack, Kakao Local, Covering 외부 Supabase | 해피톡(런치), NicePay, Bolta, Google Sheets, Kakao Local | 채널톡 Open API + Desk API, 백오피스 스크래퍼, Voyage AI, Kakao Local | (외부 연동 없음 — Anthropic API 만) | Anthropic API, Supabase |

---

## 1. 방문수거 (Visit / Pickup)

건물 폐기물 수거 — 카카오 상담톡(해피톡) 기반 견적·예약·배차·결제.

### 페이지

| 라우트 | 파일 | 역할 |
|---|---|---|
| `/` | `app/page.tsx` | 방문수거 메인 대시보드 (기존 통계·일정 화면) |
| `/conversations` | `app/conversations/page.tsx` | 상담 채팅 (3열 — 목록/채팅/고객 + AI draft) |
| `/bookings` | `app/bookings/page.tsx` | 예약 관리 (URL 잔존, 내부적으로 `/api/orders/*` 호출) |
| `/dispatch` | `app/dispatch/page.tsx` | 배차 보드 |
| `/items` | `app/items/page.tsx` | 품목·카테고리 관리 |
| `/templates` | `app/templates/page.tsx` | 매크로/템플릿 |

### API 라우트

#### 채팅 / 메시지
- `app/api/conversations/route.ts` (GET 목록)
- `app/api/conversations/updates/route.ts` (SSE)
- `app/api/conversations/[sessionId]/{route,assignee,draft,memo,name,phase,quote,read,regenerate,requested-date,reset,status}/route.ts`
- `app/api/conversations/[sessionId]/{send,send-image,send-file,send-guide,send-abc-slots}/route.ts` — 발송류
- `app/api/conversations/[sessionId]/{polish,extract-items,extract-items-v2,assistant-hint}/route.ts` — AI 보조

#### 주문 / 견적
- `app/api/orders/{route,batch}/route.ts`
- `app/api/orders/[id]/{route,payment}/route.ts`
- `app/api/orders/{batch-payment,payment-nudge}/route.ts`
- `app/api/quote/calculate/route.ts`

#### 웹훅
- `app/api/webhook/route.ts` — sender_key 분기 라우터 (방문 vs 런치)
- `app/api/webhook/{message,metadata,session-end}/route.ts` — 방문수거 전용

#### 운영 / 마스터
- `app/api/dispatch/{route,assign}/route.ts`
- `app/api/drivers/route.ts`, `app/api/vehicles/route.ts`
- `app/api/products/{list,search,siblings,ai-lookup}/route.ts`
- `app/api/region-prices/route.ts`, `app/api/ladder-fees/route.ts`, `app/api/service-areas/route.ts`
- `app/api/schedule/{route,abc/route,abc/month}/route.ts`
- `app/api/policies/pickup/route.ts`
- `app/api/dhero/deliveries/{route,create}/route.ts`
- `app/api/invoices/{route,issue}/route.ts`, `app/api/invoices/[id]/{route,cancel}/route.ts`
- `app/api/dashboard/{stats,monthly,analytics,abc-funnel}/route.ts`, `app/api/dashboard/analytics/export/route.ts` (legacy 방문 통계)
- `app/api/nudge/{route,seed}/route.ts`, `app/api/reminder/route.ts`, `app/api/download-image/route.ts`

#### Cron (자세히는 [`cron.md`](cron.md))
- `cron/auto-close-chat` (채널톡과 공유), `auto-nudge`, `auto-payment`, `auto-reminder`, `daily-sheet-push`, `payment-sync`, `tomorrow-pickup-slack`

### Components
- `components/conversations/{ChatArea,ConversationCard,CustomerPanel,MessageBubble,MessageInput,QuoteEditor,SchedulePreview,AssistantBuddy,PolicyModal,PickupInvoiceDetailModal,PickupInvoiceModal,PickupInvoicesView}.tsx`
- `components/dispatch/*`
- `components/PaymentModal.tsx` (방문수거 결제 모달)

### Lib
- **AI**: `lib/ai/{prompt,phases,phase-transitions,district-resolver,product-lookup,ambiguous-items,product-prompt,prompt-blocks,claude,ai-client,voyage,pickup-policy.md}`
- **Store**: `lib/store/{conversations,orders,drivers,vehicles,pickup-invoices}.ts`
- **Happytalk (방문 채널)**: `lib/happytalk/{client,send-message,types}.ts`
- **외부 동기화**: `lib/covering/client.ts` (`sendToCovering` 만 활성)
- **운영**: `lib/dispatch/{time-blocks,zones}.ts`, `lib/dhero/client.ts`
- **Webhook 분리 모듈**: `lib/webhook/{message-parser,phase-engine,response-builder,types}.ts`

### DB 테이블 (방문 전용)
`conversations`, `messages`, `orders`, `products`, `drivers`, `vehicles`, `quotes`. 자세히는 (예정) `docs/db/visit.md`.

### 외부 연동
| 서비스 | 사용 모듈 | 인증 |
|---|---|---|
| 해피톡 (방문 채널) | `lib/happytalk/client.ts` | `HT_CLIENT_ID/SECRET` + `SENDER_KEY` |
| NicePay (결제) | `lib/nicepay/client.ts` (공유) | `NICEPAY_*` |
| Dhero (배송) | `lib/dhero/client.ts` | `DHERO_*` |
| Slack (브리핑) | `cron/tomorrow-pickup-slack` | `SLACK_*` |
| Kakao Local (주소) | `lib/kakao/local.ts` (공유) | `KAKAO_REST_API_KEY` |
| Covering 외부 Supabase | `lib/covering/client.ts` `sendToCovering` | `COVERING_SUPABASE_*` |
| Google Sheets | `cron/daily-sheet-push` 직접 호출 | `GOOGLE_*` |

---

## 2. 런치 (Lunch)

도시락 폐기물 정기 수거 — 카카오 상담톡(런치 채널), 자동결제·세금계산서.

### 페이지
| 라우트 | 파일 |
|---|---|
| `/lunch` | `app/lunch/page.tsx` (탭 3개 — 주문/세금계산서/채팅) |

### API 라우트

#### 채팅 / 메시지
- `app/api/lunch/conversations/{route,[sessionId]/route}/route.ts`
- `app/api/lunch/conversations/[sessionId]/{polish,read,regenerate,send,send-image,send-file}/route.ts`

#### 주문 / 결제 / 세금계산서
- `app/api/lunch/route.ts` (목록·메인)
- `app/api/lunch/payment/route.ts`, `app/api/lunch/payment/check-unsettled/route.ts`
- `app/api/lunch/invoices/{route,issue,[issuanceKey]/route,[issuanceKey]/cancel}/route.ts`
- `app/api/lunch/vendors/{route,[id]/route,[id]/cert}/route.ts`

#### 웹훅
- `app/api/webhook/lunch/{route,message,session-end}/route.ts`

#### Cron
- `cron/lunch-sheet-push`, `cron/lunch-auto-payment`, `cron/lunch-payment-sync`

### Components
- `components/lunch/{LunchChatView,LunchInvoicesView,TaxInvoiceSection}.tsx`
- `components/lunch/modals/*`

### Lib
- **AI**: `lib/ai/{lunch-prompt,lunch-policy.md,lunch-ai}.ts`
- **Store**: `lib/store/{lunch-conversations,lunch-invoices,lunch-orders,lunch-vendors}.ts`
- **Happytalk (런치 채널)**: `lib/happytalk/lunch-client.ts`
- **Sheets**: `lib/google/sheets.ts`
- **세금계산서**: `lib/bolta/client.ts`

### DB 테이블 (런치 전용)
`lunch_conversations`, `lunch_messages`, `lunch_orders`, `lunch_vendors`, `lunch_invoices`. (예정) `docs/db/lunch.md`.

### 외부 연동
| 서비스 | 사용 모듈 | 인증 |
|---|---|---|
| 해피톡 (런치 채널) | `lib/happytalk/lunch-client.ts` | `LUNCH_HT_CLIENT_ID/SECRET` + `LUNCH_SENDER_KEY` |
| NicePay (결제) | `lib/nicepay/client.ts` (공유) | `NICEPAY_*` |
| Bolta (세금계산서) | `lib/bolta/client.ts` | `BOLTA_*` |
| Google Sheets | `lib/google/sheets.ts` + `cron/lunch-sheet-push` | `GOOGLE_*` |
| Kakao Local | `lib/kakao/local.ts` (공유) | 공유 |

---

## 3. 채널톡 (Channeltalk)

채널톡 플랫폼 기반 일반 고객지원 — AI 답변 추천 파이프라인. **DB 저장 없음** (플랫폼이 진본).

### 페이지
| 라우트 | 파일 |
|---|---|
| `/channeltalk` | `app/channeltalk/page.tsx` (3열 + 8 컴포넌트) |
| `/channeltalk/analytics` | (메뉴 내) |

### API 라우트

#### 채널톡 Open API 프록시
- `app/api/channeltalk/chats/route.ts`
- `app/api/channeltalk/chats/[chatId]/{route(메시지),assign,auto-tag,close,delete-message,description,messages,send-image,snooze,tags,upload,vehicle-auto}/route.ts`
- `app/api/channeltalk/users/[userId]/{chats,profile}/route.ts`
- `app/api/channeltalk/{file,polish,stats,tags}/route.ts`

#### 채널톡 AI 추천
- `app/api/channeltalk-ai/suggest/{route,send,stream}/route.ts`

#### 백오피스 스크래퍼 (채널톡 전용)
- `app/api/backoffice/{lookup,order-detail}/route.ts` — 사외 백오피스에서 고객 정보 가져옴 (Puppeteer 브릿지)

### Components
- `components/channeltalk/{ChatList,FilterSidebar,MessagePanel,SuggestPanel,SuggestDebugPanel,ToolPanel,AiCompareModal,types,utils,index}.{ts,tsx}`

### Lib
- **Channeltalk API**: `lib/channeltalk/{client,app-client,desk-api,auto-tag,emoji,types}.ts`
- **AI 파이프라인**: `lib/channeltalk-ai/{suggest,normalize,validate,service-area,category-prompts,category-labels,types}.ts`

### DB 테이블
- (채널톡 메시지 자체는 채널톡 플랫폼 소유 — 우리 DB 에 저장 안 함)
- 부가 테이블: `backoffice_requests`, `backoffice_cache` (Puppeteer 브릿지 큐), `channeltalk_reply_logs` (답변 분류 통계용)

### 외부 연동
| 서비스 | 사용 모듈 | 인증 |
|---|---|---|
| 채널톡 Open API | `lib/channeltalk/client.ts` + `app-client.ts` | `CHANNELTALK_ACCESS_KEY/SECRET` + `CHANNELTALK_APP_ID` |
| 채널톡 Desk API | `lib/channeltalk/desk-api.ts` | `CHANNELTALK_DESK_COOKIE` (30일 로테이션) |
| Voyage AI (RAG 임베딩) | `lib/ai/voyage.ts` (방문수거에서도 사용 가능) | `VOYAGE_AI_API_KEY` |
| 백오피스 (Puppeteer) | `app/api/backoffice/*` | 별도 (스크래퍼 머신에서 폴링) |

---

## 4. 대시보드 (Dashboard)

신규 관리자 대시보드 — 운영 분석·실시간 상담사 현황·고객 불만 분류·AI 인사이트.

### 페이지
| 라우트 | 파일 |
|---|---|
| `/new_dashboard` | `app/new_dashboard/page.tsx` (대시보드 메인) |

### API 라우트

#### 분석 / 메모 / 인사이트
- `app/api/new_dashboard/analytics/route.ts`
- `app/api/new_dashboard/notes/{route,[id]/route}/route.ts`
- `app/api/new_dashboard/insight/route.ts` (Sonnet, 캐시)
- `app/api/new_dashboard/p5-reasons/route.ts` (Haiku 이탈 사유 분류)
- `app/api/new_dashboard/cs-report/route.ts` (Sonnet 상담사 리포트)
- `app/api/new_dashboard/region-stats/route.ts`, `app/api/new_dashboard/orders-detail/route.ts`

#### 불만 / 이탈 사유
- `app/api/new_dashboard/complaints/{route,unmark,conversations}/route.ts`
- `app/api/new_dashboard/churn-reasons/{route,conversations}/route.ts`

#### 실시간 상담사 현황
- `app/api/new_dashboard/cs-realtime/{route,work-history}/route.ts`
- `app/api/cs-realtime/heartbeat/route.ts`

#### Cron
- `cron/classify-complaints`

### Components
- 대시보드 전용 컴포넌트는 `app/new_dashboard/components/` 안에 위치 (이 프로젝트는 `components/` 와 `app/*/components/` 혼용)

### Lib
- `lib/dashboard/{cache,operators,health,revenue,funnel,daily-funnel,churn,churn-classify,complaint-classify,p5-classify,ai-insight,insight,period,settings,serviceability,types,_paginate}.ts`
- `lib/cache/prefetch.ts` (대시보드 진입 시 prefetch)
- `lib/hooks/{CsRealtimePresenceContext,useCsRealtimePresence,useCounselorPresence}.tsx`

### DB 테이블 (대시보드 전용)
- `cs_presence_log` (1분 heartbeat)
- `complaint_classifications` (Haiku 분류 캐시)

### 외부 연동
- Anthropic API (Sonnet · Haiku) 만. 그 외 외부 연동 없음. 모든 데이터는 다른 도메인의 DB 를 read 만 함.

---

## 5. 공유 (Shared)

3 도메인이 공통으로 의존하는 인프라.

### 페이지
- `app/login/page.tsx` — 로그인
- `app/settings/page.tsx`, `app/settings/category-prompts/page.tsx` — 전역 설정

### API 라우트
- 인증: `app/api/auth/{login,logout,me,change-password,profile,google,google/callback}/route.ts`
- 설정: `app/api/settings/{route,category-prompts}/route.ts`
- 사람: `app/api/counselors/route.ts`
- 매크로: `app/api/macros/route.ts`
- 감사: `app/api/audit-logs/route.ts`
- 알림: `app/api/notifications/route.ts`
- 주소 정규화 (양 시스템): `app/api/address/normalize/route.ts`

### Components
- `components/ui/*` — Shadcn 프리미티브
- `components/AuditLogPanel.tsx` — 공유 감사 로그 패널

### Lib
- **인증**: `lib/auth/{AuthContext,jwt,session,types}.ts` + `middleware.ts` + `lib/session/store.ts`
- **DB 클라이언트**: `lib/supabase/{client,browser,storage}.ts`
- **결제 클라이언트** (방문+런치 공유): `lib/nicepay/client.ts`
- **유틸**: `lib/utils.ts`, `lib/utils/{booking-datetime,format,item-format,item-normalizer,process-context,product-cache,product-search,quote-template,reply-classify,serial-number,trip-fee,with-retry,workflow-config}.ts`
- **외부 공통**: `lib/kakao/local.ts` (주소 정규화)
- **데이터/테마/추적**: `lib/data/*`, `lib/theme/ThemeContext.tsx`, `lib/tracking/mixpanel.ts`
- **Store (공유)**: `lib/store/audit-logs.ts`
- **Hooks (공유)**: `lib/hooks/useNewConversationNotifier.ts`

### DB 테이블 (공유)
`audit_logs`, `app_settings`, `macros`, `consultation_tags`, `notifications`, `region_prices`, `ladder_fees`. (예정) `docs/db/shared.md`.

---

## 모호 / 검증 권장

| 항목 | 추정 도메인 | 비고 |
|---|---|---|
| `app/api/dashboard/*` (legacy 5개) | 방문수거 | 신규 대시보드 (`/new_dashboard/*`) 와 별개. 통합·폐기 검토 가능 |
| `app/api/nudge/*`, `app/api/reminder/route.ts` | 방문수거 | quote_sent_nudge phase 와 연계됨 |
| `app/api/schedule/*` | 방문수거 | ABC 시간안내 — 방문수거 견적 단계 |
| `app/api/invoices/*` | 방문수거 | 방문 영수증 |
| `app/api/products/*` | 방문수거 | 방문수거 품목 (런치는 별도 lunch_vendors) |
| `app/api/dhero/*` | 방문수거 | 방문수거 배송만 사용 |
| `lib/data/*` | 공유? | 내용 확인 후 도메인 확정 (Phase 4 에서 정리) |

---

## 새 코드를 어디에 둘지 결정하는 규칙

1. **새 API route**:
   - 방문수거: `app/api/{conversations,orders,quote,...}/...` 기존 패턴 따름
   - 런치: `app/api/lunch/...`
   - 채널톡: `app/api/channeltalk/...` 또는 `app/api/channeltalk-ai/...`
   - 대시보드: `app/api/new_dashboard/...`
   - 공유 인프라(인증·설정·매크로): `app/api/auth/...` 등 기존 도메인 외 위치

2. **새 lib 모듈**:
   - 도메인 전용이면 도메인 폴더(`lib/ai/lunch-*`, `lib/store/lunch-*`, `lib/channeltalk-ai/*` 등)
   - 공유면 `lib/utils/`, `lib/auth/`, `lib/supabase/` 등

3. **새 page**:
   - 도메인별 최상위 디렉토리(`app/conversations/`, `app/lunch/`, `app/channeltalk/`, `app/new_dashboard/`)

4. **새 컴포넌트**:
   - 도메인 전용이면 `components/{conversations,lunch,channeltalk}/` 또는 `app/<domain>/components/`
   - 공유 UI 프리미티브는 `components/ui/`

5. **무엇이든 도메인이 모호하면** 이 문서의 `## 모호 / 검증 권장` 표에 추가하고 README 작성 시점에 결정.

---

## 도메인 외 — 도구 / 데이터

운영 코드는 아니지만 운영 정확도·디버깅·DB 시드를 좌우하는 폴더.

### `scripts/` — 운영 도구
- `seed-data.ts`, `seed-embeddings.ts` — DB 초기 시드
- `backup-channeltalk.js` — 채널톡 백업 (수동 실행)
- `backoffice-scraper/` — 채널톡 백오피스 Puppeteer 브릿지 (별도 머신에서 폴링 운영)


### `tools/channeltalk-ai/` — 채널톡 AI 학습/시드 파이프라인
2026-04-27 `scripts/covering-ai/` 에서 승격. 자세히는 [`../../tools/channeltalk-ai/README.md`](../../tools/channeltalk-ai/README.md).
- 정책 문서·상담 페어·임베딩 시드·카테고리 분류
- 채널톡 AI 추천 정확도의 원천 자산

### `migrations/` — SQL 마이그레이션 (번호순)
도메인 무관 단일 시퀀스. 도메인 분류는 (예정) `docs/db/migrations.md` 에서 관리.

---

## 변경 시 동기화

- 새 도메인 코드 추가 → 본 문서의 해당 섹션 + (예정) 도메인별 README
- 도메인 이동 (예: 공유 → 방문 전용으로 좁힘) → 본 문서 + import 체인 검증
- 도메인 경계 변화 (시스템 통합·분리) → [`overview.md`](overview.md) `§ 7 외부 서비스 매트릭스` + 본 문서
