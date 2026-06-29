# 채널톡 — 4단계 파이프라인 Sequence

> 분류 → RAG → 답변 생성 → 톤 다듬기. 모든 데이터 ephemeral (DB 저장 없음 — 분류 카운트만 channeltalk_reply_logs).
> 위치: `lib/channeltalk-ai/suggest.ts` (1252줄, 메인) + `normalize.ts`, `category-prompts.ts`, `validate.ts`, `service-area.ts`.

## 전체 sequence

```
[채널톡 chat 선택] → SuggestPanel
    ↓
POST /api/channeltalk-ai/suggest (또는 stream)
    ↓
suggestAnswers(params)
    │
    ├─ 1. normalizeAndClassify (Sonnet)
    │       ├─ 메시지 정규화 (오타·반복 제거)
    │       ├─ 카테고리 분류 (19개 중 1~3개)
    │       ├─ Stage 0: 재방문 판별 (continuing / new / combined)
    │       └─ 입력 태그 추출 (chat 의 채널톡 태그)
    │
    ├─ 2. RAG 병렬 로드
    │       ├─ embedText(query) — Voyage AI 임베딩
    │       ├─ supabase.rpc("match_consultations") — Q&A top-K
    │       ├─ supabase.rpc("match_macros") — 매크로 top-K
    │       ├─ getCategoryPrompt(category) — DB 카테고리별 prompt_rules (5분 캐시)
    │       ├─ getAccumulatedPolicySections(categories) — 정책 섹션 합집합
    │       └─ getServiceAreaInfo(message) — 지역 검증 (해당 시)
    │
    ├─ 3. 답변 생성 (Sonnet)
    │       ├─ buildAnswerPrompt(...) — base + category + RAG + customer context
    │       ├─ cachedMessageCreate (Anthropic prompt caching)
    │       └─ generatePolicyAnswer(...) — 메인. 또는 variants:
    │             ├─ generatePolicyAnswerDirect (단순)
    │             ├─ generateCombinedAnswer (복수 카테고리)
    │             ├─ generateAiThenHuman (AI 답변 + 상담사 안내 결합)
    │             └─ generateMacroAnswer (매크로만)
    │
    ├─ 4. 톤 다듬기 (Haiku, 선택)
    │       ├─ TONE_GUIDE 적용
    │       └─ 본문만 자연스러운 톤으로 rewriting
    │
    └─ 5. 결과 반환
            ├─ answer (최종 본문)
            ├─ answerWithoutTone (Haiku 적용 전)
            ├─ categories (분류 결과)
            ├─ stage0 (재방문 판별)
            ├─ macros (후보)
            ├─ policyRefs (인용 정책 섹션)
            ├─ ragHits (디버그용 — 매칭된 Q&A)
            └─ modelUsed (분류·생성·톤 별 model 정보)
    ↓
SuggestPanel 표시
    ├─ 추천 답변 본문
    ├─ 카테고리 라벨
    ├─ 매크로 후보
    └─ 디버그 (SuggestDebugPanel — 단계별 출력)
    ↓
상담사 액션
    ├─ 채택 → 입력창 자동 채움 → 발송
    ├─ 편집 → 수정 후 발송
    └─ 무시 → 직접 작성
    ↓
발송: POST /api/channeltalk-ai/suggest/send
    ├─ 채널톡 Open API (sendMessage) 호출
    └─ channeltalk_reply_logs INSERT (chat_id + manager + reply_kind + draft_char_overlap)
```

## suggestAnswers 진입점

```ts
// lib/channeltalk-ai/suggest.ts:914
export async function suggestAnswers(params: {
  chatId: string;
  messages: Array<{ role: "user" | "manager"; text: string; senderName?: string }>;
  userProfile?: ChannelTalkUser;
  inputTags?: string[];          // 채널톡 chat 의 기존 태그
  customerContext?: CustomerContext;  // 백오피스 lookup 결과
}): Promise<SuggestResult>
```

스트리밍 버전:
```ts
// suggest.ts:1072
export async function suggestAnswersStreaming(
  params: ...,
  onStep: (step: PipelineStep) => void
): Promise<SuggestResult>
```

`PipelineStep` 으로 단계별 결과 stream — SuggestPanel 의 디버그 뷰가 활용.

