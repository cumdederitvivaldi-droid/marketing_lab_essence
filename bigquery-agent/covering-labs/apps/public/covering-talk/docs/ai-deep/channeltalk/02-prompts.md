# 채널톡 — 프롬프트 구조 + 변경 가이드

> 채널톡은 방문수거·런치와 달리 **단일 정적 SYSTEM_PROMPT 가 없음** — 카테고리별 prompt_rules + base + 정책 + RAG 인용 + customer context 를 동적으로 조립.
> 위치: `lib/channeltalk-ai/suggest.ts` (base + TONE_GUIDE) + `category_prompts` 테이블 (DB) + `lib/ai/lunch-policy.md` 같은 외부 정책 문서 (정책 섹션 원본).

## prompt 조립 흐름

```
buildAnswerPrompt({
  category,
  categoryPrompt,    // DB 에서 fetch (5분 캐시)
  policySections,    // 정책 섹션 합집합
  matches,           // RAG top-K Q&A
  customerContext,   // 백오피스 정보 (있으면)
  serviceArea,       // 지역 검증 결과
  recentTurns,       // 최근 대화
  inputTags,         // 채널톡 chat 태그
})
  ↓
조립 결과:
  ├─ base 프롬프트 (suggest.ts 안 정적, ~500줄)
  ├─ TONE_GUIDE (스타일 가이드)
  ├─ categoryPrompt.prompt_rules (DB)
  ├─ "정책 참조" — policySections 인용
  ├─ "유사 사례" — matches Q&A 인용
  ├─ "고객 정보" — customerContext block
  ├─ "지역 검증" — serviceArea block
  ├─ "현재 대화" — recentTurns
  └─ "추가 태그" — inputTags
```

## base 프롬프트 (suggest.ts 안)

코드 안에 정적 정의 — 채널톡 AI 의 정체성·페르소나·기본 규칙.

핵심:
- "당신은 커버링 상담사 AI" 페르소나
- 친근하지만 정중한 톤
- 정책 외 임의 안내 금지
- 백오피스 정보가 있으면 직접 인용
- 카테고리 외 질문은 NEED_HUMAN 또는 cannotAnswer

## TONE_GUIDE (Haiku 톤 다듬기)

```
[인사/시작]
- 첫 응대: "안녕하세요, 커버링 입니다." (밝은 톤)
- 오전 10시 이후 1시간 이상 기다린 고객: "...금일 문의량 급증으로 답변이 지연된 점 양해 부탁드립니다."
- 문의 내용 없이 연결된 고객: "안녕하세요, 커버링 입니다. 문의 내용을 작성해 주시면 확인 후 안내드리겠습니다!"
- 이미 대화 중: 인사 생략, 바로 본론

[말투 핵심]
- 정중 + 친근
- 이모지 적당히 (1~2개 / 응답)
- "고객님" 호칭 적절히
- 마무리는 "감사합니다 :)" 같이 부드럽게
```

(suggest.ts 안의 TONE_GUIDE 상수 — 전체는 코드 참조)

Haiku 호출 시 system prompt 로 들어가서 본문 rewriting.

## category_prompts 테이블 (DB)

스키마:
```sql
CREATE TABLE category_prompts (
  id SERIAL PRIMARY KEY,
  category_id TEXT UNIQUE NOT NULL,    -- 예: "이용_배출품목"
  category_name TEXT NOT NULL,          -- 예: "배출/품목"
  parent_category TEXT,                 -- 예: "서비스이용"
  prompt_rules TEXT NOT NULL,           -- 카테고리별 답변 규칙
  policy_sections TEXT[] DEFAULT '{}',  -- 참조할 정책문서 섹션 목록
  ai_scope_note TEXT,                   -- AI 답변 범위 참고
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by TEXT
);
```

### `prompt_rules` 예시 (이용_배출품목)
```
배출 가능 품목 안내:
- 80L / 220L 봉투
- 음식물쓰레기 봉투 (50L 이하)
- 일반 종량제 봉투

배출 불가:
- 가구·가전·자재 → 방문수거 (별도 채널 안내)
- 도시락 폐기물 → 런치 서비스 안내
- 의료폐기물·위험물 → NEED_HUMAN

답변 규칙:
- 배출 가능 품목 명확히 안내
- 배출 불가 품목은 대체 서비스 안내
- 이모지 1개 이내
- 봉투 가격은 정책 섹션 참조 (절대 임의 추정 X)
```

### `policy_sections` 예시
```
["배출품목", "분리수거", "봉투규격"]
```

→ `getAccumulatedPolicySections(categories)` 가 모든 카테고리의 sections 합집합 → 그 섹션들의 본문을 정책 문서에서 fetch → prompt 에 inline.

### `ai_scope_note` 예시
```
가격 변경은 절대 안내하지 마. 변경 안내는 운영팀 공지 후 prompt_rules 갱신.
```

운영자가 AI 한계·주의사항 메모.

## getCategoryPrompt 캐시

```ts
// lib/channeltalk-ai/category-prompts.ts
const CACHE_TTL = 5 * 60 * 1000; // 5분
let cache: Map<string, CategoryPrompt> | null = null;

async function loadAllPrompts(): Promise<Map<string, CategoryPrompt>> {
  if (cache && Date.now() - cacheTime < CACHE_TTL) return cache;
  // ... DB 로드 후 cache 갱신
}
```

