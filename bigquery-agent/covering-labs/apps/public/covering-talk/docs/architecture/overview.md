# 시스템 아키텍처 — 3 시스템 분리

> ⚠️ **마이그레이션 안내 (2026-05-13)** — 일부 단락은 Vercel 호스팅 가정으로 작성됐다. covering-labs `apps/public/covering-talk/` 이관 이후 외부 cron runner · 배포 파이프라인 가정은 후속 PR 에서 갱신 예정. 도메인 분리·데이터·AI 매트릭스는 변경 없음.

이 프로젝트는 **완전히 독립된 3개 시스템**이 인프라만 공유하는 구조다.
세션 간 작업 시 반드시 이 문서를 먼저 읽고 작업 대상 시스템을 특정하라.

## ⚠️ Golden Rule

```
방문수거 ≠ 런치 ≠ 채널톡
```

**DB 격리** · **채널 격리** · **AI 프롬프트 격리** · **UI 격리**

한 시스템 작업할 때 다른 시스템 파일을 절대 건드리지 마라. import 체인이 겹치면 회귀 버그의 원인이 된다.

---

## 1. 시스템별 개요

| | 방문수거 (Pickup) | 런치 (Lunch) | 채널톡 (ChannelTalk) |
|---|---|---|---|
| **용도** | 건물 폐기물 방문 수거 | 도시락 폐기물 정기 수거 | 일반 고객지원 (80L/220L 봉투 등) |
| **채널** | 카카오 상담톡 (해피톡) | 카카오 상담톡 (해피톡, 별도 채널) | 채널톡 플랫폼 |
| **메인 페이지** | `app/conversations/page.tsx` | `app/lunch/page.tsx` | `app/channeltalk/page.tsx` |
| **웹훅** | `/api/webhook/message` | `/api/webhook/lunch/message` | 없음 (폴링) |
| **DB 저장** | Supabase 내부 | Supabase 내부 | 없음 (ChannelTalk 플랫폼이 소유) |
| **AI 프롬프트** | `lib/ai/prompt.ts` | `lib/ai/lunch-prompt.ts` | `lib/channeltalk-ai/*` |
| **AI 모델** | Sonnet | Sonnet | Sonnet (분류/생성) + Haiku (톤) |

---

## 2. 웹훅 라우팅

해피톡은 방문수거/런치가 **같은 엔드포인트**(`/api/webhook`)로 들어오고, `sender_key`로 분기한다.

**`app/api/webhook/route.ts`** (절대 로직 중복 금지)

```typescript
if (senderKey === process.env.LUNCH_SENDER_KEY) {
  → /api/webhook/lunch/message 또는 /api/webhook/lunch/session-end
} else {
  → /api/webhook/message (방문수거)
}
```

채널톡은 웹훅 없음 — 클라이언트 사이드 폴링.

---

## 3. 데이터베이스 격리

### 방문수거 전용 테이블
- `conversations`, `messages` — 채팅 세션/메시지
- `orders` — 예약/주문 통합 테이블 (2026-04-08 외부 커버링 DB → 내부 `orders` 로 전환, 단일 원천)
- `products`, `drivers`, `vehicles` — 품목/기사/차량
- ~~`bookings`~~ — 2026-04-27 코드 이관 완료. 테이블·컬럼만 Supabase 에 남아있고 read/write 없음 (DROP 보류)

### 런치 전용 테이블
- `lunch_conversations`, `lunch_messages` — 채팅 (방문수거와 완전 분리)
- `lunch_orders`, `lunch_vendors`, `lunch_invoices` — 주문/벤더/세금계산서

### 채널톡
- **테이블 없음.** 모든 데이터는 ChannelTalk 플랫폼에 있음.
- AI 추천 결과도 저장 안 함 (ephemeral).

### 공유 테이블
- `audit_logs` — 모든 시스템 CRUD 추적 (`entity_type`로 구분)
- `app_settings` — 전역 설정 (AI 모델 등)
- `macros`, `consultation_tags` — 매크로/태그

**Store 파일 매핑** (혼동 금지):
| 시스템 | Store 파일 |
|---|---|
| 방문수거 | `lib/store/conversations.ts`, `lib/store/orders.ts` |
| 런치 | `lib/store/lunch-conversations.ts`, `lib/store/lunch-orders.ts`, `lib/store/lunch-vendors.ts`, `lib/store/lunch-invoices.ts` |
| 채널톡 | 없음 |

---

## 4. 환경변수 (시스템별)

> 실제 값은 `.env.local` / Vercel 환경변수 참조. 키 목록 전체는 [`.env.local.example`](../../.env.local.example)에 정리돼 있다.

### 방문수거 (해피톡 운영)
```
HT_CLIENT_ID
HT_CLIENT_SECRET
SENDER_KEY
HAPPYTALK_API_HOST
```

