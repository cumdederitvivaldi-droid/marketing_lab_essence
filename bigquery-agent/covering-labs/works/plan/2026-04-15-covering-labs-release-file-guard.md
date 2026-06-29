# covering-labs 출고 전 파일 필터 스킬 도입 플랜

> 유형: PRD | 플랜
> 작성일: 2026-04-15
> 상태: 완료

## 목표

비개발자가 Claude Code 또는 Codex로 covering-labs 작업을 마무리할 때,
앱 배포와 무관한 문서/임시 파일/민감 파일이 commit 또는 push에 섞여 올라가지 않도록
출고 전 점검용 스킬과 hook 알림을 도입한다.

## 현황 분석

- covering-labs는 비개발자가 앱을 빠르게 배포할 수 있도록 문서와 자동화가 풍부하다.
- 자유도가 높은 만큼 앱 코드와 무관한 정책 문서, 일반론 메모, AI 산출물, 로컬 산출물이 repo에 섞일 수 있다.
- 기존 hook은 works PRD, 보안 키워드, 배포 워크플로우는 알려주지만
  push 직전 "이 파일이 정말 repo에 올라가도 되는가"를 분류해 주는 guard는 없다.

## 구현 계획

### 단계별 작업

- [x] covering-labs의 AGENTS / CLAUDE / GEMINI / works 규칙 확인
- [x] Claude/Codex 공용으로 쓸 `release-file-guard` skill 작성
- [x] push/commit/PR 직전에 동작하는 hook scanner 추가
- [x] Claude `.claude/settings.json`, Codex `.codex/hooks.json`에 easter egg 연결
- [x] plan 문서에 변경 파일과 운영 의도 기록
- [x] 비개발자 개인 로컬 설치용 INSTALL.md / install-global.sh 추가
- [x] 비개발자용 설치 문서 `docs/10_출고_전_파일_필터_설치.md` 추가
- [x] README / docs index / 비개발자 가이드에 설치 경로 노출

## 변경 파일

- `.claude/skills/release-file-guard/SKILL.md`
- `.claude/skills/release-file-guard/INSTALL.md`
- `.claude/skills/release-file-guard/install-global.sh`
- `.codex/skills/release-file-guard/SKILL.md`
- `.codex/skills/release-file-guard/INSTALL.md`
- `.codex/skills/release-file-guard/install-global.sh`
- `.claude/hooks/release-file-guard.py`
- `.claude/settings.json`
- `.codex/hooks.json`
- `docs/10_출고_전_파일_필터_설치.md`
- `docs/00_목차.md`
- `docs/08_비개발자_가이드.md`
- `README.md`
- `works/plan/2026-04-15-covering-labs-release-file-guard.md`

## 완료 기준

- Claude Code와 Codex 양쪽에서 동일한 skill 문서를 참조할 수 있다.
- `git commit`, `git push`, `gh pr create` 전후로 repo 부적합 파일 경고가 자동 출력된다.
- 경고에는 `ALLOW / REVIEW / REJECT` 기준과 후속 액션이 명시된다.
