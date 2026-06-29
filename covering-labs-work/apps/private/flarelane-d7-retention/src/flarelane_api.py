"""FlareLane API 호출 공통 로직."""

from __future__ import annotations

import time
from typing import Any, Callable

import requests

import config
from bq_helper import TRACK_API_BASE


def emit_to_flarelane(
    rows: list[dict[str, Any]],
    build_payload: Callable[[dict[str, Any]], dict[str, Any]],
    *,
    payload_key: str,
    total_label: str,
    dry_run: bool,
    sleep_ms: int,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """rows 중 미발송 건을 FlareLane에 건별 POST 한다.

    Returns:
        (summary dict, successful_rows list)
    """
    candidate_rows = [row for row in rows if not row["already_emitted"]]
    payloads = [build_payload(row) for row in candidate_rows]
    summary: dict[str, Any] = {
        total_label: len(rows),
        "total_emittable": len(payloads),
        "already_emitted": sum(1 for row in rows if row["already_emitted"]),
        "sent": 0,
        "failed": 0,
        "sample_payloads": payloads[:3],
        "sample_errors": [],
    }
    if dry_run or not payloads:
        return summary, []

    session = requests.Session()
    session.headers.update(
        {
            "Authorization": f"Bearer {config.FLARELANE_API_KEY}",
            "Content-Type": "application/json",
        }
    )
    url = f"{TRACK_API_BASE}/{config.FLARELANE_PROJECT_ID}/track"

    successful_rows: list[dict[str, Any]] = []
    for index, payload in enumerate(payloads):
        try:
            response = session.post(
                url, json={payload_key: [payload]}, timeout=20
            )
            if response.ok and payload_key == "events":
                body = response.json()
                success_count = body.get("events", {}).get("success", 0)
                if success_count > 0:
                    summary["sent"] += 1
                    successful_rows.append(candidate_rows[index])
                else:
                    summary["failed"] += 1
                    if len(summary["sample_errors"]) < 5:
                        summary["sample_errors"].append(
                            {
                                "index": index,
                                "user_id": payload["subjectId"],
                                "status": response.status_code,
                                "success": success_count,
                                "errorMessages": body.get("events", {}).get("errorMessages", []),
                            }
                        )
            elif response.ok:
                summary["sent"] += 1
                successful_rows.append(candidate_rows[index])
            else:
                summary["failed"] += 1
                if len(summary["sample_errors"]) < 5:
                    summary["sample_errors"].append(
                        {
                            "index": index,
                            "user_id": payload["subjectId"],
                            "status": response.status_code,
                            "body": response.text[:300],
                        }
                    )
            if sleep_ms > 0 and index < len(payloads) - 1:
                time.sleep(sleep_ms / 1000)
        except Exception as exc:
            summary["failed"] += 1
            if len(summary["sample_errors"]) < 5:
                summary["sample_errors"].append(
                    {
                        "index": index,
                        "user_id": payload["subjectId"],
                        "error": str(exc),
                    }
                )

    return summary, successful_rows
