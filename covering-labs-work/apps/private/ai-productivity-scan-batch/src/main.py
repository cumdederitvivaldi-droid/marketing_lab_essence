#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from news_monitor import run_news_monitor
from problem_discovery_snapshot import write_problem_discovery_snapshots
from score_loop import run_score_loop
from slack_utils import SlackApiError, SlackMessage, flatten_channel_messages, iso_from_ts


APP_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = APP_ROOT / "data"
STATE_PATH = DATA_DIR / "scan-state.json"
SCAN_JSON_PATH = DATA_DIR / "latest-scan.json"
REPORT_PATH = DATA_DIR / "latest-report.md"
REGISTRY_JSON_PATH = DATA_DIR / "experiment-registry.json"
REGISTRY_MD_PATH = DATA_DIR / "experiment-registry.md"
DEFAULT_CHANNEL_ID = "C0AD9A131JR"
DEFAULT_CHANNEL_NAME = "#pj_ai로생산성높이기"
DEFAULT_APPROVER = "wjh"
PROPOSAL_PATTERN = re.compile(r"(해야|하자|넣자|붙이자|도입|자동화|표준화|리포트|스캔|대시보드|게이트|강제|복구|정리|workflow|hook|skill|report|scan|gate)", re.IGNORECASE)
CATEGORY_KEYWORDS = {
    "problem-discovery": ("문제 발견", "problem discovery", "okr", "grafana", "bigquery", "bq", "signal", "전략", "지표"),
    "hooks": ("hook", "hooks", "guard", "검문소", "gate", "훅", "자동검사"),
    "skills": ("skill", "skills", "command", "workflow", "재사용", "runbook", "standup", "weekly", "ticket"),
    "dashboard": ("dashboard", "대시보드", "gmail", "calendar", "linear", "notion", "slack"),
    "model": ("gpt", "claude", "gemini", "model", "routing", "proxy", "vibe"),
    "figma": ("figma", "use_figma", "design context", "pixel diff", "screenshot"),
    "score-gate": ("score", "채점", "quality", "review", "검증", "독립 검토"),
    "ops": ("automation", "cron", "daily", "digest", "sync", "report", "scan", "배치", "자동화"),
}
ACTION_HINTS = {
    "problem-discovery": "problem-discovery 입력 반영 검토",
    "hooks": "hook/rule 후보 검토",
    "skills": "새 skill 또는 command 분리 검토",
    "dashboard": "대시보드 위젯/브리핑 연결 검토",
    "model": "모델 라우팅/프록시 운영 판단",
    "model-news": "공식 model changelog 검토",
    "figma": "Figma 표준 루프/검증 반영 검토",
    "score-gate": "quality gate/score threshold 검토",
    "tool-news": "공식 tool changelog 검토",
    "ops": "일일 자동화 또는 배치 후보 검토",
    "misc": "수동 triage",
}


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def load_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def summarize_text(text: str, limit: int = 160) -> str:
    normalized = re.sub(r"\s+", " ", text).strip()
    return normalized if len(normalized) <= limit else normalized[: limit - 1].rstrip() + "…"


def classify_message(message: SlackMessage) -> tuple[list[str], Counter[str]]:
    lowered = message.text.lower()
    categories: list[str] = []
    matched = Counter()
    for category, keywords in CATEGORY_KEYWORDS.items():
        hits = sum(1 for keyword in keywords if keyword.lower() in lowered)
        if hits:
            categories.append(category)
            matched[category] = hits
    if not categories and message.urls:
        categories.append("ops")
        matched["ops"] = 1
    return categories, matched


def candidate_score(message: SlackMessage, categories: list[str], matched: Counter[str]) -> int:
    score = sum(matched.values()) + (1 if message.urls else 0) + (2 if PROPOSAL_PATTERN.search(message.text) else 0)
    if len(message.text) >= 180:
        score += 1
    if message.reply_count >= 3:
        score += 1
    if message.is_reply:
        score = max(score - 1, 0)
    return 0 if not categories and len(message.text) < 80 else score


