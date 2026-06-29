"""Slack #10_고객피드백 메시지 수집 → voc_messages 저장."""
import os
import re
import time
import logging
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Optional, Dict, Any, List

from dotenv import load_dotenv
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

from config import SOURCE_CHANNEL, RATE_LIMIT_SLEEP
from storage import upsert_messages, get_latest_ts

load_dotenv()
KST = ZoneInfo("Asia/Seoul")


def _get_permalink(client: WebClient, channel_id: str, message_ts: str) -> str:
    try:
        time.sleep(RATE_LIMIT_SLEEP)
        result = client.chat_getPermalink(channel=channel_id, message_ts=message_ts)
        return result.get("permalink", "")
    except SlackApiError as e:
        logging.warning(f"permalink 취득 실패 ts={message_ts}: {e.response['error']}")
        return ""


def _parse_message(message: Dict[str, Any], client: WebClient) -> Dict[str, Any]:
    raw_text = message.get("text", "")
    slack_ts = message["ts"]
    m = re.search(r'\[(\d+)\]', raw_text)
    return {
        "slack_ts": slack_ts,
        "channel_id": SOURCE_CHANNEL,
        "posted_at": datetime.fromtimestamp(float(slack_ts), tz=KST).isoformat(),
        "raw_text": raw_text,
        "permalink": _get_permalink(client, SOURCE_CHANNEL, slack_ts),
        "user_key": m.group(1) if m else None,
        "has_attachments": 1 if "files" in message else 0,
    }


def collect(oldest: Optional[str] = None) -> int:
    """채널 메시지 수집. oldest='0' 이면 전체 백필, None 이면 마지막 저장 ts 이후 증분.
    Returns: 저장된 신규 건수"""
    token = os.environ.get("SLACK_BOT_TOKEN")
    if not token:
        logging.error("SLACK_BOT_TOKEN 없음")
        return 0
    client = WebClient(token=token)

    is_backfill = (str(oldest) == "0")
    if oldest is None:
        oldest_ts = get_latest_ts() or "0"
        logging.info(f"증분 수집 시작 oldest_ts={oldest_ts}")
    else:
        oldest_ts = str(oldest)
        logging.info(f"수집 시작 oldest={oldest_ts} (backfill={is_backfill})")

    messages_to_save: List[Dict[str, Any]] = []
    processed_ts: set = set()
    cursor = None
    log_milestone = 0

    try:
        while True:
            time.sleep(RATE_LIMIT_SLEEP)
            response = client.conversations_history(
                channel=SOURCE_CHANNEL,
                cursor=cursor,
                oldest=oldest_ts,
                limit=200,
            )
            for msg in response.get("messages", []):
                if msg["ts"] in processed_ts:
                    continue

                thread_msgs: List[Dict] = []
                if msg.get("reply_count", 0) > 0:
                    try:
                        time.sleep(RATE_LIMIT_SLEEP)
                        rep = client.conversations_replies(
                            channel=SOURCE_CHANNEL, ts=msg["ts"], limit=500
                        )
                        thread_msgs = rep.get("messages", [])
                    except SlackApiError as e:
                        logging.warning(f"스레드 조회 실패 ts={msg['ts']}: {e.response['error']}")
                        thread_msgs = [msg]
                else:
                    thread_msgs = [msg]

                for tm in thread_msgs:
                    if tm["ts"] not in processed_ts:
                        messages_to_save.append(_parse_message(tm, client))
                        processed_ts.add(tm["ts"])

                if is_backfill:
                    milestone = len(messages_to_save) // 500
                    if milestone > log_milestone:
                        log_milestone = milestone
                        logging.info(f"백필 진행 {len(messages_to_save)}건 수집 중...")

            cursor = response.get("response_metadata", {}).get("next_cursor")
            if not response.get("has_more") or not cursor:
                break

    except SlackApiError as e:
        logging.error(f"Slack API 오류: {e.response['error']}")
        return 0

    if not messages_to_save:
        logging.info("신규 메시지 없음")
        return 0

    before_count = len(messages_to_save)
    upsert_messages(messages_to_save)
    logging.info(f"수집 완료 {before_count}건 저장 시도")
    return before_count


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    n = collect()
    logging.info(f"증분 수집 완료 {n}건")
