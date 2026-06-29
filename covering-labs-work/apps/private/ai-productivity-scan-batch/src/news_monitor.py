#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import html
import json
import re
import subprocess
import time
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urljoin


USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
)


@dataclass(frozen=True)
class NewsSource:
    id: str
    name: str
    url: str
    source_type: str
    category: str


NEWS_SOURCES = (
    NewsSource(
        id="openai-news",
        name="OpenAI News",
        url="https://openai.com/news/rss.xml",
        source_type="rss",
        category="model-news",
    ),
    NewsSource(
        id="anthropic-release-notes",
        name="Anthropic Release Notes",
        url="https://platform.claude.com/docs/en/release-notes/overview",
        source_type="anthropic-html",
        category="model-news",
    ),
    NewsSource(
        id="gemini-api-release-notes",
        name="Gemini API Release Notes",
        url="https://ai.google.dev/gemini-api/docs/changelog",
        source_type="gemini-html",
        category="model-news",
    ),
    NewsSource(
        id="vercel-changelog",
        name="Vercel Changelog",
        url="https://vercel.com/changelog",
        source_type="vercel-html",
        category="tool-news",
    ),
)


def load_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def now_local() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def compact(value: str, limit: int = 180) -> str:
    normalized = re.sub(r"\s+", " ", value).strip()
    return normalized if len(normalized) <= limit else normalized[: limit - 1].rstrip() + "…"


def clean_html_text(raw: str) -> str:
    without_tags = re.sub(r"<[^>]+>", " ", raw)
    return compact(html.unescape(without_tags), limit=400)


def fingerprint(*parts: str) -> str:
    joined = "||".join(part.strip() for part in parts if part)
    return hashlib.sha1(joined.encode("utf-8")).hexdigest()


def fetch_via_curl(command: list[str]) -> str:
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        timeout=25,
        check=False,
    )
    if result.returncode == 0 and result.stdout.strip():
        return result.stdout
    stderr = compact(result.stderr or "", limit=180)
    raise RuntimeError(stderr or "curl fetch failed")


def fetch_text(url: str) -> str:
    if "ai.google.dev" in url:
        return fetch_via_curl(
            [
                "curl",
                "-L",
                "-sS",
                "--connect-timeout",
                "5",
                "--max-time",
                "20",
                "-A",
                "Mozilla/5.0",
                url,
            ]
        )

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "application/xml,text/xml,text/html,application/xhtml+xml,*/*;q=0.8",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.read().decode("utf-8", errors="ignore")
    except Exception as exc:
        errors = [compact(str(exc), limit=180)]

    curl_commands = (
        [
            "curl",
            "-L",
            "-sS",
            "--connect-timeout",
            "5",
            "--max-time",
            "20",
            "-A",
            USER_AGENT,
            url,
        ],
        [
            "curl",
            "--http1.1",
            "-L",
            "-sS",
            "--connect-timeout",
            "5",
            "--max-time",
            "20",
            "-A",
            USER_AGENT,
            url,
        ],
        [
            "curl",
            "-L",
            "-sS",
            "--connect-timeout",
            "5",
            "--max-time",
            "20",
            "-A",
            USER_AGENT,
            "-H",
            "Accept: text/html,*/*;q=0.8",
            url,
        ],
    )
    for command in curl_commands:
        try:
            return fetch_via_curl(command)
        except Exception as exc:
            errors.append(compact(str(exc), limit=180))
    raise RuntimeError(" | ".join(errors[:3]) or "fetch failed")


def parse_openai_rss(raw: str, source: NewsSource) -> list[dict[str, str]]:
    root = ET.fromstring(raw)
    entries: list[dict[str, str]] = []
    for item in root.findall("./channel/item"):
        title = compact(item.findtext("title") or "")
        link = (item.findtext("link") or "").strip()
        published_at = compact(item.findtext("pubDate") or "")
        summary = compact(item.findtext("description") or "")
        if not title:
            continue
        entries.append(
            {
                "fingerprint": fingerprint(source.id, title, link, published_at),
                "title": title,
                "summary": summary or title,
                "published_at": published_at,
                "url": link or source.url,
            }
        )
    return entries[:6]


