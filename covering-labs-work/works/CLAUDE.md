# CLAUDE.md — works/ AI 가이드

> covering-labs 작업 기록, 플랜, PRD, 보고서를 관리하는 디렉토리.
> 코드가 아닌 모든 작업 문서는 여기에 저장한다.

---

## 디렉토리 구조

```text
works/
├── CLAUDE.md              이 파일
├── AGENTS.md              작업 기록 AI 가이드 (파일 저장 규칙, 네이밍, 템플릿)
├── plan/                  플랜, PRD, 기획서, 의사결정 기록
└── reports/               분석 보고서, 조사 결과, 회고
```

---

## 파일 저장 위치 결정

| 문서 유형 | 저장 위치 |
|---|---|
| 기능 PRD, 기획서 | `plan/` |
| 작업 플랜, 구현 계획 | `plan/` |
| 의사결정 기록 (ADR) | `plan/` |
| 데이터 분석, 조사 결과 | `reports/` |
| 장애 분석, 서버 조사 | `reports/` |
| 성능 분석, 로그 분석 | `reports/` |

---

## 파일 네이밍 규칙

covering-labs 작업 문서 파일명:

```text
{YYYY-MM-DD}-covering-labs-{task-slug}.md
```

예시:
- `2026-04-14-covering-labs-doc-consistency.md`
- `2026-04-14-covering-labs-nestjs-template-fix.md`
- `2026-04-14-covering-labs-batch-crontab-bug.md`

---

## 문서 헤더 규칙

모든 문서 첫 줄:

```markdown
# 문서 제목

> 유형: PRD | 플랜 | 분석
> 작성일: YYYY-MM-DD
> 상태: 초안 | 검토중 | 확정 | 완료
```

---

## PRD/플랜 작성 템플릿

```markdown
# {작업명} 플랜

> 유형: PRD | 플랜
> 작성일: YYYY-MM-DD
> 상태: 초안

## 목표

## 현황 분석

## 구현 계획

### 단계별 작업

## 완료 기준
```

---

## 절대 하면 안 되는 것

| 금지 사항 | 이유 |
|---|---|
| `works/` 루트에 직접 파일 생성 | `plan/` 또는 `reports/` 하위에만 |
| 날짜 없이 파일명 생성 | 시간순 정렬 및 맥락 추적 불가 |
| 코드 파일(`.ts`, `.js`, `.py` 등) 저장 | works/는 문서 전용 |
| `covering-labs` prefix 없이 파일명 생성 | 다른 프로젝트 작업 기록과 혼동 방지 |
