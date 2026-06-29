# 런치 — `<order_data>` 자동 파싱

> 런치 AI 의 핵심 차별 기능 — confirm Phase 응답에 JSON 태그를 포함해 클라이언트가 주문 등록 모달을 자동 채움.
> 위치: AI 측 `lib/ai/lunch-prompt.ts:170` (스키마 명시) + 클라이언트 측 `components/lunch/LunchChatView.tsx` (파싱).

## 동작 흐름

```
사장님: "내일 오전 10시 30분에 도시락 50개 수거 부탁드려요. 강남구 테헤란로 ..."
    ↓
AI (Sonnet) 처리
    ├─ Phase 결정: confirm
    ├─ 수집 정보로 응답 본문 작성
    └─ 응답 끝에 <order_data> JSON 태그 부착
    ↓
응답:
"수거 접수 확인드립니다 :)

접수 내역
- 날짜: 2026-04-28 (오전)
- 주소: 서울 강남구 테헤란로 ...
- 도시락: 50개
- 담당자: 사장님 010-XXXX-XXXX

예상 비용
- 수거요금: 5,000원 (서울 강남구)
- 처리요금: 25,000원 (500원 x 50개)
- 합계: 30,000원 (부가세 포함)

수량 변경 시 미리 말씀 부탁드립니다!
감사합니다 :)

<order_data>
{
  "vendorName": "카페 ABC 강남점",
  "date": "2026-04-28",
  "timeAmPm": "오전",
  ...
}
</order_data>

<phase>confirm</phase>
<intent>AUTO_REPLY</intent>"
    ↓
서버 측 파싱
    ├─ <order_data> 추출 → lunch_conversations.ai_order_data 저장 (TEXT, m017)
    ├─ <phase> 추출 → lunch_conversations.ai_phase 저장
    ├─ <intent> 추출 → 라우팅 결정
    └─ 본문 (태그 제거) → ai_draft 저장
    ↓
클라이언트 (LunchChatView)
    ├─ ai_draft 표시 (사용자에게 보일 본문)
    ├─ ai_order_data 가 있으면 "주문 등록" 버튼 활성화
    └─ 클릭 → Orders 탭의 신규 주문 모달 자동채움
```

## JSON Schema

```json
{
  "vendorName": "string",        // 상호명 (자동 매칭됨)
  "date": "YYYY-MM-DD",          // 수거 날짜
  "timeAmPm": "오전|오후|야간",   // 시간대
  "timeHour": "string",          // 12h 시 (예: "2")
  "timeMinute": "string",        // 분 (예: "30")
  "boxCount": "string",          // 개수 (숫자 문자열)
  "pickupAddress": "string",     // 수거주소
  "ownerPhone": "string",        // 사장님 연락처
  "siteContact": "string",       // 현장 담당자명/연락처
  "notes": "string",             // 출입방법 등 특이사항
  "settlementType": "link_pay|monthly_invoice|tax_invoice"
}
```

### 필드 누락 처리
- 없는 필드는 빈 문자열로 (system prompt 명시)
- 필수 정보 (date / boxCount / pickupAddress) 누락 → AI 가 confirm 까지 진입 안 함, order Phase 유지하며 재질문

### settlementType 매핑
- 카드결제 / 링크페이 → `link_pay`
- 계좌이체 → `tax_invoice` (사장님이 명시 안 했으면)
- 월말정산 → `monthly_invoice` (벤더 기본 settlement_type 우선)

## 파싱 정규식

```ts
// 서버 측 (lib/ai/lunch-ai.ts)
const orderDataMatch = response.match(/<order_data>([\s\S]*?)<\/order_data>/);
let orderData: Record<string, string> | null = null;
if (orderDataMatch) {
  try {
    orderData = JSON.parse(orderDataMatch[1].trim());
  } catch {
    orderData = null; // silent fail
  }
}
```

`[\s\S]*?` — non-greedy + 줄바꿈 포함.
JSON 파싱 실패 시 silent fail (운영 안전).

## 클라이언트 측 처리

### 메시지 렌더 (`LunchChatView.tsx`)
```tsx
function renderMessage(content: string) {
  // <order_data> 태그 제거 후 본문만 표시
  const cleaned = content
    .replace(/<order_data>[\s\S]*?<\/order_data>/, "")
    .replace(/<phase>.*?<\/phase>/, "")
    .replace(/<intent>.*?<\/intent>/, "")
    .trim();
  return <Markdown>{cleaned}</Markdown>;
}
```

