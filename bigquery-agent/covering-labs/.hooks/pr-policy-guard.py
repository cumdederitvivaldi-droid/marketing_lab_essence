#!/usr/bin/env python3
"""
pr-policy-guard.py

Claude/Codex PreToolUse Bash 훅 — GitHub 운영 정책을 로컬에서도 강제한다.
CI(ai-pr-guardrail, deploy.yml) 와 이중 방어를 구성한다.

감시 대상 명령과 규칙:

1. `git push origin main` (또는 `git push <remote> main`)
   → 차단. main 브랜치 직접 push 는 절대 금지 (PR 필수).

2. `git push origin <branch>` / `git push --set-upstream ... <branch>`
   → 브랜치 이름이 `feat/` | `fix/` | `docs/` | `hotfix/` | `chore/` 로 시작하지 않으면 경고.

3. `gh pr create --body "<inline>"` / `gh pr create --body-file <path>` / `gh pr create -F <path>`
   → body 안에 다음이 누락/다수선택 시 차단:
     - `- [x] `ai-generated`` / `- [x] `ai-assisted`` / `- [x] `no-ai`` 정확히 1개
     - `- [x] `normal-change`` / `- [x] `post-release-fix`` / `- [x] `hotfix`` 정확히 1개
   → `post-release-fix` 또는 `hotfix` 면 `원인 PR: #\d+` 필수, `문제 코드/파일:` 이 N/A 가 아니어야 함.

호출 인터페이스: Claude PreToolUse Bash hook
  - stdin: JSON { tool_name, command }
  - stdout: 경고(정보성) 메시지
  - exit code: 0 = 통과, 1 = 차단
"""
from __future__ import annotations

import json
import os
import re
import shlex
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ALLOWED_BRANCH_PREFIXES = ("feat/", "fix/", "docs/", "hotfix/", "chore/")


def load_payload() -> dict:
    try:
        return json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return {}


def split_command(cmd: str) -> list[str]:
    try:
        return shlex.split(cmd)
    except ValueError:
        return cmd.split()


def check_main_push(tokens: list[str]) -> list[str]:
    """`git push <remote> main` 감지 (refspec/force flag 포함)."""
    if len(tokens) < 2 or tokens[0] != "git" or tokens[1] != "push":
        return []
    rest = [t for t in tokens[2:] if not t.startswith("-")]
    if len(rest) < 2:
        return []
    remote, refspec = rest[0], rest[1]
    target = refspec.split(":")[-1]
    if target == "main":
        return [
            f"[PR-POLICY] `git push {remote} main` 은 차단됩니다. main 직접 push 금지.",
            "  → 해결: feat/fix/docs/hotfix/chore 브랜치로 push 후 gh pr create 로 PR 을 열어주세요.",
            "  → 참고: CLAUDE.md § 배포 워크플로우 (PR 필수)",
        ]
    return []


def check_branch_prefix(tokens: list[str]) -> list[str]:
    """push 대상 브랜치 prefix 검사 (경고)."""
    if len(tokens) < 2 or tokens[0] != "git" or tokens[1] != "push":
        return []
    args = tokens[2:]
    has_upstream_flag = any(a in ("-u", "--set-upstream") for a in args)
    rest = [t for t in args if not t.startswith("-")]
    branch_candidate = None
    if len(rest) >= 2:
        refspec = rest[1]
        branch_candidate = refspec.split(":")[-1]
    elif has_upstream_flag and len(rest) == 0:
        branch_candidate = None
    if not branch_candidate or branch_candidate == "HEAD" or branch_candidate == "main":
        return []
    if not branch_candidate.startswith(ALLOWED_BRANCH_PREFIXES):
        return [
            f"[PR-POLICY] 브랜치 `{branch_candidate}` 이 권장 prefix 와 다릅니다.",
            f"  → 권장: {'/'.join(p[:-1] for p in ALLOWED_BRANCH_PREFIXES)}/YYYY-MM-DD-<slug>",
            "  → 예: feat/2026-04-21-public-vm-setup",
        ]
    return []


