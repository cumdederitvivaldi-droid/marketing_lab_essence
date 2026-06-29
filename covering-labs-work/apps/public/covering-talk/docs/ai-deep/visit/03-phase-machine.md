# 방문수거 — 9단계 Phase 머신

> 위치: `lib/ai/phases.ts` (enum + 라벨) + `lib/ai/phase-transitions.ts` (전환 로직, 359줄).
> 호출처: `app/api/webhook/message/route.ts` 의 `processTextMessage` — Pre/Post-transition 2회 호출.

## Phase enum

```ts
enum Phase {
  PHASE_1_INITIAL    = "phase_1",     // 초기 인입
  PHASE_2_COLLECT    = "phase_2",     // 정보 수집
  PHASE_3_SPEC       = "phase_3",     // 사양 확인 (현재 사실상 생략)
  PHASE_3_1_MODIFY   = "phase_3_1",   // 품목 변경
  PHASE_4_QUOTE      = "phase_4",     // 견적 안내
  PHASE_5_NUDGE      = "phase_5",     // 넛지 (고민/보류)
  PHASE_6_BOOKING    = "phase_6",     // 예약 접수
  PHASE_7_CONFIRM    = "phase_7",     // 예약 확인
  PHASE_8_POST       = "phase_8",     // 사후 관리
  CLOSED             = "closed",      // 종료
}
```

## Phase → ConversationStatus 매핑

`getDefaultStatusForPhase` (`phases.ts:85`) — Phase 진입 시 status 자동 설정:

| Phase | Default Status |
|---|---|
| 1, 2, 3, 6 | `pending` |
| 3-1 | `pending` |
| 4 | `pending` (견적 발송 후 quote_sent_nudge 로 별도 갱신) |
| 5 | `quote_sent_nudge` |
| 7 | `pending` |
| 8 | `booked` |
| CLOSED | `completed` |

## 전체 전환 표

```
Phase 1 (초기 인입)
  ├─ text → Phase 2
  └─ image/file 만 → null (needs_human 플래그)

Phase 2 (정보 수집)
  └─ hasBasicInfo + hasQuote + allSpecsConfirmed → Phase 4

Phase 3 (사양 확인 — 현재 거의 안 들어옴)
  └─ hasQuote → Phase 4

Phase 4 (견적 안내)
  ├─ 명시적 booking 키워드 / 성함+연락처 → Phase 6
  ├─ 고민/보류 키워드 (예약 행동 없음) → Phase 5 (단, skipNudge 옵션 시 머무름)
  ├─ 새 견적 요청 패턴 (주소+품목수량) 또는 재문의 키워드 → Phase 2
  └─ 의문문은 단순 질문 → 머무름

Phase 5 (넛지)
  ├─ 새 견적 요청 → Phase 2
  ├─ 넓은 booking 키워드 → Phase 6
  └─ 같은 메시지에 deliberation 있으면 머무름 (다음 메시지에서 판단)

Phase 6 (예약 접수)
  └─ hasBookingInfo (성함+연락처+일자+시간 모두) → Phase 7

Phase 7 (예약 확인)
  └─ confirm 키워드 ("네", "맞아요", "확정", ...) → Phase 8

Phase 8 (사후 관리)
  ├─ 취소 키워드 → CLOSED
  └─ 품목 변경 키워드 → Phase 3-1

Phase 3-1 (품목 변경)
  └─ hasQuote (변경 견적 산출 완료) → Phase 8

CLOSED
  ├─ 같은 메시지에 cancel 키워드 있으면 머무름 (즉시 재진입 방지)
  └─ 그 외 모든 메시지 → Phase 2 (재인입)
```

## 키워드 패턴 (모두 `phase-transitions.ts` 상수)

### `BOOKING_KEYWORDS` (좁은 — Phase 4 → 6)
```
예약, 접수, 신청, 진행할게, 진행해주, 진행합니, 예약할게, 예약해주, 예약합니,
접수할게, 접수해주, 신청할게, 신청해주
```
**제외**: "부탁드"·"부탁합니" — "견적부탁드릴게요" 오탐 유발해서 제외.

### `BROAD_BOOKING_KEYWORDS` (넓은 — Phase 5 → 6)
```
[BOOKING_KEYWORDS] + 진행, 부탁, 확정, 할게요, 할래요, 하겠습니다, 해주세요
```
넛지 후 고객은 간단히 "할게요" 만 답할 수 있어서 더 넓게 매칭.

### `ITEM_CHANGE_KEYWORDS` (Phase 8 → 3-1)
```
추가, 빼주, 제거, 삭제, 변경, 더 있, 하나 더, 빠졌, 빼고
```

### `DELIBERATION_KEYWORDS` (Phase 4 → 5)
```
고민, 보류, 나중에, 생각해, 생각 좀, 다음에, 좀 더, 아직, 고려, 검토, 비교, 알아보, 알아볼
```

### `CANCEL_KEYWORDS` (Phase 8 → CLOSED)
```
취소, 안할게, 안할래, 안하겠, 취소할게, 취소해주, 예약취소, 캔슬
```

### `REENTRY_KEYWORDS` (Phase 4·5 → 2 / CLOSED → 2)
```
다시, 새로, 견적, 문의, 상담, 버리, 수거, 폐기
```

### `NEGATION_PATTERN` — 부정 맥락 detector
```
/(?:안\s|않|아닌|아니|말고|못\s|아직|안할|안해|안하|취소)/
```
예약 키워드 앞뒤에 부정 표현이 있으면 booking 으로 판정 안 함.

