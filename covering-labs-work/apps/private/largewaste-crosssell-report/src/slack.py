"""Slack 리포트 발송 — chat.postMessage."""

import logging
import requests
from config import SLACK_BOT_TOKEN, SLACK_REPORT_CHANNEL

_logger = logging.getLogger(__name__)

SLACK_API_URL = "https://slack.com/api/chat.postMessage"


def post_report(text: str) -> bool:
    """리포트 발송. 성공 True, 실패 False (로그만 남기고 배치는 정상 종료)."""
    if not SLACK_BOT_TOKEN:
        _logger.error("SLACK_BOT_TOKEN 미설정 — 발송 스킵")
        return False

    payload = {"channel": SLACK_REPORT_CHANNEL, "text": text}
    try:
        resp = requests.post(
            SLACK_API_URL,
            json=payload,
            headers={
                "Authorization": f"Bearer {SLACK_BOT_TOKEN}",
                "Content-Type": "application/json; charset=utf-8",
            },
            timeout=10,
        )
    except requests.RequestException as e:
        _logger.error(f"Slack 발송 에러: {e}")
        return False

    body: dict = {}
    if resp.ok:
        try:
            body = resp.json()
        except ValueError:
            _logger.error(f"Slack 응답 JSON 파싱 실패: {resp.status_code} {resp.text[:300]}")
            return False

    if resp.ok and body.get("ok"):
        return True
    _logger.error(f"Slack 발송 실패: {resp.status_code} {body}")
    return False
