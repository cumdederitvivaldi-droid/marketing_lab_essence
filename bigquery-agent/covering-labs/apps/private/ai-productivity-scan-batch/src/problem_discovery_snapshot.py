#!/usr/bin/env python3
from __future__ import annotations

import json
import time
from collections import Counter
from pathlib import Path
from typing import Any


BIGQUERY_SNAPSHOT_NAME = "pd-bigquery-snapshot.md"
GRAFANA_SNAPSHOT_NAME = "pd-grafana-snapshot.md"
WEB_SIGNAL_SNAPSHOT_NAME = "pd-web-signal-snapshot.md"


def write_markdown(path: Path, lines: list[str]) -> None:
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def render_bigquery_snapshot(
    registry: list[dict[str, Any]],
    quality_summary: dict[str, Any],
    new_entries: list[dict[str, Any]],
) -> list[str]:
    recommendation_counts = Counter(quality_summary.get("recommendation_counts", {}))
    category_counts = Counter()
    blocked_categories = Counter()
    for entry in registry:
        categories = entry.get("categories", [])
        for category in categories:
            category_counts[category] += 1
            if entry.get("score_loop", {}).get("gate_decision") == "block":
                blocked_categories[category] += 1

    total_entries = len(registry)
    blocked = int(quality_summary.get("gate_counts", {}).get("block", 0))
    blocked_ratio = round((blocked / total_entries) * 100, 1) if total_entries else 0
    lines = [
        "# PD BigQuery Snapshot",
        "",
        f"- generated_at: {time.strftime('%Y-%m-%d %H:%M:%S')}",
        "- source: ai-productivity-scan-batch derived metrics",
        f"- total_entries: {total_entries}",
        f"- keep: {recommendation_counts.get('keep', 0)}",
        f"- review: {recommendation_counts.get('review', 0)}",
        f"- discard: {recommendation_counts.get('discard', 0)}",
        f"- blocked_ratio_pct: {blocked_ratio}",
        f"- latest_new_entries: {len(new_entries)}",
        "",
        "## Category Volume",
    ]
    for category, count in category_counts.most_common(10):
        lines.append(f"- {category}: {count}")
    lines.extend(["", "## Blocked Category Volume"])
    for category, count in blocked_categories.most_common(10):
        lines.append(f"- {category}: {count}")
    if not blocked_categories:
        lines.append("- 없음")
    return lines


def render_grafana_snapshot(registry: list[dict[str, Any]], quality_summary: dict[str, Any]) -> list[str]:
    blocked_entries = [
        entry for entry in registry if entry.get("score_loop", {}).get("gate_decision") == "block"
    ]
    blocked_entries.sort(key=lambda item: item.get("score_loop", {}).get("quality_score", 0))
    reason_counts = Counter()
    for entry in blocked_entries:
        for reason in entry.get("score_loop", {}).get("reasons", []):
            reason_counts[reason] += 1

    lines = [
        "# PD Grafana Snapshot",
        "",
        f"- generated_at: {time.strftime('%Y-%m-%d %H:%M:%S')}",
        "- source: ai-productivity-scan-batch quality gate panels",
        f"- pass: {quality_summary.get('gate_counts', {}).get('pass', 0)}",
        f"- warn: {quality_summary.get('gate_counts', {}).get('warn', 0)}",
        f"- block: {quality_summary.get('gate_counts', {}).get('block', 0)}",
        "",
        "## Alert Reasons",
    ]
    for reason, count in reason_counts.most_common(10):
        lines.append(f"- {reason}: {count}")
    if not reason_counts:
        lines.append("- 없음")
    lines.extend(["", "## Lowest Score Entries"])
    for entry in blocked_entries[:10]:
        score_loop = entry.get("score_loop", {})
        lines.append(
            f"- {entry.get('id', '-')} | score={score_loop.get('quality_score', '-')} | {entry.get('summary', '-')}"
        )
        lines.append(
            f"  categories={', '.join(entry.get('categories', []))} | reasons={', '.join(score_loop.get('reasons', []))}"
        )
    if not blocked_entries:
        lines.append("- 없음")
    return lines


def render_web_signal_snapshot(news_sources: list[dict[str, Any]]) -> list[str]:
    lines = [
        "# PD Web Signal Snapshot",
        "",
        f"- generated_at: {time.strftime('%Y-%m-%d %H:%M:%S')}",
        "- source: ai-productivity-scan-batch official model/tool signals",
        "",
    ]
    if not news_sources:
        lines.append("- 뉴스 소스 없음")
        return lines
    for source in news_sources:
        lines.append(f"## {source.get('name', '-')}")
        if source.get("error"):
            lines.append(f"- error: {source['error']}")
            lines.append("")
            continue
        latest = (source.get("items") or [{}])[0]
        lines.append(f"- latest: {latest.get('published_at', '-')} | {latest.get('title', '-')}")
        lines.append(f"- latest_url: {latest.get('url', source.get('url', '-'))}")
        lines.append(f"- new_count: {source.get('new_count', 0)}")
        lines.append("")
    return lines


def write_problem_discovery_snapshots(
    data_dir: Path,
    registry: list[dict[str, Any]],
    quality_summary: dict[str, Any],
    news_sources: list[dict[str, Any]],
    new_entries: list[dict[str, Any]],
) -> dict[str, str]:
    bigquery_path = data_dir / BIGQUERY_SNAPSHOT_NAME
    grafana_path = data_dir / GRAFANA_SNAPSHOT_NAME
    web_signal_path = data_dir / WEB_SIGNAL_SNAPSHOT_NAME
    write_markdown(bigquery_path, render_bigquery_snapshot(registry, quality_summary, new_entries))
    write_markdown(grafana_path, render_grafana_snapshot(registry, quality_summary))
    write_markdown(web_signal_path, render_web_signal_snapshot(news_sources))
    return {
        "bigquery": str(bigquery_path),
        "grafana": str(grafana_path),
        "web": str(web_signal_path),
    }
