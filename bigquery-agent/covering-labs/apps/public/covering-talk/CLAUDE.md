# CLAUDE.md — covering-talk

커버링 통합 상담 플랫폼 (구 covering-spot-chatbot). **방문수거 · 런치 · 채널톡 + 대시보드** 4 도메인을 단일 코드베이스로 운영. covering-labs `apps/public/covering-talk/` 에 위치하며 covering-labs-public VM 에 배포.

## ⚠️ Golden Rule — 시스템 구분

이 프로젝트는 **완전히 독립된 4 도메인**이 인프라만 공유한다.

| 도메인 | 용도 | 메인 페이지 | 웹훅 | 전용 DB |
|---|---|---|---|---|
| **방문수거** | 건물 폐기물 수거 | `app/conversations/`, `app/page.tsx` | `/api/webhook/message` | `conversations`, `messages`, `orders`, `products`, `drivers`, `vehicles` 등 |
| **런치** | 도시락 폐기물 수거 | `app/lunch/` | `/api/webhook/lunch/message` | `lunch_conversations`, `lunch_messages`, `lunch_orders`, `lunch_vendors`, `lunch_invoices` |
| **채널톡** | 일반 고객지원 | `app/channeltalk/` | 없음 (폴링) | (메시지는 외부) `backoffice_*`, `channeltalk_reply_logs`, `category_prompts` |
| **대시보드** | 운영 분석 | `app/new_dashboard/` | 없음 (read only) | `dashboard_*`, `cs_presence_log` |

**Store · API · 프롬프트 · 컴포넌트 절대 혼용 금지.** 한 도메인 작업할 때 다른 도메인 import 금지. 도메인 매핑은 [`docs/architecture/domains.md`](docs/architecture/domains.md) 가 단일 진실의 원천.

---

## 📚 문서 진입점

**모든 문서 인덱스**: [`docs/README.md`](docs/README.md)

### 작업 시작 전 필독
| 문서 | 언제 |
|---|---|
| [`docs/architecture/overview.md`](docs/architecture/overview.md) | 모든 작업 — 시스템 경계 확인 |
| [`docs/architecture/domains.md`](docs/architecture/domains.md) | 새 코드 작성·이동 전 — 도메인 매핑 |

### 도메인 작업 시
| 도메인 | 풀 가이드 (README + 01~08) |
|---|---|
| 방문수거 | [`docs/domains/visit/README.md`](docs/domains/visit/README.md) |
| 런치 | [`docs/domains/lunch/README.md`](docs/domains/lunch/README.md) |
| 채널톡 | [`docs/domains/channeltalk/README.md`](docs/domains/channeltalk/README.md) |
| 대시보드 | [`docs/domains/dashboard/README.md`](docs/domains/dashboard/README.md) |

각 도메인 9 파트:
- `01-overview` 비즈니스 컨텍스트 / 시나리오 / KPI
- `02-ui` 페이지 + 컴포넌트
- `03-ai` AI 로직 (프롬프트 / Phase / 분류)
- `04-api` API 라우트 카탈로그
- `05-data` DB 테이블 + 외부 데이터
- `06-integrations` 외부 서비스 (해피톡 / NicePay / Bolta 등)
- `07-operations` Cron · 모니터링 · 배포 영향
- `08-gotchas` 알려진 함정 + 진단 SQL

### API
| 문서 | 용도 |
|---|---|
| [`docs/api/tags.md`](docs/api/tags.md) | 전체 195 태그 카탈로그 (`CS-카테고리-번호`) |
| [`docs/api-specs/README.md`](docs/api-specs/README.md) | 외부 API 스펙 (채널톡 OpenAPI · Dhero PDF) |

### DB
| 문서 | 용도 |
|---|---|
| [`docs/db/README.md`](docs/db/README.md) | DB 인덱스 + 매트릭스 |
| [`docs/db/visit.md`](docs/db/visit.md) | 방문수거 11 + 외부 1 테이블 |
| [`docs/db/lunch.md`](docs/db/lunch.md) | 런치 5 테이블 |
| [`docs/db/channeltalk.md`](docs/db/channeltalk.md) | 채널톡 4 + 임베딩 |
| [`docs/db/dashboard.md`](docs/db/dashboard.md) | 대시보드 7 테이블 |
| [`docs/db/shared.md`](docs/db/shared.md) | 공유 7 테이블 |
| [`docs/db/migrations.md`](docs/db/migrations.md) | 41 SQL 파일 ledger |
| [`docs/db/ERD.md`](docs/db/ERD.md) | Mermaid ER 다이어그램 (4 도메인) |

