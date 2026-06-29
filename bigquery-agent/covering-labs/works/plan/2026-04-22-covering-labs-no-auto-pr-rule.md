# [PRD] AI 자동 PR 생성 금지 규칙 + 문서 더블체크 + 로컬 개발 지원

> 작성일: 2026-04-22
> 작성자: jun@covering.app (AI 세션)
> 상태: 완료

---

## 배경

- 최근 PR #94 에서 AI 가 작업 직후 자동으로 PR 을 생성해 사용자 리뷰 기회를 건너뛰는 문제가 발생.
- Ralph/executor 에이전트가 `gh pr create` 를 작업 완료 단계로 인식해 `bypassPermissions` 모드에서 훅 없이 실행하는 구조.
- 또한 PR #95 완료 후 architect 가 지적한 잔여 항목(install-global.sh 경로 버그, CLAUDE.md 보호 파일 목록) 이 남아 있음.

## 목표

1. **PR 자동 생성 금지**: 사용자가 `배포 준비해줘` / `배포해줘` / `PR 올려줘` 등 명시적 배포 키워드를 말했을 때만 PR 생성.
2. **로컬 개발 워크플로우**: 로컬에서 실행·테스트·빌드 가능하도록 가이드. node_modules 는 항상 .gitignore.
3. **잔여 정합성 수정**: install-global.sh 경로, CLAUDE.md 보호 파일 목록.

## 스토리

### US-001: AGENTS.md / CLAUDE.md — PR 자동 생성 금지 규칙 명문화
- 기본 개발 흐름: 구현 → 로컬 테스트 → 커밋 → **멈춤**
- 명시적 배포 키워드 목록 정의
- 커밋만 하고 push/PR 은 사용자 승인 후

### US-002: install-global.sh 경로 버그 수정
- `.claude/skills/release-file-guard/install-global.sh`: `.claude/hooks/` → `.hooks/`
- `.codex/skills/release-file-guard/install-global.sh`: 동일 수정
- 스크립트 실행 테스트 (dry-run 검증)

### US-003: CLAUDE.md 보호 파일 목록 보강
- `GEMINI.md` 추가 (이미 AGENTS.md 에는 반영됨)

### US-004: pr-policy-guard 훅에 자동 PR 경고 강화
- `gh pr create` 실행 시 명시적 경고 메시지 출력 ("사용자가 배포를 명시적으로 지시했는지 재확인")
- 차단은 하지 않음 (기존 AI body 검증 유지)

### US-005: 로컬 개발 가이드 확인
- `apps/AGENTS.md` 로컬 TypeScript/빌드/테스트 섹션 검증
- `.gitignore` 에 node_modules/.next/dist 포함 확인

## 작업 범위

- `AGENTS.md`
- `CLAUDE.md`
- `.claude/skills/release-file-guard/install-global.sh`
- `.codex/skills/release-file-guard/install-global.sh`
- `.hooks/pr-policy-guard.py`

## 미커밋 / 미PR 원칙

이 작업은 로컬 커밋까지만 수행하고, 사용자가 `배포 준비해줘` 라고 지시하기 전까지 push/PR 을 만들지 않는다.
