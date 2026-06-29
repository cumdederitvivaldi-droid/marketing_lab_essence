# 런치 — 메시지 → 응답 Sequence

> 런치는 방문수거보다 단순. 4단계 경량 Phase + 단일 webhook.
> 코드 위치: `app/api/webhook/lunch/message/route.ts` + `lib/ai/lunch-{prompt,ai}.ts` + `lib/store/lunch-*`.

## 전체 sequence

```
사장님 카카오톡 메시지 (런치 채널)
    ↓
[1] 해피톡 webhook → /api/webhook/route.ts
    sender_key === LUNCH_SENDER_KEY → 분기
    ↓
[2] /api/webhook/lunch/message/route.ts POST
    │
    ├─ 2a. serial_number 중복 체크 (lunch_messages UNIQUE)
    ├─ 2b. lunch_conversations upsert (vendor_id 매핑)
    ├─ 2c. lunch_messages INSERT
    └─ 2d. 200 응답 (즉시)
    ↓
[3] 백그라운드: lunch-ai 호출
    │
    ├─ 3a. 컨텍스트 수집
    │       ├─ vendor 정보 (lunch_vendors)
    │       ├─ 최근 주문 10건 (lunch_orders)
    │       ├─ 지역별 가격 (region_prices)
    │       └─ 현재 Phase (lunch_conversations.ai_phase)
    │
    ├─ 3b. buildLunchSystemPrompt(...)
    │       └─ Phase 별 행동 규칙 + 정책 inline + 주문 이력 inline
    │
    ├─ 3c. Sonnet 호출 (lib/ai/lunch-ai.ts)
    │
    ├─ 3d. 응답 파싱
    │       ├─ <intent>AUTO_REPLY|NEED_HUMAN</intent> 추출
    │       ├─ <phase>idle|order|confirm|inquiry</phase> 추출
    │       └─ <order_data>{...}</order_data> JSON 추출 (confirm 시)
    │
    ├─ 3e. lunch_conversations 갱신
    │       ├─ ai_draft = 본문 (태그 제거)
    │       ├─ ai_phase = 추출된 phase
    │       └─ ai_order_data = JSON 문자열 (있으면)
    │
    └─ 3f. NEED_HUMAN → status = needs_check
    ↓
[4] 상담사 화면 (LunchChatView)
    ├─ ai_draft 표시
    ├─ <order_data> 있으면 "주문 등록" 버튼 활성화
    └─ 상담사가 검토 후 발송 (또는 직접 작성)
    ↓
[5] 발송: /api/lunch/conversations/[sessionId]/send
    └─ sendLunchPlainMessage (lib/happytalk/lunch-client.ts)
```

## 함수 trace

### Webhook 진입
- `app/api/webhook/route.ts` — sender_key 분기
- `app/api/webhook/lunch/message/route.ts` — 메인 핸들러
- `app/api/webhook/lunch/session-end/route.ts` — 세션 종료 알림

### AI 응답 생성
| 함수 | 위치 |
|---|---|
| `buildLunchSystemPrompt(params)` | `lib/ai/lunch-prompt.ts` (229줄) |
| `getPolicyText()` | 위 (내부) — `lunch-policy.md` 빌드 타임 로드 |
| `runLunchAI(...)` | `lib/ai/lunch-ai.ts` (113줄) |

### Store
| 함수 | 위치 |
|---|---|
| `lunchConversationStore.upsert` | `lib/store/lunch-conversations.ts` |
| `lunchConversationStore.updateDraft` | (위와 동일) |
| `lunchConversationStore.updatePhase` | (위와 동일) |
| `lunchConversationStore.updateOrderData` | (위와 동일) |
| `lunchOrderStore.create` | `lib/store/lunch-orders.ts` (주문 등록 모달 → POST) |

### 발송
| 함수 | 위치 |
|---|---|
| `sendLunchPlainMessage` | `lib/happytalk/lunch-client.ts` |
| `sendLunchImageMessage` | (위와 동일) |
| `lunch_messages.serial_number` UNIQUE | DB 측 중복 방지 (m018) |

## 4단계 Phase 머신

```
idle (기본)
  │
  ├─ "내일 50개 수거 가능한가요" 같은 주문 정보 감지 → order
  │
  ├─ "정산은 언제까지" / "지난주 금액" 같은 질의 → inquiry
  │
  └─ 그 외 (인사, 잡담) → idle 유지

order
  │
  ├─ 정보 부족 (날짜·시간·개수·주소 중 하나라도 없음) → order 유지, 재질문
  │
  └─ 정보 완성 → confirm
        ├─ 응답에 <order_data> JSON 포함
        ├─ 클라이언트가 파싱 → 주문 등록 모달 자동채움
        └─ 상담사가 모달에서 lunch_orders INSERT
              └─ 그 후 idle 로 복귀

inquiry
  │
  ├─ 견적 안내 (지역+개수 기반 계산)
  │
  └─ 단순 질의 처리 (정산·일정·기타)
```

방문수거의 9단계와 비교:
- 방문은 견적·예약을 다 단계로 (1→2→3→4→5→6→7→8→closed)
- 런치는 단순 (idle ↔ order/inquiry → confirm 후 idle 복귀)
- 이유: 정기 수거는 매번 비슷한 패턴, 견적 흥정·예약 단계 분리 불필요

