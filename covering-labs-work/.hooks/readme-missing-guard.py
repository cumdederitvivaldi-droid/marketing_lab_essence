#!/usr/bin/env python3
"""
readme-missing-guard.py

PostToolUse(Edit|Write) 훅 — apps/ 하위 deploy.yml 수정 후 README.md 누락을 감지하고 안내합니다.

  - stdin: JSON { file_path }
  - stdout: 안내 메시지 (AI 컨텍스트에 주입)
  - exit code: 항상 0 (차단 없음, 안내만)
"""
from __future__ import annotations

import json
import os
import sys


def load_payload() -> dict:
    """stdin JSON 파싱 + Claude Code의 tool_input wrap 평탄화 (PostToolUse Edit|Write 포함)."""
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
    fp = payload.get("file_path") or ""

    if "apps/" in fp and "deploy.yml" in fp:
        app_dir = os.path.dirname(fp)
        if app_dir and not os.path.exists(os.path.join(app_dir, "README.md")):
            print(
                f"[README 필수] {app_dir}/README.md 가 없습니다.\n"
                "  → PR 전에 반드시 README.md를 작성하세요 (apps/AGENTS.md § README 필수 규칙 참조)"
            )

    return 0


if __name__ == "__main__":
    sys.exit(main())
