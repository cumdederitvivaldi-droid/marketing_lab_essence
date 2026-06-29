#!/usr/bin/env python3
"""
works-status-reminder.py

PostToolUse(Edit|Write) 훅 — works/ 문서 수정 후 현재 상태를 표시하고 업데이트를 안내합니다.

- stdin: JSON { file_path }
- stdout: 안내 메시지 (AI 컨텍스트에 주입)
- exit code: 항상 0
"""
from __future__ import annotations

import json
import os
import re
import sys

ALLOWED_STATUS = {"초안", "검토중", "확정", "완료"}


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

    norm = fp.replace("\\", "/")
    if not re.search(r"(^|/)works/", norm) or not norm.endswith(".md"):
        return 0
    if os.path.basename(norm) == "AGENTS.md":
        return 0
    if not re.search(r"(^|/)works/(plan|reports)/", norm):
        return 0

    fs_path = os.path.normpath(norm)
    try:
        with open(fs_path, encoding="utf-8") as f:
            content = f.read()
    except Exception:
        return 0

    header_area = "\n".join(content.splitlines()[:12])
    status_match = re.search(r"^>\s*상태\s*:\s*(.+)", header_area, re.MULTILINE)
    current_status = status_match.group(1).strip() if status_match else None

    if current_status is None:
        print(
            f"[WORKS 상태] `{os.path.basename(fp)}` 에 > 상태: 필드가 없습니다.\n"
            "  → 허용 값: 초안 | 검토중 | 확정 | 완료"
        )
    elif current_status not in ALLOWED_STATUS:
        print(
            f"[WORKS 상태] 현재 상태 `{current_status}` 는 허용되지 않는 값입니다. 수정이 필요합니다.\n"
            "  → 허용 값: 초안 | 검토중 | 확정 | 완료"
        )
    else:
        print(
            f"[WORKS 상태] 현재 상태: `{current_status}` — 작업 진행 상황에 맞게 업데이트하세요.\n"
            "  → 허용 값: 초안 | 검토중 | 확정 | 완료"
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