def parse_gemini_html(raw: str, source: NewsSource) -> list[dict[str, str]]:
    pattern = re.compile(
        r'<h2 id="(?P<anchor>[^"]+)"[^>]*>(?P<date>[^<]+)</h2>\s*<ul>(?P<body>.*?)</ul>',
        re.S,
    )
    entries: list[dict[str, str]] = []
    for match in pattern.finditer(raw):
        bullets = [
            clean_html_text(item)
            for item in re.findall(r"<li>(.*?)</li>", match.group("body"), re.S)
        ]
        bullets = [item for item in bullets if item]
        if not bullets:
            continue
        title = compact(bullets[0])
        entries.append(
            {
                "fingerprint": fingerprint(source.id, match.group("date"), title),
                "title": title,
                "summary": title,
                "published_at": compact(match.group("date")),
                "url": f"{source.url}#{match.group('anchor')}",
            }
        )
    return entries[:6]


def parse_anthropic_html(raw: str, source: NewsSource) -> list[dict[str, str]]:
    pattern = re.compile(
        r'<h3[^>]*>.*?<div>(?P<date>[A-Z][a-z]+ \d{1,2}, \d{4})</div>.*?</h3>\s*<ul[^>]*>(?P<body>.*?)</ul>',
        re.S,
    )
    entries: list[dict[str, str]] = []
    for match in pattern.finditer(raw):
        bullets = [
            clean_html_text(item)
            for item in re.findall(r"<li[^>]*>(.*?)</li>", match.group("body"), re.S)
        ]
        bullets = [item for item in bullets if item]
        if not bullets:
            continue
        title = compact(bullets[0])
        entries.append(
            {
                "fingerprint": fingerprint(source.id, match.group("date"), title),
                "title": title,
                "summary": title,
                "published_at": compact(match.group("date")),
                "url": source.url,
            }
        )
    return entries[:6]


def parse_vercel_html(raw: str, source: NewsSource) -> list[dict[str, str]]:
    pattern = re.compile(
        r'<article[^>]*>.*?<time[^>]*><span[^>]*>(?P<date>[^<]+)</span>.*?</time>'
        r'<h2><a[^>]*href="(?P<href>[^"]+)"[^>]*>(?P<title>.*?)</a></h2>'
        r'(?P<body>.*?)</article>',
        re.S,
    )
    entries: list[dict[str, str]] = []
    for match in pattern.finditer(raw):
        title = clean_html_text(match.group("title"))
        paragraph_match = re.search(r"<p[^>]*>(.*?)</p>", match.group("body"), re.S)
        summary = clean_html_text(paragraph_match.group(1)) if paragraph_match else title
        if not title:
            continue
        entries.append(
            {
                "fingerprint": fingerprint(source.id, match.group("date"), title, match.group("href")),
                "title": compact(title),
                "summary": compact(summary, limit=240),
                "published_at": compact(match.group("date")),
                "url": urljoin(source.url, match.group("href")),
            }
        )
    return entries[:6]


def parse_source(raw: str, source: NewsSource) -> list[dict[str, str]]:
    if source.source_type == "rss":
        return parse_openai_rss(raw, source)
    if source.source_type == "gemini-html":
        return parse_gemini_html(raw, source)
    if source.source_type == "anthropic-html":
        return parse_anthropic_html(raw, source)
    if source.source_type == "vercel-html":
        return parse_vercel_html(raw, source)
    raise ValueError(f"unsupported source_type={source.source_type}")


