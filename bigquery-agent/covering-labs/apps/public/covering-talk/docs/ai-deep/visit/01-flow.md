# 방문수거 — 메시지 → 응답 Sequence

> 고객이 카카오톡에 메시지를 보낸 시점부터 AI 답변이 발송되기까지의 전체 흐름.
> 코드 위치: 모두 `app/api/webhook/message/route.ts` + `lib/ai/*` + `lib/webhook/*`.

## 전체 sequence (텍스트 메시지)

```
고객 카카오톡 메시지
    ↓
[1] 해피톡 webhook → /api/webhook/route.ts
    sender_key 분기 (방문 vs 런치)
    ↓ (방문 sender_key)
[2] /api/webhook/message/route.ts POST
    │
    ├─ 2a. 중복 메시지 체크 (isDuplicateMessage)
    ├─ 2b. status = "pending" 으로 전환 (재연락 감지)
    ├─ 2c. messages INSERT (ai_draft = null)
    ├─ 2d. 전화번호 / 이름 추출 (상담사가 요청한 후에만)
    └─ 2e. 클라이언트에 "ok" 즉시 200 반환
    ↓
[3] after() 백그라운드 작업
    │
    ├─ 3초 debounce (고객 연속 메시지 합치기)
    ├─ getLatestUserTextMessageId — 더 새 메시지 있으면 스킵
    ├─ mergeConsecutiveUserMessages — 연속 메시지 1개로
    └─ processTextMessage(...) 호출
    ↓
[4] processTextMessage
    │
    ├─ 4a. ABC 타임 슬롯 버튼 응답 감지 → 조기 return
    ├─ 4b. requestedDate 자동 추출 (extractBookingDateTime)
    ├─ 4c. workflow config 로드 (skipNudge / skipDoublecheck)
    │
    ├─ 4d. Phase 1 분기
    │       ├─ "견적받기" 버튼 → 템플릿 생략, Phase 2 전환
    │       ├─ 고객 작성 템플릿 감지 → Phase 2
    │       └─ 첫 메시지 → 고정 템플릿 (getPhase1Template) 발송 + Phase 2
    │
    ├─ 4e. Fast Path (Phase 2/3 + 버튼 응답 감지)
    │       ├─ detectButtonResponse
    │       ├─ autoMapQuoteItems (basic_info 버튼은 스킵)
    │       ├─ 출장비 재계산
    │       ├─ checkPhaseTransition → Phase 4 직행 가능 여부
    │       └─ 다음 버튼 전송 또는 fastPathCompleted
    │
    ├─ 4f. 정보 추출 + 견적 매핑 (병렬)
    │       ├─ infoExtractionTask (extractCollectedInfo + resolveDistrict)
    │       └─ quoteMapTask (autoMapQuoteItems) — Phase 2/3/3-1 만
    │
    ├─ 4g. Pre-transition (checkPhaseTransition)
    │       └─ Phase 4 진입 시 즉시 견적 템플릿 발송
    │
    ├─ 4h. handleBasicInfoButtons (Phase 2/3, 서비스 지역 內)
    │
    ├─ 4i. AI 응답 생성 (generateAIResponse)
    │       ├─ Sonnet 호출 (intent 분류 통합 — Haiku 1회 절감)
    │       └─ extractMessage(response)
    │
    ├─ 4j. intent 분기
    │       ├─ AUTO_REPLY → ai_draft 저장
    │       ├─ NEED_HUMAN → status = needs_check
    │       └─ CANCEL (또는 키워드 폴백) → quote_sent_no_nudge
    │
    ├─ 4k. Post-transition loop (Phase 4→6→7→8 같은 다단계)
    │       └─ Phase 8 진입 시 needs_check + 메모 자동 요약
    │
    └─ 4l. 자동상담 모드 (DB 설정) → 즉시 발송 (sendPlainMessage)
            └─ 중복 전송 방지 — 이미 같은 user 메시지 뒤에 assistant 있으면 스킵
    ↓
상담사 화면 갱신 (SSE: /api/conversations/updates)
    └─ 상담사 검토 → 발송 (manual mode) 또는 이미 자동 발송됨
```

## 함수 trace

### 진입점
- `app/api/webhook/route.ts` — sender_key 분기
- `app/api/webhook/message/route.ts:81` — `POST` 핸들러