## 컨텍스트 inline (system prompt)

`buildLunchSystemPrompt` 가 다음을 system prompt 에 inline:

### 벤더 정보
```
- 벤더명: 카페 ABC 강남점
- 신규 고객 여부: 아니오 (기존 고객)
- 현재 Phase: order
```

### 최근 주문 이력 (최대 10건)
```
- 2026-04-25 10:30 | 50개 | 서울 강남구 ... | 35,000원 | 일정확정 | order_xxx
- 2026-04-24 야간 | 30개 | 서울 강남구 ... | 15,000원 | 정산완료 | order_yyy
```

→ 고객이 "지난주 금액 알려주세요" 같은 질문 시 AI 가 직접 인용 가능.

### 지역별 가격
```
서울 강남구: 5,000원
서울 종로구: 5,000원
경기 성남시: 8,000원
...
```

→ 정책 4 의 가격 계산 시 사용.

### 정책 문서
`lunch-policy.md` 전체 inline (빌드 타임 로드).

## `<order_data>` 자동 파싱

confirm Phase 응답 끝에 JSON 태그:
```
<order_data>
{
  "vendorName": "카페 ABC 강남점",
  "date": "2026-04-28",
  "timeAmPm": "오전",
  "timeHour": "10",
  "timeMinute": "30",
  "boxCount": "50",
  "pickupAddress": "서울 강남구 테헤란로 ...",
  "ownerPhone": "010-1234-5678",
  "siteContact": "김매니저 010-1111-2222",
  "notes": "지하 1층 입구",
  "settlementType": "link_pay"
}
</order_data>
```

자세히는 [`03-order-parsing.md`](03-order-parsing.md).

## 응답 파싱 흐름

```ts
// lib/ai/lunch-ai.ts (개념)
const response = await sonnet.complete(systemPrompt, userMessage);

// 1. intent 추출
const intentMatch = response.match(/<intent>(AUTO_REPLY|NEED_HUMAN)<\/intent>/);
const intent = intentMatch?.[1] ?? "AUTO_REPLY";

// 2. phase 추출
const phaseMatch = response.match(/<phase>(idle|order|confirm|inquiry)<\/phase>/);
const phase = phaseMatch?.[1] ?? "idle";

// 3. order_data 추출 (있으면)
const orderDataMatch = response.match(/<order_data>([\s\S]*?)<\/order_data>/);
const orderData = orderDataMatch ? JSON.parse(orderDataMatch[1]) : null;

// 4. 본문 (태그 제거)
const body = response
  .replace(/<intent>.*?<\/intent>/s, "")
  .replace(/<phase>.*?<\/phase>/s, "")
  .replace(/<order_data>[\s\S]*?<\/order_data>/s, "")
  .trim();
```

## NEED_HUMAN 케이스

AI 가 자동 응답하지 않고 상담사에게 넘김:
- 행사 수거 (대량·특수)
- 견적서 요청 (별도 양식)
- 당일 시간 변경 (확정 후)
- 미수거 / 클레임
- 도시락 외 문의 (다른 폐기물)
- 서비스 지역 외 (서울/경기/인천 외)

NEED_HUMAN → `lunch_conversations.status = "needs_check"` → 상담사 알림

## 자동 발송 vs 수동

런치는 기본 **수동 모드** (방문수거와 다름). AI 가 ai_draft 만 채우고 상담사 검토 후 발송. 자동 모드는 운영 안 함.

이유: 런치 응대는 비즈니스 톤 + 정확한 금액 안내가 중요. AI 단독 발송은 위험.

## 발송 후 분류

상담사 답변 발송 시 `lib/utils/reply-classify.ts:classifyReply` 자동 호출:
- `lunch_messages.reply_kind` 기록 (ai_auto / ai_assist / human)
- `lunch_messages.responded_in_ms`
- `lunch_messages.draft_char_overlap`

CS Realtime 카드의 런치 답변 통계에 사용.

## 실패 fallback

| 단계 | 실패 | 처리 |
|---|---|---|
| webhook 진입 | serial 중복 | 200 응답 (idempotent) |
| AI 호출 실패 | Sonnet timeout / 한도 | ai_draft 비움 → 상담사 직접 작성 |
| order_data 파싱 실패 | JSON 형식 오류 | silently fail, 모달 자동채움 안 됨 |
| 발송 실패 | 해피톡 에러 | DB 메시지 보존, 재발송 가능 |
| InvalidSession (-502) | 카카오 채팅창 닫힘 | status = closed (자동) |

## 핵심 차이 (방문수거와)

| 항목 | 방문수거 | 런치 |
|---|---|---|
| Phase 수 | 9 | 4 |
| Webhook | message + metadata + session-end | message + session-end |
| 자동 모드 | DB 토글 (auto/manual) | 항상 manual |
| 견적 산출 | quote/calculate API + products 매칭 | system prompt 안 인라인 계산 |
| 모호 품목 | ambiguous-items (현재 거의 미사용) | 없음 |
| <order_data> | 없음 | 있음 (confirm Phase) |
| 톤 | 마크다운 / 이모지 허용 | **금지** (`:)` 만) |
| 정책 문서 | pickup-policy.md | lunch-policy.md (둘 다 빌드 타임) |
| 외부 동기화 | sendToCovering | 없음 (Bolta 발행은 별도 라우트) |