def build_registry_entry(source: NewsSource, item: dict[str, str], approver: str) -> dict[str, Any]:
    entry_id = "aiprod-news-" + hashlib.sha1(
        f"{source.id}:{item['fingerprint']}".encode("utf-8")
    ).hexdigest()[:10]
    return {
        "id": entry_id,
        "channel": source.id,
        "channel_name": source.name,
        "source_ts": f"{time.time():.6f}",
        "thread_ts": item["fingerprint"][:12],
        "permalink": item["url"],
        "summary": compact(f"[뉴스] {item['published_at']} | {item['title']}", limit=160),
        "categories": [source.category],
        "candidate_score": 5,
        "links": [item["url"]],
        "status": "proposed",
        "approval_required": True,
        "approval_owner": approver,
        "approval_status": "pending",
        "next_action": "공식 changelog 검토",
        "last_seen_at": now_local(),
    }


def write_news_markdown(path: Path, results: list[dict[str, Any]]) -> None:
    changed_sources = sum(1 for result in results if result.get("new_count", 0) > 0)
    lines = [
        "# AI Productivity News Monitor",
        "",
        f"- last_checked: {now_local()}",
        f"- sources: {len(results)}",
        f"- changed_sources: {changed_sources}",
        "",
    ]
    for result in results:
        lines.append(f"## {result['name']}")
        lines.append(f"- url: {result['url']}")
        if result.get("error"):
            lines.append(f"- status: error | {result['error']}")
            lines.append("")
            continue
        lines.append(f"- status: ok | new_items={result.get('new_count', 0)}")
        items = result.get("items", [])
        if not items:
            lines.append("- latest: 없음")
            lines.append("")
            continue
        latest = items[0]
        lines.append(f"- latest: {latest['published_at']} | {latest['title']}")
        lines.append(f"- latest_url: {latest['url']}")
        for item in items[:3]:
            lines.append(f"- item: {item['published_at']} | {item['title']}")
        lines.append("")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def run_news_monitor(data_dir: Path, approver: str) -> dict[str, Any]:
    state_path = data_dir / "news-monitor.json"
    markdown_path = data_dir / "news-monitor.md"
    previous_state = load_json(state_path, {"sources": {}})
    previous_sources = previous_state.get("sources", {})

    results: list[dict[str, Any]] = []
    registry_entries: list[dict[str, Any]] = []

    for source in NEWS_SOURCES:
        try:
            raw = fetch_text(source.url)
            items = parse_source(raw, source)
            if not items:
                raise ValueError("no items parsed")
            previous_source = previous_sources.get(source.id, {})
            previous_fingerprints = set(previous_source.get("fingerprints", []))
            emit_limit = 1 if not previous_fingerprints else 2
            new_items = [item for item in items if item["fingerprint"] not in previous_fingerprints]
            for item in new_items[:emit_limit]:
                registry_entries.append(build_registry_entry(source, item, approver))
            results.append(
                {
                    "id": source.id,
                    "name": source.name,
                    "url": source.url,
                    "category": source.category,
                    "checked_at": now_local(),
                    "items": items,
                    "fingerprints": [item["fingerprint"] for item in items],
                    "new_count": len(new_items),
                    "error": None,
                }
            )
        except Exception as exc:
            results.append(
                {
                    "id": source.id,
                    "name": source.name,
                    "url": source.url,
                    "category": source.category,
                    "checked_at": now_local(),
                    "items": [],
                    "fingerprints": [],
                    "new_count": 0,
                    "error": str(exc),
                }
            )

    write_json(
        state_path,
        {
            "checked_at": now_local(),
            "sources": {
                result["id"]: {
                    "name": result["name"],
                    "url": result["url"],
                    "category": result["category"],
                    "checked_at": result["checked_at"],
                    "fingerprints": result["fingerprints"],
                    "items": result["items"],
                    "error": result["error"],
                }
                for result in results
            },
        },
    )
    write_news_markdown(markdown_path, results)
    return {"sources": results, "registry_entries": registry_entries}