### 정보 추출 (4f)
| 함수 | 위치 | 입력 | 출력 |
|---|---|---|---|
| `extractCollectedInfo` | `lib/ai/claude.ts` | messages | `{address, district, floor, elevator, parking, items, ...}` |
| `resolveDistrict` | `lib/ai/district-resolver.ts` | address, current district | 정규화된 구·시군 |
| `autoMapQuoteItems` | `lib/webhook/response-builder.ts` | sessionId, messages | quotes 자동 매핑 (DB INSERT) |
| `extractBookingDateTime` | `lib/utils/booking-datetime.ts` | message | `{date: "YYYY-MM-DD"}` |

### Phase 결정 (4e, 4g, 4k)
| 함수 | 위치 | 입력 | 출력 |
|---|---|---|---|
| `checkPhaseTransition` | `lib/ai/phase-transitions.ts` | currentPhase, collectedInfo, hasQuote, latestUserMessage, ... | `{nextPhase, reason}` 또는 `null` |
| `updatePhaseWithStatus` | `lib/webhook/phase-engine.ts` | sessionId, nextPhase, reason | DB 갱신 + status 매핑 |
| `checkBookingInfoComplete` | `lib/webhook/phase-engine.ts` | conv, messages | boolean (성함+연락처+일자+시간) |

### AI 응답 (4i)
| 함수 | 위치 | 모델 | 응답 |
|---|---|---|---|
| `generateAIResponse` | `lib/ai/claude.ts` | Sonnet | `{intent, response, ...}` |
| `extractMessage` | `lib/ai/claude.ts` | — | response 에서 `<message>` 본문만 |

### 발송 (4l + manual)
| 함수 | 위치 | 비고 |
|---|---|---|
| `sendPlainMessage` | `lib/happytalk/client.ts` | 텍스트 (sendType=1) |
| `sendImageMessage` | `lib/happytalk/client.ts` | 이미지 + 버튼 (sendType=2) |
| `sendSplitMessage` | `lib/happytalk/send-message.ts` | 긴 메시지 자동 분할 |

## 이미지 / 파일 수신 (별도 흐름)

```
이미지 수신
    ↓
/api/webhook/message → msgType === "image" / "photo"
    ├─ extractImageUrls(body)
    ├─ persistImage (Kakao CDN → Supabase Storage)
    ├─ messages INSERT (이미지 1장당 1개)
    └─ after() 백그라운드 — 마지막 이미지로 AI 분석 (vision)
            └─ generateAIResponse(prompt, history, lastImageUrl)
            └─ aiDraft 저장
    ↓
상담사 화면 갱신
```

## ABC 타임 슬롯 버튼 응답 (별도 fast path)

```
고객이 ABC 시간안내 슬롯 버튼 클릭
    ↓
processTextMessage 시작
    └─ handleAbcSlotButtonResponse → 조기 return
            ├─ 슬롯 정보 collected_info.selectedTimeBlock 저장
            └─ 즉시 응답 (AI 호출 없음)
```

## 자동 상담 모드 vs 수동

런타임 토글: `app_settings.auto_mode`. 또는 `process.env.SEND_MODE` fallback.

| 모드 | 동작 |
|---|---|
| `auto` (=true) | AI draft 생성 후 자동 발송 (sendPlainMessage). 상담사 검토 단계 없음 |
| `manual` (기본) | AI draft 만 채워두고 상담사가 검토 후 발송 |

자동 모드라도 다음 케이스에서는 발송 안 함:
- intent === NEED_HUMAN
- aiDraft === null
- 같은 user 메시지 뒤에 이미 assistant 응답 있음 (중복 방지)

## 자동생성 sentBy 로직

```ts
function getAutoSentBy(assignee: string | null): string {
  if (assignee) return `${assignee}(자동생성)`;
  return "AI(자동생성)";
}
```

`messages.sent_by` 가 "이름(자동생성)" / "AI(자동생성)" 패턴 → 대시보드 운영자 카운트에서 자동 발송분 식별.

## 응답 시간 계산 (CS Realtime)

상담사 답변 발송 시 `messages.responded_in_ms` 자동 계산 — 직전 user 메시지 → 본 assistant 메시지 timestamp diff.

운영시간 KST 10–22 내 발송만 First Response Time median 에 집계.

## 실패 fallback

| 단계 | 실패 | 처리 |
|---|---|---|
| webhook 진입 | JSON 파싱 실패 | 400 응답 |
| 백그라운드 throw | 모든 에러 | catch → status `needs_check` |
| AI 호출 실패 | generateAIResponse throw | aiDraft = null → 상담사 직접 작성 |
| 발송 실패 | sendPlainMessage throw | 메시지는 DB 저장됨 (재발송 가능) |
| InvalidSession (-502) | send 라우트 (별도) | conversations.status = `closed` |
