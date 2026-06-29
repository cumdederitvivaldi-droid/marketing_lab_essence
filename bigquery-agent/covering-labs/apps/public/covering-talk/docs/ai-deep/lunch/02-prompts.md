# 런치 — 프롬프트 본문 + 변경 가이드

> 위치: `lib/ai/lunch-prompt.ts` (229줄, 동적 prompt builder) + `lib/ai/lunch-policy.md` (159줄, 빌드 타임 로드).
> 핵심 export: `buildLunchSystemPrompt(params)`.

## buildLunchSystemPrompt 구조

방문수거의 정적 SYSTEM_PROMPT 와 달리 **벤더·주문이력·지역가격 등 컨텍스트를 inline 한 동적 prompt**.

### 입력 파라미터
```ts
interface BuildParams {
  phase: "idle" | "order" | "confirm" | "inquiry";
  vendorName: string;
  isNewVendor: boolean;
  regionPricesContext: string;     // 지역별 가격 요약 (예: "서울 강남구: 5,000원\n...")
  recentOrders?: PromptOrderSummary[];  // 최근 10건
}
```

### 출력 구조
```
당신은 "커버링 런치" 상담 AI입니다. ...

## 기본 규칙
- 친근하고 간결한 비즈니스 톤
- 마크다운 사용 금지
- 이모지 사용 금지 (`:)` 만 허용)
- 서비스 가능 지역: 서울/경기/인천만

## 현재 상태
- 벤더명: {vendorName}
- 신규 고객 여부: {isNewVendor}
- 현재 Phase: {phase}

## 해당 벤더의 최근 주문 이력 (최신순)
{ordersContext}

## Phase별 행동 규칙
### idle / order / confirm / inquiry

## 금액 계산 방법
{regionPricesContext}

## 주문 정보 파싱
## 주문 데이터 출력 (confirm Phase에서 필수)
## 의도 분류
## 정책 문서 inline
{policyText from lib/ai/lunch-policy.md}
```

## 핵심 규칙

### 톤 (방문과 다름)

> - 친근하고 **간결한 비즈니스 톤**
> - **마크다운 사용 금지** (`**`, `*`, `#`, `-`, 코드블록 등 절대 사용 X) — 순수 텍스트만
> - **이모지 사용 금지**. 단, `:)` 텍스트 이모티콘만 사용 가능
> - 모든 금액은 **부가세 포함**

### 인사말 — 벤더명 부르지 마

> 첫 인사는 "안녕하세요 커버링 런치입니다 :)" 로 **고정**.
> "[상호명]님" 같은 호칭 사용 금지.
>
> 이유: 벤더명은 가게 이름이지 개인명이 아님 → "카페 ABC 강남점님" 은 어색.

### 서비스 지역 제한

> 서울 / 경기 / 인천만 가능. 그 외 지역은 NEED_HUMAN.

### 야간 vs 주간

> - 야간: 오후 10시 ~ 오전 6시 고정. **시간 지정 불가** (기사 동선 따라 진행)
> - 주간: 그 외
> - 주의: 고객이 "야간 9시" 요청 시 → 야간 아님, **오후 수거** 안내 + 재확인
> - 주의: 고객이 "야간 몇 시" 요청 시 → "야간은 시간 지정 어렵다" 안내

## 금액 계산 (system prompt 안 인라인)

```
1. 주소에서 지역(구/시) 추출
2. 지역별 수거요금 조회 (regionPricesContext)
3. 처리요금 계산:
   - 기본: 도시락 개수 × 500원
   - 한솥: 도시락 개수 × 400원
4. 야간 수거:
   - 수거요금 = 0원
   - 처리요금만 적용
   - 최소 10,000원 (20개 미만이어도)
5. 총 비용 = 수거요금 + 처리요금
```

방문수거의 quote/calculate API 와 달리 **prompt 안에서 AI 가 직접 계산**. 산식이 단순해서 이렇게 함.

## confirm Phase 응답 형식 (강제)

```
수거 접수 확인드립니다 :)

접수 내역
- 날짜: [날짜] ([시간대])
- 주소: [주소]
- 도시락: [개수]개
- 담당자: [연락처]

예상 비용
- 수거요금: [금액]원 ([지역])
- 처리요금: [금액]원 ([단가]원 x [개수]개)
- 합계: [총금액]원 (부가세 포함)

수량 변경 시 미리 말씀 부탁드립니다!
감사합니다 :)
```

