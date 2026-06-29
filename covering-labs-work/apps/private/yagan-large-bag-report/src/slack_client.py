from datetime import datetime, timedelta, timezone

import requests

import config

_KST = timezone(timedelta(hours=9))


def send_report(summary: dict) -> None:
    now = datetime.now(_KST).strftime("%Y-%m-%d %H:%M")
    total = summary["total_count"]
    done = summary["done_count"]
    pending = summary["pending_count"]

    text = "\n".join([
        f"*📦 야간 대형 봉투 수거 현황 — {now} 기준*",
        "",
        f"오늘 예정된 대형 봉투 수거: *{total}건*",
        f"• 완료: {done}건 / 미완료: {pending}건",
    ])

    resp = requests.post(
        "https://slack.com/api/chat.postMessage",
        headers={"Authorization": f"Bearer {config.SLACK_BOT_TOKEN}"},
        json={"channel": config.SLACK_CHANNEL, "text": text},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    if not data.get("ok"):
        raise RuntimeError(f"Slack 전송 실패: {data.get('error')}")
