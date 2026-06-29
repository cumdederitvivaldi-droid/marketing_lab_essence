#!/usr/bin/env python3
"""
review-resolve-reminder.py

UserPromptSubmit 훅 — "리뷰 해결" 요청 감지 시 처리 프로세스 체크리스트를 주입합니다.

감지 키워드: 리뷰, 코멘트, review, comment + 해결/처리/fix/resolve
- stdin: JSON { prompt }
- stdout: 프로세스 안내 메시지 (AI 컨텍스트에 주입)
- exit code: 항상 0 (차단 없음, 안내만)
"""
from __future__ import annotations

import json
import re
import sys


REVIEW_KEYWORDS = re.compile(
    r"(리뷰|코멘트|review|comment).{0,20}(해결|처리|fix|resolve|반영)"
    r"|"
    r"(해결|처리|fix|resolve|반영).{0,20}(리뷰|코멘트|review|comment)",
    re.IGNORECASE,
)


def load_payload() -> dict:
    try:
        return json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return {}


def main() -> int:
    payload = load_payload()
    if not isinstance(payload, dict):
        return 0
    prompt = payload.get("prompt")
    if not isinstance(prompt, str):
        return 0

    if not REVIEW_KEYWORDS.search(prompt):
        return 0

    print(
        "[PR 리뷰 처리 프로세스] 리뷰 해결 시 아래 절차를 반드시 따르세요:\n"
        "  1. 미해결 스레드 전체 조회 (GraphQL reviewThreads, isResolved: false)\n"
        "  2. 각 스레드별 판단:\n"
        "     - 수정 필요 → 코드/문서 수정 → 커밋 → resolveReviewThread\n"
        "     - 수정 불필요 → PR에 이유 댓글 → resolveReviewThread\n"
        "  3. 완료 후 미해결 스레드 0건인지 재확인\n"
        "  ⛔ resolve 없이 작업 종료 금지 / 댓글 없이 resolve 금지\n"
        "  → 상세 규칙: AGENTS.md § PR 리뷰 해결 의무 규칙"
    )

    return 0


if __name__ == "__main__":
    sys.exit(main())
