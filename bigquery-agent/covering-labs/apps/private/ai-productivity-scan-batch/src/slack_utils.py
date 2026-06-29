#!/usr/bin/env python3
from __future__ import annotations

import html
import json
import re
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


SLACK_API_ROOT = "https://slack.com/api"
URL_PATTERN = re.compile(r"https?://[^\s>]+")
SLACK_LINK_PATTERN = re.compile(r"<(https?://[^>|]+)(?:\|([^>]+))?>")


class SlackApiError(RuntimeError):
    pass


@dataclass(frozen=True)
class SlackMessage:
    channel: str
    ts: str
    thread_ts: str
    is_reply: bool
    reply_count: int
    text: str
    urls: list[str]
    permalink: str
    user: str


def iso_from_ts(ts: str | None) -> str:
    if not ts:
        return "-"
    try:
        return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(float(ts)))
    except (TypeError, ValueError):
        return "-"


def _normalize_ts(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, (int, float)):
        return f"{value:.6f}".rstrip("0").rstrip(".")
    return None


def _request(method: str, token: str, payload: dict[str, Any]) -> dict[str, Any]:
    url = f"{SLACK_API_ROOT}/{method}"
    data = urllib.parse.urlencode({k: v for k, v in payload.items() if v not in (None, "", [])}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        if exc.code != 429:
            raise SlackApiError(f"{method} http {exc.code}") from exc
        time.sleep(max(int(exc.headers.get("Retry-After", "1")), 1))
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
    body = json.loads(raw)
    if not body.get("ok"):
        raise SlackApiError(f"{method} -> {body.get('error', 'unknown_error')}")
    return body


def normalize_slack_text(text: str | None) -> str:
    raw = html.unescape(text or "")
    normalized = SLACK_LINK_PATTERN.sub(lambda m: f"{m.group(2)} ({m.group(1)})" if m.group(2) and m.group(2) != m.group(1) else m.group(1), raw)
    normalized = re.sub(r"<@([A-Z0-9]+)>", r"@\1", normalized)
    normalized = re.sub(r"<#([A-Z0-9]+)\|([^>]+)>", r"#\2", normalized)
    normalized = re.sub(r"<!subteam\^[^|]+\|([^>]+)>", r"@\1", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def extract_urls(text: str | None) -> list[str]:
    if not text:
        return []
    urls: list[str] = []
    seen: set[str] = set()
    for pattern in (SLACK_LINK_PATTERN, URL_PATTERN):
        for match in pattern.finditer(text):
            url = match.group(1) if match.lastindex else match.group(0)
            cleaned = url.rstrip("),.>]")
            if cleaned and cleaned not in seen:
                seen.add(cleaned)
                urls.append(cleaned)
    return urls


def _paginate(method: str, token: str, **payload: Any) -> list[dict[str, Any]]:
    cursor: str | None = None
    rows: list[dict[str, Any]] = []
    while True:
        response = _request(method, token, {**payload, "cursor": cursor, "limit": payload.get("limit", 200)})
        rows.extend(response.get("messages") or [])
        cursor = (response.get("response_metadata") or {}).get("next_cursor")
        if not cursor:
            return rows


def get_permalink(token: str, channel: str, message_ts: str) -> str:
    return str(_request("chat.getPermalink", token, {"channel": channel, "message_ts": message_ts}).get("permalink") or "")


def fetch_channel_history(token: str, channel: str, oldest: str | None, latest: str | None = None) -> list[dict[str, Any]]:
    rows = _paginate(
        "conversations.history",
        token,
        channel=channel,
        oldest=_normalize_ts(oldest),
        latest=_normalize_ts(latest),
        inclusive=True,
    )
    return sorted(rows, key=lambda item: float(item.get("ts", 0)))


def fetch_thread_replies(token: str, channel: str, thread_ts: str, oldest: str | None) -> list[dict[str, Any]]:
    rows = _paginate(
        "conversations.replies",
        token,
        channel=channel,
        ts=thread_ts,
        oldest=_normalize_ts(oldest),
        inclusive=True,
    )
    return sorted(rows, key=lambda item: float(item.get("ts", 0)))


def flatten_channel_messages(token: str, channel: str, oldest: str | None) -> list[SlackMessage]:
    messages = fetch_channel_history(token, channel, oldest=oldest)
    flattened: list[SlackMessage] = []
    for message in messages:
        ts = str(message.get("ts") or "")
        thread_ts = str(message.get("thread_ts") or ts)
        raw_text = str(message.get("text") or "")
        flattened.append(
            SlackMessage(
                channel=channel,
                ts=ts,
                thread_ts=thread_ts,
                is_reply=False,
                reply_count=int(message.get("reply_count") or 0),
                text=normalize_slack_text(raw_text),
                urls=extract_urls(raw_text),
                permalink=get_permalink(token, channel, ts) if ts else "",
                user=str(message.get("user") or message.get("bot_id") or ""),
            )
        )
        if int(message.get("reply_count") or 0) <= 0 or thread_ts != ts:
            continue
        for reply in fetch_thread_replies(token, channel, ts, oldest=oldest):
            reply_ts = str(reply.get("ts") or "")
            if reply_ts == ts:
                continue
            raw_reply = str(reply.get("text") or "")
            flattened.append(
                SlackMessage(
                    channel=channel,
                    ts=reply_ts,
                    thread_ts=ts,
                    is_reply=True,
                    reply_count=0,
                    text=normalize_slack_text(raw_reply),
                    urls=extract_urls(raw_reply),
                    permalink=get_permalink(token, channel, reply_ts) if reply_ts else "",
                    user=str(reply.get("user") or reply.get("bot_id") or ""),
                )
            )
    return sorted(flattened, key=lambda item: float(item.ts))
