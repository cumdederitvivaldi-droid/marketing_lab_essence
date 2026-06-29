# AI 깊이 분석 (ai-deep)

> 3 도메인의 AI 동작 로직을 코드 수준 깊이로 정리.
> 도메인별 README 의 [`03-ai.md`](../domains/visit/03-ai.md) 가 한 눈 요약, 본 문서는 디테일.

## 도메인별 인덱스

### 방문수거 (Visit) — 9단계 Phase 머신
- [`visit/01-flow.md`](visit/01-flow.md) — 한 메시지 → 응답까지 sequence + 함수 trace
- [`visit/02-prompts.md`](visit/02-prompts.md) — SYSTEM_PROMPT 11 섹션 + INTENT_CLASSIFY + 변경 가이드
- [`visit/03-phase-machine.md`](visit/03-phase-machine.md) — Phase 전환 키워드·로직·코드 인용
- [`visit/04-extraction.md`](visit/04-extraction.md) — 품목/주소/공휴일/시간 추출

### 런치 (Lunch) — 4단계 경량 머신
- [`lunch/01-flow.md`](lunch/01-flow.md) — 메시지 → 응답 sequence
- [`lunch/02-prompts.md`](lunch/02-prompts.md) — lunch-prompt + lunch-policy
- [`lunch/03-order-parsing.md`](lunch/03-order-parsing.md) — `<order_data>` 자동파싱
- [`lunch/04-tone-rules.md`](lunch/04-tone-rules.md) — 마크다운 금지 / 자가검수

### 채널톡 (Channeltalk) — 4단계 RAG 파이프라인
- [`channeltalk/01-flow.md`](channeltalk/01-flow.md) — Stage 0~3 sequence (분류 → RAG → 생성 → 톤)
- [`channeltalk/02-prompts.md`](channeltalk/02-prompts.md) — category_prompts 구조 + base prompt
- [`channeltalk/03-rag.md`](channeltalk/03-rag.md) — Voyage 임베딩 / top-K / 임계값
- [`channeltalk/04-categories.md`](channeltalk/04-categories.md) — 84+ 카테고리 정의

## 문서 사용

- 빠른 참조: 도메인 README 의 03-ai.md
- 깊이 있는 작업 (프롬프트 수정, 파이프라인 디버깅, 새 기능 추가): 본 문서 4 파트
- 코드 작업 시: 본 문서 + 실제 `lib/ai/`·`lib/channeltalk-ai/` 코드 같이

## 변경 시 동기화

- 프롬프트 수정 → 02-prompts 갱신 (코드 ↔ 본 문서 정합)
- Phase 추가 → 03-phase-machine + `lib/ai/phases.ts` + `phase-transitions.ts`
- 카테고리 추가 → 04-categories + `lib/channeltalk-ai/category-labels.ts` + `category_prompts` 테이블
- 새 추출 함수 → 04-extraction