## 1단계 — normalizeAndClassify

`lib/channeltalk-ai/normalize.ts`

```ts
export type Category =
  | "이용_배출품목" | "이용_대형폐기물" | "이용_서비스안내" | "이용_주문관리"
  | "구독_관리" | "배송_현황" | "배송_이슈"
  | "미수거_정책위반" | "미수거_누락" | "미수거_출입실패"
  | "결제_안내" | "결제_이슈" | "앱_오류"
  | "수거_확인" | "오인수거" | "계정_정보" | "쿠폰" | "VOC" | "기타" | "빼기주문";

export async function normalizeAndClassify(messages, ...): Promise<{
  normalized: string;
  categories: Category[];
  stage0: "continuing" | "new" | "combined";
}>
```

### 처리
1. 메시지 마지막 N개 → 단일 문맥 문자열로 합침
2. Sonnet 호출 (분류 prompt)
3. 결과: 카테고리 1~3개 + Stage 0 (continuing/new/combined)

Stage 0 사용:
- `continuing` — 같은 챗에서 이전 응답 이어서
- `new` — 새 문의
- `combined` — 둘 다 (이전 챗 + 새 질문)

## 2단계 — RAG 병렬 로드

`suggest.ts:914` 안에서 Promise.all 로 병렬:

| 데이터 | 소스 | 함수 |
|---|---|---|
| 카테고리 prompt_rules | `category_prompts` 테이블 | `getCategoryPrompt(category)` (5분 캐시) |
| 정책 섹션 합집합 | `category_prompts.policy_sections` | `getAccumulatedPolicySections(categories)` |
| Q&A 페어 | `consultation_embeddings` | `supabase.rpc("match_consultations", { query_embedding, top_k })` |
| 매크로 후보 | `macro_embeddings` | `supabase.rpc("match_macros", { query_embedding, top_k })` |
| 지역 검증 | `service_areas` | `getServiceAreaInfo(message)` (해당 시만) |

### Voyage 임베딩
- 모델: `voyage-2` (한국어)
- 호출: `embedText(query)` (`lib/ai/voyage.ts`)
- 출력: 1536차원 vector

### Top-K 매칭
- consultation_embeddings: top 5~10
- macro_embeddings: top 5~10
- 코사인 유사도 기준
- threshold (60 이하면 candidate 제외) — `POLICY_ANSWER_THRESHOLD = 60`

자세한 스코어링: [`03-rag.md`](03-rag.md).

## 3단계 — 답변 생성

`buildAnswerPrompt` 가 system prompt 조립:
```
base 프롬프트 (suggest.ts 안 정적)
+ TONE_GUIDE (스타일)
+ getCategoryPrompt(category) — DB 의 prompt_rules
+ 정책 섹션 인용 (policy_sections)
+ Q&A 매칭 결과 (top-K)
+ customer context (백오피스 정보, 있으면)
+ 사용자 메시지 + 문맥
```

### Variant 함수들

| 함수 | 사용 케이스 |
|---|---|
| `generatePolicyAnswer` | 메인 — 카테고리별 정책 답변 |
| `generatePolicyAnswerDirect` | 단순 + 빠른 응답 (Stage 1 분류 결과 명확할 때) |
| `generateCombinedAnswer` | 복수 카테고리 (예: 결제 + 배송 둘 다) |
| `generateAiThenHuman` | AI 답변 후 "상담사가 자세히 안내" 추가 |
| `generateMacroAnswer` | 매크로만 (정책 RAG 없이 빠르게) |

### Anthropic prompt caching
`cachedMessageCreate` 가 system prompt 에 `cache_control: { type: "ephemeral" }` 적용:
- 같은 system 으로 N번 호출 시 첫 호출 후 90% 토큰 비용 절감
- TTL 5분 (Anthropic 정책)

## 4단계 — 톤 다듬기 (Haiku)

`TONE_GUIDE` 가 system prompt:
```
[인사/시작]
- 첫 응대: "안녕하세요, 커버링 입니다."
- 1시간+ 대기: "...금일 문의량 급증으로 답변이 지연된 점 양해 부탁드립니다."
- 이미 대화 중: 인사 생략

[말투 핵심]
...

[금지]
- 마크다운
- 과도한 이모지
- 정책 외 임의 안내
```