### Phase 7 confirm 키워드
```
네, 넵, 넹, 응, ㅇㅇ, 맞아요, 맞아, 맞습니다, 확정, 예약, 진행, 좋아요, 좋아,
그렇게, 부탁, 오케이, ㅇㅋ, ok
```

## 핵심 결정 함수들

### `hasBasicInfo(info)` — Phase 2 → 4 조건
```ts
return info.address != null
    && info.district != null     // 출장비 산출 필수
    && info.elevator != null
    && info.parking != null;
```

### `allSpecsConfirmed(messages)` — 모호 품목 처리 끝났는지
- `findNextPendingAmbiguousItem(messages)` 호출 (`lib/ai/ambiguous-items.ts`)
- 매트리스 사이즈, 세탁기 종류 등 모호한 품목 질문 남아있으면 false
- 현재 Phase 3 사양 확인 단계가 거의 생략돼 대부분 true

### `isNewQuoteRequest(message)` — 키워드 없이 정보만 보낸 고객 감지
```ts
const hasAddress =
  /(?:서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)/.test(message)
    && /(?:[가-힣]+(?:구|군|시|동|로|길))/.test(message)
  || /(?:아파트|빌라|오피스텔|캐슬|타워|맨션|파크|힐스|자이)\s*\d*/.test(message)
  || /\d+동\s*\d+호/.test(message)
  || /\d+호/.test(message) && /[가-힣]+(?:구|동|로|길)/.test(message);
const hasItemQuantity = /\d+\s*(?:개|대|세트|장|ea)/.test(message);
return hasAddress && hasItemQuantity;
```

키워드 없이 "서울 용산구 도원동... 침대 1개" 같은 메시지를 새 견적 요청으로 감지.

### `checkBookingInfoComplete` — Phase 6 → 7 조건
- `lib/webhook/phase-engine.ts`
- conversations.collected_info 의 성함·연락처 + 메시지에서 일자·시간 추출

## 호출 위치

`webhook/message/route.ts:processTextMessage` 안에서 3번 호출:

| 호출 | 시점 | 목적 |
|---|---|---|
| Fast Path 안 (Phase 2/3 + 버튼 응답) | 버튼 후 | Phase 4 직행 가능 여부 |
| Pre-transition | AI 호출 전 | 입력 정보 기준 Phase 결정 |
| Post-transition loop | AI 응답 후 | 같은 메시지 안에 다단계 전환 (Phase 4→6→7→8) |

Post-transition 은 최대 4 hop 까지 (`for (let hop = 0; hop < 4; hop++)`). 무한 루프 방지.

## skipNudge / skipDoublecheck 옵션

`workflow_config` 테이블의 토글:
- `skip_nudge: true` → Phase 4 에서 "고민/보류" 감지해도 Phase 5 안 가고 머무름
- `skip_doublecheck: true` → Phase 7 더블체크 단계 생략 가능 (구현 위치 확인 필요)

운영팀이 워크플로우 단계 줄이고 싶을 때 사용.

## 예외 / 가드

### "이 메시지가 Phase 전환을 유발한 것" 처리
- 사용자가 "고민이에요" 라고 보내서 Phase 4 → 5 전환된 직후, 같은 메시지로 Phase 5 → 6 / 5 → 2 전환되면 안 됨
- Phase 5 전환 직후 같은 메시지에 deliberation 키워드가 포함됐는지 검사 → 있으면 머무름

### 의문문 처리
Phase 4 에서 reentry/new-quote 키워드 감지 시 의문문 패턴 체크:
```ts
const isQuestion = /[?？]|(?:인가요|나요|까요|ㄴ가요|는지요|한가요|할까요|되나요|있나요|없나요|...)/.test(message);
if (isQuestion && !hasNewQuoteInQuote) return null;  // 단순 질문, 견적 초기화 방지
```

### 부정 맥락
"안 할 거예요" 안에 "예약" 키워드 있어도 Phase 6 안 감.

## 디버깅

### Phase 강제 변경 (개발용)
```bash
PATCH /api/conversations/[sessionId]/phase
{ "phase": "phase_4" }
```
프로덕션 사용 주의 — phase_history 가 인위적으로 변하면 통계 왜곡.

### 자주 쓰는 SQL
```sql
-- Phase 별 분포
SELECT current_phase, COUNT(*) FROM conversations
WHERE status NOT IN ('closed', 'completed', 'cancelled')
GROUP BY current_phase ORDER BY COUNT(*) DESC;

-- Phase 4 에서 N시간 묶여 있는 conversations
SELECT session_id, name, updated_at,
       EXTRACT(EPOCH FROM (NOW() - updated_at))/3600 AS hours_idle
FROM conversations
WHERE current_phase = 'phase_4' AND status = 'pending'
ORDER BY updated_at LIMIT 50;

-- Phase 전환 이력 (특정 세션)
SELECT session_id, jsonb_array_elements(phase_history) AS transition
FROM conversations WHERE session_id = '...';
```

## 변경 시 주의

- 새 Phase 추가 → enum + getDefaultStatusForPhase + 모든 case 분기 + UI 라벨 색상
- 키워드 패턴 변경 → 회귀 위험 (기존 conversations 영향)
- 고정 템플릿 (Phase 1, 4, 8) 변경 → 즉시 운영 영향
- skipNudge/skipDoublecheck 토글 변경 → 운영팀 사전 공유
