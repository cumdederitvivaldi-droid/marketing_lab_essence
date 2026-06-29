# 채널톡 — 카테고리 정의 + 분류 결정

> 채널톡 AI 가 메시지를 분류하는 19개 카테고리 (이전 84+ 에서 운영 변경됨).
> 위치: `lib/channeltalk-ai/normalize.ts` (Category type) + `category-labels.ts` (UI 라벨) + `category_prompts` 테이블 (DB prompt_rules).

## 카테고리 카탈로그 (19개)

`lib/channeltalk-ai/category-labels.ts` 의 `CATEGORY_LABELS`:

| 카테고리 ID | UI 라벨 | parent | 사용 케이스 (예시) |
|---|---|---|---|
| `이용_배출품목` | 배출/품목 | 서비스이용 | "어떤 봉투 사용해야 하나요?" |
| `이용_대형폐기물` | 대형폐기물 | 서비스이용 | "냉장고도 수거 되나요?" → 방문수거 안내 |
| `이용_서비스안내` | 서비스안내 | 서비스이용 | "어떻게 신청하나요?" |
| `이용_주문관리` | 주문관리 | 서비스이용 | "주문 변경하고 싶어요" |
| `구독_관리` | 구독 | 구독 | "구독 해지하고 싶어요" |
| `배송_현황` | 배송현황 | 배송 | "오늘 수거 시간 알려주세요" |
| `배송_이슈` | 배송이슈 | 배송 | "수거 시간이 늦었어요" |
| `미수거_정책위반` | 정책위반 | 미수거 | "허가 안 되는 품목" 안내 |
| `미수거_누락` | 수거누락 | 미수거 | "수거 안 됐어요" |
| `미수거_출입실패` | 출입실패 | 미수거 | "기사가 못 들어왔어요" |
| `결제_안내` | 결제안내 | 결제 | "결제 방법 알려주세요" |
| `결제_이슈` | 결제이슈 | 결제 | "이중 결제 됐어요" |
| `앱_오류` | 앱오류 | 앱 | "앱이 안 켜져요" |
| `수거_확인` | 수거확인 | 운영 | "수거 됐는지 확인해주세요" |
| `오인수거` | 오인수거 | 운영 | "잘못 수거됐어요" |
| `계정_정보` | 계정정보 | 계정 | "비밀번호 변경" |
| `쿠폰` | 쿠폰 | 프로모션 | "쿠폰 어떻게 사용하나요?" |
| `VOC` | VOC | VOC | "불만 / 칭찬 / 제안" |
| `기타` | 기타 | — | 분류 안 되는 케이스 (fallback) |
| `빼기주문` | 빼기주문 | 운영 | (특수 — 운영팀 사용) |

## 카테고리 추가 / 변경

### 절차
1. `lib/channeltalk-ai/normalize.ts` 의 `Category` type 에 추가
2. `lib/channeltalk-ai/category-labels.ts` 의 `CATEGORY_LABELS` 에 라벨 + UI 색상
3. `category_prompts` 테이블 INSERT (Supabase Studio 또는 `/api/settings/category-prompts` PATCH):
   ```sql
   INSERT INTO category_prompts (category_id, category_name, parent_category, prompt_rules, policy_sections, ai_scope_note)
   VALUES (
     '신규_카테고리',
     '신규 카테고리',
     '서비스이용',
     '답변 규칙 본문 ...',
     ARRAY['관련 정책 섹션'],
     '주의사항'
   );
   ```
4. Stage 1 분류 prompt 갱신 — 새 카테고리 keyword + negative example 추가
   - 외부 파이프라인 (운영팀 보유)
5. 운영 후 분류 정확도 모니터링

## 분류 알고리즘 (Stage 1)

`lib/channeltalk-ai/normalize.ts:normalizeAndClassify`:

```ts
async function normalizeAndClassify(
  messages: Array<{ role; text; senderName? }>,
  context?: { previousCategories?: Category[] }
): Promise<{
  normalized: string;
  categories: Category[];        // 1~3개 (가장 가까운 순)
  stage0: "continuing" | "new" | "combined";
}>
```

### 처리
1. 메시지 마지막 N개 → 단일 문맥 문자열로 합침
2. 정규화 (오타 제거, 반복 제거 등)
3. Sonnet 호출 (분류 prompt — 19개 enum + Stage 0 결정 같이)
4. 응답 parse → categories + stage0

### 분류 prompt (개념)
```
다음 메시지를 19개 카테고리 중 가장 가까운 1~3개로 분류하세요.

카테고리:
- 이용_배출품목: 봉투 종류·규격·배출 가능 품목 질의
- 이용_대형폐기물: 가구·가전·자재 (방문수거 대상)
- ... (19개 enum)

또한 Stage 0 (재방문 판별):
- continuing: 이전 응답 이어서
- new: 새 문의
- combined: 둘 다

응답 JSON:
{
  "normalized": "정규화된 메시지",
  "categories": ["이용_배출품목"],
  "stage0": "new"
}
```

## Stage 0 — 재방문 판별

```
continuing — 같은 챗에서 상담사가 답한 후 고객이 재질문 (이어지는 대화)
new        — 신규 문의 (이전 응답과 무관)
combined   — 이전 챗 + 새 문의 결합 (드물게)
```

활용:
- `continuing` → 이전 응답 컨텍스트를 prompt 에 더 많이 포함
- `new` → 인사말 시작 가능
- `combined` → AI 가 양쪽 다 처리

