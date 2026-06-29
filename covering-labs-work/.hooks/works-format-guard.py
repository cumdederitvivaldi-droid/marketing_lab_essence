#!/usr/bin/env python3
"""
works-format-guard.py

PreToolUse(Edit|Write) 훅 — works/ 문서 형식을 검사합니다.

검사 항목:
  1. 저장 위치: works/plan/ 또는 works/reports/ 하위에만 허용
  2. 파일명: {YYYY-MM-DD}-covering-labs-{slug}.md 형식
  3. 헤더: > 유형:, > 작성일:, > 상태: 필드 존재 여부
  4. 상태 값: 허용된 값 중 하나

- stdin: JSON { file_path, content (Write의 경우) }
- stdout: 경고 메시지 (AI 컨텍스트에 주입)
- exit code: 항상 0 (차단 없음, 안내만)
"""
from __future__ import annotations

import json
import os
import re
import sys

ALLOWED_STATUS = {"초안", "검토중", "확정", "완료"}
FILENAME_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}-covering-labs-.+\.md$")


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


def check_works_file(fp: str, content: str | None) -> list[str]:
    warnings = []

    norm = fp.replace("\\", "/")
    if not re.search(r"(^|/)works/", norm):
        return warnings

    basename = os.path.basename(norm)

    if basename == "AGENTS.md" or not norm.endswith(".md"):
        return warnings

    # 저장 위치 검사
    if not re.search(r"(^|/)works/(plan|reports)/", norm):
        warnings.append(
            "[WORKS 위치] works/ 루트에 직접 파일을 저장할 수 없습니다.\n"
            "  → works/plan/ 또는 works/reports/ 하위에 저장하세요."
        )
        return warnings

    # 파일명 형식 검사
    if not FILENAME_PATTERN.match(basename):
        warnings.append(
            f"[WORKS 파일명] `{basename}` 형식이 올바르지 않습니다.\n"
            "  → 올바른 형식: YYYY-MM-DD-covering-labs-{{slug}}.md\n"
            "  → 예시: 2026-04-23-covering-labs-my-feature.md"
        )

    # 헤더 검사
    text = content
    if text is None and os.path.exists(fp):
        try:
            with open(fp, encoding="utf-8") as f:
                text = f.read()
        except Exception:
            return warnings

    if not text:
        return warnings

    header_area = "\n".join(text.splitlines()[:12])
    missing_fields = []
    if not re.search(r"^>\s*유형\s*:", header_area, re.MULTILINE):
        missing_fields.append("> 유형: PRD | 플랜 | 분석")
    if not re.search(r"^>\s*작성일\s*:", header_area, re.MULTILINE):
        missing_fields.append("> 작성일: YYYY-MM-DD")
    if not re.search(r"^>\s*상태\s*:", header_area, re.MULTILINE):
        missing_fields.append("> 상태: 초안 | 검토중 | 확정 | 완료")

    if missing_fields:
        warnings.append(
            "[WORKS 헤더] 필수 헤더 필드가 없습니다:\n"
            + "\n".join(f"  → {f}" for f in missing_fields)
        )
    else:
        # 상태 값 검사
        status_match = re.search(r">\s*상태\s*:\s*(.+)", text)
        if status_match:
            status_val = status_match.group(1).strip()
            if status_val not in ALLOWED_STATUS:
                warnings.append(
                    f"[WORKS 상태] `{status_val}` 는 허용되지 않는 상태 값입니다.\n"
                    "  → 허용 값: 초안 | 검토중 | 확정 | 완료"
                )

    return warnings


def main() -> int:
    payload = load_payload()
    fp = payload.get("file_path") or ""
    content = payload.get("content")

    for w in check_works_file(fp, content):
        print(w)

    return 0


if __name__ == "__main__":
    sys.exit(main())