def extract_heredoc_body(cmd: str) -> str | None:
    """'$(cat <<'EOF'\\n...\\nEOF)' 패턴에서 body 텍스트 추출."""
    m = re.search(r'\$\(cat\s+<<[\'"]?EOF[\'"]?\s*\n(.*?)\nEOF\s*\)', cmd, re.DOTALL)
    if m:
        return m.group(1)
    # 따옴표 없이 heredoc 사용하는 경우도 처리
    m = re.search(r'--body\s+"([^"]*)"', cmd, re.DOTALL)
    if m:
        return m.group(1)
    return None


def resolve_body_text(raw_cmd: str, tokens: list[str]) -> tuple[str | None, str | None]:
    """gh pr create 의 body / body-file / -F 를 해석해 본문 문자열 반환.

    Returns (source, body) — body 가 None 이면 확인 불가.
    """
    if len(tokens) < 3 or tokens[0] != "gh" or tokens[1] != "pr" or tokens[2] != "create":
        return None, None

    # HEREDOC 패턴 우선 시도 (shlex.split이 파싱 못하는 경우)
    heredoc_body = extract_heredoc_body(raw_cmd)
    if heredoc_body:
        return ("body", heredoc_body)

    i = 3
    while i < len(tokens):
        t = tokens[i]
        if t in ("--body", "-b") and i + 1 < len(tokens):
            return ("body", tokens[i + 1])
        if t.startswith("--body="):
            return ("body", t.split("=", 1)[1])
        if t in ("--body-file", "-F") and i + 1 < len(tokens):
            path_str = tokens[i + 1]
            p = Path(path_str).expanduser()
            if not p.is_absolute():
                p = (REPO_ROOT / path_str).resolve()
            try:
                return ("body-file", p.read_text(encoding="utf-8"))
            except OSError as e:
                return ("body-file-error", f"{path_str} 읽기 실패: {e}")
        if t.startswith("--body-file="):
            path_str = t.split("=", 1)[1]
            p = Path(path_str).expanduser()
            if not p.is_absolute():
                p = (REPO_ROOT / path_str).resolve()
            try:
                return ("body-file", p.read_text(encoding="utf-8"))
            except OSError as e:
                return ("body-file-error", f"{path_str} 읽기 실패: {e}")
        i += 1
    return ("none", None)


# 허용된 최상위 경로 (apps 하위는 private/public만 허용)
ALLOWED_TOPLEVEL = {
    "apps", "docs", "works", ".github", ".claude", ".codex",
    "scripts", "infra", "AGENTS.md", "CLAUDE.md", "GEMINI.md",
    "README.md", ".gitignore", ".gitattributes",
}
ALLOWED_APPS_SUBDIRS = {"private", "public", "_template", "AGENTS.md", "README.md"}


def check_main_sync(tokens: list[str]) -> list[str]:
    """gh pr create 전에 origin/main 이 최신인지 확인 (경고)."""
    if len(tokens) < 3 or tokens[0] != "gh" or tokens[1] != "pr" or tokens[2] != "create":
        return []
    import subprocess as sp
    try:
        fetch_result = sp.run(
            ["git", "fetch", "origin", "main", "--quiet"],
            capture_output=True, timeout=15, cwd=str(REPO_ROOT)
        )
        if fetch_result.returncode != 0:
            return []
        result = sp.run(
            ["git", "rev-list", "--count", "HEAD..origin/main"],
            capture_output=True, text=True, timeout=10, cwd=str(REPO_ROOT)
        )
        if result.returncode != 0:
            return []
        behind = int(result.stdout.strip() or "0")
        if behind > 0:
            return [
                f"[PR-POLICY] 현재 브랜치가 origin/main 보다 {behind}개 커밋 뒤처져 있습니다.",
                "  → `git pull origin main --rebase` 후 PR 을 생성하세요.",
            ]
    except Exception:
        pass
    return []