### 런치 (해피톡 운영, 2026-04-17 전환)
```
LUNCH_HT_CLIENT_ID            # 방문수거와 동일 클라이언트 자격증명 사용
LUNCH_HT_CLIENT_SECRET
LUNCH_SENDER_KEY              # 런치 전용 채널
LUNCH_HAPPYTALK_API_HOST
```

### 채널톡
```
CHANNELTALK_APP_ID              # Native Functions (Webhook, Open API 내부 호출)
CHANNELTALK_APP_SECRET
CHANNELTALK_ACCESS_KEY
CHANNELTALK_ACCESS_SECRET
CHANNELTALK_DESK_COOKIE         # Desk API (메시지 삭제 등, 30일 로테이션 필요)
```

### 공유 (인증, Supabase, AI, 결제, 시트, 세금계산서, Dhero)
```
JWT_SECRET
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_*
COVERING_SUPABASE_URL, COVERING_SUPABASE_KEY   # 외부 커버링 DB 동기화 (방문수거 send 시 sendToCovering 활성. 비우면 throw)
ANTHROPIC_API_KEY, OPENAI_API_KEY, VOYAGE_AI_API_KEY
NICEPAY_MID, NICEPAY_MERCHANT_KEY, NICEPAY_USR_ID
GOOGLE_SHEET_ID, GOOGLE_SHEET_GID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET          # OAuth 로그인
BOLTA_API_KEY, BOLTA_CUSTOMER_KEY, BOLTA_SUPPLIER_*   # 런치 세금계산서
DHERO_API_URL, DHERO_TOKEN, DHERO_SPOT_CODE     # 두발히어로 배송
KAKAO_REST_API_KEY                               # 주소 정규화
```

---

## 5. AI 시스템 비교

### 방문수거 AI (`lib/ai/`)
- **프롬프트**: `prompt.ts` (존댓말 + `:)` 이모티콘)
- **Phase**: 1→2→3→3-1→4→5→6→7→8→closed (9단계 state machine)
- **핵심 모듈**: `claude.ts`, `phases.ts`, `phase-transitions.ts`, `district-resolver.ts`, `product-lookup.ts`, `ambiguous-items.ts`
- **톤**: 친근한 고객 응대, 이모지 허용

### 런치 AI (`lib/ai/lunch-*`)
- **프롬프트**: `lunch-prompt.ts` + `lunch-policy.md` (빌드 타임 로드)
- **Phase**: idle→order→confirm OR inquiry (4단계 경량)
- **핵심 모듈**: `lunch-ai.ts`
- **톤**: 비즈니스 톤, 마크다운/이모지 금지, `:)` 만 허용
- **특이사항**: `<order_data>` JSON 태그로 주문 파싱 → 모달 자동채움

### 채널톡 AI (`lib/channeltalk-ai/`)
- **파이프라인**: 분류(Sonnet) → RAG 병렬 로드(Voyage AI 임베딩) → 답변 생성(Sonnet) → 톤 다듬기(Haiku)
- **핵심 모듈**: `suggest.ts`, `normalize.ts`, `category-prompts.ts`, `service-area.ts`, `validate.ts`
- **카테고리**: 84+ 태그 기반 라우팅
- **특이사항**: 모든 데이터 ephemeral, DB 저장 없음

---

## 6. Cron 작업 (시스템별)

`vercel.json` 에 11개 크론이 등록돼 있다. 시간대는 Vercel이 UTC로 실행하므로 괄호 안 KST 는 참고용. 자세한 비즈니스 동작 / 실패 영향은 [`cron.md`](cron.md).

| Cron | UTC | KST | 시스템 |
|---|---|---|---|
| `auto-close-chat` | `*/2 * * * *` | 2분마다 | 방문수거 + 채널톡 자동종료 / 채널톡 자동배차 |
| `daily-sheet-push` | `*/5 * * * *` | 5분마다 | 방문수거 → `단건_수거` 시트 |
| `lunch-sheet-push` | `*/5 * * * *` | 5분마다 | 런치 → `단건_수거` + `단건_정산` 시트 |
| `classify-complaints` | `*/5 * * * *` | 5분마다 | 대시보드 — 불만 사전 분류 (Haiku) |
| `payment-sync` | `*/10 * * * *` | 10분마다 | 방문수거 NicePay polling |
| `lunch-payment-sync` | `*/10 * * * *` | 10분마다 | 런치 NicePay polling |
| `auto-nudge` | `0 1 * * *` | 매일 10:00 | 방문수거 견적 넛지 (전날 견적 후 응답 없는 건) |
| `lunch-auto-payment` | `0 6 * * *` | 매일 15:00 | 런치 — 전일 confirmed + link_pay → 결제 |
| `auto-reminder` | `0 9 * * *` | 매일 18:00 | 방문수거 익일 리마인드 |
| `tomorrow-pickup-slack` | `0 9 * * *` | 매일 18:00 | 방문수거 — 익일 수거 건 Slack 브리핑 |
| `auto-payment` | `0 11 * * *` | 매일 20:00 | 방문수거 자동결제 |

