#!/usr/bin/env python3
"""
protected-file-guard.py

PreToolUse(Edit|Write) 훅 — 절대 수정 금지 파일 수정 시도를 차단합니다.

  - stdin: JSON { file_path }
  - stderr: 차단 메시지
  - exit code: 0 = 통과, 2 = 차단

승인 메커니즘:
  사용자가 명시적으로 해당 파일 수정을 승인한 경우,
  .omc/state/protected-file-approved.json 을 아래 형식으로 생성하세요 (10분 유효):
  { "files": ["deploy.yml"], "ts": <unix_timestamp>, "reason": "승인 이유" }
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

PROTECTED = [
    ".github/workflows/deploy.yml",
    "scripts/deploy-app.sh",
    "scripts/undeploy-app.sh",
    ".gitignore",
    "_template",
    "CLAUDE.md",
    "AGENTS.md",
    "GEMINI.md",
    "_dashboard",
    ".hooks/",
    ".claude/settings.json",
]

APPROVAL_TTL = 600  # 10분
REPO_ROOT = Path(__file__).resolve().parents[1]
APPROVAL_FILE = REPO_ROOT / ".omc/state/protected-file-approved.json"

BLOCK_MSG = """[수정 차단] {fp} 은 절대 수정 금지 파일입니다.

수정하려면:
1. 사용자에게 수정 이유를 설명하고 명시적 승인을 받으세요.
2. 사용자가 승인하면 아래 파일을 생성하세요 (10분 유효):
   {approval_path}
   내용: {{"files": ["{basename}"], "ts": {ts_example}, "reason": "승인 이유"}}
3. 그 후 다시 시도하세요.

참고: CLAUDE.md §절대 수정 금지 파일
"""


def check_approval(fp: str) -> bool:
    if not APPROVAL_FILE.exists():
        return False
    try:
        data = json.loads(APPROVAL_FILE.read_text(encoding="utf-8"))
        if time.time() - data.get("ts", 0) > APPROVAL_TTL:
            APPROVAL_FILE.unlink(missing_ok=True)
            return False
        return any(p in fp for p in data.get("files", []))
    except (json.JSONDecodeError, OSError, KeyError, ValueError):
        return False


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
    fp = payload.get("file_path") or ""
    if not fp:
        return 0

    matched = [p for p in PROTECTED if p in fp]
    if not matched:
        return 0

    if check_approval(fp):
        print(f"[수정 금지 파일 승인됨] {fp} 수정 진행합니다.")
        return 0

    print(
        BLOCK_MSG.format(
            fp=fp,
            basename=matched[0],
            approval_path=str(APPROVAL_FILE),
            ts_example=int(time.time()),
        ),
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