`hasRealManagerReply(turns)` — 봇/워크플로우 메시지가 아닌 실제 상담사 응답 여부 확인. 봇 이름 "커버링" 은 제외.

## 분류 결과 분기 (suggest.ts)

```ts
const { categories, stage0 } = await normalizeAndClassify(messages);

if (categories.length === 0 || categories[0] === "기타") {
  // fallback — 일반 답변 또는 NEED_HUMAN
}

if (categories.length === 1) {
  return generatePolicyAnswer({ category: categories[0], ... });
} else if (categories.length > 1) {
  return generateCombinedAnswer({ categories, ... });
}
```

## NEED_HUMAN 케이스 (cannotAnswer)

`parseCannotAnswer(text)` — AI 가 "답변 불가" 판단 시:
```ts
function parseCannotAnswer(text: string): { canAnswer: false; reason: string; summary: string } | null
```

AI 응답에 다음 패턴 포함 시:
```
[CANNOT_ANSWER]
reason: 답변 불가 이유
summary: 상담사에게 전달할 요약
```

→ SuggestPanel 에 "AI 답변 불가" 표시 + 상담사 직접 처리.

대표 사례:
- 행사 / 단체 수거 (별도 견적 필요)
- 환불 / 보상 (운영팀 결정)
- 고객 정보 변경 (계정 권한 필요)
- 정책 외 예외 요청

## EXCLUDE 태그 처리

`suggest.ts` 의 상수:
```ts
const EXCLUDE_TAG_PREFIXES = ["고객유형/"];
const EXCLUDE_TAGS = new Set(["무응종결", "중복"]);
```

채널톡 chat 의 모든 태그 중 위 패턴은 카테고리 분류·매칭에 영향 안 줌.

## 입력 태그 (inputTags) 활용

`scoreCandidate` 의 `calcTagScore` 가 입력 태그 ↔ candidate 태그 일치도 점수화:
- 채널톡 chat 의 기존 태그 (운영자가 수동 추가 또는 auto-tag)
- 매칭 candidate 의 태그 (consultation 데이터의 카테고리·키워드)

일치 1개당 +10점.

## auto-tagging

채널톡 신규 chat 자동 태깅 (`lib/channeltalk/auto-tag.ts`):
- `cron/auto-close-chat` 이 새 chat 발견 시
- Sonnet 으로 태그 추정 (CATEGORY_LABELS 기준)
- 채널톡 Open API 로 태그 추가

## 카테고리 분포 모니터링

```sql
-- 최근 7일 reply_kind 별 분포 (chat_id 기준 — chat 의 카테고리 직접 알 수 없으므로 manual)
SELECT manager_name, reply_kind, COUNT(*)
FROM channeltalk_reply_logs
WHERE sent_at > NOW() - INTERVAL '7 days'
GROUP BY manager_name, reply_kind ORDER BY COUNT(*) DESC;

-- (channeltalk_reply_logs 에 category 컬럼은 없음 — 분포는 채널톡 콘솔의 태그 통계 활용 권장)
```

## 검증 SQL

### category_prompts 운영 상태
```sql
SELECT category_id, category_name, parent_category,
       length(prompt_rules) AS rule_chars,
       array_length(policy_sections, 1) AS policy_count,
       updated_at, updated_by
FROM category_prompts
ORDER BY updated_at DESC;
```

### 미정의 카테고리 (코드 vs DB)
- 코드: `Category` type (lib/channeltalk-ai/normalize.ts) — 19개
- DB: `category_prompts.category_id` — 운영 추가/제거
- 정합성: AI 가 DB 에 없는 카테고리 분류하면 prompt_rules fetch 실패 → fallback

```sql
-- DB 의 모든 category_id
SELECT category_id FROM category_prompts ORDER BY category_id;
```

코드의 19개 enum 과 비교해 누락/추가 검증.

## 자주 깨지는 곳

### 1. 잘못된 카테고리 분류
- 증상: 결제 질문이 "이용_배출품목" 으로 분류
- 원인: Stage 1 prompt 약함
- 수정: 분류 prompt 의 예시·negative example 보강

### 2. "기타" 폭주
- 증상: 많은 메시지가 "기타" 로 분류
- 원인: 분류 prompt 가 보수적 또는 카테고리 정의 모호
- 수정: 카테고리 추가 또는 prompt 임계값 완화

### 3. 신규 카테고리가 분류 안 됨
- 증상: DB 에 새 카테고리 INSERT 했는데 AI 가 분류 못 함
- 원인: Stage 1 prompt 미갱신 (외부 파이프라인 재실행 필요)
- 수정: 운영팀에 학습 데이터 갱신 요청

### 4. 카테고리는 맞는데 답변이 stale
- 증상: 분류는 정확, 답변에 옛 정책 안내
- 원인: `prompt_rules` 가 stale 또는 정책 임베딩 stale
- 수정: prompt_rules DB 갱신 + 정책 재임베딩

## 변경 시 주의

- 카테고리 enum 변경 → 코드 + DB + 분류 prompt 3곳 동기화 필수
- 카테고리 제거 → 기존 channeltalk_reply_logs 영향 (history 보존 가치)
- 라벨 변경 (UI) → CATEGORY_LABELS 만 변경 (분류 영향 없음)
- parent_category 변경 → SuggestPanel UI 분류 그룹화 영향
