---
name: release-file-guard
description: Use when a covering-labs change is about to be committed, pushed, or opened as a PR and the agent must screen repo-inappropriate files such as stray policy docs, methodology notes, secrets, exports, or temporary outputs before shipping.
---

# Release File Guard

## Overview

covering-labs는 비개발자도 앱을 배포할 수 있게 만든 저장소라서,
앱 배포와 무관한 문서/메모/임시 산출물이 repo에 섞이기 쉽다.
이 스킬은 **push 전에 staged 또는 배포 예정 파일을 `ALLOW / REVIEW / REJECT`로 분류**해서
"올려도 되는 파일만 남기는 것"을 목표로 한다.

핵심 원칙은 하나다.

> **코드를 올리는 행위와 지식을 남기는 행위를 분리한다.**
> 앱/배포 산출물은 `apps/`와 필요한 설정에 남기고,
> 작업 기록은 `works/`, 영속 운영 지식은 `docs/`에 남긴다.

## Companion Files Required

이 스킬은 `SKILL.md`만으로 완성되지 않는다.
아래가 같이 있어야 비개발자 개인 로컬에서도 동일하게 동작한다.

- `INSTALL.md`
- `install-global.sh`
- hook helper (`release-file-guard.py`)
- Claude/Codex 설정 연결 (`settings.json`, `hooks.json`)

비개발자에게 전달할 때는 **이 폴더 전체** 또는 `docs/10_출고_전_파일_필터_설치.md`를 함께 전달한다.

## When to Use

다음 중 하나라도 해당하면 이 스킬을 사용한다.

- `git commit`, `git push`, `gh pr create` 직전
- 비개발자가 AI에게 "올려줘", "배포해줘", "커밋해줘"라고 말했을 때
- `apps/` 수정 외에 루트/`docs/`/`works/`/`.claude/`/`.codex/` 파일이 같이 바뀌었을 때
- 정책 문서, 방법론 문서, 회고, AI 메모, CSV/엑셀/로그/스크린샷이 섞였을 가능성이 있을 때

다음에는 사용하지 않는다.

- 단순 조회만 하고 아무 파일도 올리지 않을 때
- 명시적으로 "운영 문서 자체를 업데이트하는 작업"이고, 사용자가 그 범위를 승인한 상태일 때

## Mandatory Reading

작업 범위에 따라 아래를 먼저 읽는다.

1. `AGENTS.md` — 전체 규칙과 repo 구조
2. `apps/AGENTS.md` — 앱 관련 변경이 있을 때
3. `works/AGENTS.md` — 문서 위치를 판단해야 할 때

## Decision Table

| 분류 | 의미 | 대표 예시 | 기본 액션 |
|---|---|---|---|
| `ALLOW` | 이번 배포/작업 산출물로 repo에 남아도 됨 | `apps/<app>/src/**`, `apps/<app>/deploy.yml`, 필요한 테스트/설정, `works/plan/*.md`, `works/reports/*.md`, 번호가 붙은 운영 문서 `docs/0*_*.md` | 유지 |
| `REVIEW` | 맥락이 있어야만 남길 수 있음 | 루트의 새 markdown, `apps/**` 내부의 README 외 `.md`, `.claude/**`, `.codex/**`, `docs/`의 비정규 문서, `POLICY.md`, `PLAYBOOK.md`, `IMPLEMENTATION_PLAN.md`, `TODO.md`, `PROMPT.md` | 사용자 의도 확인 후 유지/이동 |
| `REJECT` | 개발 repo에 올리면 안 되거나 거의 항상 실수 | `.env`, `.pem`, `.key`, 서비스 계정 json, `node_modules`, `.next`, `dist`, `coverage`, `tmp`, `.DS_Store`, 로그/덤프/압축파일, 무관한 CSV/XLSX/SQL dump, 앱과 무관한 스크린샷/녹화본 | 제거 또는 ignore |

## Workflow

1. `git status --short`로 현재 변경 파일을 본다.
2. commit 전이면 `git diff --cached --name-only --diff-filter=ACMR`를 기준으로 본다.
3. push/PR 전이면 upstream 또는 기본 브랜치 대비 변경 파일을 기준으로 본다.
4. 각 파일을 `ALLOW / REVIEW / REJECT`로 분류한다.
5. `REJECT`는 push 전에 반드시 제거하거나 `.gitignore`로 막는다.
6. `REVIEW`는 아래 두 질문으로 판정한다.
   - 이 파일이 앱 배포/운영에 실제로 필요한가?
   - 이 파일이 `works/`나 기존 번호 문서 `docs/0*_*.md`로 가야 하는가?
