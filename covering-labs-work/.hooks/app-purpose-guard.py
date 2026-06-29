#!/usr/bin/env python3
"""
app-purpose-guard.py

UserPromptSubmit 훅 — covering-labs는 커버링 서비스 운영·데이터 모니터링
목적의 앱/배치만 개발합니다. 개인·취미·커뮤니티 스크래핑 등 비즈니스
목적과 무관한 앱 개발 요청은 차단하고 목적 명시를 요구합니다.

호출 인터페이스: Claude UserPromptSubmit hook
  - stdin: JSON { prompt }
  - stderr: 차단 메시지 (exit 2 시 사용자에게 표시)
  - stdout: 통과 시 AI 컨텍스트에 주입되는 확인 메시지
  - exit code: 0 = 통과, 2 = 차단
"""
from __future__ import annotations

import json
import sys

# 앱/배치 생성 요청 감지 키워드
APP_CREATION_KW = [
    "앱 만들", "앱 추가", "앱 생성", "앱 개발", "앱을 만들", "앱을 추가",
    "배치 만들", "배치 추가", "배치 생성", "배치 개발",
    "새 앱", "새로운 앱",
    "nextjs 만들", "nestjs 만들", "nextjs 앱", "nestjs 앱",
    "페이지 만들", "페이지 추가", "페이지 생성", "페이지 개발",
    "api 만들", "api 추가", "api 서버", "api 서버 만들",
    "스케줄 만들", "스케줄 추가", "스케줄 생성",
    "cron 만들", "cron 추가", "크론 만들", "크론 추가", "크론 생성",
    "스크립트 만들", "스크립트 추가", "스크립트 개발",
    "create app", "new app",
]

# 비즈니스 목적 키워드 — 하나라도 있으면 통과
BUSINESS_KW = [
    "커버링", "covering",
    "고객", "배송", "차량", "배차", "픽업",
    "모니터링", "대시보드", "dashboard",
    "kpi", "okr", "목표", "지표", "성과",
    "알림", "슬랙", "slack",
    "데이터 수집", "데이터 분석", "리포트", "보고서",
    "운영", "내부", "사내", "서비스",
    "인프라", "자동화",
    "flarelane", "channeltalk", "두발히어로", "dhero",
    "backoffice", "백오피스",
    "비즈니스 목적",
]

# 비즈니스와 무관한 명시적 신호 — 하나라도 있으면 즉시 차단
NON_BUSINESS_KW = [
    "커뮤니티 스크래핑", "커뮤니티 크롤링",
    "개인 프로젝트", "개인적인 앱", "개인용 앱",
    "재미로", "재미 삼아", "취미로",
    "연습용 앱", "공부용 앱",
]

BLOCK_NON_BUSINESS = """\
[앱 개발 제한] covering-labs는 커버링 서비스 운영·데이터 모니터링 전용 인프라입니다.
개인·취미·커뮤니티 스크래핑 목적의 앱/배치는 이 서버에서 개발하지 않습니다.

  ✅ 허용: 커버링 서비스 관련, 데이터 모니터링, 내부 운영 도구, 자동화 배치
  ❌ 제한: 개인 프로젝트, 커뮤니티 스크래핑, 취미/재미 목적"""

BLOCK_NO_PURPOSE = """\
[앱 개발 목적 확인 필요] covering-labs는 커버링 서비스 운영·데이터 모니터링 목적의 앱만 개발합니다.
개발하려는 앱/배치가 어떤 비즈니스 목적인지 함께 설명해주세요.

  예: "고객 배송 현황 모니터링 배치 만들어줘"
  예: "커버링 KPI 대시보드 앱 개발해줘"
  예: "Slack 알림 자동화 배치 추가해줘"

  ✅ 허용: 커버링 서비스 관련, 데이터 모니터링, 내부 운영 도구, 자동화 배치
  ❌ 제한: 개인 프로젝트, 커뮤니티 스크래핑, 취미/재미 목적"""


def load_payload() -> dict:
    try:
        return json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return {}


def main() -> int:
    payload = load_payload()
    prompt = (payload.get("prompt") or "").lower()

    if not prompt:
        return 0

    is_app_creation = any(kw in prompt for kw in APP_CREATION_KW)
    if not is_app_creation:
        return 0

    # 명시적 비비즈니스 신호 → 즉시 차단
    if any(kw in prompt for kw in NON_BUSINESS_KW):
        print(BLOCK_NON_BUSINESS, file=sys.stderr)
        return 2

    # 비즈니스 키워드 없음 → 목적 명시 요구
    if not any(kw in prompt for kw in BUSINESS_KW):
        print(BLOCK_NO_PURPOSE, file=sys.stderr)
        return 2

    # 비즈니스 목적 확인됨 → 통과 (AI 컨텍스트에 확인 메시지 주입)
    print("[앱 개발 목적 확인] 비즈니스 관련 앱 요청이 확인되었습니다. apps/AGENTS.md 를 참고하여 진행하세요.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
