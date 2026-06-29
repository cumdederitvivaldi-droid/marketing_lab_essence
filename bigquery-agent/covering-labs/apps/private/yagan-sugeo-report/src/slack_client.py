from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests

import config

_MAX_REGION      = 10
_MAX_RIDER       = 10
_THREAD_CHUNK    = 150  # Slack text 40,000자 제한 대응



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


def send_report(orders: list[dict], total_yesterday: int) -> None:
    today   = datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d")
    delayed = len(orders)

    cnt: dict[str, int] = {}
    for o in orders:
        s = o.get("fulfillment_status", "UNKNOWN")
        cnt[s] = cnt.get(s, 0) + 1

    running = cnt.get("RUNNING", 0)
    pending = cnt.get("READY", 0) + cnt.get("CREATED", 0)

    region_cnt: Counter = Counter()
    rider_cnt:  Counter = Counter()
    for o in orders:
        city     = o.get("city", "")
        district = o.get("district", "")
        region_cnt[f"{city} {district}".strip() or "지역 미확인"] += 1
        rider_cnt[o.get("rider_name", "미배차")] += 1

    def pct_of_yesterday(n: int) -> str:
        return f"{n / total_yesterday * 100:.1f}%" if total_yesterday > 0 else "N/A"

    def pct_of_delayed(n: int) -> str:
        return f"{n / delayed * 100:.1f}%" if delayed > 0 else "N/A"

    lines = [
        f"*🚨 수거 지연 리포트 — {today} 오전 8시 기준*",
        "",
        f"📦 전날 미완료 수거 (개인 주문): *{delayed}건* (전체 {total_yesterday}건 중 {pct_of_yesterday(delayed)})",
        f"• 🔄 진행중: {running}건  • ⏳ 미시작: {pending}건",
    ]

    if delayed == 0:
        lines += ["", "_전날 미완료 수거 건이 없습니다._"]
    else:
        lines += ["", "📍 *지역별*"]
        for region, count in region_cnt.most_common(_MAX_REGION):
            lines.append(f"• {region}: {count}건 ({pct_of_delayed(count)})")
        if len(region_cnt) > _MAX_REGION:
            lines.append(f"_…외 {len(region_cnt) - _MAX_REGION}개 지역_")

        lines += ["", "🛵 *기사님별*"]
        for rider, count in rider_cnt.most_common(_MAX_RIDER):
            lines.append(f"• {rider}: {count}건 ({pct_of_delayed(count)})")
        if len(rider_cnt) > _MAX_RIDER:
            lines.append(f"_…외 {len(rider_cnt) - _MAX_RIDER}명_")

    result = _post("\n".join(lines))

    if orders:
        ts = result.get("ts")
        for chunk_start in range(0, delayed, _THREAD_CHUNK):
            chunk = orders[chunk_start:chunk_start + _THREAD_CHUNK]
            is_first = chunk_start == 0
            header = f"📋 주문 코드 전체 ({delayed}건)" if is_first else f"📋 이어서 ({chunk_start + 1}–{chunk_start + len(chunk)}건)"
            thread_lines = [header]
            for o in chunk:
                order_num = o.get("order_number", "N/A")
                rider     = o.get("rider_name", "미배차")
                thread_lines.append(f"• #{order_num} | {rider}")
            _post("\n".join(thread_lines), thread_ts=ts)
