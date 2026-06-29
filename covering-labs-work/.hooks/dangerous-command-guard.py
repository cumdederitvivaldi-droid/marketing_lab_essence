#!/usr/bin/env python3
"""
dangerous-command-guard.py

PreToolUse(Bash) 훅 — 위험한 시스템 명령 및 원격 코드 파이프 실행 패턴을 감지하고 차단합니다.

  - stdin: JSON { command }
  - stderr: 차단 메시지
  - exit code: 0 = 통과, 2 = 차단
"""
from __future__ import annotations

import json
import sys

DANGEROUS_CMDS = [
    "rm -rf /shared",
    "rm -rf /etc",
    "rm -rf /home",
    "chmod 777",
    "chmod -R 777",
]

PIPE_EXEC_TRIGGERS = ["| bash", "| sh", "| python", "| python3"]

# 승인 우회 파일에 대한 bash 직접 쓰기 차단
APPROVAL_BYPASS_PATTERNS = [
    "protected-file-approved",
]


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

    violations = []

    if any(x in cmd for x in DANGEROUS_CMDS):
        violations.append(
            f"[실행 차단] 위험한 시스템 명령 감지 — 실행이 차단되었습니다: {cmd[:120]}\n"
            "사용자에게 명시적 승인을 받으세요."
        )

    if ("curl" in cmd or "wget" in cmd) and any(x in cmd for x in PIPE_EXEC_TRIGGERS):
        violations.append(
            "[실행 차단] 원격 코드 파이프 실행 패턴 감지 — 스크립트 내용 확인 후 사용자 승인을 받으세요."
        )

    if any(p in cmd for p in APPROVAL_BYPASS_PATTERNS):
        violations.append(
            "[실행 차단] 보호 우회 시도 감지 — protected-file-approved.json 을 Bash로 직접 생성/수정할 수 없습니다.\n"
            "사용자가 터미널에서 직접 승인 파일을 생성해야 합니다."
        )

    for v in violations:
        print(v, file=sys.stderr)

    return 2 if violations else 0


if __name__ == "__main__":
    sys.exit(main())
