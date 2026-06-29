"""Slack 결과 알림."""

import logging
import requests
from config import SLACK_BOT_TOKEN, SLACK_CHANNEL_ID

_logger = logging.getLogger(__name__)


def _build_text(
    match_breakdown: dict[str, int],
    issued_breakdown: dict[str, int],
    failed: int,
    lifetime: dict[str, int],
    elapsed: float,
) -> str:
    """안 1 형식 — 그룹별 줄 정리, 0건 줄 생략."""
    lines = ["*[친구초대] 배치 완료*", "", "▸ 오늘 처리"]

    total_match = sum(match_breakdown.values())
    if total_match == 0:
        lines.append("• 매칭 없음")
    else:
        lines.append(f"• 매칭: {total_match}건")
        match_labels = [
            ("new_personal", "신규 - 개인화"),
            ("new_public", "신규 - 공용"),
            ("existing_personal", "기존 - 개인화"),
            ("existing_public", "기존 - 공용"),
        ]
        items = [(k, label) for k, label in match_labels if match_breakdown.get(k, 0) > 0]
        for i, (k, label) in enumerate(items):
            prefix = "   └" if i == len(items) - 1 else "   ├"
            lines.append(f"{prefix} {label}: {match_breakdown[k]}건")

        total_issued = sum(issued_breakdown.values())
        if total_issued > 0:
            lines.append(f"• 지급: {total_issued}건")
            issued_labels = [
                ("new", "신규 (30k, 정책 205)"),
                ("existing", "기존 (3k, 정책 212)"),
            ]
            items = [(k, label) for k, label in issued_labels if issued_breakdown.get(k, 0) > 0]
            for i, (k, label) in enumerate(items):
                prefix = "   └" if i == len(items) - 1 else "   ├"
                lines.append(f"{prefix} {label}: {issued_breakdown[k]}건")

        if failed > 0:
            lines.append(f"• 실패: {failed}건")

    # 누적 (장부)
    issued_new = lifetime.get("issued_new", 0)
    issued_existing = lifetime.get("issued_existing", 0)
    perma_failed = lifetime.get("permanently_failed", 0)
    total_lifetime = issued_new + issued_existing
    if total_lifetime > 0 or perma_failed > 0:
        lines.extend(["", "▸ 누적 (장부)"])
        if total_lifetime > 0:
            parts = []
            if issued_new > 0:
                parts.append(f"신규 {issued_new:,}")
            if issued_existing > 0:
                parts.append(f"기존 {issued_existing:,}")
            bracket = f" ({' / '.join(parts)})" if len(parts) > 1 else ""
            lines.append(f"• 발급 완료: {total_lifetime:,}건{bracket}")
        if perma_failed > 0:
            lines.append(f"• 영구 실패: {perma_failed:,}건")

    lines.extend(["", f"▸ 소요: {elapsed:.1f}초"])
    return "\n".join(lines)


def send_result(
    *,
    match_breakdown: dict[str, int],
    issued_breakdown: dict[str, int],
    failed: int,
    lifetime: dict[str, int],
    elapsed: float,
) -> None:
    if not SLACK_BOT_TOKEN:
        _logger.warning("SLACK_BOT_TOKEN 없음, 알림 건너뜀")
        return

    text = _build_text(match_breakdown, issued_breakdown, failed, lifetime, elapsed)

    try:
        resp = requests.post(
            "https://slack.com/api/chat.postMessage",
            headers={"Authorization": f"Bearer {SLACK_BOT_TOKEN}"},
            json={"channel": SLACK_CHANNEL_ID, "text": text},
            timeout=10,
        )
        if not resp.ok or not resp.json().get("ok"):
            _logger.error(f"Slack 알림 실패: {resp.text}")
    except Exception as e:
        _logger.error(f"Slack 알림 에러: {e}")
