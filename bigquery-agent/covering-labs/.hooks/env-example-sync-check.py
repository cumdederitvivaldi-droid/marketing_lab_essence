#!/usr/bin/env python3
"""
env-example-sync-check.py — 앱별 .env.example 누락 변수 경고
PreToolUse (Edit|Write) 훅에서 실행됩니다.

코드에서 사용하는 환경변수가 해당 앱의 .env.example / .env.local.example에
등록되어 있는지 검사합니다. env-var-registry-check.py(apps/AGENTS.md 기준)와 상보적입니다.
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

# 코드 파일만 검사
CODE_EXTS = ['.py', '.ts', '.tsx', '.js', '.jsx']
if not any(file_path.endswith(ext) for ext in CODE_EXTS):
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

# 앱 디렉토리 찾기 (apps/public/my-app 또는 apps/private/my-app)
path = Path(file_path)
parts = path.parts
try:
    apps_idx = next(i for i, p in enumerate(parts) if p == 'apps')
    # apps/{public|private}/my-app
    if apps_idx + 2 < len(parts):
        app_dir = Path(*parts[:apps_idx + 3])
    else:
        sys.exit(0)
except StopIteration:
    sys.exit(0)

# .env.example 또는 .env.local.example 찾기
example_candidates = [
    app_dir / '.env.example',
    app_dir / '.env.local.example',
    app_dir / '.env.example.local',
]
example_path = next((f for f in example_candidates if f.exists()), None)

if example_path is None:
    sys.exit(0)

# .env.example에서 등록된 변수명 파싱
example_content = example_path.read_text(encoding='utf-8')
registered_vars: set[str] = set(
    m.group(1)
    for m in re.finditer(r'^([A-Z][A-Z0-9_]+)\s*=', example_content, re.MULTILINE)
)

# 항상 허용 (런타임/시스템 변수)
ALWAYS_ALLOWED = {
    'NODE_ENV', 'PORT', 'HOST', 'PATH', 'HOME', 'USER', 'DEBUG',
    'LOG_LEVEL', 'PYTHONPATH', 'VIRTUAL_ENV', 'NEXT_PUBLIC_BASE_PATH',
    'GOOGLE_CLOUD_PROJECT', 'ENV_FILE', 'USE_V3_PHASES', 'SEND_MODE',
}

missing = used_vars - registered_vars - ALWAYS_ALLOWED

if missing:
    names = ', '.join(sorted(missing))
    print()
    print(f'⚠️  [.env.example 동기화] {example_path.name}에 누락된 변수: {names}')
    print(f'   → 코드에서 사용 중이지만 {example_path.name}에 문서화되지 않은 환경변수입니다')
    print(f'   → {example_path.name}에 해당 변수와 용도 주석을 추가하세요')
    print('   → 신규 변수라면 apps/AGENTS.md 레지스트리에도 먼저 등록하세요')
    print()
