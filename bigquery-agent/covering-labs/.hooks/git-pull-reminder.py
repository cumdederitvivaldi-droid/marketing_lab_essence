#!/usr/bin/env python3
"""
git-pull-reminder.py

UserPromptSubmit 훅 — 앱/배치 생성 키워드 감지 시 git pull 동기화와 README 작성을 안내합니다.

  - stdin: JSON { prompt }
  - stdout: 안내 메시지 (AI 컨텍스트에 주입)
  - exit code: 항상 0 (차단 없음, 안내만)
"""
from __future__ import annotations

import json
import sys

APP_KW = [
    "새 앱", "새로운 앱",
    "앱 만들", "앱 추가", "앱 생성", "앱 개발",
    "만들어줘", "생성해줘", "개발해줘",
    "new app", "create app",
]

GUIDE = """\
[개발 시작 전 필수] git pull origin main 을 먼저 실행하세요
  → 최신 코드 없이 작업하면 이미 존재하는 파일/앱과 충돌할 수 있습니다
  → 참고: apps/AGENTS.md § 0단계 — 최신 코드 동기화

[README 필수] 앱 생성 시 README.md를 반드시 작성하세요 (apps/AGENTS.md § README 필수 규칙 참조)
  → 필수 섹션: 목적 / 실행 환경 / 주요 파일 / 환경변수 / 실행 방법 / 의존 서비스 / 주의사항"""


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

    if any(w in p for w in APP_KW):
        print(GUIDE)

    return 0


if __name__ == "__main__":
    sys.exit(main())