### Cron · 운영 · 온보딩
| 문서 | 용도 |
|---|---|
| [`docs/architecture/cron.md`](docs/architecture/cron.md) | Vercel Cron 11개 상세 (path · 시간 · 비즈니스) |
| [`docs/ops/deployment.md`](docs/ops/deployment.md) | 배포 / 롤백 / DB 마이그레이션 절차 |
| [`docs/ops/environment.md`](docs/ops/environment.md) | 47 env var 그룹별 + 노출 시 대응 |
| [`docs/ops/external-services.md`](docs/ops/external-services.md) | 14 외부 서비스 콘솔 / 자격증명 / 로테이션 |
| [`docs/ops/incidents.md`](docs/ops/incidents.md) | 15 인시던트 P0~P3 + 대응 절차 |

## 코드 위치 매핑

### 방문수거
- 페이지: `app/conversations/`, `app/page.tsx`, `app/bookings/`, `app/dispatch/`, `app/items/`, `app/templates/`
- API: `app/api/conversations/*`, `app/api/orders/*`, `app/api/quote/*`, `app/api/webhook/{route,message,metadata,session-end}`, `app/api/dispatch/*`, `app/api/products/*`, `app/api/region-prices`, `app/api/ladder-fees`, `app/api/service-areas`, `app/api/schedule/*`, `app/api/policies/pickup`, `app/api/dhero/*`, `app/api/invoices/*`, `app/api/dashboard/*` (legacy)
- AI: `lib/ai/{prompt,phases,phase-transitions,district-resolver,product-lookup,ambiguous-items,product-prompt,prompt-blocks,claude,ai-client,voyage,pickup-policy.md}`
- Store: `lib/store/{conversations,orders,drivers,vehicles,pickup-invoices}.ts`
- 외부: `lib/happytalk/{client,send-message,types}.ts`, `lib/covering/client.ts` (`sendToCovering` 만), `lib/dispatch/`, `lib/dhero/client.ts`
- Webhook 분리: `lib/webhook/{message-parser,phase-engine,response-builder,types}.ts`
- Components: `components/conversations/*`, `components/dispatch/*`, `components/PaymentModal.tsx`

### 런치
- 페이지: `app/lunch/page.tsx` (단일 + 3 탭)
- API: `app/api/lunch/*`, `app/api/webhook/lunch/*`, `app/api/cron/{lunch-sheet-push,lunch-auto-payment,lunch-payment-sync}`
- AI: `lib/ai/{lunch-prompt,lunch-policy.md,lunch-ai}.ts`
- Store: `lib/store/lunch-{conversations,invoices,orders,vendors}.ts`
- 외부: `lib/happytalk/lunch-client.ts`, `lib/google/sheets.ts`, `lib/bolta/client.ts`
- Components: `components/lunch/*`

### 채널톡
- 페이지: `app/channeltalk/`, `app/channeltalk/analytics`
- API: `app/api/channeltalk/*`, `app/api/channeltalk-ai/*`, `app/api/backoffice/*`
- AI 파이프라인: `lib/channeltalk-ai/{suggest,normalize,validate,service-area,category-prompts,category-labels,types}.ts`
- 채널톡 API: `lib/channeltalk/{client,app-client,desk-api,auto-tag,emoji,types}.ts`
- Components: `components/channeltalk/*`
- 학습 데이터·시드: `tools/channeltalk-ai/`

### 대시보드
- 페이지: `app/new_dashboard/`
- API: `app/api/new_dashboard/*`, `app/api/cs-realtime/heartbeat`, `app/api/cron/classify-complaints`
- Lib: `lib/dashboard/*`, `lib/cache/prefetch.ts`, `lib/hooks/{CsRealtimePresenceContext,useCsRealtimePresence,useCounselorPresence}`
- Components: `app/new_dashboard/components/*` (도메인 자기완결)

### 공유
- `middleware.ts` (JWT)
- `lib/{auth,supabase,utils,nicepay,session,kakao,theme,tracking,data}/`
- `lib/store/audit-logs.ts`
- `lib/hooks/useNewConversationNotifier.ts`
- `components/ui/`, `components/AuditLogPanel.tsx`

---

## AI 시스템 3종

각 시스템의 AI 로직은 완전히 분리됨. 섞어 쓰지 말 것. 자세히는 각 도메인의 [`docs/domains/<domain>/03-ai.md`](docs/domains/) + [`docs/ai-deep/`](docs/ai-deep/).

### 방문수거 AI
- 9단계 Phase state machine (1→인사 / 2→정보수집 / 3→사양확인 / 3-1→품목수정 / 4→견적 / 5→넛지 / 6→예약접수 / 7→예약확정 / 8→사후관리 / closed→종료)
- 톤: 존댓말 + 이모지 / 마크다운 허용
- 프롬프트: `lib/ai/prompt.ts` + `lib/ai/pickup-policy.md` (빌드 타임 로드)