def check_file_paths(tokens: list[str]) -> list[str]:
    """gh pr create 시 변경된 파일 경로가 가이드라인에 맞는지 확인."""
    if len(tokens) < 3 or tokens[0] != "gh" or tokens[1] != "pr" or tokens[2] != "create":
        return []
    import subprocess as sp
    try:
        result = sp.run(
            ["git", "diff", "--name-only", "origin/main...HEAD"],
            capture_output=True, text=True, timeout=10, cwd=str(REPO_ROOT)
        )
        if result.returncode != 0:
            return []
        changed = [f.strip() for f in result.stdout.splitlines() if f.strip()]
    except Exception:
        return []

    errors: list[str] = []
    for path in changed:
        parts = path.split("/")
        top = parts[0]
        if top not in ALLOWED_TOPLEVEL and "." not in top:
            errors.append(
                f"[PR-POLICY] 비허용 경로: `{path}`\n"
                f"  → covering-labs 앱은 `apps/private/[앱이름]/` 또는 `apps/public/[앱이름]/` 에 있어야 합니다.\n"
                f"  → `{top}/` 디렉토리는 이 레포에서 허용되지 않습니다."
            )
        elif top == "apps" and len(parts) >= 2:
            sub = parts[1]
            if sub not in ALLOWED_APPS_SUBDIRS:
                errors.append(
                    f"[PR-POLICY] 비허용 앱 경로: `{path}`\n"
                    f"  → apps 하위는 `private/` 또는 `public/` 만 허용됩니다. `apps/{sub}/` 는 올바르지 않습니다."
                )
    return errors


def check_deploy_checklist(body: str) -> list[str]:
    """배포 전 필수 확인 체크박스가 모두 [x]인지 검사."""
    section_match = re.search(
        r"^##\s*.*배포 전 필수 확인.*$\n?(.*?)(?=^##\s|\Z)",
        body,
        re.MULTILINE | re.DOTALL,
    )
    if not section_match:
        return []
    section = section_match.group(1)
    unchecked = re.findall(r"- \[ \] (.+)", section)
    if unchecked:
        return [
            f"배포 전 필수 확인 체크박스 {len(unchecked)}개가 미체크 상태입니다:\n"
            + "\n".join(f"  → {item.strip()}" for item in unchecked)
            + "\n  → 모든 항목을 확인하고 `- [x]`로 바꾼 후 PR을 생성하세요."
        ]
    return []


def check_pr_body(body: str) -> list[str]:
    """PR body 에 AI/후속수정 라벨 체크박스, 배포 전 체크리스트, post-release-fix 메타데이터 검증."""
    errors: list[str] = []

    errors.extend(check_deploy_checklist(body))

    ai_patterns = {
        "ai-generated": r"- \[x\] `ai-generated`",
        "ai-assisted": r"- \[x\] `ai-assisted`",
        "no-ai": r"- \[x\] `no-ai`",
    }
    ai_hits = [k for k, p in ai_patterns.items() if re.search(p, body)]
    if len(ai_hits) != 1:
        errors.append(
            f"AI 사용 여부 체크박스가 {len(ai_hits)}개 선택됨 (정확히 1개 필요). "
            "PR body 의 `- [ ] `ai-generated|ai-assisted|no-ai`` 중 하나를 `- [x]` 로 바꾸세요."
        )

    followup_patterns = {
        "normal-change": r"- \[x\] `normal-change`",
        "post-release-fix": r"- \[x\] `post-release-fix`",
        "hotfix": r"- \[x\] `hotfix`",
    }
    followup_hits = [k for k, p in followup_patterns.items() if re.search(p, body)]
    if len(followup_hits) != 1:
        errors.append(
            f"후속 수정 여부 체크박스가 {len(followup_hits)}개 선택됨 (정확히 1개 필요). "
            "PR body 의 `- [ ] `normal-change|post-release-fix|hotfix`` 중 하나를 `- [x]` 로 바꾸세요."
        )

    is_followup = any(k in followup_hits for k in ("post-release-fix", "hotfix"))
    if is_followup:
        cause_match = re.search(r"원인 PR:\s*(#\d+|N/A)", body)
        if not cause_match or cause_match.group(1).upper() == "N/A":
            errors.append(
                "post-release-fix/hotfix PR 은 `원인 PR:` 에 실제 PR 번호(`#123` 형식)가 필요합니다. `N/A` 는 허용되지 않습니다."
            )
        problem_match = re.search(r"문제 코드/파일:\s*(.+)", body)
        if not problem_match or problem_match.group(1).strip().upper().startswith("N/A"):
            errors.append(
                "post-release-fix/hotfix PR 은 `문제 코드/파일:` 에 실제 파일 경로가 필요합니다 (예: `apps/private/foo/src/bar.ts`). `N/A` 는 허용되지 않습니다."
            )

    return errors


