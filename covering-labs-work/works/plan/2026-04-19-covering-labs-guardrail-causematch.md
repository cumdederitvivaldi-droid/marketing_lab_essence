# AI PR 가드레일 — causeMatch 무음 실패 수정

> 유형: 플랜
> 작성일: 2026-04-19
> 상태: 확정

날짜: 2026-04-19
목표: mark-cause-pr-followup 잡에서 원인 PR 번호 누락 시 무음 성공 방지

## Objective

`post-release-fix` / `hotfix` PR이 머지될 때 `원인 PR` 번호가 본문에 없으면
`had-followup` 라벨이 누락되어 이슈 사전 차단율 집계가 잘못된다.
현재 `console.log + return`으로 무음 종료되는 동작을 `core.setFailed`로 교체해
누락을 즉시 인지할 수 있게 한다.

성공 기준: `원인 PR` 미기재 hotfix/post-release-fix PR 머지 시 워크플로우가 실패 상태로 표시되고 Slack 장애 알림이 발송된다.

## Current Status

- `check-ai-label` 잡(PR 오픈·수정 시)은 이미 `core.setFailed`로 처리 중
- `mark-cause-pr-followup` 잡(머지 시)만 무음 성공 상태

## Implementation Plan

`ai-pr-guardrail.yml`의 `mark-cause-pr-followup` 잡에서 아래 분기를 수정한다.

**변경 전:**
```javascript
if (!causeMatch) {
  console.log('원인 PR 번호를 찾을 수 없음 — had-followup 라벨 생략');
  return;
}
```

**변경 후:**
```javascript
if (!causeMatch) {
  core.setFailed('post-release-fix/hotfix PR이 머지되었으나 원인 PR 번호를 찾을 수 없습니다. PR 본문에 "원인 PR: #번호" 형식으로 명시되어야 합니다.');
  return;
}
```

## Step-by-Step Tasks

- [x] `fix/2026-04-19-guardrail-causematch-failsafe` 브랜치 생성
- [x] `ai-pr-guardrail.yml` — `!causeMatch` 분기 `core.setFailed`로 교체
- [x] PR #67 생성

## Completion Criteria

- `post-release-fix`/`hotfix` 라벨 + `원인 PR` 미기재 상태로 머지 시 `mark-cause-pr-followup` 잡 실패
- `had-followup` 라벨 누락이 집계 오류로 이어지지 않음
- `notify-failure` 잡이 Slack 장애 알림 발송

## 기준 (Standards)

### 원인 PR 필드 처리 기준

| 단계 | 조건 | 동작 |
|---|---|---|
| PR 오픈/수정 (`check-ai-label`) | `post-release-fix`/`hotfix` + `원인 PR` 미기재 | `core.setFailed` → 머지 차단 |
| PR 머지 (`mark-cause-pr-followup`) | `post-release-fix`/`hotfix` + `원인 PR` 미기재 | `core.setFailed` → 알림 발송 |

### 원인 PR 필드 형식

```text
원인 PR: #123
```

- `#숫자` 형식만 인식 (`N/A`, 텍스트 등 허용 안 함)
- `post-release-fix`/`hotfix` 라벨이 없는 PR은 해당 없음
