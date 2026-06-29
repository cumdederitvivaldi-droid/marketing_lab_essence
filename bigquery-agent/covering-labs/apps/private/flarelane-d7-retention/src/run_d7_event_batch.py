#!/usr/bin/env python3
"""
Assign exact D7 users for ENG-1559 and emit reminder-entry events to FlareLane.

Flow:
1. Query BigQuery for users whose first paid order date is exactly D+7.
2. Persist stable arm assignments for the ENG-1559 v2 experiment.
3. Insert reminder event history rows for newly eligible non-control users.
4. Emit one FlareLane track request per user/event.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from pathlib import Path
from typing import Any

import requests

import config
from bq_helper import (
    ASSIGNMENT_TABLE,
    BQ_STATUSES,
    EVENT_HISTORY_TABLE,
    TRACK_API_BASE,
    build_marketing_agreed_users_cte_sql,
    kst_today_string,
    normalize_rows,
    run_bq_command,
    run_bq_query,
)
from experiment_config import (
    ARM_CONTROL,
    ARM_FIXED5000,
    ARM_INDEX_BY_BUCKET,
    ARM_MSG_ONLY,
    ARM_PCT50,
    ENG1559_TAG_KEY,
    ENTRY_EVENT,
    ENTRY_EVENT_SOURCE,
    EXPERIMENT_KEY,
)

DATA_DIR = Path.home() / "data" / "eng1559_exact_d7_batch"
LOG_PREFIX = "eng1559_exact_d7_batch"
ORDER_DOMAIN_V2_START_DATE = "2026-03-31"


def build_prepare_tables_sql() -> str:
    return f"""
CREATE TABLE IF NOT EXISTS {ASSIGNMENT_TABLE}
(
  experiment_key STRING,
  user_id INT64,
  variant STRING,
  assigned_at TIMESTAMP,
  eligible_date DATE,
  scheduled_day INT64,
  scheduled_send_date DATE,
  channel STRING,
  tag_key STRING,
  tag_value STRING,
  assignment_status STRING,
  first_order_id INT64,
  first_order_at TIMESTAMP,
  loaded_at TIMESTAMP
)
PARTITION BY eligible_date
CLUSTER BY experiment_key, variant, user_id;

CREATE TABLE IF NOT EXISTS {EVENT_HISTORY_TABLE}
(
  experiment_key STRING,
  user_id INT64,
  first_order_id INT64,
  arm STRING,
  event_kind STRING,
  event_type STRING,
  source STRING,
  eligible_date DATE,
  signal_at TIMESTAMP,
  emitted_at TIMESTAMP
)
PARTITION BY eligible_date
CLUSTER BY experiment_key, event_kind, event_type, user_id;
""".strip()


def build_paid_orders_cte_sql() -> str:
    statuses = ", ".join(f"'{status}'" for status in BQ_STATUSES)
    return f"""
source_orders AS (
  SELECT
    o.user_id,
    o.id AS order_id,
    o.created_date AS created_at,
    DATE(o.created_date, 'Asia/Seoul') AS order_date
  FROM `covering-app-ccd23.secure_dataset.order` o
  JOIN `covering-app-ccd23.secure_dataset.order_line` ol ON ol.order_id = o.id
  JOIN `covering-app-ccd23.secure_dataset.product` p ON p.id = ol.product_id
  WHERE o.payment_policy_id IS NOT NULL
    AND o.deleted_date IS NULL
    AND o.status IN ({statuses})
    AND DATE(o.created_date, 'Asia/Seoul') < DATE '{ORDER_DOMAIN_V2_START_DATE}'
    AND p.product_type = 'SERVICE'

  UNION ALL

  SELECT
    o.user_id,
    o.id AS order_id,
    o.created_at,
    DATE(o.created_at, 'Asia/Seoul') AS order_date
  FROM `covering-app-ccd23.secure_dataset.order_v2` o
  JOIN `covering-app-ccd23.secure_dataset.order_line` ol ON ol.order_id = o.id
  JOIN `covering-app-ccd23.secure_dataset.product` p ON p.id = ol.product_id
  WHERE o.payment_policy_id IS NOT NULL
    AND o.deleted_at IS NULL
    AND o.status = 'COMPLETED'
    AND DATE(o.created_at, 'Asia/Seoul') >= DATE '{ORDER_DOMAIN_V2_START_DATE}'
    AND p.product_type = 'SERVICE'
),
paid_orders AS (
  SELECT
    user_id,
    order_id,
    created_at,
    order_date,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) AS order_seq
  FROM source_orders
)
""".strip()


def build_assignment_upsert_sql(run_date: str) -> str:
    return f"""
