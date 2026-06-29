#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import time
from collections import Counter
from pathlib import Path
from typing import Any


PASS_SCORE = 80
WARN_SCORE = 55
MIN_CONTRACT_FIT = 60
MIN_CONFIDENCE = 45
QUALITY_SCORECARD_JSON = "quality-scorecard.json"
QUALITY_SCORECARD_MD = "quality-scorecard.md"

RULE_CANDIDATES = {
    "misc-only-category": "misc 단일 카테고리 후보는 기본 discard 후보로 내린다.",
    "url-only-summary": "링크만 있는 요약은 한 줄 설명이 없으면 discard 후보로 내린다.",
    "low-evidence": "공식 소스가 아니고 근거가 빈약한 항목은 review 이상으로 승격하지 않는다.",
    "contract-fit-low": "승인 필드, next_action, 카테고리 정합성이 약한 항목은 registry 승격 전 차단한다.",
    "self-score-confidence-low": "자가점수 신뢰도가 낮은 항목은 keep 대신 review/discard로 내린다.",
}


def clamp(value: float, lower: float = 0, upper: float = 100) -> float:
    return max(lower, min(upper, value))


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def compute_contract_fit(entry: dict[str, Any], summary: str, non_misc: bool) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    if entry.get("approval_required"):
        score += 30
    if entry.get("approval_owner") and entry.get("approval_status"):
        score += 20
    if non_misc:
        score += 20
    else:
        reasons.append("misc-only-category")
    if entry.get("next_action"):
        score += 15
    if summary:
        score += 15
    if score < MIN_CONTRACT_FIT:
        reasons.append("contract-fit-low")
    return int(clamp(score)), reasons


def compute_evidence_score(
    candidate_score: int,
    categories: list[str],
    links_count: int,
    summary: str,
    official_source: bool,
) -> int:
    score = candidate_score * 9
    score += min(links_count, 2) * 8
    score += min(len(categories), 3) * 4
    score += 12 if official_source else 0
    if len(summary) >= 48:
        score += 8
    return int(clamp(score))


def compute_confidence_score(
    candidate_score: int,
    summary: str,
    official_source: bool,
    links_count: int,
    non_misc: bool,
) -> tuple[int, list[str]]:
    score = 20
    reasons: list[str] = []
    summary_is_url = summary.startswith("http")
    has_sentence = bool(re.search(r"[A-Za-z가-힣]{6,}", summary))
    if official_source:
        score += 22
    score += min(candidate_score * 7, 28)
    score += 10 if has_sentence else 0
    score += 8 if len(summary) >= 32 else 0
    score += 6 if links_count > 0 else 0
    if summary_is_url:
        score -= 22
        reasons.append("url-only-summary")
    if candidate_score <= 1 and not official_source:
        score -= 18
        reasons.append("low-evidence")
    if not non_misc:
        score -= 12
    score = int(clamp(score))
    if score < MIN_CONFIDENCE:
        reasons.append("self-score-confidence-low")
    return score, reasons


