# 채널톡 — RAG (Voyage 임베딩 + 매칭 + 스코어링)

> Retrieval-Augmented Generation — Q&A·매크로·정책 임베딩 검색 → AI 답변에 인용.
> 위치: `lib/channeltalk-ai/suggest.ts` (스코어링) + `lib/ai/voyage.ts` (임베딩) + Supabase RPC.

## 임베딩 데이터 소스

| 테이블 | 내용 | 생성 |
|---|---|---|
| `consultation_embeddings` (m003) | Q&A 페어 + 정책 청크 | `tools/channeltalk-ai/embed-consultations.ts` (외부 파이프라인) |
| `macro_embeddings` (m004) | CS 매크로 172건 | `tools/channeltalk-ai/embed-macros.ts` |
| `service_areas` (m006) | 행정동 마스터 (임베딩 없음 — 텍스트 검색) | `tools/channeltalk-ai/seed-service-areas.ts` |

## Voyage 임베딩

```ts
// lib/ai/voyage.ts
export async function embedText(text: string): Promise<number[]>
```

- 모델: `voyage-2`
- 차원: 1536
- 한국어 강세
- 비용: ~$0.0001 / 1K 토큰

## RAG 검색 흐름

```ts
// lib/channeltalk-ai/suggest.ts (개념)
const queryEmbedding = await embedText(normalizedMessage);

const [consultations, macros] = await Promise.all([
  supabase.rpc("match_consultations", {
    query_embedding: queryEmbedding,
    match_threshold: 0.5,
    match_count: 10,
  }),
  supabase.rpc("match_macros", {
    query_embedding: queryEmbedding,
    match_threshold: 0.5,
    match_count: 10,
  }),
]);
```

### Supabase RPC (`match_consultations` 등)
- 코사인 유사도 기준
- top-K (보통 10)
- threshold (0.5 이하 제외)

## 스코어링 — `scoreCandidate`

`suggest.ts:357` — 각 candidate 에 종합 점수 계산:

```ts
function scoreCandidate(c: Candidate, ...): ScoredCandidate {
  const similarity = c.similarity;                            // 0~1
  const tagScore = calcTagScore(c.tags, inputTags);           // 태그 일치도
  const categoryScore = calcCategoryScore(c.category, ...);   // 카테고리 매칭
  const similarityScore = calcSimilarityScore(similarity);    // 유사도 가중치

  return {
    ...c,
    score: tagScore + categoryScore + similarityScore,
  };
}
```

### 가중치 — `SCORING_WEIGHTS`
```ts
// lib/channeltalk-ai/types.ts
export const SCORING_WEIGHTS = {
  similarity: 100,      // 코사인 유사도 (0~1 → 0~100)
  category_match: 50,   // 카테고리 매칭 시 보너스
  tag_match_each: 10,   // 태그 일치 1개당
};
```

### `calcSimilarityScore(similarity)`
```ts
function calcSimilarityScore(similarity: number): number {
  return Math.round(similarity * SCORING_WEIGHTS.similarity);
}
```

### `calcTagScore(candidateTags, inputTags)`
- 입력 태그 (chat 의 채널톡 태그) ↔ candidate 태그 일치 개수 × 10
- 노이즈 태그 제외 (`EXCLUDE_TAG_PREFIXES`, `EXCLUDE_TAGS`)

### `calcCategoryScore(candidateCategory, classifiedCategories)`
- 분류된 카테고리와 일치하면 +50
- 안 일치하면 0

## 임계값 — `POLICY_ANSWER_THRESHOLD = 60`

```ts
// suggest.ts:30
const POLICY_ANSWER_THRESHOLD = 60;
```

스코어 60 미만 candidate 는 제외. 즉:
- 유사도만 0.6 (60점) → 카테고리·태그 일치 없으면 통과
- 유사도 0.4 (40점) + 카테고리 일치 (+50) → 90점, 통과

## 매칭 결과 활용

### 답변 생성에 inline
top 3~5 candidate 의 본문을 prompt 에 inline:
```
유사 사례:
1. Q: "수거 시간은 어떻게 되나요?"
   A: "수거 가능한 시간은 오전 9시 ~ 오후 8시입니다 :)"
2. Q: "주말도 수거 가능한가요?"
   A: "네, 주말 / 공휴일 모두 운영합니다 :)"
3. ...
```

AI 가 이를 참조해 답변 작성.

### 매크로 후보 — SuggestPanel 별도 표시
`macros` 배열로 반환 → 상담사가 매크로 직접 선택 가능 (AI 답변 무시하고).

## 정책 섹션 — 별도 RAG 아님

`getAccumulatedPolicySections(categories)`:
- `category_prompts.policy_sections` 의 합집합
- 정책 섹션 ID → 정책 문서 본문 fetch (코드 안 또는 DB)
- prompt 에 inline