def build_entry(message: SlackMessage, categories: list[str], score: int, channel_name: str, approver: str) -> dict[str, Any]:
    stable = f"{message.channel}:{message.thread_ts}:{message.ts}:{message.permalink}"
    entry_id = "aiprod-" + hashlib.sha1(stable.encode("utf-8")).hexdigest()[:10]
    primary = categories[0] if categories else "misc"
    return {
        "id": entry_id,
        "channel": message.channel,
        "channel_name": channel_name,
        "source_ts": message.ts,
        "thread_ts": message.thread_ts,
        "permalink": message.permalink,
        "summary": summarize_text(message.text),
        "categories": categories or ["misc"],
        "candidate_score": score,
        "links": message.urls,
        "status": "proposed",
        "approval_required": True,
        "approval_owner": approver,
        "approval_status": "pending",
        "next_action": ACTION_HINTS.get(primary, ACTION_HINTS["misc"]),
        "last_seen_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }


def update_registry(existing: list[dict[str, Any]], candidates: list[dict[str, Any]], approver: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    by_id = {entry["id"]: dict(entry) for entry in existing}
    new_entries: list[dict[str, Any]] = []
    for candidate in candidates:
        current = by_id.get(candidate["id"])
        if current is None:
            by_id[candidate["id"]] = candidate
            new_entries.append(candidate)
            continue
        current["candidate_score"] = max(int(current.get("candidate_score", 0)), candidate["candidate_score"])
        current["summary"] = candidate["summary"]
        current["last_seen_at"] = candidate["last_seen_at"]
        current["links"] = sorted({*current.get("links", []), *candidate.get("links", [])})
        current["categories"] = sorted({*current.get("categories", []), *candidate.get("categories", [])})
        current["next_action"] = current.get("next_action") or candidate["next_action"]
        current["approval_required"] = True
        current["approval_owner"] = current.get("approval_owner") or approver
        current["approval_status"] = current.get("approval_status") or "pending"
        by_id[candidate["id"]] = current
    registry = sorted(by_id.values(), key=lambda item: (item.get("status", ""), item.get("source_ts", "")), reverse=True)
    return registry, new_entries


def write_registry_markdown(registry: list[dict[str, Any]]) -> None:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for entry in registry:
        grouped[entry.get("status", "proposed")].append(entry)
    lines = ["# AI Productivity Experiment Registry", "", f"- last_updated: {time.strftime('%Y-%m-%d %H:%M:%S')}", f"- total_entries: {len(registry)}", ""]
    for status in ("proposed", "active", "applied", "discarded"):
        lines.append(f"## {status}")
        entries = grouped.get(status, [])
        if not entries:
            lines.extend(["- 없음", ""])
            continue
        for entry in entries[:40]:
            score_loop = entry.get("score_loop", {})
            quality_score = score_loop.get("quality_score", "-")
            gate_decision = score_loop.get("gate_decision", "-")
            recommendation = entry.get("triage_recommendation", "-")
            lines.append(
                f"- {entry['id']} | {', '.join(entry['categories'])} | {entry['summary']} | score={entry['candidate_score']} | quality={quality_score} | gate={gate_decision} | triage={recommendation} | next={entry['next_action']}"
            )
            lines.append(f"  source: {iso_from_ts(entry['source_ts'])} | {entry['permalink']}")
            lines.append(f"  approval: {entry['approval_owner']} | {entry['approval_status']}")
        lines.append("")
    REGISTRY_MD_PATH.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_report(
    channel_id: str,
    channel_name: str,
    messages: list[SlackMessage],
    candidates: list[dict[str, Any]],
    new_entries: list[dict[str, Any]],
    started_at: str,
    finished_at: str,
    news_results: dict[str, Any],
    slack_status: str,
    score_summary: dict[str, Any],
) -> None:
    category_counts = Counter(category for entry in candidates for category in entry["categories"])
    message_counts = Counter("reply" if item.is_reply else "root" for item in messages)
    news_sources = news_results.get("sources", [])
    news_new = sum(int(source.get("new_count", 0)) for source in news_sources)
    lines = [
        "# AI Productivity Daily Scan",
        "",
        f"- channel: {channel_name} ({channel_id})",
        f"- window_start: {started_at}",
        f"- window_end: {finished_at}",
        f"- slack_status: {slack_status}",
        f"- messages: total={len(messages)} root={message_counts.get('root', 0)} replies={message_counts.get('reply', 0)}",
        f"- candidates: {len(candidates)} | registry_new: {len(new_entries)} | links: {sum(len(item.urls) for item in messages)}",
        f"- news_sources: {len(news_sources)} | news_new: {news_new}",
        f"- quality_gate: pass={score_summary.get('gate_counts', {}).get('pass', 0)} warn={score_summary.get('gate_counts', {}).get('warn', 0)} block={score_summary.get('gate_counts', {}).get('block', 0)}",
        "",
        "## Category Counts",
    ]
    lines.extend([f"- {name}: {count}" for name, count in category_counts.most_common()] or ["- 없음"])
    lines.extend(["", "## News Monitor"])
    if news_sources:
        for source in news_sources:
            if source.get("error"):
                lines.append(f"- {source['name']}: error | {source['error']}")
                continue
            latest = (source.get("items") or [{}])[0]
            lines.append(f"- {source['name']}: new={source.get('new_count', 0)} | latest={latest.get('published_at', '-')} | {latest.get('title', '-')}")
            lines.append(f"  source: {latest.get('url', source['url'])}")
    else:
        lines.append("- configured sources 없음")
    lines.extend(["", "## Quality Gate"])
    lines.append(
        f"- keep={score_summary.get('recommendation_counts', {}).get('keep', 0)} | review={score_summary.get('recommendation_counts', {}).get('review', 0)} | discard={score_summary.get('recommendation_counts', {}).get('discard', 0)}"
    )
    blocked_new_ids = score_summary.get("blocked_new_ids", [])
    lines.append(f"- blocked_new: {len(blocked_new_ids)}")
    auto_rules = score_summary.get("auto_rule_candidates", [])
    if auto_rules:
        for rule in auto_rules[:5]:
            lines.append(f"- auto_rule_candidate: {rule['reason']} | count={rule['count']} | {rule['suggestion']}")
    else:
        lines.append("- auto_rule_candidate: 없음")
    lines.extend(["", "## Top Candidates"])
    for entry in sorted(candidates, key=lambda item: item["candidate_score"], reverse=True)[:12]:
        score_loop = entry.get("score_loop", {})
        lines.append(f"- score={entry['candidate_score']} | {', '.join(entry['categories'])} | {entry['summary']}")
        lines.append(f"  source: {iso_from_ts(entry['source_ts'])} | {entry['permalink']}")
        if entry["links"]:
            lines.append(f"  links: {', '.join(entry['links'][:3])}")
        lines.append(f"  next: {entry['next_action']}")
        lines.append(f"  approval: {entry['approval_owner']} | {entry['approval_status']}")
        if score_loop:
            lines.append(
                f"  quality: {score_loop.get('quality_score', '-')} | gate={score_loop.get('gate_decision', '-')} | triage={entry.get('triage_recommendation', '-')}"
            )
    if not candidates:
        lines.append("- 새 후보 없음")
    lines.extend(["", "## Registry Delta"])
    lines.extend([f"- {entry['id']} | {', '.join(entry['categories'])} | {entry['summary']} | approval={entry['approval_owner']}:{entry['approval_status']}" for entry in new_entries[:20]] or ["- 신규 proposed 항목 없음"])
    REPORT_PATH.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def _load_env_file() -> None:
    env_path = Path(os.environ.get("ENV_FILE", "/shared/.env"))
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def main() -> int:
    _load_env_file()
    parser = argparse.ArgumentParser(description="AI생산성 Slack 스캔 배치")
    parser.add_argument("--days-back", type=float, default=1.0)
    parser.add_argument("--full", action="store_true")
    parser.add_argument("--skip-news", action="store_true")
    parser.add_argument("--enforce-score-gate", action="store_true")
    args = parser.parse_args()
    ensure_dirs()
    token = os.getenv("SLACK_BOT_TOKEN", "").strip()
    channel_id = os.getenv("AI_PRODUCTIVITY_CHANNEL_ID", DEFAULT_CHANNEL_ID)
    channel_name = os.getenv("AI_PRODUCTIVITY_CHANNEL_NAME", DEFAULT_CHANNEL_NAME)
    approver = os.getenv("AI_PRODUCTIVITY_APPROVER", DEFAULT_APPROVER)
    state = load_json(STATE_PATH, {})
    registry = load_json(REGISTRY_JSON_PATH, [])
    oldest = f"{time.time() - (args.days_back * 86400):.6f}" if args.full or not state.get("last_scanned_ts") else str(max(float(state["last_scanned_ts"]) - 1, 0))
    news_results = {"sources": [], "registry_entries": []}
    if not args.skip_news:
        news_results = run_news_monitor(DATA_DIR, approver)

    messages: list[SlackMessage] = []
    serializable: list[dict[str, Any]] = []
    candidates: list[dict[str, Any]] = []
    slack_status = "ok"
    if token:
        try:
            messages = flatten_channel_messages(token, channel_id, oldest=oldest)
        except SlackApiError as exc:
            slack_status = f"error | {exc}"
    else:
        slack_status = "skipped | SLACK_BOT_TOKEN 없음"

    for message in messages:
        categories, matched = classify_message(message)
        score = candidate_score(message, categories, matched)
        serializable.append({"channel": message.channel, "ts": message.ts, "thread_ts": message.thread_ts, "is_reply": message.is_reply, "reply_count": message.reply_count, "text": message.text, "urls": message.urls, "permalink": message.permalink, "user": message.user, "categories": categories, "candidate_score": score})
        if score > 0:
            candidates.append(build_entry(message, categories, score, channel_name, approver))

    candidates.extend(news_results.get("registry_entries", []))
    updated_registry, new_entries = update_registry(registry, candidates, approver)
    new_entry_ids = {entry["id"] for entry in new_entries}
    score_results = run_score_loop(DATA_DIR, updated_registry, new_entry_ids)
    updated_registry = score_results["registry"]
    score_summary = score_results["summary"]
    scored_by_id = {entry["id"]: entry for entry in updated_registry}
    candidates = [scored_by_id.get(entry["id"], entry) for entry in candidates]
    new_entries = [entry for entry in updated_registry if entry.get("id") in new_entry_ids]
    pd_snapshot_paths = write_problem_discovery_snapshots(
        DATA_DIR,
        updated_registry,
        score_summary,
        news_results.get("sources", []),
        new_entries,
    )
    latest_ts = max((float(message.ts) for message in messages), default=float(state.get("last_scanned_ts", time.time())))
    window_end = f"{latest_ts:.6f}"
    write_json(
        SCAN_JSON_PATH,
        {
            "scanned_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "channel": channel_id,
            "channel_name": channel_name,
            "window_start": oldest,
            "window_end": window_end,
            "slack_status": slack_status,
            "messages": serializable,
            "news_sources": [
                {
                    "id": source["id"],
                    "name": source["name"],
                    "url": source["url"],
                    "new_count": source.get("new_count", 0),
                    "error": source.get("error"),
                    "latest": (source.get("items") or [{}])[0],
                }
                for source in news_results.get("sources", [])
            ],
            "quality_summary": score_summary,
            "problem_discovery_snapshots": pd_snapshot_paths,
        },
    )
    write_json(STATE_PATH, {"last_scanned_ts": window_end, "updated_at": time.strftime("%Y-%m-%d %H:%M:%S")})
    write_json(REGISTRY_JSON_PATH, updated_registry)
    write_registry_markdown(updated_registry)
    write_report(
        channel_id,
        channel_name,
        messages,
        candidates,
        new_entries,
        iso_from_ts(oldest),
        iso_from_ts(window_end),
        news_results,
        slack_status,
        score_summary,
    )
    news_candidate_count = len(news_results.get("registry_entries", []))
    blocked_count = len(score_results["blocked_ids"])
    blocked_new_count = len(score_results["blocked_new_ids"])
    print(
        f"[AI생산성 스캔] messages={len(messages)} candidates={len(candidates)} "
        f"news_candidates={news_candidate_count} registry_new={len(new_entries)} blocked={blocked_count} blocked_new={blocked_new_count} "
        f"window={iso_from_ts(oldest)}→{iso_from_ts(window_end)}"
    )
    if args.enforce_score_gate and blocked_count:
        print(
            f"[AI생산성 스캔] enforce-score-gate blocked ids={','.join(score_results['blocked_ids'][:10])}"
        )
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
