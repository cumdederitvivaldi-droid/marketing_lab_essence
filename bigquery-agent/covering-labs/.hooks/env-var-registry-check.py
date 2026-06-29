#!/usr/bin/env python3
"""
env-var-registry-check.py — 미등록 환경변수 도입 차단
PreToolUse (Edit|Write) 훅에서 실행됩니다.

stdin: Claude Code가 전달하는 툴 인자 JSON
stdout: 경고 메시지 (있을 때만 출력)
"""
import sys
import json
import re
from pathlib import Path

try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)

content = d.get('content', '') or d.get('new_string', '') or ''
file_path = d.get('file_path', '') or ''

# Python / TypeScript 코드 파일만 검사
CODE_EXTS = ['.py', '.ts', '.tsx', '.js', '.jsx']
if not any(file_path.endswith(ext) for ext in CODE_EXTS):
    sys.exit(0)

# apps/ 디렉토리 파일만 검사
if '/apps/' not in file_path:
    sys.exit(0)

# 파일에서 사용된 env var 이름 추출
used_vars: set[str] = set()

# Python: os.environ.get('VAR'), os.environ['VAR'], _require('VAR')
for m in re.finditer(r'os\.environ(?:\.get)?\s*\(\s*["\']([A-Z][A-Z0-9_]+)["\']', content):
    used_vars.add(m.group(1))
for m in re.finditer(r'os\.environ\s*\[\s*["\']([A-Z][A-Z0-9_]+)["\']', content):
    used_vars.add(m.group(1))
for m in re.finditer(r'_require\s*\(\s*["\']([A-Z][A-Z0-9_]+)["\']', content):
    used_vars.add(m.group(1))

# TypeScript/JavaScript: process.env.VAR_NAME
for m in re.finditer(r'process\.env\.([A-Z][A-Z0-9_]+)', content):
    used_vars.add(m.group(1))

if not used_vars:
    sys.exit(0)

# apps/AGENTS.md 레지스트리에서 등록된 변수명 파싱
try:
    path = Path(file_path)
    repo_root = path
    while repo_root != repo_root.parent:
        if (repo_root / 'apps' / 'AGENTS.md').exists():
            break
        repo_root = repo_root.parent

    agents_md = (repo_root / 'apps' / 'AGENTS.md').read_text(encoding='utf-8')
    # 테이블 첫 번째 컬럼에서만 추출 (prose 예시 오염 방지)
    registered_vars: set[str] = set(re.findall(r'^\|\s+`([A-Z][A-Z0-9_]+)`\s+\|', agents_md, re.MULTILINE))
except Exception:
    sys.exit(0)

# 미등록 변수 감지 (범용 시스템 변수 제외)
ALWAYS_ALLOWED = {
    'PATH', 'HOME', 'USER', 'PORT', 'HOST', 'ENV_FILE',
    'NODE_ENV', 'DEBUG', 'LOG_LEVEL', 'PYTHONPATH', 'VIRTUAL_ENV',
    'NEXT_PUBLIC_BASE_PATH', 'GOOGLE_CLOUD_PROJECT',
}

unregistered = used_vars - registered_vars - ALWAYS_ALLOWED

if unregistered:
    names = ', '.join(sorted(unregistered))
    print()
    print(f'⚠️  [ENV 레지스트리] 미등록 환경변수 감지: {names}')
    print('   → 새 환경변수는 코드 작성 전 apps/AGENTS.md 레지스트리에 먼저 등록하세요')
    print('   → 레지스트리에 없으면 개발자에게 요청하고 PR 문서에 추가 내용을 남겨주세요')
    print('   → 유사 용도의 기존 변수가 있으면 새 이름 대신 재사용하세요')
    print()
