# 방문수거 — 정보 추출 (품목 / 주소 / 공휴일 / 시간)

> 고객 메시지에서 견적·예약에 필요한 구조화된 정보를 추출하는 모듈들.
> 위치: 주로 `lib/ai/`, `lib/utils/`, `lib/webhook/`.

## 추출 항목

| 항목 | 용도 | 추출 함수 |
|---|---|---|
| 품목 (items) | 견적 산출 | `extractItemsFromConversation` (Sonnet) |
| 주소 + 행정구 | 출장비 + 서비스 가능 여부 | `extractCollectedInfo` + `resolveDistrict` |
| 층수 / 엘베 / 주차 | 사다리차 산정·작업 환경 | `extractCollectedInfo` |
| 수거 희망 일시 | 예약 + ABC 슬롯 | `extractBookingDateTime` |
| 성함 / 전화번호 | 예약 정보 | 정규식 (`webhook/message-parser`) |
| 모호 품목 | 사양 재질문 (현재 거의 미사용) | `findNextPendingAmbiguousItem` |

## 1. 품목 추출

### `extractItemsFromConversation`
- 위치: `lib/ai/claude.ts`
- 호출: 첫 메시지에서 + Phase 2/3 진행 중
- 모델: Sonnet (정확도 우선)
- 출력: `[{category, spec, quantity}]`

### `autoMapQuoteItems` (위쪽 함수가 호출)
- 위치: `lib/webhook/response-builder.ts`
- 동작:
  1. 추출된 품목 리스트
  2. `lib/utils/product-search.ts:searchProducts` (Voyage AI 임베딩 + 별칭) 로 products 테이블 매칭
  3. 매칭 성공한 품목 → quotes / quote_items INSERT
  4. 매칭 실패 (unmatched) → warnings 로 응답 → 상담사 확인

### v1 vs v2
- `/api/conversations/[sessionId]/extract-items` (v1) — 단순 패턴 매칭, legacy
- `/api/conversations/[sessionId]/extract-items-v2` (v2) — Sonnet, 모호한 표현 처리

신규 webhook 흐름은 모두 v2 사용. v1 은 legacy 진입점.

### 모호 품목 (`ambiguous-items.ts`)

일부 품목은 사양에 따라 가격이 크게 달라짐:
- 매트리스: 싱글 / 슈퍼싱글 / 더블·퀸 / 킹
- 세탁기: 통돌이 / 드럼
- 옷장: 1문 / 2문 / 3문+

원래 v2 이전엔 모호 품목 발견 시 버튼 메시지로 사양 재확인했으나, 현재는 **AI 가 프롬프트에서 직접 매칭** (사양 묻지 않음 정책). 따라서 `findNextPendingAmbiguousItem` 은 거의 항상 null 반환.

## 2. 주소 + 행정구 추출

### `extractCollectedInfo`
- 위치: `lib/ai/claude.ts`
- 입력: messages
- 출력: `{address, district, floor, elevator, parking, items, special_notes, ...}`
- 빈 값 처리: null 반환 → webhook 측에서 delete 후 conversationStore.updateCollectedInfo (병합)

### `resolveDistrict`
- 위치: `lib/ai/district-resolver.ts`
- 입력: `address`, `currentDistrict | null`
- 동작:
  1. address 텍스트에서 "강남구", "수원시" 같은 단위 추출
  2. `service_areas` 테이블 lookup (m006)
  3. 행정동 기준 (법정동 아님 — 사용자 메모 강조) 정규화
  4. 미서비스 지역이면 별도 마킹 (`isOutOfServiceArea` 가 다음 단계에서 체크)

### `isOutOfServiceArea`
- 위치: `lib/ai/district-resolver.ts`
- 미서비스 지역 → AI 응답이 "죄송합니다, 해당 지역은 서비스 가능 지역이 아닙니다" 패턴으로 자동 안내

### District 재시도
첫 추출 시 district 가 null 일 수 있음 → webhook/message:670 가 같은 conversation 의 address 로 한번 더 resolveDistrict 호출.

## 3. 층수 / 엘베 / 주차

`extractCollectedInfo` 가 한 번에 추출. 각각:
- `floor: number | null` — "3층", "지하 1층"
- `elevator: boolean | null` — "엘리베이터 있어요" / "없어요"
- `parking: boolean | null` — "주차 가능" / "주차 안 돼요"

추출 실패 시 `handleBasicInfoButtons` (`lib/webhook/phase-engine.ts`) 가 버튼 메시지로 재질문.

## 4. 수거 희망 일시

### `extractBookingDateTime`
- 위치: `lib/utils/booking-datetime.ts`
- 입력: 메시지 1개
- 출력: `{date: "YYYY-MM-DD" | null, time: "HH:MM" | null}`

처리:
- "내일" / "모레" / "다음주 화요일" → 절대 날짜 변환
- "오후 3시" → "15:00"
- "오전 10시 30분" → "10:30"
- 한국 시간 표기 다수 패턴

### 저장
- `conversations.collected_info.requestedDate` (YYYY-MM-DD)
- 단방향 — 새 메시지에 날짜 있으면 갱신, 과거 메시지는 재추출 안 함 (오래된 날짜가 덮어쓰지 않게)

