# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## Skill Auto-Triggers

다음 상황에서는 사용자가 명시하지 않아도 자동으로 해당 스킬을 호출.
스킬 호출 시 사용자에게 "[스킬명] 스킬로 진행합니다" 라고 한 줄 알릴 것.

### :red_circle: 강제 자동 호출 (예외 없음)

**`/grill-with-docs` 자동 호출 조건:**
- 사용자 요청에 다음 키워드가 포함될 때:
  - "기능 추가", "새 기능", "구현"
  - "리팩토링", "구조 변경", "단일화"
  - "auth", "인증", "보안", "결제", "권한"
  - "DB 스키마", "마이그레이션"
- 코드 변경량이 3개 파일 이상 예상될 때
- 프로젝트에 `docs/danger-zones/` 폴더가 있고 해당 영역을 건드릴 때

**`/grill-me` 자동 호출 조건:**
- 코드 작업이 아닌 의사결정 / 기획 / 전략 질문
- "어떻게 할지 고민", "결정해야 할", "선택지", "도입할지" 같은 키워드
- 신규 기능 기획 단계 (아직 코드 작성 전)

**`/diagnose` 자동 호출 조건:**
- "버그", "안 됨", "에러", "이상함" 같은 키워드
- 사용자가 재현 가능한 증상을 보고할 때

**`/zoom-out` 자동 호출 조건:**
- 사용자가 처음 보는 파일/영역을 작업 요청할 때
- 작업 범위가 불명확할 때

### :large_yellow_circle: 권장 자동 호출 (Claude 판단)

**`/tdd` 권장 호출:**
- 비즈니스 로직 함수 작성/수정 시
- 단, 단순 UI 변경, 텍스트 수정, 스타일링은 제외

**`/to-prd` 권장 호출:**
- 사용자가 큰 작업을 자연어로 설명할 때 (반나절 이상 걸릴 작업)

### :large_green_circle: 사용자 명시 호출만

- `/improve-codebase-architecture` — 주기적 점검용, 자동 호출 금지
- `/to-issues` — 사용자가 PRD → 이슈 분할 명시할 때만
- `/triage` — 사용자가 트리아지 요청할 때만
- `/caveman`, `/handoff` — 사용자 명시 호출만

### 절대 규칙

- 자동 호출했을 때 **반드시 한 줄 고지**: ":wrench: [스킬명] 스킬로 진행합니다"
- 사용자가 "스킬 없이 그냥 해줘" 라고 하면 자동 호출 끄기
- 자동 호출 후에도 Karpathy 룰 (추측 금지, surgical changes) 우선