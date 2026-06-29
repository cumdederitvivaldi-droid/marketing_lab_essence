#!/usr/bin/env python3
"""
deploy-yml-guard.py

Claude/Codex PreToolUse hook — apps/public/[app]/deploy.yml 에 대해
GitHub Actions 가 CI에서 거부하는 조합을 사전 차단한다.

규칙:
1. apps/public/*/deploy.yml 의 type 이 nextjs / nestjs 가 아니면 차단 (batch 포함)
2. apps/public/*/deploy.yml 에 schedule 필드가 있으면 차단 (public 에서 cron 불가)
3. apps/private/*/deploy.yml 의 type 이 batch 인 경우 schedule, command 필드 존재 확인
4. type 필드가 없으면 차단

호출 인터페이스: Claude PreToolUse Edit|Write hook
  - stdin: JSON { tool_name, file_path, content? , old_string?, new_string? }
  - stdout: 위반 시 사람이 읽을 경고 메시지
  - exit code: 0 = 통과, 1 = 차단 (Claude 가 edit 을 보류)
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ALLOWED_PUBLIC_TYPES = {"nextjs", "nestjs"}


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


def extract_yaml_field(content: str, field: str) -> str | None:
    """Return value for a top-level YAML scalar field, or None if absent."""
    pattern = rf"^{field}:\s*['\"]?([^'\"\n#]*)['\"]?"
    for line in content.splitlines():
        m = re.match(pattern, line.strip())
        if m:
            return m.group(1).strip()
    return None


def has_yaml_field(content: str, field: str) -> bool:
    """Return True when a top-level YAML key exists, regardless of value (even empty)."""
    pattern = rf"^{field}:(\s|$)"
    for line in content.splitlines():
        if re.match(pattern, line.strip()):
            return True
    return False


def is_deploy_yml_path(path: str) -> tuple[bool, str]:
    """Return (is_deploy_yml, scope) where scope ∈ {'public', 'private', 'other'}."""
    norm = path.replace("\\", "/")
    if not norm.endswith("/deploy.yml"):
        return False, "other"
    parts = norm.split("/")
    # look for apps/<scope>/<app>/deploy.yml
    for i in range(len(parts) - 3):
        if parts[i] == "apps":
            scope = parts[i + 1]
            if scope == "public":
                return True, "public"
            if scope == "private":
                return True, "private"
            return True, "other"
    return False, "other"


def get_effective_content(payload: dict) -> str:
    """Resolve the content that will end up on disk after this tool call."""
    # Write tool
    if "content" in payload and payload.get("content") is not None:
        return str(payload["content"])
    # Edit tool — prefer new_string as the source of truth for newly written YAML fields.
    # For partial edits, check both old and new to minimize false negatives.
    new_string = payload.get("new_string") or ""
    old_string = payload.get("old_string") or ""
    # If the edit replaces the entire file, new_string alone is enough.
    # If it's partial, we still scan new_string (what the AI wants to write).
    return str(new_string) if new_string else str(old_string)


def check_public(content: str) -> list[str]:
    errors: list[str] = []
    type_value = extract_yaml_field(content, "type")

    if type_value is None:
        errors.append("`type` 필드가 없습니다. (nextjs | nestjs 중 하나 필수)")
    elif type_value not in ALLOWED_PUBLIC_TYPES:
        errors.append(
            f"public 앱의 type=`{type_value}` 은 허용되지 않습니다. "
            f"public VM 은 {sorted(ALLOWED_PUBLIC_TYPES)} 만 허용하며, batch 는 반드시 apps/private/ 에 배치하세요."
        )

    # schedule 은 value 와 무관하게 "필드 존재 자체"를 차단한다.
    if has_yaml_field(content, "schedule"):
        errors.append(
            "public 앱에는 `schedule` 필드를 사용할 수 없습니다 (값이 비어 있어도 불가). cron 배치는 private VM 전용입니다."
        )
    return errors


def check_private(content: str) -> list[str]:
    errors: list[str] = []
    type_value = extract_yaml_field(content, "type")

    if type_value is None:
        errors.append("`type` 필드가 없습니다. (nextjs | nestjs | batch 중 하나 필수)")
    elif type_value == "batch":
        if not extract_yaml_field(content, "schedule"):
            errors.append("type=batch 인 경우 `schedule` 필드가 필수입니다 (cron 표현식).")
        if not extract_yaml_field(content, "command"):
            errors.append("type=batch 인 경우 `command` 필드가 필수입니다 (실행 명령어).")
    return errors


def main() -> int:
    payload = load_payload()
    file_path = payload.get("file_path") or payload.get("path") or ""
    if not file_path:
        return 0

    is_deploy, scope = is_deploy_yml_path(file_path)
    if not is_deploy:
        return 0

    content = get_effective_content(payload)
    if not content.strip():
        return 0

    if scope == "public":
        errors = check_public(content)
    elif scope == "private":
        errors = check_private(content)
    else:
        return 0

    if errors:
        print(f"[DEPLOY-YML-GUARD] {file_path} 위반 감지:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        print("  → apps/AGENTS.md § private vs public 앱 구분 참조", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
