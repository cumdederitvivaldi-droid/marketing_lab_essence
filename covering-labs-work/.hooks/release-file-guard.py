#!/usr/bin/env python3
"""
release-file-guard.py

Claude/Codex hook helper for covering-labs.
- UserPromptSubmit: remind when deploy/push/commit intent appears
- Bash PreToolUse: inspect staged/push-range files and warn before commit/push/PR
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

PROMPT_KEYWORDS = [
    '배포', 'push', '커밋', 'pr', 'merge', '올려줘', 'main에 올려', 'main으로 올려',
    '배포해줘', '배포할게', 'pr 생성', 'pull request'
]
COMMAND_KEYWORDS = ['git commit', 'git push', 'gh pr create']
ROOT_ALLOWED = {'README.md', 'AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.gitignore'}
APP_DOC_ALLOWED = {'README.md'}
GENERIC_DOC_NAMES = {
    'policy.md', 'playbook.md', 'prompt.md', 'system_prompt.md', 'implementation_plan.md',
    'execution_plan.md', 'retrospective.md', 'todo.md', 'notes.md', 'draft.md', '회의록.md'
}
REJECT_EXTS = {
    '.env', '.pem', '.key', '.p12', '.pfx', '.crt', '.cer', '.log', '.tmp', '.bak',
    '.sqlite', '.db', '.zip', '.tar', '.gz', '.tgz', '.csv', '.tsv', '.xlsx', '.sql',
    '.mov', '.mp4'
}
MEDIA_EXTS = {'.png', '.jpg', '.jpeg', '.gif', '.webp'}
REJECT_PATH_PARTS = {
    'node_modules', '.next', 'dist', 'coverage', 'tmp', '.pytest_cache', '__pycache__', '.ds_store'
}


def run_git(args: list[str]) -> str:
    try:
        out = subprocess.check_output(['git', *args], cwd=ROOT, stderr=subprocess.DEVNULL)
        return out.decode().strip()
    except Exception:
        return ''


def load_payload() -> dict:
    """stdin JSON 파싱 + Claude Code의 tool_input wrap 평탄화.

    이 훅은 UserPromptSubmit (prompt 키) 과 PreToolUse Bash (tool_input.command) 양쪽에 등록되어 있어 두 형식 모두 처리해야 한다.
    """
    try:
        data = json.load(sys.stdin)
    except Exception:
        return {}
    if not isinstance(data, dict):
        return {}
    tool_input = data.get("tool_input")
    if isinstance(tool_input, dict):
        flat = {k: v for k, v in data.items() if k != "tool_input"}
        flat.update(tool_input)
        return flat
    return data


def normalize_files(raw: str) -> list[str]:
    return [line.strip() for line in raw.splitlines() if line.strip()]


def get_default_base() -> str:
    origin_head = run_git(['symbolic-ref', 'refs/remotes/origin/HEAD'])
    if origin_head:
        return origin_head.replace('refs/remotes/', '')
    for candidate in ('origin/main', 'origin/master'):
        if run_git(['rev-parse', '--verify', candidate]):
            return candidate
    return 'HEAD~1'


def get_push_range_files() -> list[str]:
    upstream = run_git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
    base = upstream or get_default_base()
    files = run_git(['diff', '--name-only', f'{base}...HEAD'])
    return normalize_files(files)


def classify(path: str) -> tuple[str, str]:
    p = path.replace('\\', '/')
    lower = p.lower()
    name = Path(lower).name
    suffix = Path(lower).suffix
    parts = set(part.lower() for part in Path(lower).parts)

    if any(part in REJECT_PATH_PARTS for part in parts):
        return 'REJECT', '로컬 빌드/캐시/임시 산출물'

    if suffix in REJECT_EXTS:
        return 'REJECT', '민감정보 또는 로컬 산출물 가능성이 높은 확장자'

    if suffix in MEDIA_EXTS and not lower.startswith('apps/'):
        return 'REVIEW', '앱 자산이 아닌 이미지/미디어는 목적 확인 필요'

    if p in ROOT_ALLOWED:
        return 'ALLOW', '루트 canonical 파일'

    if lower.startswith('works/plan/') or lower.startswith('works/reports/'):
        return 'ALLOW', '작업 기록 문서의 정규 위치'

    if lower.startswith('docs/'):
        if re.match(r'^docs/\d\d_[^/]+\.md$', lower):
            return 'ALLOW', '번호가 붙은 운영 문서'
        return 'REVIEW', '정규 운영 문서 체계 밖의 docs 파일'

    if lower.startswith('apps/'):
        if suffix == '.md' and Path(lower).name not in APP_DOC_ALLOWED:
            return 'REVIEW', '앱 폴더 안 일반 문서는 works 또는 docs 검토 필요'
        return 'ALLOW', '앱 배포 산출물 범주'

    if lower.startswith('.claude/') or lower.startswith('.codex/'):
        return 'REVIEW', 'AI 설정/skill 변경은 의도 확인 필요'

    if name in GENERIC_DOC_NAMES:
        return 'REVIEW', '일반 방법론/정책 문서일 가능성 높음'

    if suffix == '.md':
        return 'REVIEW', '루트 또는 임의 위치의 markdown 문서'

    return 'ALLOW', '명시적 차단 규칙 없음'


def print_report(scope: str, files: list[str]) -> None:
    rows = [(scope, path, *classify(path)) for path in files]
    reject = [r for r in rows if r[2] == 'REJECT']
    review = [r for r in rows if r[2] == 'REVIEW']
    allow = [r for r in rows if r[2] == 'ALLOW']

    if not rows:
        print('[RELEASE-FILE-GUARD] 검사할 파일이 없습니다.')
        return

    print('[RELEASE-FILE-GUARD] push 전에 파일 분류를 확인하세요. 필요하면 `release-file-guard` 스킬을 즉시 실행하세요.')
    print('')
    print('구분         파일                                             판정     이유')
    print('-----------  -----------------------------------------------  -------  ----------------------------------------')
    for scope, path, verdict, reason in rows[:20]:
        print(f'{scope:<11}  {path[:47]:<47}  {verdict:<7}  {reason[:40]}')
    if len(rows) > 20:
        print(f'... ({len(rows) - 20} more files omitted)')
    print('')
    print(f'ALLOW={len(allow)} REVIEW={len(review)} REJECT={len(reject)}')

    if reject:
        print('')
        print('[REJECT] 아래 파일은 push 전에 제거 또는 ignore 권장')
        for _, path, _, _ in reject:
            print(f' - {path}')
    if review:
        print('')
        print('[REVIEW] 아래 파일은 위치/필요성 확인 후 진행')
        for _, path, _, _ in review[:10]:
            print(f' - {path}')


def handle_prompt(payload: dict) -> None:
    prompt = (payload.get('prompt') or '').lower()
    if any(keyword in prompt for keyword in PROMPT_KEYWORDS):
        print('[RELEASE-FILE-GUARD] 배포/commit/push 의도가 감지되었습니다. `release-file-guard` 스킬로 파일 필터를 먼저 실행하세요.')


def handle_bash(payload: dict) -> None:
    command = (payload.get('command') or '').lower()
    if not any(keyword in command for keyword in COMMAND_KEYWORDS):
        return

    scope = 'staged'
    files = normalize_files(run_git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']))

    if 'git push' in command or 'gh pr create' in command:
        scope = 'push-range'
        files = get_push_range_files()

    print_report(scope, files)


if __name__ == '__main__':
    payload = load_payload()
    if 'command' in payload:
        handle_bash(payload)
    else:
        handle_prompt(payload)