운영자가 `category_prompts` 갱신 → 5분 안에 반영 (또는 다음 cache miss 시).
즉시 반영 필요 시 Vercel function 재배포.

## customerContext block (백오피스 정보)

`buildCustomerContextBlock(ctx)`:
```
고객 정보 (백오피스 조회 결과):
- 이름: 홍길동
- 전화: 010-XXXX-XXXX
- 가입일: 2025-08-15
- 구독: 220L 주 2회 (활성)
- 최근 주문: 2026-04-25 220L 1팩
- 미결제: 없음
- 메모: 강아지 있음 (벨 누르지 마세요)
```

AI 가 답변에서 직접 참조 가능:
- "고객님, 가입일 2025-08-15 부터 사용해주신 주 2회 220L 구독 확인했습니다 :)"

## serviceArea block (지역 검증)

```ts
// lib/channeltalk-ai/service-area.ts
export async function lookupServiceArea(message: string): Promise<{
  isServiceable: boolean;
  region: string;
  detail: string;
}>
```

서비스 가능 여부 + 인근 정보. AI 가 정확한 안내 (서비스 안 되는 지역 → 정중한 거절).

## suggest variants 별 prompt 차이

### `generatePolicyAnswer` (메인)
- base + TONE_GUIDE + categoryPrompt + policySections + matches + customerContext + serviceArea + recentTurns
- 가장 풍부한 컨텍스트
- 사용 케이스: 일반 정책 질의

### `generatePolicyAnswerDirect` (빠른)
- base + categoryPrompt 만 (RAG 생략)
- 사용 케이스: Stage 1 분류 결과 명확하고 정책만으로 답변 가능 시
- 비용 절감 + latency 감소

### `generateCombinedAnswer` (복수 카테고리)
- 카테고리가 2~3개 매칭됐을 때
- 모든 categoryPrompt + 모든 policySections 합집합
- 사용 케이스: 한 메시지에 여러 주제 (예: "쿠폰 사용법이랑 결제방법 알려주세요")

### `generateAiThenHuman` (AI + 상담사 결합)
- AI 답변 + "더 자세한 사항은 상담사가 안내드리겠습니다" 패턴
- 사용 케이스: 부분적으로만 답변 가능한 케이스

### `generateMacroAnswer` (매크로만)
- 정책·RAG 생략 + macro_embeddings 매칭만
- 사용 케이스: 매우 일반적 질문 (예: "운영시간 알려주세요")
- 가장 빠름

## 카테고리 추가 / 변경

### 새 카테고리 추가 절차
1. `lib/channeltalk-ai/normalize.ts` 의 `Category` type 에 추가
2. `lib/channeltalk-ai/category-labels.ts` 의 `CATEGORY_LABELS` 에 추가
3. `category_prompts` 테이블 INSERT (Supabase Studio 또는 `/api/settings/category-prompts` PATCH)
4. Stage 1 분류 prompt 재학습 필요 가능성 (외부 파이프라인 — `tools/channeltalk-ai/`)
5. 정책 섹션이 새로 필요하면 정책 문서 (`tools/channeltalk-ai/policy-document.md`) 갱신 후 재임베딩

### prompt_rules 변경
- DB UPDATE 또는 `/api/settings/category-prompts` PATCH
- 5분 안에 반영 (캐시)
- 즉시 반영 필요 시 재배포

### 정책 변경
- `tools/channeltalk-ai/policy-document.md` 편집
- `embed-consultations.ts` 재실행 → `consultation_embeddings` 갱신
- 운영팀 작업 (자세히는 `tools/channeltalk-ai/README.md`)

## 변경 시 주의

### prompt_rules 직접 변경 vs 정책 문서 변경
- prompt_rules: 답변 규칙·톤 (즉시)
- 정책 문서: 사실 정보 (재임베딩 필요)

### TONE_GUIDE 변경
- `lib/channeltalk-ai/suggest.ts` 직접 편집 → 빌드·배포 필요
- 영향: 모든 카테고리 답변의 톤

### A/B 테스트
- AiCompareModal (UI) — 같은 메시지로 prompt 변경 전/후 비교
- 운영 검증 가치 있음

## 모델 사용 매트릭스

| Step | 모델 | 비용 |
|---|---|---|
| Stage 1 분류 | Sonnet | ~$0.005 |
| 답변 생성 (variants) | Sonnet (caching) | ~$0.005 ~ $0.015 |
| 톤 다듬기 | Haiku | ~$0.0005 |
| 임베딩 | Voyage `voyage-2` | ~$0.00012 |

Provider 전환 (anthropic ↔ openai) — `app_settings.ai_provider`. Voyage 는 별개 (전환 불가).

## 자주 깨지는 곳

### prompt_rules 가 stale
- 운영 정책 변경 후 DB 갱신 안 됨
- AI 답변이 옛 정책 안내 (예: 가격, 사용법)
- 검증: 운영팀이 주기적으로 prompt_rules 검토

### 캐시 hit 후 옛 prompt
- 5분 TTL 안에 변경한 prompt 미반영
- 강제 재배포 또는 5분 대기

### 카테고리 분류 오류
- Stage 1 prompt 약함 → AI 가 잘못 분류
- 결과: 답변이 엉뚱한 카테고리 prompt_rules 사용
- 해결: 분류 prompt 보강 + negative example
