from datetime import datetime, timedelta, timezone
from typing import Optional

import requests

import config

_KST = timezone(timedelta(hours=9))


def _post(text: str, thread_ts: Optional[str] = None) -> dict:
    payload: dict = {"channel": config.SLACK_CHANNEL, "text": text}
    if thread_ts:
        payload["thread_ts"] = thread_ts
    resp = requests.post(
        "https://slack.com/api/chat.postMessage",
        headers={"Authorization": f"Bearer {config.SLACK_BOT_TOKEN}"},
        json=payload,
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    if not data.get("ok"):
        raise RuntimeError(f"Slack 전송 실패: {data.get('error')}")
    return data


def send_alert(riders: list[dict]) -> None:
    now = datetime.now(_KST).strftime("%Y-%m-%d %H:%M")
    count = len(riders)

    lines = [
        f"*⏰ 야간기사 수거 간격 알림 — {now} 기준*",
        "",
        f"마지막 완료 후 {config.GAP_MINUTES}분 이상 다음 완료 없는 기사님: *{count}명*",
        "",
        "🛵 *해당 기사님 목록*",
    ]
    for r in riders:
        name = r.get("rider_name", "이름없음")
        last_time = r.get("last_completed_time", "?")
        minutes = r.get("minutes_since_last", "?")
        pending = r.get("pending_count", "?")
        lines.append(f"• {name} — 마지막 완료 {last_time} ({minutes}분 전) / 잔여 {pending}건")

    _post("\n".join(lines))
