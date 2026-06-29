#!/usr/bin/env python3
"""
deploy-workflow-guide.py

UserPromptSubmit 훅 — 배포 관련 키워드 감지 시 PR 기반 배포 워크플로우를 안내합니다.

  - stdin: JSON { prompt }
  - stdout: 안내 메시지 (AI 컨텍스트에 주입)
  - exit code: 항상 0 (차단 없음, 안내만)
"""
from __future__ import annotations

import json
import sys

DEPLOY_KW = [
    "배포해줘", "배포 해줘", "배포 준비해줘", "배포 준비",
    "올려줘",
    "push해줘", "push 해줘", "푸시해줘",
    "배포하자", "배포할게",
    "pr 올려줘", "pr 만들어줘",
    "main에 올려", "main으로 올려",
]

GUIDE = """\
[배포 워크플로우] main 직접 push 금지 — 아래 절차를 따르세요:
 1. 브랜치 생성: git checkout -b feat/YYYY-MM-DD-{slug}
 2. 변경사항 커밋 후 push: git push origin feat/...
 3. PR 생성: gh pr create --title '제목' --body '설명'
 4. CodeRabbit 자동 코드 리뷰 → 코멘트 없음 + 담당자 1인 승인 + 미해결 대화 없음 → 머지 + 배포"""


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

    if any(w in p for w in DEPLOY_KW):
        print(GUIDE)

    return 0


if __name__ == "__main__":
    sys.exit(main())