Haiku 호출 — 본문만 자연스럽게 rewriting. 정책·정보는 그대로.

선택 사항 — 빠른 모드에서는 스킵 가능 (variant 에 따라).

## 5단계 — 결과 반환

```ts
interface SuggestResult {
  answer: string;                  // 최종 (톤 적용 후)
  answerWithoutTone: string;       // Haiku 전
  categories: Category[];
  stage0: "continuing" | "new" | "combined";
  macros: MacroCandidate[];
  policyRefs: string[];
  ragHits: ConsultationMatch[];
  modelUsed: { classify: string; generate: string; tone?: string };
  cannotAnswer?: { reason: string; summary: string };  // AI 가 답변 불가 판단 시
}
```

`cannotAnswer` 가 set 되면 SuggestPanel 에 "AI 답변 불가 — 상담사 직접 처리" 표시.

## 발송 — POST /api/channeltalk-ai/suggest/send

```ts
// 입력
{
  chatId: string;
  message: string;          // 채택한 답변 (또는 수정본)
  managerName: string;
  draftCharOverlap: number; // AI draft 와의 일치율 (0~1)
}

// 처리
1. 채널톡 Open API sendMessage (botName=managerName)
2. channeltalk_reply_logs INSERT (chat_id, manager_name, reply_kind, draft_char_overlap, sent_at)
   - draftCharOverlap >= 1.0 → ai_auto
   - draftCharOverlap >= 0.6 → ai_assist
   - 그 외 → human
```

## 호출 빈도 (트래픽)

- 채팅 선택 시 자동 호출 (디바운스)
- 같은 chat 에 새 메시지 도착 시 재호출
- 운영 평균: 1 chat 당 1~5회 호출 (대화 turn 수 따라)
- 시간당 100~500 회 정도

## 모델 / 비용

| 단계 | 모델 | 비용 (호출당) |
|---|---|---|
| Stage 1 분류 | Sonnet | ~$0.005 |
| 답변 생성 | Sonnet (with caching) | ~$0.005 ~ $0.015 |
| 톤 (Haiku) | Haiku | ~$0.0005 |
| 임베딩 (Voyage) | voyage-2 | ~$0.00012 |
| **합계** | | ~$0.011 ~ $0.02 |

cache hit 률 따라 30~50% 절감 가능.

## 실패 fallback

| 단계 | 실패 | 처리 |
|---|---|---|
| Stage 1 | 분류 실패 | category = "기타" fallback |
| RAG | 임베딩 실패 | 매칭 없이 진행 (정책만으로 답변) |
| RAG | DB 매칭 0건 | candidate 없음 → policy 만 사용 |
| 답변 생성 | Sonnet timeout | answer = null + cannotAnswer 표시 |
| 톤 | Haiku 실패 | answerWithoutTone 그대로 사용 |

## 이전 응답 컨텍스트 (continuing)

`hasRealManagerReply(turns)` — 봇/워크플로우 메시지가 아닌 실제 상담사 응답이 있는지:
- 있으면 stage0 = continuing 가능성
- 없으면 stage0 = new
- 봇 이름 "커버링" 은 제외

## 백오피스 정보 inline (customerContext)

채널톡 응대 중 phone 발견 시:
1. 클라이언트가 `/api/backoffice/lookup` POST → 결과 받음
2. `suggestAnswers` 의 `customerContext` 파라미터로 전달
3. `buildCustomerContextBlock(ctx)` 가 system prompt 안에 inline:
   ```
   고객 정보 (백오피스 조회):
   - 이름: 홍길동
   - 전화: 010-XXXX-XXXX
   - 가입일: 2025-08-15
   - 최근 주문: 3건 ...
   ```
4. AI 답변에 직접 인용 가능

## 디버깅 (SuggestDebugPanel)

`suggestAnswersStreaming` + `onStep` 콜백으로 단계별 결과 스트림:
- Stage 1 결과 (categories + stage0)
- RAG 매칭 (top-K + 유사도 점수)
- buildAnswerPrompt 본문
- Stage 2 raw 응답 (Sonnet)
- 톤 적용 전후

운영 디버그 시 SuggestDebugPanel 토글하면 표시.
