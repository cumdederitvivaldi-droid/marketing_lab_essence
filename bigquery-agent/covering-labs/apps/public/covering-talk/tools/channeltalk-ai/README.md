# tools/channeltalk-ai — 채널톡 AI 학습/시드 파이프라인

> 운영 코드가 아닌 **데이터 자산 + 1회성/주기성 도구**.
> 운영 중 RAG / Sonnet 추천에 영향을 주는 정책 문서·임베딩의 원본이 모여 있다.
> (이전 위치: `scripts/covering-ai/` — 2026-04-27 `tools/` 로 승격)

## 무엇이 있는가

### 정책 문서 (RAG 참조 후보 — 학습 입력)
- `policy-document.md` — 100건씩 묶어 요약·통합한 최종 정책 문서
- `policy-reference.md` — 사람이 작성한 정책 레퍼런스
- `policy-summaries.json` — 100건 단위 요약 결과 (정책 문서 빌드 중간 산출물)

### 학습 데이터
- `consultation-pairs.json` — 채널톡 (질문 / 답변) 페어 원본
- `consultation-pairs-classified.json` — 카테고리 분류 적용본
- `test-results.json` — Sonnet 추천 품질 테스트 결과

### 시드 스크립트 (DB 쓰기, 의도적으로만 실행)
- `seed-category-prompts.ts` → `app_settings` 카테고리 프롬프트 seed
- `seed-service-areas.ts` → `service_areas` 마스터 seed
- `seed-consultation-tags.ts` → `consultation_tags` 마스터 seed
- `add-new-service-areas-20260330.ts` — 1회성 (날짜 박힘, 보존만)

### Embedding 스크립트 (Voyage AI 호출 → DB 누적)
- `embed-consultations.ts`
- `embed-macros.ts`
- `embed-missing.ts`

### 분석/생성 도구
- `parse-consultations.ts` — 백업 데이터 → consultation-pairs.json 추출
- `classify-consultations.ts` — 카테고리 자동 분류
- `generate-policy-doc.ts` — 페어 → 100건 요약 → 정책 문서 통합
- `test-suggest-quality.ts` — 운영 Sonnet 추천 품질 회귀 테스트

## 실행 방법

```bash
# 카테고리 분류
npx tsx tools/channeltalk-ai/classify-consultations.ts

# 정책 문서 생성 파이프라인
npx tsx tools/channeltalk-ai/generate-policy-doc.ts

# 임베딩 적재 (수동)
npx tsx tools/channeltalk-ai/embed-consultations.ts
npx tsx tools/channeltalk-ai/embed-missing.ts

# DB seed (운영에서는 단발성)
npx tsx tools/channeltalk-ai/seed-service-areas.ts
npx tsx tools/channeltalk-ai/seed-category-prompts.ts
```

모든 스크립트는 `__dirname/../../.env.local` 을 dotenv 로 읽어 `SUPABASE_*`, `ANTHROPIC_API_KEY`, `VOYAGE_AI_API_KEY` 등을 사용한다.

## 운영 코드와의 관계

운영 중 채널톡 AI 추천 (`/api/channeltalk-ai/suggest`) 은 본 폴더의 코드를 직접 import 하지 않는다. 대신:

- `policy-document.md`·`policy-reference.md` 의 내용은 **사전 임베딩** 되어 Supabase 에 적재됨 → suggest 호출 시 RAG 로 인용
- `consultation-pairs-classified.json` 의 분류 라벨은 [`lib/channeltalk-ai/category-prompts.ts`](../../lib/channeltalk-ai/category-prompts.ts) 의 카테고리 정의와 정합 유지

따라서 본 폴더의 데이터·스크립트는 **운영 정확도의 원천 자산**. 변경 시:
1. 데이터 갱신 → 분류/임베딩 재실행
2. 결과 push → DB 반영

## 안 건드리면 어떻게 되나

- 새 카테고리·정책 추가 안 됨 → 기존 학습본 안에서만 추천
- 운영 동작 자체는 영향 없음 (이 폴더 안 돌리면 기존 임베딩 그대로 사용)

## 주의

- 실행 시 외부 API 비용 발생 — Anthropic / Voyage 사용량 확인 필요
- DB 직접 write — 작업 전 백업 권장
- 실행 후 결과 파일(`policy-summaries.json`, `test-results.json`) 은 git 에 commit 할지 case 별 결정
