# 보안 규약 문서 + Hook 강제 + AI 지침 동기화

> 유형: PRD
> 작성일: 2026-04-14
> 상태: 완료

## 목표

1. covering-labs에서 개발되는 앱의 보안 규약을 문서화(`docs/09_보안_규약.md`)
2. 보안 위반 코드를 Claude Code hook으로 자동 감지·경고
3. CLAUDE.md, GEMINI.md, AGENTS.md 내용 동기화 (보안 문서 링크, GEMINI.md 설명 수정)

## 현황 분석

- `.claude/settings.json`에 파일 보호 hook과 PRD 리마인더 hook은 존재
- 보안 관련 코드 스캔 hook 없음
- GEMINI.md description이 "Claude Code" 로 표기되어 있어 수정 필요
- CLAUDE.md, GEMINI.md, AGENTS.md 모두 docs/09 링크 없음

## 구현 계획

### 단계별 작업

- [x] PRD 작성 (이 파일)
- [ ] US-001: docs/09_보안_규약.md 작성
- [ ] US-002: .claude/hooks/security-check.py 생성 + settings.json 업데이트
- [ ] US-003: CLAUDE.md, GEMINI.md, AGENTS.md 동기화

## 완료 기준

- docs/09_보안_규약.md 존재, 보안 섹션 7개 이상 포함
- security-check.py가 하드코딩 키/eval/localStorage/SELECT* 감지
- GEMINI.md description "Claude Code" → "AI 에이전트" 수정
- 모든 AI 지침 파일에 docs/09 링크 포함