### "주문 등록" 버튼
```tsx
const orderData = JSON.parse(conv.aiOrderData ?? "null");
{orderData && (
  <button onClick={() => openOrderModal(orderData)}>
    주문 등록
  </button>
)}
```

### 모달 자동채움
```tsx
function openOrderModal(orderData: Record<string, string>) {
  setForm({
    date: orderData.date ?? "",
    pickupTime: composePickupTime(orderData.timeAmPm, orderData.timeHour, orderData.timeMinute),
    boxCount: orderData.boxCount ?? "",
    pickupAddress: orderData.pickupAddress ?? "",
    siteContact: orderData.siteContact ?? "",
    notes: orderData.notes ?? "",
    settlementType: orderData.settlementType ?? vendor.settlement_type,
    // vendor 자동 매칭은 vendorName 으로
  });
}
```

## DB 저장

### `lunch_conversations.ai_order_data` (m017)
- TEXT (JSON 문자열)
- 모달 닫기 후 재방문 시 복원용
- 주문 등록 후에는 null 로 비움 (다음 신규 주문에 재사용 안 되게)

## 실패 케이스

### JSON 형식 오류
- AI 가 잘못된 JSON 출력 (드물게)
- 클라이언트 파싱 실패 → 모달 자동채움 안 됨
- 본문 텍스트는 정상 표시 → 상담사가 수동 입력

### 정보 부족
- date 또는 boxCount 가 빈 문자열
- 클라이언트가 필수 필드 검사 → 모달에 빈 값 표시 + 상담사가 보강

### 다중 주문
- 사장님이 "내일과 모레 둘 다" 같이 요청
- AI 는 한 번에 1건만 파싱
- 나머지는 inquiry Phase 로 안내 ("내일 건은 등록 도와드렸어요. 모레 건은 다시 한번 알려주시면 등록 도와드리겠습니다 :)")

### 벤더 자동 매칭 실패
- vendorName 이 lunch_vendors 와 정확 매칭 안 됨 (오타·축약 등)
- 모달에서 vendor 드롭다운으로 수동 선택

## A/B 테스트 / 디버깅

### 디버그 모드
- `lunch_conversations.ai_order_data` 직접 읽기
- 또는 SuggestDebugPanel 같은 도구 (현재 미구현)

### 회귀 테스트
- 같은 메시지로 여러 번 호출해 일관성 검증
- 특히 야간 / 주간 / 한솥 가격 분기 정확성

## 변경 가이드

### 새 필드 추가 (예: `discountAmount`)
1. `lib/ai/lunch-prompt.ts` 의 `<order_data>` schema 에 추가
2. 클라이언트 파서 (`LunchChatView.tsx`) 에서 추출
3. 모달 form 에 새 input 추가
4. lunch_orders 테이블 컬럼 추가 + migration
5. lib/store/lunch-orders.ts 갱신

### 필드 제거
- 운영 데이터에 영향 안 미치게 — 모든 호출처 grep
- DB 컬럼은 보수적으로 유지 (deprecated 컬럼은 NULL 허용 + 점진 제거)

### 다중 주문 지원 (미래)
- `<order_data>` 를 `<order_data_list>` 로 array 화
- 클라이언트 모달이 여러 주문 batch 등록 지원
- AI 프롬프트에 다중 주문 케이스 예시 추가

## 자주 깨지는 곳

### AI 가 confirm 갔는데 <order_data> 태그 누락
- system prompt 의 "confirm Phase에서 필수" 강조 보강
- AiCompareModal 류로 회귀 검증

### 같은 사장님 여러 번 confirm — 중복 등록
- 클라이언트 측 가드 — 직전 ai_order_data 와 동일하면 모달 안 띄우기
- 또는 lunch_orders INSERT 시 (vendor_id, date, pickup_time) UNIQUE constraint 검토

### 가격 자동 계산 오류
- 야간 / 주간 잘못 분류
- 처리요금 단가 실수 (500원 vs 400원)
- 정책 위반 — system prompt 의 "금액 계산 방법" 명확화

### 시간 파싱 모호
- "오후 12시" → 정오인지 자정인지 (정오 표준)
- "12시" 단독 → 오전/오후 어느쪽? (직전 컨텍스트 고려)
- system prompt 보강 또는 코드 측 후처리
