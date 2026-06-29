#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../" && pwd)"
HOME_DIR="${HOME:?HOME is required}"

CLAUDE_SKILL_SRC="$REPO_ROOT/.claude/skills/release-file-guard/SKILL.md"
CLAUDE_INSTALL_SRC="$REPO_ROOT/.claude/skills/release-file-guard/INSTALL.md"
CODEX_SKILL_SRC="$REPO_ROOT/.codex/skills/release-file-guard/SKILL.md"
CODEX_INSTALL_SRC="$REPO_ROOT/.codex/skills/release-file-guard/INSTALL.md"
HELPER_SRC="$REPO_ROOT/.hooks/release-file-guard.py"

mkdir -p "$HOME_DIR/.claude/skills/release-file-guard" "$HOME_DIR/.claude/hooks"
mkdir -p "$HOME_DIR/.codex/skills/release-file-guard" "$HOME_DIR/.codex/hooks"

cp "$CLAUDE_SKILL_SRC" "$HOME_DIR/.claude/skills/release-file-guard/SKILL.md"
cp "$CLAUDE_INSTALL_SRC" "$HOME_DIR/.claude/skills/release-file-guard/INSTALL.md"
cp "$CODEX_SKILL_SRC" "$HOME_DIR/.codex/skills/release-file-guard/SKILL.md"
cp "$CODEX_INSTALL_SRC" "$HOME_DIR/.codex/skills/release-file-guard/INSTALL.md"
cp "$HELPER_SRC" "$HOME_DIR/.claude/hooks/release-file-guard.py"
cp "$HELPER_SRC" "$HOME_DIR/.codex/hooks/release-file-guard.py"

python3 - <<'PY'
import json
import os
from pathlib import Path

home = Path(os.environ['HOME'])
claude_path = home / '.claude' / 'settings.json'
codex_path = home / '.codex' / 'hooks.json'
claude_cmd = 'python3 "$HOME/.claude/hooks/release-file-guard.py"'
codex_cmd = 'python3 "$HOME/.codex/hooks/release-file-guard.py"'
status_msg = '출고 전 파일 필터 확인 중'


def load_or_default(path: Path):
    if path.exists() and path.read_text().strip():
        return json.loads(path.read_text())
    return {'hooks': {}}


def ensure_user_prompt(data, command, add_status=False):
    hooks = data.setdefault('hooks', {})
    user_prompt = hooks.setdefault('UserPromptSubmit', [])
    if user_prompt:
        hook_list = user_prompt[0].setdefault('hooks', [])
    else:
        hook_list = []
        user_prompt.append({'hooks': hook_list})
    if not any(h.get('command') == command for h in hook_list):
        entry = {'type': 'command', 'command': command}
        if add_status:
            entry['statusMessage'] = status_msg
        hook_list.append(entry)


def ensure_bash(data, command, add_status=False):
    hooks = data.setdefault('hooks', {})
    pre_tool = hooks.setdefault('PreToolUse', [])
    bash_entry = None
    for entry in pre_tool:
        if entry.get('matcher') == 'Bash':
            bash_entry = entry
            break
    if bash_entry is None:
        bash_entry = {'matcher': 'Bash', 'hooks': []}
        pre_tool.append(bash_entry)
    hook_list = bash_entry.setdefault('hooks', [])
    if not any(h.get('command') == command for h in hook_list):
        entry = {'type': 'command', 'command': command}
        if add_status:
            entry['statusMessage'] = status_msg
        hook_list.append(entry)


claude = load_or_default(claude_path)
ensure_user_prompt(claude, claude_cmd, add_status=False)
ensure_bash(claude, claude_cmd, add_status=False)
claude_path.write_text(json.dumps(claude, ensure_ascii=False, indent=2) + '\n')

codex = load_or_default(codex_path)
ensure_user_prompt(codex, codex_cmd, add_status=True)
ensure_bash(codex, codex_cmd, add_status=True)
codex_path.write_text(json.dumps(codex, ensure_ascii=False, indent=2) + '\n')
PY

cat <<'MSG'
[release-file-guard] 설치 완료

다음 경로를 확인하세요:
- ~/.claude/skills/release-file-guard/SKILL.md
- ~/.claude/hooks/release-file-guard.py
- ~/.codex/skills/release-file-guard/SKILL.md
- ~/.codex/hooks/release-file-guard.py

검증 방법:
1. Claude/Codex에 "배포해줘"라고 입력
2. [RELEASE-FILE-GUARD] 경고가 뜨는지 확인
3. git commit / git push 직전 파일 분류 경고가 뜨는지 확인

주의:
- Codex hook은 대상 repo에서 hooks 기능이 켜져 있어야 합니다.
- covering-labs에서는 `.codex/config.toml`에 이미 `[features] codex_hooks = true`가 설정되어 있습니다.
MSG
