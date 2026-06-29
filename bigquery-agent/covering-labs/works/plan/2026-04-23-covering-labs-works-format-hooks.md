# works/ 문서 형식 강제 훅 추가

> 유형: 플랜
> 작성일: 2026-04-23
> 상태: 완료

## 목표

`works/` 문서의 형식 일관성을 훅으로 강제하고, PR 생성 시 배포 전 필수 확인 체크리스트 미체크를 차단한다.

## 현재 상태 분석

- `works/` 문서 형식이 작성자별로 달라 품질 편차가 발생함 (상태값: `진행중`, `Complete`, `Review` 등 혼재)
- PR 템플릿의 배포 전 체크리스트가 미체크 상태로 제출될 여지가 있었음
- 기존 훅은 보안/배포 규칙 중심으로, 문서 형식/상태 관리 훅은 부재했음

## 구현 계획

### 단계별 작업

- [x] `works-format-guard.py` 작성 (PreToolUse: Edit|Write)
  - 파일명 형식 검사: `{YYYY-MM-DD}-covering-labs-{slug}.md`
  - 저장 위치 검사: `works/plan/` 또는 `works/reports/` 하위에만 허용
  - 헤더 필드 검사: `> 유형:`, `> 작성일:`, `> 상태:`
  - 상태 값 검사: `초안 | 검토중 | 확정 | 완료`
- [x] `works-status-reminder.py` 작성 (PostToolUse: Edit|Write)
  - works/ 파일 수정 후 현재 상태 표시 및 업데이트 안내
- [x] `pr-policy-guard.py` 업데이트
  - `## ✅ 배포 전 필수 확인` 체크박스 미체크 항목 감지 및 차단
- [x] `.claude/settings.json` 업데이트
  - PreToolUse에 `works-format-guard.py` 추가
  - PostToolUse에 `works-status-reminder.py` 추가

## 변경 파일 목록

- `.hooks/works-format-guard.py` (신규)
- `.hooks/works-status-reminder.py` (신규)
- `.hooks/pr-policy-guard.py` (수정 — 배포 전 체크리스트 검증 추가)
- `.claude/settings.json` (수정 — 훅 연결)
- `works/plan/2026-04-23-covering-labs-works-format-hooks.md` (신규)

## 완료 기준

- [x] works/ 파일 생성/수정 시 형식 경고 동작
- [x] PR 생성 시 배포 전 체크리스트 미체크 차단 동작