### 활용
- AI 가 user 프롬프트에 `requestedDate` 플래그로 받음 (공휴일 환각 방지용)
- ABC 시간안내 슬롯 발송 시 사용

## 5. 공휴일 환각 방지 (매우 중요)

### 문제
AI 가 "5월 5일은 어린이날이라 안 됩니다" 같은 환각 응답.

### 해결
1. 운영팀이 `app_settings.abc_capacity.holidays` 에 공휴일 명시:
   ```json
   { "holidays": ["2026-05-05", "2026-05-06"] }
   ```
2. 코드에 2026 fallback 하드코딩 (안전망)
3. 서버가 위 둘 병합 → system prompt 에 inline:
   ```
   2026년 공휴일: 2026-05-05, 2026-05-06, ...
   위 목록에 없는 날짜를 임의로 공휴일이라 판단하지 마.
   ```
4. AI 가 `ci.requestedDate` (서버 사전 판정) 도 user 프롬프트로 받음

### 결과
AI 가 명시 목록에만 의존 → 환각 없음.

## 6. 성함 / 전화번호

### 추출 조건 (중요)
**상담사가 성함·연락처를 요청한 후에만** 추출. 그 전엔 추출 안 함.

이유: 고객이 본 인증 절차 없이 정보 보낼 수 있는데, 그게 본인이 아닐 수 있음. 상담사 액션 후에만 신뢰.

### 트리거 패턴
직전 5개 assistant 메시지 중에 다음 키워드 중 하나라도 있으면 추출:
```
성함 | 연락처 | 이름 | 전화번호 | 휴대폰
```

### 전화번호 패턴
```ts
/(?<!\d)01[016789][-\s]*\d{3,4}[-\s]*\d{4}(?!\d)/
```
- 앞뒤 숫자 lookbehind/lookahead — "010 3234 6915 추가 1234" 같은 텍스트에서 잘못된 추출 방지
- `[-\s]*` — 복수 공백/하이픈 허용 ("010  3234  6915" 같은 이중 공백 입력)

### 검증
- `isValidPhoneNumber` (`lib/webhook/message-parser`) — 010/011/016/017/018/019 + 길이 10~11
- 통과해야 `conversationStore.updatePhone` 호출

### 이름 추출
- `extractCustomerName(userMessage)` — 한국 이름 패턴
- 신뢰도 검사: 이름 + 전화번호 함께 있거나 "이름은 X입니다" 같은 명시 키워드 있으면 high confidence
- 기존 이름이 있는 경우 high confidence 일 때만 덮어쓰기

## 7. 메시지 합치기 (debounce)

### `mergeConsecutiveUserMessages`
- 위치: `lib/webhook/message-parser`
- 동작:
  1. 마지막 N개 메시지 fetch
  2. 연속된 user 메시지 1개로 병합 (assistant 가 중간에 끼면 분리)
  3. 줄바꿈으로 join

이유: 고객이 짧은 메시지 여러 개 (예: "강남구\n도곡동\n123-45\n3층") 를 따로 보낸 경우 한 번에 처리.

### debounce timing
- 메시지 도착 시 즉시 200 응답 (해피톡 timeout 방지)
- after() 백그라운드에서 3초 대기
- 그 사이 새 메시지 도착하면 → 더 새 메시지의 핸들러가 처리하므로 본 핸들러는 스킵

## 8. 중복 메시지 처리

### `isDuplicateMessage`
- 위치: `lib/webhook/message-parser`
- 직전 N개 메시지 비교
- 같은 내용 + 짧은 시간 차 → 중복 (해피톡 webhook 재시도 가능성)
- 중복이면 200 응답 후 처리 안 함

## 9. 가격·견적 보정

### `getTripFee(district, workerCount)`
- 위치: `lib/utils/trip-fee.ts`
- 지역별 출장비 (`region_prices` 테이블 기준)

### 출장비 재계산 흐름
infoExtractionTask + quoteMapTask 병렬 → 둘 다 끝난 후:
1. 갱신된 district 조회
2. 현재 quote 의 tripFee 와 비교
3. 다르면 quote 업데이트 + VAT 재계산 + total 재계산

여러 곳에서 재계산 (Phase 1 직접 / Fast Path / 일반 흐름) — 일관성 위해.

## 10. 추출 실패 / fallback

| 항목 | 실패 fallback |
|---|---|
| 품목 | unmatched 로 warnings → 상담사 화면 표시 |
| 주소 | district null → AI 가 다시 묻기 |
| 층수/엘베/주차 | basic_info 버튼으로 재질문 |
| 일시 | requestedDate null → AI 가 묻기 또는 ABC 슬롯 발송 |
| 성함/연락처 | 다음 메시지에서 재추출 |
| AI 호출 자체 실패 | aiDraft = null → status = needs_check |

## 변경 시 주의

- 새 추출 항목 추가 → `CollectedInfo` 인터페이스 + `extractCollectedInfo` 프롬프트
- 정규식 변경 → 기존 메시지 파싱 영향 (회귀)
- Voyage 임베딩 모델 변경 → product_embeddings 재생성 필요
- 공휴일 추가 → `app_settings.abc_capacity.holidays` (DB 즉시) + (선택) 2026 fallback 코드
- 모호 품목 활성화 (현재 거의 미사용) → ambiguous-items.ts + AI 프롬프트
