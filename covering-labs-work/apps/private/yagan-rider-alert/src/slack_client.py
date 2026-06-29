from datetime import datetime, timedelta, timezone
from typing import Optional

import requests

import config


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
    today = datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d")
    count = len(riders)

    if count == 0:
        _post(
            f"*✅ 야간기사 수거 미완료 알림 — {today} 22:20 기준*\n\n"
            "당일 배차된 모든 기사님이 1건 이상 수거를 완료했습니다."
        )
        return

    lines = [
        f"*🚨 야간기사 수거 미완료 알림 — {today} 22:20 기준*",
        "",
        f"당일 배차 중 수거 완료 건이 없는 기사님: *{count}명*",
        "",
        "🛵 *미완료 기사님 목록*",
    ]
    for row in riders:
        name = row.get("rider_name") or "이름없음"
        assigned = row.get("assigned_count")
        assigned_display = assigned if assigned is not None else "?"
        lines.append(f"• {name} (배차 {assigned_display}건)")

    _post("\n".join(lines))
