"""주간 LLM 클러스터링 결과 슬랙 발송."""
import logging
import sqlite3
from datetime import datetime, timedelta, timezone

from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

from config import DB_PATH, PO_USER_ID, TARGET_CHANNEL
from notifier import _get_channel, _post

KST = timezone(timedelta(hours=9))

LENS_MAP = {
    "수거품질": "운영레버리지",
    "앱버그": "리텐션",
    "가격": "단위경제학",
    "결제오류": "운영레버리지",
    "지역확장": "시장",
    "품목": "시장",
    "문의": "조직역량",
}


def _get_top_vocs(conn: sqlite3.Connection, ids: list, limit: int = 3) -> list:
    if not ids:
        return []
    placeholders = ",".join("?" * len(ids))
    rows = conn.execute(
        f"""
        SELECT vi.quote, vm.permalink
        FROM voc_items vi
        JOIN voc_messages vm ON vi.slack_ts = vm.slack_ts
        WHERE vi.id IN ({placeholders})
          AND LENGTH(vi.quote) >= 15
        ORDER BY
          CASE WHEN vi.severity = 'critical' THEN 0
               WHEN vi.severity = 'high' THEN 1
               ELSE 2 END,
          LENGTH(vi.quote) DESC
        LIMIT ?
        """,
        [*ids, limit],
    ).fetchall()
    return [{"quote": r[0], "permalink": r[1]} for r in rows]


def _build_category_blocks(cat: str, groups: list, conn: sqlite3.Connection, date_str: str) -> list:
    total = sum(len(g["ids"]) for g in groups)
    lens = LENS_MAP.get(cat, "")
    blocks: list = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f"[주간] {cat}  |  {total}건  ({len(groups)}개 문제)"},
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": f"렌즈: {lens}  ·  기간: 최근 7일 (~{date_str})  ·  Gemini LLM 클러스터링",
                }
            ],
        },
        {"type": "divider"},
    ]
    for i, g in enumerate(groups):
        vocs = _get_top_vocs(conn, g["ids"])
        count = len(g["ids"])
        blocks.append(
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*{i+1}. {g['name']}*  —  {count}건\n_{g['desc']}_",
                },
            }
        )
        if not vocs:
            blocks.append(
                {"type": "context", "elements": [{"type": "mrkdwn", "text": "_(원문 없음)_"}]}
            )
        for v in vocs:
            quote = (v["quote"] or "")[:120]
            pl = v.get("permalink", "")
            text = f"> {quote}"
            if pl:
                text += f"  <{pl}|[원문]>"
            blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": text}})
        blocks.append({"type": "divider"})
    if len(blocks) > 48:
        blocks = blocks[:48]
    return blocks


def send_weekly_llm_report(client: WebClient, clusters: dict) -> str:
    """LLM 클러스터링 결과를 카테고리별로 분할 발송 (주간 배치용)."""
    channel = _get_channel(client)
    if not channel:
        return ""
    if not clusters:
        logging.warning("주간 클러스터 결과 없음 — 발송 스킵")
        return channel

    date_str = datetime.now(KST).strftime("%m/%d")
    total_all = sum(len(g["ids"]) for groups in clusters.values() for g in groups)
    cluster_count = sum(len(groups) for groups in clusters.values())
    summary_lines = [
        f"• {cat}: {len(groups)}개 문제, {sum(len(g['ids']) for g in groups)}건"
        for cat, groups in clusters.items()
    ]
    intro_blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f"주간 VOC 랭킹  ·  {date_str}  (최근 7일)"},
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": (
                    f"Gemini LLM이 카테고리별로 직접 분류한 *{cluster_count}개 문제 / {total_all:,}건* 기준.\n\n"
                    + "\n".join(summary_lines)
                ),
            },
        },
    ]
    try:
        intro_resp = client.chat_postMessage(
            channel=channel, blocks=intro_blocks, text=f"주간 VOC 랭킹 {date_str}"
        )
        thread_ts = intro_resp["ts"]
    except SlackApiError as e:
        logging.error(f"주간 리포트 인트로 발송 실패: {e.response['error']}")
        return channel

    conn = sqlite3.connect(DB_PATH)
    try:
        for cat, groups in clusters.items():
            blocks = _build_category_blocks(cat, groups, conn, date_str)
            total = sum(len(g["ids"]) for g in groups)
            try:
                client.chat_postMessage(
                    channel=channel,
                    blocks=blocks,
                    text=f"[주간 VOC] {cat} {total}건 / {len(groups)}개 문제",
                    thread_ts=thread_ts,
                )
            except SlackApiError as e:
                logging.error(f"[{cat}] 스레드 발송 실패: {e.response['error']}")
    finally:
        conn.close()
    return channel