채널톡은 전용 cron 없음 (`auto-close-chat` 가 공유).

---

## 7. 외부 서비스 사용 매트릭스

| 서비스 | 방문수거 | 런치 | 채널톡 | 비고 |
|---|---|---|---|---|
| 해피톡 | ✅ | ✅ | ❌ | sender_key로 구분 |
| 채널톡 API | ❌ | ❌ | ✅ | 완전 독립 |
| 구글 시트 | ✅ | ✅ | ❌ | `단건_수거`(양쪽) + `단건_정산`(런치) — 2026-04-08 내부 직접 구현으로 전환 |
| NicePay | ✅ | ✅ | ❌ | 결제 링크 |
| Bolta | ❌ | ✅ | ❌ | 세금계산서 |
| Voyage AI | ❌ | ❌ | ✅ | RAG 임베딩 |
| Dhero | ✅ | ❌ | ❌ | 배송 API |
| 카카오 Local | ✅ | ✅ | ✅ | 주소 정규화 (공유 API) |
| Covering 외부 DB | ✅ 동기화 only | ❌ | ❌ | 2026-04-08 진본은 내부 `orders`. 방문수거 상담사 답변 시 `sendToCovering()` 으로 외부 DB 에 단방향 동기화. 2026-04-27 dead chain (`/api/covering/*` 6개 + 미사용 함수 8개) 정리 |

---

## 8. 작업 시 체크리스트

### 새 기능 추가 전
- [ ] 어느 시스템 대상인지 명확한가?
- [ ] 해당 시스템 Store/API 경로만 건드리는가?
- [ ] 다른 시스템 파일을 import하지 않는가?

### 웹훅 관련 수정
- [ ] `sender_key` 라우팅 로직(`/api/webhook/route.ts`)을 거치는가?
- [ ] 런치 수정 시 방문수거 웹훅은 건드리지 말 것

### DB 스키마 변경
- [ ] 해당 시스템 전용 테이블만 변경하는가?
- [ ] `docs/DB-Schema.md` 업데이트
- [ ] 마이그레이션 파일을 `migrations/`에 추가

### API 추가/삭제
- [ ] `// [CS-카테고리-번호]` 태그 주석 추가
- [ ] `docs/API-TAG.md` 목록 갱신

### 환경변수 사용
- [ ] 방문수거: `HT_*`, `SENDER_KEY`
- [ ] 런치: `LUNCH_HT_*`, `LUNCH_SENDER_KEY`
- [ ] 채널톡: `CHANNELTALK_*`
- [ ] 절대 섞이지 않도록 이름으로 구분

---

## 9. 주의사항 (흔한 실수)

1. **sender_key 혼동**: `/api/webhook/route.ts`가 유일한 라우팅 지점. 다른 곳에서 중복 체크 금지.
2. **Store 혼용**: `conversationStore` ≠ `lunchConversationStore`. 이름 그대로 엄격 분리.
3. **채널톡 데이터 영속성 오해**: 채널톡 메시지는 로컬 DB에 저장 안 됨. 실시간 조회만.
4. **Google Sheets 범위**:
   - 방문수거(`daily-sheet-push`) — `단건_수거` 탭에 orders 기준으로 5분마다 업서트
   - 런치(`lunch-sheet-push`) — `단건_수거` + `단건_정산` 양쪽 탭 모두 기록
5. **환경변수 오타**: `LUNCH_SENDER_KEY` vs `SENDER_KEY`, `HT_CLIENT_ID` vs `LUNCH_HT_CLIENT_ID` — Vercel 설정에서도 주의.
6. **AI 프롬프트 편집**: 방문수거 `prompt.ts` 편집이 런치에 영향 주지 않지만, 런치 `lunch-policy.md`는 빌드 타임 로드이므로 수정 후 빌드 확인.

---

## 10. 참조 문서

| 문서 | 내용 |
|---|---|
| [CLAUDE.md](../../CLAUDE.md) | 프로젝트 개요 및 컨벤션 |
| [api/tags.md](../api/tags.md) | 전체 API 관리번호 (자동 생성) |
| [db/README.md](../db/README.md) | 내부 Supabase 스키마 (도메인별 분할) + 외부 DB + 시트 |
| [domains/channeltalk/README.md](../domains/channeltalk/README.md) | 채널톡 통합 아키텍처 상세 |