CREATE TEMP TABLE exact_d7_source AS
WITH {build_paid_orders_cte_sql()},
{build_marketing_agreed_users_cte_sql()},
eligible AS (
  SELECT
    CAST(first_order.user_id AS INT64) AS user_id,
    CAST(first_order.order_id AS INT64) AS first_order_id,
    first_order.created_at AS first_order_at,
    DATE(first_order.created_at, 'Asia/Seoul') AS first_order_date
  FROM paid_orders AS first_order
  JOIN marketing_agreed_users
    ON first_order.user_id = marketing_agreed_users.user_id
  LEFT JOIN paid_orders AS second_order
    ON first_order.user_id = second_order.user_id
   AND second_order.order_seq = 2
  WHERE first_order.order_seq = 1
    AND first_order.order_date = DATE_SUB(DATE('{run_date}'), INTERVAL 7 DAY)
    AND second_order.user_id IS NULL
),
assigned AS (
  SELECT
    '{EXPERIMENT_KEY}' AS experiment_key,
    user_id,
    CASE ABS(MOD(FARM_FINGERPRINT(CONCAT(CAST(user_id AS STRING), ':{EXPERIMENT_KEY}')), 4))
      WHEN 0 THEN 'CONTROL'
      WHEN 1 THEN 'MSG_ONLY'
      WHEN 2 THEN 'PCT50'
      ELSE 'FIXED5000'
    END AS variant,
    TIMESTAMP(DATETIME(DATE('{run_date}'), TIME(9, 5, 0)), 'Asia/Seoul') AS assigned_at,
    DATE('{run_date}') AS eligible_date,
    0 AS scheduled_day,
    DATE('{run_date}') AS scheduled_send_date,
    CASE
      WHEN ABS(MOD(FARM_FINGERPRINT(CONCAT(CAST(user_id AS STRING), ':{EXPERIMENT_KEY}')), 4)) = 0 THEN 'holdout'
      ELSE 'flarelane_friendtalk'
    END AS channel,
    '{ENG1559_TAG_KEY}' AS tag_key,
    '1' AS tag_value,
    CASE
      WHEN ABS(MOD(FARM_FINGERPRINT(CONCAT(CAST(user_id AS STRING), ':{EXPERIMENT_KEY}')), 4)) = 0 THEN 'holdout'
      ELSE 'send_today'
    END AS assignment_status,
    first_order_id,
    first_order_at,
    CURRENT_TIMESTAMP() AS loaded_at
  FROM eligible
)
SELECT
  experiment_key,
  user_id,
  variant,
  assigned_at,
  eligible_date,
  scheduled_day,
  scheduled_send_date,
  channel,
  tag_key,
  tag_value,
  assignment_status,
  first_order_id,
  first_order_at,
  loaded_at
FROM assigned;

MERGE {ASSIGNMENT_TABLE} AS target
USING exact_d7_source AS source
ON target.experiment_key = source.experiment_key
AND target.user_id = source.user_id
WHEN MATCHED THEN UPDATE SET
  target.variant = source.variant,
  target.assigned_at = source.assigned_at,
  target.eligible_date = source.eligible_date,
  target.scheduled_day = source.scheduled_day,
  target.scheduled_send_date = source.scheduled_send_date,
  target.channel = source.channel,
  target.tag_key = source.tag_key,
  target.tag_value = source.tag_value,
  target.assignment_status = source.assignment_status,
  target.first_order_id = source.first_order_id,
  target.first_order_at = source.first_order_at,
  target.loaded_at = source.loaded_at