def score_entry(entry: dict[str, Any], is_new: bool) -> dict[str, Any]:
    categories = [str(item) for item in entry.get("categories", [])]
    summary = normalize_text(str(entry.get("summary", "")))
    candidate_score = int(entry.get("candidate_score", 0) or 0)
    links_count = len(entry.get("links", []) or [])
    official_source = any(item in {"model-news", "tool-news"} for item in categories)
    non_misc = any(item != "misc" for item in categories)

    contract_fit, contract_reasons = compute_contract_fit(entry, summary, non_misc)
    evidence_score = compute_evidence_score(candidate_score, categories, links_count, summary, official_source)
    confidence_score, confidence_reasons = compute_confidence_score(
        candidate_score=candidate_score,
        summary=summary,
        official_source=official_source,
        links_count=links_count,
        non_misc=non_misc,
    )
    quality_score = round((contract_fit * 0.35) + (evidence_score * 0.35) + (confidence_score * 0.30), 1)

    gate_reasons = list(dict.fromkeys(contract_reasons + confidence_reasons))
    if contract_fit < MIN_CONTRACT_FIT or confidence_score < MIN_CONFIDENCE or quality_score < WARN_SCORE:
        gate_decision = "block"
    elif quality_score >= PASS_SCORE:
        gate_decision = "pass"
    else:
        gate_decision = "warn"

    recommendation = "keep" if gate_decision == "pass" else "review" if gate_decision == "warn" else "discard"
    if gate_decision == "pass" and not gate_reasons:
        gate_reasons = ["healthy"]

    scored = dict(entry)
    scored["triage_recommendation"] = recommendation
    scored["score_loop"] = {
        "version": 1,
        "quality_score": quality_score,
        "contract_fit_score": contract_fit,
        "evidence_score": evidence_score,
        "self_score_confidence": confidence_score,
        "gate_decision": gate_decision,
        "reasons": gate_reasons,
        "is_new_entry": is_new,
        "scored_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    return scored


def build_rule_candidates(scored_registry: list[dict[str, Any]]) -> list[dict[str, Any]]:
    reason_counts = Counter()
    for entry in scored_registry:
        score_loop = entry.get("score_loop", {})
        if score_loop.get("gate_decision") != "block":
            continue
        for reason in score_loop.get("reasons", []):
            if reason in RULE_CANDIDATES:
                reason_counts[reason] += 1

    suggestions: list[dict[str, Any]] = []
    for reason, count in reason_counts.most_common():
        if count < 2:
            continue
        suggestions.append(
            {
                "reason": reason,
                "count": count,
                "suggestion": RULE_CANDIDATES[reason],
            }
        )
    return suggestions


def write_scorecard_markdown(path: Path, summary: dict[str, Any], scored_registry: list[dict[str, Any]]) -> None:
    lines = [
        "# AI Productivity Quality Scorecard",
        "",
        f"- scored_at: {summary['scored_at']}",
        f"- total_entries: {summary['total_entries']}",
        f"- gate_pass: {summary['gate_counts'].get('pass', 0)}",
        f"- gate_warn: {summary['gate_counts'].get('warn', 0)}",
        f"- gate_block: {summary['gate_counts'].get('block', 0)}",
        f"- recommendation_keep: {summary['recommendation_counts'].get('keep', 0)}",
        f"- recommendation_review: {summary['recommendation_counts'].get('review', 0)}",
        f"- recommendation_discard: {summary['recommendation_counts'].get('discard', 0)}",
        "",
        "## Auto Rule Candidates",
    ]
    auto_rules = summary.get("auto_rule_candidates", [])
    if auto_rules:
        for item in auto_rules:
            lines.append(f"- {item['reason']} | count={item['count']} | {item['suggestion']}")
    else:
        lines.append("- 없음")

    lines.extend(["", "## Top Blocked Entries"])
    blocked = [
        entry for entry in scored_registry if entry.get("score_loop", {}).get("gate_decision") == "block"
    ]
    if blocked:
        blocked.sort(key=lambda item: item.get("score_loop", {}).get("quality_score", 0))
        for entry in blocked[:15]:
            score_loop = entry["score_loop"]
            lines.append(
                f"- {entry['id']} | score={score_loop['quality_score']} | {entry['triage_recommendation']} | {entry['summary']}"
            )
            lines.append(
                f"  reasons: {', '.join(score_loop.get('reasons', []))} | next: {entry.get('next_action', '-')}"
            )
    else:
        lines.append("- 없음")

    lines.extend(["", "## Top Keep Entries"])
    keep_entries = [
        entry for entry in scored_registry if entry.get("score_loop", {}).get("gate_decision") == "pass"
    ]
    if keep_entries:
        keep_entries.sort(
            key=lambda item: item.get("score_loop", {}).get("quality_score", 0),
            reverse=True,
        )
        for entry in keep_entries[:15]:
            score_loop = entry["score_loop"]
            lines.append(
                f"- {entry['id']} | score={score_loop['quality_score']} | {entry['triage_recommendation']} | {entry['summary']}"
            )
            lines.append(
                f"  contract={score_loop['contract_fit_score']} evidence={score_loop['evidence_score']} confidence={score_loop['self_score_confidence']}"
            )
    else:
        lines.append("- 없음")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def run_score_loop(data_dir: Path, registry: list[dict[str, Any]], new_entry_ids: set[str]) -> dict[str, Any]:
    scored_registry = [score_entry(entry, entry.get("id") in new_entry_ids) for entry in registry]
    gate_counts = Counter(entry["score_loop"]["gate_decision"] for entry in scored_registry)
    recommendation_counts = Counter(entry["triage_recommendation"] for entry in scored_registry)
    blocked_ids = [
        entry["id"]
        for entry in scored_registry
        if entry["score_loop"]["gate_decision"] == "block"
    ]
    blocked_new_ids = [
        entry["id"]
        for entry in scored_registry
        if entry["id"] in new_entry_ids and entry["score_loop"]["gate_decision"] == "block"
    ]
    summary = {
        "scored_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total_entries": len(scored_registry),
        "gate_counts": dict(gate_counts),
        "recommendation_counts": dict(recommendation_counts),
        "blocked_ids": blocked_ids,
        "blocked_new_ids": blocked_new_ids,
        "auto_rule_candidates": build_rule_candidates(scored_registry),
    }
    write_json(data_dir / QUALITY_SCORECARD_JSON, {"summary": summary, "entries": scored_registry})
    write_scorecard_markdown(data_dir / QUALITY_SCORECARD_MD, summary, scored_registry)
    return {
        "registry": scored_registry,
        "summary": summary,
        "blocked_ids": blocked_ids,
        "blocked_new_ids": blocked_new_ids,
    }