이 패턴 + `<order_data>` JSON 태그 둘 다 응답에 포함.

## 결제방법 안내

> 결제 방법: **계좌이체 / 카드결제 2가지만** 안내
> - 링크페이 = 카드결제
> - 세금계산서 / 월말정산 = 계좌이체에 해당

settlement_type 매핑:
- 카드결제 → `link_pay`
- 계좌이체 → `tax_invoice` (또는 `monthly_invoice`)

## 의도 분류 — `<intent>` 태그

```
<intent>AUTO_REPLY</intent> — AI 직접 답변 가능
<intent>NEED_HUMAN</intent> — 상담사 확인 필요
```

### NEED_HUMAN 케이스
- 행사 수거 문의
- 견적서 요청
- 당일 시간 변경
- 미수거 / 클레임
- 도시락 외 문의
- 서비스 지역 외

## Phase 결정 — `<phase>` 태그

```
<phase>idle|order|confirm|inquiry</phase>
```

방문수거와 달리 **AI 가 직접 다음 phase 결정**해서 응답에 태그로 포함. 서버는 그것을 그대로 저장 (별도 phase-transitions.ts 같은 결정 로직 없음).

## 변경 가이드

### 톤 변경 (예: 더 친근)
- `lib/ai/lunch-prompt.ts` 의 "기본 규칙" 또는 "Phase별 행동 규칙" 편집
- 즉시 다음 호출부터 적용

### 가격 정책 변경
- `app_settings` 의 가격 키가 아니라 `lib/ai/lunch-prompt.ts` 의 "금액 계산 방법" 직접 편집
- 또는 `region_prices` DB 갱신 (regionPricesContext 가 DB 에서 fetch)

### 정책 문서 (`lunch-policy.md`)
- 빌드 타임 로드 — 수정 후 **빌드 후 배포 필수**
- 내용:
  - 시간대 운영 (야간 / 주간)
  - 결제 방법
  - 미수거 / 클레임 처리
  - 행사 수거
  - 견적서 발행
  - 정기 수거 사이클
  - FAQ

### 새 NEED_HUMAN 케이스 추가
- system prompt 의 "의도 분류" 섹션에 추가
- AI 가 다음 호출부터 해당 패턴 시 NEED_HUMAN 반환

### 새 Phase 추가
- `LunchPhase` type 갱신 (lunch-prompt.ts:36)
- "Phase별 행동 규칙" 섹션 추가
- 서버 측 ai_phase 컬럼 (lunch_conversations.ai_phase) 가 enum 외 값도 허용해서 DB 마이그레이션 불필요

### 주문 데이터 필드 추가
- `<order_data>` JSON schema 갱신 (system prompt)
- 클라이언트 (`components/lunch/LunchChatView.tsx`) 의 파서 갱신
- DB (`lunch_orders` 또는 `lunch_conversations.ai_order_data`) 컬럼 추가 (필요 시)

## 모델 / 비용

| 항목 | 값 |
|---|---|
| 기본 모델 | Sonnet (`claude-sonnet-4-6`) |
| Provider 전환 | `app_settings.ai_provider` (anthropic / openai) |
| 호출 빈도 | 메시지 1건당 1회 |
| 평균 응답 시간 | 1~3초 |
| 비용 | 메시지당 ~$0.005 ~ $0.02 |

## 컨텍스트 inline 의 부담

system prompt 가 매번 다음을 inline:
- 벤더 정보 (~50 토큰)
- 최근 주문 10건 (~500 토큰)
- 지역 가격 (~200 토큰)
- 정책 문서 (~3000 토큰)

→ 매 호출 ~4000 토큰 입력. Sonnet input 비용 영향 있음.

최적화 옵션 (미구현):
- 정책 문서를 prompt cache (Anthropic prompt caching) 로 분리
- 주문 이력은 5건으로 줄임
- 지역 가격은 해당 벤더 지역만

## 자가 검수 (응답 형식 강제)

system prompt 의 "기본 규칙" 이 마크다운/이모지 금지 명시. AI 가 응답 작성 시 자체 검사:
- `**` `*` `#` `-` 등 마크다운 패턴 발견 → 재생성
- 이모지 (😊, 🎉 등) 발견 → 제거 후 `:)` 로 교체

이는 system prompt 측 강제이므로 100% 보장 안 됨. 발송 직전 sanitizer 검토 가치 (현재 미구현).