WHEN NOT MATCHED THEN INSERT (
  experiment_key,
  user_id,
  variant,
  assigned_at,
  eligible_date,
  scheduled_day,
  scheduled_send_date,
  channel,
  tag_key,
  tag_value,
  assignment_status,
  first_order_id,
  first_order_at,
  loaded_at
) VALUES (
  source.experiment_key,
  source.user_id,
  source.variant,
  source.assigned_at,
  source.eligible_date,
  source.scheduled_day,
  source.scheduled_send_date,
  source.channel,
  source.tag_key,
  source.tag_value,
  source.assignment_status,
  source.first_order_id,
  source.first_order_at,
  source.loaded_at
);
""".strip()


def build_assignment_preview_sql(run_date: str) -> str:
    return f"""
WITH {build_paid_orders_cte_sql()},
{build_marketing_agreed_users_cte_sql()},
eligible AS (
  SELECT
    CAST(first_order.user_id AS INT64) AS user_id,
    CAST(first_order.order_id AS INT64) AS first_order_id,
    first_order.created_at AS first_order_at,
    DATE(first_order.created_at, 'Asia/Seoul') AS first_order_date
  FROM paid_orders AS first_order
  JOIN marketing_agreed_users
    ON first_order.user_id = marketing_agreed_users.user_id
  LEFT JOIN paid_orders AS second_order
    ON first_order.user_id = second_order.user_id
   AND second_order.order_seq = 2
  WHERE first_order.order_seq = 1
    AND first_order.order_date = DATE_SUB(DATE('{run_date}'), INTERVAL 7 DAY)
    AND second_order.user_id IS NULL
),
assigned AS (
  SELECT
    '{EXPERIMENT_KEY}' AS experiment_key,
    user_id,
    first_order_id,
    first_order_at,
    first_order_date,
    CASE ABS(MOD(FARM_FINGERPRINT(CONCAT(CAST(user_id AS STRING), ':{EXPERIMENT_KEY}')), 4))
      WHEN 0 THEN 'CONTROL'
      WHEN 1 THEN 'MSG_ONLY'
      WHEN 2 THEN 'PCT50'
      ELSE 'FIXED5000'
    END AS variant
  FROM eligible
)
SELECT
  CAST(assigned.user_id AS STRING) AS user_id,
  CAST(assigned.first_order_id AS STRING) AS first_order_id,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%S%Ez', assigned.first_order_at, 'Asia/Seoul') AS first_order_at,
  CAST(assigned.first_order_date AS STRING) AS first_order_date,
  assigned.variant,
  EXISTS (
    SELECT 1
    FROM {EVENT_HISTORY_TABLE} AS history
    WHERE history.experiment_key = assigned.experiment_key
      AND history.user_id = assigned.user_id
      AND history.first_order_id = assigned.first_order_id
      AND history.event_kind IN ('tag_set', 'event_send', 'unified_entry')
  ) AS already_emitted
FROM assigned
ORDER BY assigned.user_id;
""".strip()


def build_assignment_select_sql(run_date: str) -> str:
    return f"""
WITH {build_marketing_agreed_users_cte_sql()}
SELECT
  CAST(assignments.user_id AS STRING) AS user_id,
  CAST(assignments.first_order_id AS STRING) AS first_order_id,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%S%Ez', assignments.first_order_at, 'Asia/Seoul') AS first_order_at,
  CAST(DATE(assignments.first_order_at, 'Asia/Seoul') AS STRING) AS first_order_date,
  assignments.variant,
  EXISTS (
    SELECT 1
    FROM {EVENT_HISTORY_TABLE} AS history
    WHERE history.experiment_key = assignments.experiment_key
      AND history.user_id = assignments.user_id
      AND history.first_order_id = assignments.first_order_id
      AND history.event_kind IN ('tag_set', 'event_send', 'unified_entry')
  ) AS already_emitted
