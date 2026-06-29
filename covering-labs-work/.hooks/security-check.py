#!/usr/bin/env python3
"""
security-check.py — covering-labs 코드 보안 스캐너
PreToolUse (Edit|Write) 훅에서 실행됩니다.

stdin: Claude Code가 전달하는 툴 인자 JSON
stdout: 보안 경고 메시지 (있을 때만 출력)
"""
import sys
import json
import re

def load_payload() -> dict:
    """stdin JSON 파싱 + Claude Code의 tool_input wrap 평탄화."""
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError, OSError):
        return {}
    if not isinstance(data, dict):
        return {}
    tool_input = data.get("tool_input")
    if isinstance(tool_input, dict):
        flat = {k: v for k, v in data.items() if k != "tool_input"}
        flat.update(tool_input)
        return flat
    return data


d = load_payload()
if not d:
    sys.exit(0)

content = d.get('content', '') or d.get('new_string', '') or ''
file_path = d.get('file_path', '') or ''

# 코드 파일만 검사 (문서/설정 파일 제외)
CODE_EXTS = ['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs', '.py', '.sh', '.sql', '.yml', '.yaml']
if not any(file_path.endswith(ext) for ext in CODE_EXTS):
    sys.exit(0)

warnings = []

# ------------------------------------------------------------------
# 1. 하드코딩된 비밀번호 / API 키 / 토큰 / Webhook / URL
#    패턴: key_name = "실제값" (8자 이상)
# ------------------------------------------------------------------
if re.search(
    r'(password|passwd|secret|api_key|apikey|token|webhook|private_key|database_url|db_url|_url)\s*[:=]\s*["\'][^"\']{8,}["\']',
    content,
    re.IGNORECASE,
):
    warnings.append(
        '🔴 [보안위험] 하드코딩된 비밀번호/키/토큰/URL 감지\n'
        '   → process.env.KEY_NAME 또는 /shared/.env 사용 필수\n'
        '   → 참고: docs/09_보안_규약.md § 민감 정보 관리'
    )

# ------------------------------------------------------------------
# 2. localStorage에 인증 정보 저장
# ------------------------------------------------------------------
if re.search(
    r'localStorage\.(setItem|getItem)\s*\(\s*["\']?\s*(token|auth|password|session|jwt)',
    content,
    re.IGNORECASE,
):
    warnings.append(
        '🔴 [보안위험] localStorage에 인증정보 저장 감지\n'
        '   → XSS 공격으로 토큰 탈취 가능\n'
        '   → HttpOnly 쿠키 또는 서버사이드 세션 사용 필수\n'
        '   → 참고: docs/09_보안_규약.md § 인증/인가'
    )

# ------------------------------------------------------------------
# 3. eval() / new Function() 사용
# ------------------------------------------------------------------
if re.search(r'\beval\s*\(|\bnew\s+Function\s*\(', content):
    warnings.append(
        '🔴 [보안위험] eval() 또는 new Function() 사용 감지\n'
        '   → RCE(원격 코드 실행) 위험, 절대 사용 금지\n'
        '   → 참고: docs/09_보안_규약.md § 웹 보안'
    )

# ------------------------------------------------------------------
# 4. 평문 비밀번호 비교 (==, !=, ===, !==)
#    null/None/undefined/빈문자열 비교는 제외
# ------------------------------------------------------------------
if re.search(
    r'(password|passwd)\s*[=!]==?\s*(?!\s*(null|None|undefined|\'\'|""|True|False))',
    content,
    re.IGNORECASE,
):
    warnings.append(
        '🔴 [보안위험] 평문 비밀번호 비교 패턴 감지\n'
        '   → 데이터 유출 시 즉시 비밀번호 노출\n'
        '   → bcrypt.compare() / argon2.verify() 사용 필수\n'
        '   → 참고: docs/09_보안_규약.md § 인증/인가'
    )

# ------------------------------------------------------------------
# 5. SELECT * without LIMIT — 쿼리 블록 단위로 검사
#    각 SELECT * 구문이 포함된 블록 내에 LIMIT이 있는지 확인
# ------------------------------------------------------------------
for m in re.finditer(r'\bSELECT\s+\*\s+FROM\b', content, re.IGNORECASE):
    # 해당 SELECT부터 세미콜론 or 다음 SELECT까지를 하나의 블록으로 처리
    block_start = m.start()
    rest = content[block_start:]
    end_match = re.search(r';|\bSELECT\b', rest[10:], re.IGNORECASE)
    block = rest[:end_match.start() + 10] if end_match else rest[:600]
    if not re.search(r'\bLIMIT\b', block, re.IGNORECASE):
        warnings.append(
            '⚠️ [보안경고] SELECT * 쿼리에 LIMIT 없음\n'
            '   → 수백만 행 반환으로 과금 폭탄 + 데이터 전체 노출 위험\n'
            '   → 필요한 컬럼만 선택하고 LIMIT 추가 필수\n'
            '   → 참고: docs/09_보안_규약.md § 데이터 접근 제한'
        )
        break  # 같은 경고 중복 방지

# ------------------------------------------------------------------
# 6. dangerouslySetInnerHTML (DOMPurify 없이 사용)
# ------------------------------------------------------------------
if re.search(r'dangerouslySetInnerHTML\s*=\s*\{\s*\{', content):
    if not re.search(r'DOMPurify\.sanitize', content):
        warnings.append(
            '⚠️ [보안경고] dangerouslySetInnerHTML 사용 감지 (DOMPurify 없음)\n'
            '   → XSS 위험. DOMPurify.sanitize(content) 후 사용 필수\n'
            '   → 참고: docs/09_보안_규약.md § 웹 보안'
        )

# ------------------------------------------------------------------
# 7. 동적 SQL 문자열 조합 (SQL Injection 가능성)
#    - Python f-string:   f"SELECT ... {variable}"
#    - TypeScript template literal: `SELECT ... ${variable}`
# ------------------------------------------------------------------
if re.search(
    r'(query|sql|execute)\s*[=(+]\s*f["\'][^"\']*\{[a-zA-Z_]\w*\}',
    content,
    re.IGNORECASE,
) or re.search(
    r'(query|sql|execute)\s*[=(+]\s*`[^`]*\$\{[^}]+\}',
    content,
    re.IGNORECASE,
):
    warnings.append(
        '⚠️ [보안경고] 동적 SQL 문자열 조합 패턴 감지\n'
        '   → SQL Injection 위험\n'
        '   → ORM(Prisma/TypeORM) 또는 파라미터 바인딩 사용\n'
        '   → 참고: docs/09_보안_규약.md § 웹 보안'
    )

# ------------------------------------------------------------------
# 결과 출력
# ------------------------------------------------------------------
if warnings:
    print()
    print('\n\n'.join(warnings))
    print()
    print('🔒 보안 규약 전체 내용: docs/09_보안_규약.md')
    print()