def check_auto_pr_warning(tokens: list[str]) -> list[str]:
    """gh pr create 또는 git push 시 AI 자동 실행 경고 (차단 없음).

    사용자가 '배포 준비해줘' 등 명시적 배포 키워드를 말했을 때만 실행해야 함을 재확인.
    """
    if len(tokens) < 2:
        return []
    is_gh_pr_create = (
        len(tokens) >= 3 and tokens[0] == "gh" and tokens[1] == "pr" and tokens[2] == "create"
    )
    is_git_push = tokens[0] == "git" and tokens[1] == "push"
    if not (is_gh_pr_create or is_git_push):
        return []
    action = "gh pr create" if is_gh_pr_create else "git push"
    return [
        f"[PR-POLICY] ⚠️  {action} 실행 전 재확인:",
        "  → 사용자가 '배포 준비해줘 / 배포해줘 / PR 올려줘 / push 해줘' 등의",
        "    명시적 키워드로 배포를 지시했는지 확인하세요.",
        "  → 작업 완료 자동 트리거로 PR/push 를 실행하는 것은 금지됩니다.",
        "  → 지시가 없었다면 지금 멈추고 사용자에게 보고하세요.",
        "  → 참고: CLAUDE.md § 개발 기본 흐름 (PR 자동 생성 금지)",
    ]


def main() -> int:
    payload = load_payload()
    cmd = payload.get("command") or ""
    if not cmd:
        return 0
    tokens = split_command(cmd)
    if not tokens:
        return 0

    errors: list[str] = []
    warnings: list[str] = []

    block_main = check_main_push(tokens)
    if block_main:
        errors.extend(block_main)

    warnings.extend(check_branch_prefix(tokens))
    if not block_main:
        warnings.extend(check_auto_pr_warning(tokens))

    source, body_or_error = resolve_body_text(cmd, tokens)
    if source == "body-file-error":
        errors.append(f"[PR-POLICY] gh pr create --body-file 읽기 실패: {body_or_error}")
    elif source in ("body", "body-file") and isinstance(body_or_error, str):
        body_errors = check_pr_body(body_or_error)
        for e in body_errors:
            errors.append(f"[PR-POLICY] {e}")
    elif source == "none" and len(tokens) >= 3 and tokens[0] == "gh" and tokens[1] == "pr" and tokens[2] == "create":
        # body 없이 gh pr create → 차단: AI 라벨 없이 PR 생성 불가
        errors.append(
            "[PR-POLICY] gh pr create 에 --body 또는 --body-file 이 없습니다. "
            "AI/후속수정 체크박스 포함 PR body 를 반드시 전달하세요.\n"
            "  → --body \"$(cat <<'EOF'\\n## ...\\n- [x] `ai-assisted`\\nEOF\\n)\" 형식 사용"
        )

    warnings.extend(check_main_sync(tokens))

    path_errors = check_file_paths(tokens)
    errors.extend(path_errors)

    for w in warnings:
        print(w, file=sys.stderr)
    for e in errors:
        print(e, file=sys.stderr)

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