FROM {ASSIGNMENT_TABLE} AS assignments
JOIN marketing_agreed_users
  ON assignments.user_id = marketing_agreed_users.user_id
WHERE assignments.experiment_key = '{EXPERIMENT_KEY}'
  AND assignments.eligible_date = DATE('{run_date}')
ORDER BY assignments.user_id;
""".strip()


def write_snapshot(rows: list[dict[str, Any]], run_date: str) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / f"eng1559_exact_d7_batch_{run_date.replace('-', '')}.csv"
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "run_date",
                "user_id",
                "first_order_id",
                "first_order_at",
                "first_order_date",
                "variant",
                "already_emitted",
            ],
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "run_date": run_date,
                    "user_id": row["user_id"],
                    "first_order_id": row["first_order_id"],
                    "first_order_at": row["first_order_at"],
                    "first_order_date": row["first_order_date"],
                    "variant": row["variant"],
                    "already_emitted": row["already_emitted"],
                }
            )
    return path


def build_event_payload(row: dict[str, Any], event_source: str) -> dict[str, Any]:
    return {
        "subjectType": "user",
        "subjectId": row["user_id"],
        "type": ENTRY_EVENT,
        "data": {
            "source": event_source,
            "arm": row["variant"],
            "order_date": row["first_order_date"],
        },
    }


def emit_events(
    rows: list[dict[str, Any]],
    dry_run: bool,
    sleep_ms: int,
    include_already_emitted: bool,
    selected_variants: set[str] | None,
    event_source: str,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    candidate_rows = [
        row
        for row in rows
        if row["variant"] != ARM_CONTROL
        and (selected_variants is None or row["variant"] in selected_variants)
        and (include_already_emitted or not row["already_emitted"])
    ]
    events = [build_event_payload(row, event_source) for row in candidate_rows]
    summary: dict[str, Any] = {
        "total_assigned": len(rows),
        "total_emittable": len(events),
        "already_emitted": sum(1 for row in rows if row["already_emitted"]),
        "include_already_emitted": include_already_emitted,
        "selected_variants": sorted(selected_variants) if selected_variants else None,
        "event_source": event_source,
        "sent": 0,
        "failed": 0,
        "sample_payloads": events[:3],
        "sample_errors": [],
    }
    if dry_run or not events:
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
    for index, event in enumerate(events):
        try:
            response = session.post(url, json={"events": [event]}, timeout=20)
            if response.ok:
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
                                "user_id": event["subjectId"],
                                "status": response.status_code,
                                "success": success_count,
                                "errorMessages": body.get("events", {}).get("errorMessages", []),
                            }
                        )
            else:
                summary["failed"] += 1
                if len(summary["sample_errors"]) < 5:
                    summary["sample_errors"].append(
                        {
                            "index": index,
                            "user_id": event["subjectId"],
                            "status": response.status_code,
                            "body": response.text[:300],
                        }
                    )
            if sleep_ms > 0 and index < len(events) - 1:
                time.sleep(sleep_ms / 1000)
        except Exception as exc:
            summary["failed"] += 1
            if len(summary["sample_errors"]) < 5:
                summary["sample_errors"].append(
                    {
                        "index": index,
                        "user_id": event["subjectId"],
                        "error": str(exc),
                    }
                )

    return summary, successful_rows


def build_event_history_insert_sql(rows: list[dict[str, Any]], event_source: str) -> str:
    if not rows:
        return ""
    selects = []
    for row in rows:
        selects.append(
            f"""
SELECT
  '{EXPERIMENT_KEY}' AS experiment_key,
  {int(row["user_id"])} AS user_id,
  {int(row["first_order_id"])} AS first_order_id,
  '{row["variant"]}' AS arm,
  'event_send' AS event_kind,
  'event:{ENTRY_EVENT}' AS event_type,
  '{event_source}' AS source,
  DATE '{row["first_order_date"]}' AS eligible_date,
  TIMESTAMP('{row["first_order_at"]}') AS signal_at,
  CURRENT_TIMESTAMP() AS emitted_at
