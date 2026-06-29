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
    try:
        return json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return {}


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
