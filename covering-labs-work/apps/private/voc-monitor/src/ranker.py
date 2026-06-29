"""RICE 기반 VOC 테마 랭킹."""
from datetime import datetime, timedelta, timezone

from config import RICE_CONFIDENCE_HIGH, RICE_CONFIDENCE_MED, RICE_CONFIDENCE_LOW, RICE_LOOKBACK_DAYS
from storage import get_all_themes, get_recent_items, upsert_theme

KST = timezone(timedelta(hours=9))


def _confidence(n: int) -> float:
    if n >= 10:
        return RICE_CONFIDENCE_HIGH
    if n >= 3:
        return RICE_CONFIDENCE_MED
    return RICE_CONFIDENCE_LOW


def recalculate_rice():
    """모든 테마의 RICE 점수를 최근 30일 데이터로 재계산."""
    cutoff = (datetime.now(KST) - timedelta(days=RICE_LOOKBACK_DAYS)).isoformat()
    recent = get_recent_items(cutoff)

    # theme_id별 집계
    from collections import defaultdict
    by_theme: dict[str, list] = defaultdict(list)
    for item in recent:
        if item.get("theme_id"):
            by_theme[item["theme_id"]].append(item)

    themes = get_all_themes()
    for t in themes:
        tid = t["id"]
        items = by_theme.get(tid, [])
        reach = len(items)
        if not items:
            impact = t.get("rice_impact", 1.0)
            effort = t.get("rice_effort", 1.0)
        else:
            impact = sum(i.get("impact_score") or 1.0 for i in items) / len(items)
            effort = sum(i.get("effort_hint") or 1.0 for i in items) / len(items)
        conf = _confidence(reach)
        score = (reach * impact * conf) / max(effort, 0.1)

        upsert_theme({
            **t,
            "rice_reach": reach,
            "rice_impact": round(impact, 2),
            "rice_confidence": conf,
            "rice_effort": round(effort, 2),
            "rice_score": round(score, 2),
        })


def get_ranked_themes(top_n: int = 10, force_critical_top: bool = True) -> list[dict]:
    """RICE 점수 기준 내림차순. severity=critical 건수 있는 테마 최상단 고정."""
    cutoff = (datetime.now(KST) - timedelta(days=RICE_LOOKBACK_DAYS)).isoformat()
    recent = get_recent_items(cutoff)

    critical_theme_ids = {
        i["theme_id"] for i in recent
        if i.get("severity") == "critical" and i.get("theme_id")
    }

    themes = get_all_themes()  # rice_score DESC 정렬
    if not force_critical_top:
        return themes[:top_n]

    critical = [t for t in themes if t["id"] in critical_theme_ids]
    others = [t for t in themes if t["id"] not in critical_theme_ids]
    return (critical + others)[:top_n]
