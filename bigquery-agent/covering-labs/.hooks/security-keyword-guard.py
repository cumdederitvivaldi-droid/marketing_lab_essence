#!/usr/bin/env python3
"""
security-keyword-guard.py

UserPromptSubmit 훅 — 보안 관련 작업 키워드 감지 시 관련 규약 준수를 안내합니다.

  - stdin: JSON { prompt }
  - stdout: 경고 메시지 (AI 컨텍스트에 주입)
  - exit code: 항상 0 (차단 없음, 안내만)
"""
from __future__ import annotations

import json
import sys


def load_payload() -> dict:
    try:
        return json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return {}


def main() -> int:
    payload = load_payload()
    p = (payload.get("prompt") or "").lower()

    if not p:
        return 0

    msgs = []

    if any(w in p for w in ["로그인", "인증", "비밀번호", "password", "login", "auth", "jwt", "session", "회원가입"]):
        msgs.append(
            "[보안] 인증 관련 작업 감지: docs/09_보안_규약.md 인증 규칙 준수 필수"
            " (서버사이드 검증 필수, bcrypt 해싱, HttpOnly 쿠키)"
        )

    if any(w in p for w in ["대시보드", "dashboard"]) and any(w in p for w in ["데이터", "data", "테이블", "table"]):
        msgs.append(
            "[보안] 데이터 표시 작업 감지: docs/09_보안_규약.md 데이터 노출 규칙 확인"
            " (SELECT * 금지, LIMIT 필수, 접근 제어 필수)"
        )

    if any(w in p for w in ["api key", "api_key", "webhook", "secret", "token"]) and \
       any(w in p for w in ["코드", "추가", "작성", "저장"]):
        msgs.append("[보안] 민감 정보 작업 감지: .env 파일 사용 필수, 코드 하드코딩 절대 금지")

    for msg in msgs:
        print(msg)

    return 0


if __name__ == "__main__":
    sys.exit(main())
