#!/usr/bin/env python3
"""
git-add-secret-guard.py

PreToolUse(Bash) 훅 — 민감 파일이 포함될 수 있는 git add 명령을 감지하고 경고합니다.

  - stdin: JSON { command }
  - stdout: 경고 메시지 (AI 컨텍스트에 주입)
  - exit code: 항상 0 (차단 없음, 경고만)
"""
from __future__ import annotations

import json
import sys

SENSITIVE_FILES = [".env", ".key", ".pem", "credentials", "service-account", "sa-key"]


def load_payload() -> dict:
    """stdin JSON 파싱 + Claude Code의 tool_input wrap 평탄화."""
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    tool_input = data.get("tool_input")
    if isinstance(tool_input, dict):
        flat = {k: v for k, v in data.items() if k != "tool_input"}
        flat.update(tool_input)
        return flat
    return data


def main() -> int:
    payload = load_payload()
    cmd = payload.get("command") or ""

    is_broad_add = "git add -A" in cmd or "git add ." in cmd
    is_sensitive_add = "git add" in cmd and any(s in cmd for s in SENSITIVE_FILES)

    if is_broad_add or is_sensitive_add:
        print("[보안] 민감 파일이 포함될 수 있는 git add 명령입니다. .gitignore 확인 후 진행하세요.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