### 런치 AI
- 4단계 경량 Phase: idle → order → confirm 또는 inquiry
- 톤: 존댓말 + `:)` 만 / **마크다운·이모지 금지**
- `<order_data>` JSON 태그로 주문 파싱 → 모달 자동채움
- 프롬프트: `lib/ai/lunch-prompt.ts` + `lib/ai/lunch-policy.md` (빌드 타임 로드)

### 채널톡 AI
- 4단계 파이프라인: 분류(Sonnet Stage 0+1) → RAG 병렬 로드(Voyage 임베딩) → 답변 생성(Sonnet Stage 2) → 톤 다듬기(Haiku)
- 84+ 카테고리 라우팅 — `category_prompts` 테이블의 `prompt_rules` 사용
- 메시지 본문 DB 저장 안 함 (채널톡 플랫폼 진본). 분류 카운트만 `channeltalk_reply_logs`

---

## 커바니 — 방문수거 상담사 어시스턴트

방문수거 상담 우측 하단 마스코트. **Haiku** 기반 1줄 코칭 + 정책 문서 모달. 방문수거 전용.

### 구성
- `components/conversations/AssistantBuddy.tsx` — 마스코트 UI (드래그·닫기·정책 버튼)
- `components/conversations/PolicyModal.tsx` — 정책 가이드 (좌측 TOC + 검색 + 섹션 점프)
- `app/api/conversations/[sessionId]/assistant-hint/route.ts` — Haiku, JSON `{hint, section}` 반환
- `app/api/policies/pickup/route.ts` — `pickup-policy.md` raw + heading slug
- `lib/ai/pickup-policy.md` — 정책 원문 (프롬프트·모달 공동)

### 동작
- 트리거: 고객(`role: user`) 새 메시지 1.5초 debounce 후 자동. 상담사 답변·AI draft 후엔 호출 안 함 (자기 답변 루프 방지)
- 공휴일 환각 방지: `app_settings.abc_capacity.holidays` + 2026 fallback 병합 후 system 프롬프트에 명시. AI 가 목록 외 날짜 공휴일 판단 금지
- 정책 섹션 연동: AI 가 `section` 필드에 heading 반환 → 📖 클릭 시 PolicyModal 자동 스크롤 + 노란 플래시
- UX 영속: 위치·숨김 모두 `localStorage` (`assistantBuddyPos`, `assistantBuddyDismissed`)
- z-index: 500 (일반 모달 9999) / PolicyModal 10000

---

## 인증

`middleware.ts` 가 전체 라우트 JWT 검증. 공개: `/login`, `/api/auth/*`, `/api/webhook/*`, `/api/cron/*`.

대시보드 `/api/new_dashboard/*` 는 추가 권한: `ADMIN_DASHBOARD_ALLOWED_USERS` set (강성진 / 유대현 / 김원빈) 만 200, 나머지 403.

---

## 환경변수 (시스템별 접두사)

자세히는 [`docs/ops/environment.md`](docs/ops/environment.md).

- 방문수거: `HT_*`, `SENDER_KEY`
- 런치: `LUNCH_HT_*`, `LUNCH_SENDER_KEY` (2026-04-17 운영 전환)
- 채널톡: `CHANNELTALK_*` (Desk Cookie 30일 로테이션 필수)
- 외부 동기화: `COVERING_SUPABASE_*` (방문 sendToCovering)
- 결제: `NICEPAY_*` (방문 + 런치 공유)
- 세금계산서: `BOLTA_*` (런치)
- AI: `ANTHROPIC_API_KEY`, `VOYAGE_AI_API_KEY` (선택 `OPENAI_API_KEY`)
- 시트: `GOOGLE_*`
- Slack: `SLACK_*`
- Kakao Local: `KAKAO_REST_API_KEY`
- 인증: `JWT_SECRET`
- Supabase: `SUPABASE_*`, `NEXT_PUBLIC_SUPABASE_*`

**원칙**: 환경변수 이름의 접두사로 도메인 구분. `HT_*` 와 `LUNCH_HT_*` 처럼 절대 섞이지 않게.

---

## Cron 11개 (Vercel → covering-labs 이관 후 외부 runner 가 호출 예정)

자세히는 [`docs/architecture/cron.md`](docs/architecture/cron.md).

| Path | KST | 도메인 | 한 줄 |
|---|---|---|---|
| `auto-close-chat` | 2분 | 채널톡 | 자동 종료 + 자동 배차 + backoffice_requests GC |
| `daily-sheet-push` | 5분 | 방문 | orders → Google Sheet "단건_수거" |
| `lunch-sheet-push` | 5분 | 런치 | lunch_orders → "단건_수거" + "단건_정산" |
| `payment-sync` | 10분 | 방문 | NicePay 상태 polling |
| `lunch-payment-sync` | 10분 | 런치 | NicePay 상태 polling |
| `classify-complaints` | 5분 | 대시보드 | 불만 사전 분류 (Haiku) |
| `auto-nudge` | 매일 10:00 | 방문 | 견적 후 응답 없는 건에 안내 |
| `auto-reminder` | 매일 18:00 | 방문 | 익일 수거 리마인드 |
| `tomorrow-pickup-slack` | 매일 18:00 | 방문 | Slack 익일 브리핑 |
| `auto-payment` | 매일 20:00 | 방문 | 당일 confirmed → 결제 링크 |
| `lunch-auto-payment` | 매일 15:00 | 런치 | 전일 confirmed + link_pay → 결제 |

