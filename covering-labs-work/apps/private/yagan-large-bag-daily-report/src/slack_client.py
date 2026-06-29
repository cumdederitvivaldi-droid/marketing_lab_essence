from datetime import datetime, timedelta, timezone

import requests

import config

_KST = timezone(timedelta(hours=9))
_WEEKDAY = ["월", "화", "수", "목", "금", "토", "일"]

_STATUS_ROWS = [
    ("수거완료",        "completed",     ":large_green_circle:"),
    ("확인필요(전체)",  "check_all",     ":large_green_circle:"),
    ("확인필요(일부)",  "check_partial", ":large_yellow_circle:"),
    ("사용자 취소",    "user_canceled", ":large_yellow_circle:"),
    ("정책미준수",     "policy_fail",   ":red_circle:"),
    ("미배출",         "notfound_fail", ":red_circle:"),
    ("진입 실패",      "enter_fail",    ":red_circle:"),
]


def _post(text: str) -> None:
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


def _arrow(delta: int) -> str:
    if delta > 0:
        return "↑"
    if delta < 0:
        return "↓"
    return "→"


def send_report(
    today: dict,
    prev: dict,
    item_reasons: list[dict],
    policy_reasons: list[dict],
) -> None:
    now_kst = datetime.now(_KST)
    yesterday = now_kst - timedelta(days=1)
    date_str = yesterday.strftime("%m/%d")
    weekday_str = _WEEKDAY[yesterday.weekday()]

    total_t = today["total"]
    total_p = prev["total"]
    total_delta = total_t - total_p
    total_pct_chg = (total_delta / total_p * 100) if total_p > 0 else 0.0

    lines = [
        ":package: *대형봉투 일일 리포트*",
        "━━━━━━━━━━━━━━━━━━━━",
        f":date: {date_str} ({weekday_str}) • 익일 08:00 기준",
        "",
        f"총 신청  *{total_t}건*  {_arrow(total_delta)} {total_delta:+}건 ({total_pct_chg:+.1f}%)",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        "상태별 현황",
        "",
    ]

    for label, key, circle in _STATUS_ROWS:
        cnt_t = today.get(key, 0)
        cnt_p = prev.get(key, 0)
        delta = cnt_t - cnt_p
        pct_t = cnt_t / total_t * 100 if total_t > 0 else 0.0
        pct_p = cnt_p / total_p * 100 if total_p > 0 else 0.0
        pct_delta = pct_t - pct_p
        lines.append(
            f"{circle}{_arrow(delta)} {label:<10}  "
            f"{cnt_t}건 ({pct_t:5.1f}%) "
            f"{delta:+}건 ({pct_delta:+.1f}%p)"
        )

    lines += [
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        "확인필요 사유 (일부수거)",
        "",
    ]
    if item_reasons:
        for r in item_reasons:
            lines.append(f"  • {r['reason']}  {r['count']}건")
    else:
        lines.append("  (없음)")

    lines += ["", "정책미준수 사유", ""]
    if policy_reasons:
        for r in policy_reasons:
            lines.append(f"  • {r['reason']}  {r['count']}건")
    else:
        lines.append("  (없음)")

    _post("\n".join(lines))