7. `REJECT=0`, `미해결 REVIEW=0`일 때만 commit/push/PR을 진행한다.

## Path Rules

### 1) 앱 관련 파일

- `apps/<app>/` 안에는 **배포 가능한 코드/설정/필수 자산**만 둔다.
- 앱 내부 문서는 `README.md` 정도만 예외로 허용한다.
- 앱 안에 정책 문서, 회고, 방법론 메모, 프롬프트 덤프를 두지 않는다.

### 2) 작업 기록 문서

다음 문서는 repo에서 완전히 삭제하지 말고 먼저 `works/` 이동을 검토한다.

- 분석 메모
- 작업 계획
- 조사 결과
- 회고
- AI와의 협업 메모

배치 규칙:

- 계획/PRD/ADR → `works/plan/`
- 분석/조사/회고 → `works/reports/`

### 3) 운영 문서

`docs/`는 **실험실 운영 지식**만 둔다.

허용 예시:
- 접속/권한/IAM/모니터링/보안 가이드
- 서버 운영 절차
- 비개발자 사용 가이드

주의 예시 (`REVIEW`):
- 일반적인 개발 방법론 문서
- 특정 세션의 임시 정책 메모
- 다른 repo에도 그대로 복붙 가능한 AI 운영 문서

## Fast Heuristics

아래 이름은 거의 항상 `REVIEW` 이상으로 본다.

- `POLICY.md`, `PLAYBOOK.md`, `PROMPT.md`, `SYSTEM_PROMPT.md`
- `IMPLEMENTATION_PLAN.md`, `EXECUTION_PLAN.md`, `RETROSPECTIVE.md`
- `TODO.md`, `NOTES.md`, `DRAFT.md`, `회의록.md`

아래 확장자는 거의 항상 `REJECT` 후보다.

- `.env`, `.pem`, `.key`, `.p12`, `.pfx`, `.crt`, `.cer`
- `.log`, `.tmp`, `.bak`, `.sqlite`, `.db`
- `.zip`, `.tar`, `.gz`, `.tgz`
- `.csv`, `.tsv`, `.xlsx`, `.sql` (앱 배포와 직접 관련된 근거가 없으면)
- `.png`, `.jpg`, `.jpeg`, `.mov`, `.mp4` (앱 자산이 아니라면)

## Output Contract

이 스킬을 실행할 때는 결과를 아래 순서로 낸다.

1. 이번에 검사한 기준 (`staged` / `push-range`)
2. 고정폭 표
3. `REJECT` 제거 명령
4. `REVIEW` 유지 사유 또는 이동 제안
5. 최종 판정 (`push 가능` / `정리 후 진행`)

예시:

```text
구분     파일                                         판정    이유                              다음 액션
staged   apps/report-bot/src/main.py                  ALLOW   앱 코드                           유지
staged   apps/report-bot/POLICY.md                    REVIEW  앱 내부 일반 정책 문서            works/plan 이동 또는 삭제 검토
staged   report-bot-debug.log                         REJECT  로컬 로그 파일                    git restore --staged ... && rm ...
```

## Cleanup Commands

```bash
# staged에서만 빼기
git restore --staged <path>

# tracked 파일 삭제
rm <path>

# 문서를 works로 이동
mv <from> works/plan/$(date +%Y-%m-%d)-covering-labs-<slug>.md

# push 범위 재검사
git diff --name-only @{u}...HEAD 2>/dev/null || git diff --name-only origin/main...HEAD
```

## Easter Egg Trigger

이 repo에는 별도 hook이 연결되어 있다.

- 사용자가 prompt에 `배포`, `push`, `커밋`, `PR`, `올려줘`, `merge` 같은 말을 쓰면 알림이 뜬다.
- `git commit`, `git push`, `gh pr create` 명령 직전에도 자동 경고가 뜬다.

**그 알림을 보면 이 스킬이 명시적으로 호출되지 않았더라도 즉시 이 스킬을 실행해야 한다.**
즉, hook의 `[RELEASE-FILE-GUARD]` 메시지는 이 스킬의 강제 호출 신호다.

## Red Flags

다음 생각이 들면 멈추고 다시 분류한다.

- "문서 하나쯤은 그냥 같이 올려도 되겠지"
- "나중에 정리하지 뭐"
- "앱 폴더 안이니까 md도 괜찮겠지"
- "CSV/로그를 증거로 남겨두자"
- "AI가 만든 프롬프트 문서도 참고용이니 같이 두자"

이 다섯 문장은 대부분 `REVIEW` 또는 `REJECT` 신호다.
