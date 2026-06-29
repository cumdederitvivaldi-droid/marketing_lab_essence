"""슬랙 발송 — 일일 브리프 / 주간 랭킹 / 백필 리포트."""
import logging
import os
from collections import Counter
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

from config import PO_USER_ID, TARGET_CHANNEL, WEEKLY_LOOKBACK_DAYS
from ranker import get_ranked_themes
from storage import get_all_themes, get_recent_items

load_dotenv()
KST = timezone(timedelta(hours=9))


def _get_channel(client: WebClient) -> str:
    ch = os.getenv("VOC_TARGET_CHANNEL") or TARGET_CHANNEL
    if ch:
        return ch
    try:
        res = client.conversations_open(users=PO_USER_ID)
        return res["channel"]["id"]
    except SlackApiError as e:
        logging.error(f"DM 채널 조회 실패: {e.response['error']}")
        return ""


def _post(client: WebClient, channel: str, blocks: list, text: str) -> bool:
    try:
        client.chat_postMessage(channel=channel, blocks=blocks, text=text)
        return True
    except SlackApiError as e:
        logging.error(f"슬랙 발송 실패 channel={channel}: {e.response['error']}")
        return False


def _fmt_item(item: dict) -> str:
    quote = item.get("quote") or item.get("raw_text", "")[:100]
    pl = item.get("permalink", "")
    if pl:
        return f"> {quote} <{pl}|[원문]>"
    return f"> {quote}"


def send_daily_brief(client: WebClient) -> str:
    channel = _get_channel(client)
    if not channel:
        return ""
    now = datetime.now(KST)
    cutoff = (now - timedelta(hours=24)).isoformat()
    date_str = now.strftime("%m/%d")
    recent = get_recent_items(cutoff)
    total = len(recent)
    blocks: list = [
        {"type": "header", "text": {"type": "plain_text", "text": f"VOC 일일 브리프 · {date_str} (어제 {total}건)"}},
    ]
    if total == 0:
        blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": "신규 VOC 없음"}})
    else:
        cats = Counter(i.get("category", "기타") for i in recent)
        summary = "  ".join(f"*{c}* {n}건" for c, n in cats.most_common())
        blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": summary}})
    blocks.append({"type": "divider"})
    crits = [i for i in recent if i.get("severity") == "critical"]
    if crits:
        blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": ":rotating_light: *Critical 감지*"}})
        for item in crits[:3]:
            blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": _fmt_item(item)}})
        blocks.append({"type": "divider"})
    all_themes = get_all_themes()
    new_themes = [t for t in all_themes if t.get("first_seen_at", "") >= cutoff]
    if new_themes:
        blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": f"*신규 테마 {len(new_themes)}개*"}})
        for t in new_themes[:5]:
            theme_items = [i for i in recent if i.get("theme_id") == t["id"]]
            n = len(theme_items)
            extra = f"\n{_fmt_item(theme_items[0])}" if theme_items else ""
            blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": f"• *{t['title']}* {n}건{extra}"}})
        blocks.append({"type": "divider"})
    top = sorted([i for i in recent if i.get("impact_score")], key=lambda x: x["impact_score"], reverse=True)
    if top:
        blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": "*어제 Top 3 (임팩트 높은 순)*"}})
        for item in top[:3]:
            blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": _fmt_item(item)}})
    blocks.append({"type": "context", "elements": [{"type": "mrkdwn", "text": "전체 랭킹 → 매주 월요일 주간 리포트"}]})
    _post(client, channel, blocks, f"VOC 일일 브리프 {date_str} ({total}건)")
    return channel


def send_weekly_report(client: WebClient) -> str:
    channel = _get_channel(client)
    if not channel:
        return ""
    now = datetime.now(KST)
    week_cutoff = (now - timedelta(days=WEEKLY_LOOKBACK_DAYS)).isoformat()
    date_str = now.strftime("%m/%d")
    ranked = get_ranked_themes(top_n=7)
    blocks: list = [
        {"type": "header", "text": {"type": "plain_text", "text": f"주간 VOC 랭킹 · {date_str}"}},
    ]
    for i, t in enumerate(ranked):
        if len(blocks) > 44:
            break
        rice = t.get("rice_score", 0)
        title_line = f"*{i+1}. {t.get('title','제목 없음')}*  `{t.get('lens','')}` RICE {rice:.1f}  _{t.get('status','발견')}_"
        blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": title_line}})
        rice_detail = (f"Reach {t.get('rice_reach',0)} · Impact {t.get('rice_impact',1):.1f} · "
                       f"Conf {t.get('rice_confidence',0.5):.1f} · Effort {t.get('rice_effort',1):.1f}")
        blocks.append({"type": "context", "elements": [{"type": "mrkdwn", "text": rice_detail}]})
        if t.get("problem_statement"):
            blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": f"_{t['problem_statement']}_"}})
        for item in get_recent_items(week_cutoff, theme_id=t["id"], limit=3):
            blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": _fmt_item(item)}})
        blocks.append({"type": "divider"})
    inactive = [t["title"] for t in get_all_themes() if t.get("rice_reach", 0) == 0 and t.get("total_count", 0) > 0]
    if inactive:
        blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": f"이번 주 0건: {', '.join(inactive[:8])}"}})
    _post(client, channel, blocks, f"주간 VOC 랭킹 {date_str} Top{len(ranked)}")
    return channel


def send_backfill_report(client: WebClient) -> str:
    channel = _get_channel(client)
    if not channel:
        return ""
    all_themes = sorted(
        [t for t in get_all_themes() if t.get("status") != "제외"],
        key=lambda t: t.get("rice_score", 0), reverse=True
    )
    blocks: list = [
        {"type": "header", "text": {"type": "plain_text", "text": "전체 기간 VOC 분석 완료"}},
        {"type": "section", "text": {"type": "mrkdwn", "text": f"유효 테마 *{len(all_themes)}개* · RICE 점수 기준 Top 10"}},
        {"type": "divider"},
    ]
    for t in all_themes[:10]:
        if len(blocks) > 44:
            break
        first = t.get("first_seen_at", "")[:10].replace("-", "/")
        last = t.get("last_seen_at", "")[:10].replace("-", "/")
        txt = f"*{t.get('title','제목 없음')}*  `{t.get('lens','')}`\n{t.get('total_count',0)}건  {first} ~ {last}"
        if t.get("problem_statement"):
            txt += f"\n> {t['problem_statement']}"
        blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": txt}})
        blocks.append({"type": "divider"})
    _post(client, channel, blocks, "전체 기간 VOC 분석 완료 — Top 10 테마")
    return channel


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    token = os.getenv("SLACK_BOT_TOKEN")
    if not token:
        logging.error("SLACK_BOT_TOKEN 없음")
    else:
        wc = WebClient(token=token)
        ch = send_daily_brief(wc)
        logging.info(f"일일 브리프 발송 완료 channel={ch}")
