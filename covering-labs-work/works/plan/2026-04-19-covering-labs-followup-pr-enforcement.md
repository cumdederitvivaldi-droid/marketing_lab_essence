# follow-up PR 자동 강제화 플랜

> 유형: Plan
> 작성일: 2026-04-19
> 상태: 완료

## 목표

- 후속 수정 PR(`post-release-fix`, `hotfix`)을 사람이 수동 라벨링하지 않도록 자동화한다.
- PR 작성 시 `원인 PR`, `문제 코드/파일`을 필수 기록하게 만들고, 누락 시 머지를 차단한다.
- AI 사용 여부와 동일하게 후속 수정 유형도 PR 본문을 기준으로 자동 라벨링한다.

## 현황 분석

- 현재 AI 사용 여부는 PR 템플릿 체크박스를 읽어 워크플로우가 자동 라벨링한다.
- 반면 후속 수정 PR 여부(`post-release-fix`, `hotfix`)는 사람이 라벨을 직접 붙여야 한다.
- `원인 PR`은 follow-up 라벨이 이미 붙어 있을 때만 검사되므로, 입력 누락과 라벨 누락에 취약하다.

## 구현 계획

### 단계별 작업

- [x] PR 템플릿에 후속 수정 유형 필수 선택 항목 추가
- [x] `원인 PR`, `문제 코드/파일` 필수 입력 형식 정의
- [x] `ai-pr-guardrail.yml`에서 후속 수정 유형 자동 라벨링 구현
- [x] 후속 수정 PR 선택 시 필수 입력 누락을 실패 처리하도록 강화
- [x] 변경 내용을 작업 기록 문서에 반영

## 변경 파일

- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/workflows/ai-pr-guardrail.yml`
- `works/plan/2026-04-19-covering-labs-followup-pr-enforcement.md`

## 완료 기준

- 사람이 `post-release-fix`/`hotfix` 라벨을 직접 붙이지 않아도 된다.
- follow-up PR은 `원인 PR`과 `문제 코드/파일`이 없으면 머지될 수 없다.
- 자동 라벨링과 검증이 동일한 템플릿 입력을 기준으로 동작한다.
