# release-file-guard 설치 안내

`SKILL.md`만 복사하면 끝나지 않습니다.
이 스킬은 아래 3가지를 함께 설치해야 제대로 동작합니다.

1. `SKILL.md`
2. hook helper (`release-file-guard.py`)
3. Claude/Codex 설정 연결 (`settings.json`, `hooks.json`)

## 가장 쉬운 방법

covering-labs repo를 갖고 있다면 아래 한 줄로 설치합니다.

```bash
bash .claude/skills/release-file-guard/install-global.sh
```

설치가 끝나면 아래로 확인합니다.

- Claude/Codex에 `배포해줘`라고 말했을 때 `[RELEASE-FILE-GUARD]` 경고가 뜨는지
- `git commit` 또는 `git push` 직전에 파일 분류 경고가 뜨는지

## 자세한 가이드

- repo 안에서 읽을 문서: `docs/10_출고_전_파일_필터_설치.md`
- 비개발자에게 전달할 때도 `SKILL.md` 하나가 아니라, 이 `INSTALL.md`와 설치 스크립트를 같이 전달하세요.