---

## 코드 컨벤션

- 컴포넌트: `PascalCase.tsx` · 함수/변수: `camelCase` · 타입: `PascalCase` (I 접두사 없음)
- 임포트: `@/*` 별칭
- API route: `app/api/[resource]/route.ts` + HTTP 메서드 export
- API 태그: `// [CS-카테고리-번호] 설명` 주석 (export 바로 위, 번호 재사용 금지)
- 에러 응답: `NextResponse.json({ error: "메시지" }, { status: 코드 })`
- 환경변수: 시스템 접두사 필수 (`HT_*`, `LUNCH_HT_*`, `CHANNELTALK_*`)

### 주석 원칙 (CLAUDE.md 글로벌 규칙 + 본 프로젝트 적용)
- **기본: 주석 없음**. 잘 지은 이름이 설명하게.
- 남길 것: 비-자명한 WHY (24h 캐시 / 단일 진본 / 외부 영향 등)
- 제거할 것: WHAT 설명 / "X 위해 추가" / "Y 용" / 완료 TODO / 죽은 코드 참조 / "임시 코드"
- `// [CS-XXX-NNN]` 태그는 보존 (API-TAG.md 동기화)
- 파일 헤더 docstring 이 stale 하면 짧게 갱신 또는 삭제

---

## 주의사항 (자주 깨지는 것)

- **Supabase 2 인스턴스** — `lib/supabase/`(내부, 진본) vs `lib/covering/`(외부, 단방향 sync) 혼동 주의
- **웹훅 라우팅** — `/api/webhook/route.ts` 가 유일한 분기 지점 (방문 vs 런치). 다른 곳에서 `sender_key` 중복 체크 금지
- **AI 모델 런타임 변경** — `app_settings.ai_provider` (anthropic / openai) — DB 변경 즉시 다음 호출부터 반영
- **빌드 타임 로드** — `lib/ai/pickup-policy.md`, `lib/ai/lunch-policy.md` 는 빌드 시점에 inline. 수정 시 반드시 빌드 후 배포
- **NicePay 는 polling** — webhook push 없음. `cron/payment-sync`, `cron/lunch-payment-sync` 가 polling. 결제 라우트 URL 변경해도 외부 영향 0
- **감사 로그 활성** — 2026-04-17부터 orders / lunch_orders CRUD 시 `audit_logs` 자동 기록
- **bookings 잔존** — DB 테이블만 남아있고 코드 read/write 없음 (DROP 보류). 신규 코드에서 참조 금지
- **외부 도구 답변자** — 채널톡 데스크앱 / 해피톡 콘솔로 답변하는 상담사도 대시보드 카드에 active 표시 (2026-04-27 보강, presence 없어도 lastReplyAt 5분 내면 online)

---

## 변경 시 동기화 규칙

| 변경 | 갱신할 곳 |
|---|---|
| API route 추가 | route 파일에 `// [CS-카테고리-번호]` 주석 + [`docs/api/tags.md`](docs/api/tags.md) 갱신 |
| API route 삭제 | 위 두 곳 모두 제거 |
| DB 테이블 / 컬럼 | 해당 도메인 [`docs/db/<domain>.md`](docs/db/) + [`docs/db/migrations.md`](docs/db/migrations.md) ledger + `migrations/NNN_xxx.sql` |
| 환경변수 | [`docs/ops/environment.md`](docs/ops/environment.md) |
| Cron 추가/수정 | [`docs/architecture/cron.md`](docs/architecture/cron.md) + cron runner 설정 (별도 PR — Vercel 이관 후 정의 예정) |
| 도메인 코드 추가 | [`docs/architecture/domains.md`](docs/architecture/domains.md) + 해당 도메인 README의 04-api / 05-data |
| 시스템 경계 변화 | [`docs/architecture/overview.md`](docs/architecture/overview.md) §7 매트릭스 |
| 외부 서비스 추가 | [`docs/ops/external-services.md`](docs/ops/external-services.md) + 도메인 06-integrations |
| 새 함정 / 인시던트 | 도메인 08-gotchas + [`docs/ops/incidents.md`](docs/ops/incidents.md) |
| 부채 발견 | PR / 이슈로 처리 (별도 트래킹 파일 없음) |