"""
        )
    union_sql = "\nUNION ALL\n".join(selects)
    return f"""
INSERT INTO {EVENT_HISTORY_TABLE} (
  experiment_key,
  user_id,
  first_order_id,
  arm,
  event_kind,
  event_type,
  source,
  eligible_date,
  signal_at,
  emitted_at
)
{union_sql};
""".strip()


def insert_event_history(rows: list[dict[str, Any]], event_source: str) -> None:
    sql = build_event_history_insert_sql(rows, event_source)
    if not sql:
        return
    run_bq_command(DATA_DIR, LOG_PREFIX, sql)


def summarize_variant_counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    counts = {arm: 0 for arm in ARM_INDEX_BY_BUCKET.values()}
    for row in rows:
        counts[row["variant"]] = counts.get(row["variant"], 0) + 1
    return counts


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Assign and emit ENG-1559 exact D7 reminder events")
    parser.add_argument("--run-date", default=kst_today_string(), help="KST 기준 실행일 YYYY-MM-DD")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="앞에서 N명만 발송")
    parser.add_argument("--user-id", default="", help="특정 user_id만 발송")
    parser.add_argument("--sleep-ms", type=int, default=0, help="이벤트 간 sleep milliseconds")
    parser.add_argument(
        "--variant",
        action="append",
        choices=[ARM_MSG_ONLY, ARM_PCT50, ARM_FIXED5000],
        help="특정 실험군만 발송. 여러 번 반복 가능.",
    )
    parser.add_argument(
        "--include-already-emitted",
        action="store_true",
        help="기존 발송 이력이 있어도 다시 이벤트를 보낸다. 복구 발송용.",
    )
    parser.add_argument(
        "--event-source",
        default=ENTRY_EVENT_SOURCE,
        help="FlareLane 이벤트 source 값. 복구 발송은 별도 source를 권장.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    run_bq_command(DATA_DIR, LOG_PREFIX, build_prepare_tables_sql())
    if args.dry_run:
        rows = normalize_rows(run_bq_query(DATA_DIR, LOG_PREFIX, build_assignment_preview_sql(args.run_date)))
    else:
        run_bq_command(DATA_DIR, LOG_PREFIX, build_assignment_upsert_sql(args.run_date))
        rows = normalize_rows(run_bq_query(DATA_DIR, LOG_PREFIX, build_assignment_select_sql(args.run_date)))
    if args.user_id:
        rows = [row for row in rows if row["user_id"] == args.user_id.strip()]
    selected_variants = set(args.variant or [])
    if selected_variants:
        rows = [row for row in rows if row["variant"] in selected_variants]
    if args.limit > 0:
        rows = rows[: args.limit]
    snapshot_path = write_snapshot(rows, args.run_date)
    summary = {
        "run_date": args.run_date,
        "experiment_key": EXPERIMENT_KEY,
        "event_source": args.event_source,
        "snapshot": str(snapshot_path),
        "row_count": len(rows),
        "variant_counts": summarize_variant_counts(rows),
        "already_emitted_counts": summarize_variant_counts([row for row in rows if row["already_emitted"]]),
        "user_id_filter": args.user_id or None,
        "variant_filter": sorted(selected_variants) if selected_variants else None,
        "limit": args.limit or None,
        "dry_run": args.dry_run,
        "include_already_emitted": args.include_already_emitted,
        "emit": None,
    }
    emit_summary, successful_rows = emit_events(
        rows,
        args.dry_run,
        args.sleep_ms,
        args.include_already_emitted,
        selected_variants or None,
        args.event_source,
    )
    if not args.dry_run:
        insert_event_history(successful_rows, args.event_source)
    summary["emit"] = emit_summary
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"[error] {exc}", file=sys.stderr)
        raise SystemExit(1)