→ 임베딩 검색이 아닌 카테고리 → 섹션 매핑.

## 서비스 지역 검증 — `service-area.ts`

```ts
// lib/channeltalk-ai/service-area.ts
export async function lookupServiceArea(message: string): Promise<{
  isServiceable: boolean;
  region: string;
  detail: string;
}>
```

- 메시지에서 주소 / 지역명 추출
- `service_areas` 테이블 조회 (행정동 기준)
- 서비스 가능 여부 + 인근 정보

임베딩 검색이 아닌 텍스트 매칭.

## 디버그 — `ragHits`

```ts
interface SuggestResult {
  ragHits: Array<{
    type: "consultation" | "macro";
    id: number;
    similarity: number;
    score: number;
    question: string;
    answer: string;
    category: string;
  }>;
  // ...
}
```

SuggestDebugPanel 에서 표시 — top-K + 점수 + 매칭 본문.

운영 디버그 시 사용:
- 왜 이 답변이 나왔는지 추적
- 매칭 정확도 검증
- 임계값 조정 검토

## 인덱스 / 성능

### pgvector 인덱스
`migrations/001_pgvector_embeddings.sql` 에 정의:
```sql
CREATE INDEX consultation_embeddings_embedding_idx
ON consultation_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

- ivfflat — 근사 nearest neighbor (정확도 vs 속도 트레이드)
- lists = 100 — 데이터 크기에 따라 조정

### 응답 속도
- Voyage 임베딩: ~100ms
- pgvector 검색: ~50ms (인덱스 적용)
- 합계 RAG 단계: ~200ms

## 데이터 갱신

### 새 Q&A 추가
1. `tools/channeltalk-ai/consultation-pairs.json` 에 추가 (운영팀)
2. `embed-consultations.ts` 재실행 → DB INSERT

### 새 매크로 추가
1. `macros` 테이블 INSERT (Supabase Studio 또는 `/api/macros` PATCH)
2. `tools/channeltalk-ai/embed-macros.ts` 재실행 → `macro_embeddings` INSERT

### 정책 변경
1. `tools/channeltalk-ai/policy-document.md` 편집
2. `embed-consultations.ts` 재실행 (정책 청크도 같은 테이블 사용)

## 자주 깨지는 곳

### 1. RAG 매칭 부정확
- 증상: 답변에 무관한 정책·매크로 인용
- 원인: 임베딩 노이즈 + 임계값 부적절
- 수정:
  - 정책 문서 청킹 단위 조정 (너무 길면 노이즈)
  - 임계값 조정 (`POLICY_ANSWER_THRESHOLD`)
  - top-K 줄임 (10 → 5)
  - 외부 파이프라인 재임베딩

### 2. 매칭 0건 (RAG 빈 결과)
- 증상: 답변에 인용 없음, 일반론적
- 원인: threshold 가 너무 높음 또는 임베딩 데이터 부족
- 수정: threshold 낮춤 또는 데이터 추가

### 3. 같은 매크로 반복 매칭
- 증상: 여러 카테고리에서 같은 매크로가 top
- 원인: 매크로 본문이 일반적 (예: "감사합니다 :)")
- 수정: 너무 일반적인 매크로는 카테고리 라벨 추가 또는 제외

### 4. Voyage API 한도
- 증상: 임베딩 호출 429
- 수정: Voyage 콘솔에서 한도 상향 또는 batch 처리

### 5. pgvector 인덱스 stale
- 증상: 새 임베딩 INSERT 후 검색 결과에 안 나옴
- 수정: VACUUM ANALYZE 또는 인덱스 재구성

## SQL 자주 쓰는 패턴

### 임베딩 데이터 검증
```sql
SELECT COUNT(*) FROM consultation_embeddings;
SELECT category, COUNT(*) FROM consultation_embeddings
GROUP BY category ORDER BY COUNT(*) DESC;
```

### 특정 메시지 매칭 직접 테스트 (debug)
```sql
-- query_embedding 은 미리 voyage 호출해서 얻어야 함
SELECT id, question, answer, category,
       1 - (embedding <=> $1::vector) AS similarity
FROM consultation_embeddings
WHERE 1 - (embedding <=> $1::vector) > 0.5
ORDER BY similarity DESC LIMIT 10;
```

## 변경 시 주의

- 임계값 (`POLICY_ANSWER_THRESHOLD`) 변경 → 모든 답변 영향
- 가중치 (`SCORING_WEIGHTS`) 변경 → 매칭 우선순위 변화
- pgvector 인덱스 lists 조정 → 검색 속도/정확도 트레이드
- Voyage 모델 변경 → 모든 임베딩 재생성 필요 (큰 작업)
