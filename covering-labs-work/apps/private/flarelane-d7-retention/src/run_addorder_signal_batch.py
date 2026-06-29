#!/usr/bin/env python3
"""
Emit ENG-1559 benefit-entry events for users who re-enter AddOrderScreen after D7.

Flow:
1. Read ENG-1559 v2 assignments for PCT50 / FIXED5000 arms.
2. Keep only users who are still first-order-only and within D7~D30.
3. Detect post-D7 AddOrderScreen signals from Mixpanel.
4. Emit one FlareLane custom event per newly eligible user.
5. Persist successful benefit-event history rows for dedupe.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Any

from bq_helper import (
    ASSIGNMENT_TABLE,
    BQ_STATUSES,
    EVENT_HISTORY_TABLE,
    build_marketing_agreed_users_cte_sql,
    kst_today_string,
    normalize_rows,
    run_bq_command,
    run_bq_query,
)
from experiment_config import (
    ADD_ORDER_SIGNAL_EVENT,
    ARM_FIXED5000,
    ARM_PCT50,
    BENEFIT_EVENT_BY_ARM,
    BENEFIT_EVENT_SOURCE,
    EXPERIMENT_KEY,
)
from flarelane_api import emit_to_flarelane

DATA_DIR = Path.home() / "data" / "eng1559_addorder_signal_batch"
LOG_PREFIX = "eng1559_addorder_signal_batch"


def build_signal_prepare_sql() -> str:
    return f"""
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


def build_signal_select_sql(run_date: str) -> str:
    statuses = ", ".join(f"'{status}'" for status in BQ_STATUSES)
    return f"""

WITH paid_orders AS (
  SELECT
    user_id,
    id AS order_id,
    created_date,
    DATE(created_date, 'Asia/Seoul') AS order_date,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_date) AS order_seq
  FROM `covering-app-ccd23.secure_dataset.order`
  WHERE payment_policy_id IS NOT NULL
    AND deleted_date IS NULL
    AND status IN ({statuses})
),
{build_marketing_agreed_users_cte_sql()},
assignment_base AS (
  SELECT
    experiment_key,
    CAST(user_id AS INT64) AS user_id,
    variant,
    CAST(first_order_id AS INT64) AS first_order_id,
    first_order_at,
    DATE(first_order_at, 'Asia/Seoul') AS first_order_date,
    eligible_date
  FROM {ASSIGNMENT_TABLE}
  WHERE experiment_key = '{EXPERIMENT_KEY}'
    AND variant IN ('{ARM_PCT50}', '{ARM_FIXED5000}')
    AND eligible_date <= DATE('{run_date}')
),
current_candidates AS (
  SELECT
    assignment_base.*
  FROM assignment_base
  JOIN marketing_agreed_users
    ON assignment_base.user_id = marketing_agreed_users.user_id
  LEFT JOIN paid_orders second_order
    ON assignment_base.user_id = second_order.user_id
   AND second_order.order_seq = 2
  WHERE second_order.user_id IS NULL
    AND DATE_DIFF(DATE('{run_date}'), DATE(assignment_base.first_order_at, 'Asia/Seoul'), DAY) BETWEEN 7 AND 30
),
signals AS (
  SELECT
    current_candidates.experiment_key,
    current_candidates.user_id,
    current_candidates.variant,
    current_candidates.first_order_id,
    current_candidates.first_order_at,
    current_candidates.first_order_date,
    current_candidates.eligible_date,
    MIN(event.time) AS signal_at
  FROM current_candidates
  JOIN `covering-app-ccd23.mixpanel.mp_master_event` AS event
    ON SAFE_CAST(event.user_id AS INT64) = current_candidates.user_id
   AND event.event_name = '{ADD_ORDER_SIGNAL_EVENT}'
   AND event.time >= TIMESTAMP(DATETIME(current_candidates.eligible_date, TIME(0, 0, 0)), 'Asia/Seoul')
   AND event.time < TIMESTAMP(DATETIME(DATE_ADD(DATE('{run_date}'), INTERVAL 1 DAY), TIME(0, 0, 0)), 'Asia/Seoul')
  GROUP BY 1, 2, 3, 4, 5, 6, 7
)
SELECT
  CAST(user_id AS STRING) AS user_id,
  CAST(first_order_id AS STRING) AS first_order_id,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%S%Ez', first_order_at, 'Asia/Seoul') AS first_order_at,
  CAST(first_order_date AS STRING) AS first_order_date,
  CAST(eligible_date AS STRING) AS eligible_date,
  variant,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%S%Ez', signal_at, 'Asia/Seoul') AS signal_at,
  CASE variant
    WHEN '{ARM_PCT50}' THEN '{BENEFIT_EVENT_BY_ARM[ARM_PCT50]}'
    WHEN '{ARM_FIXED5000}' THEN '{BENEFIT_EVENT_BY_ARM[ARM_FIXED5000]}'
    ELSE NULL
  END AS benefit_event_type,
  EXISTS (
    SELECT 1
    FROM {EVENT_HISTORY_TABLE} AS history
    WHERE history.experiment_key = signals.experiment_key
      AND history.user_id = signals.user_id
      AND history.first_order_id = signals.first_order_id
      AND history.event_kind = 'benefit'
      AND history.event_type = CASE signals.variant
        WHEN '{ARM_PCT50}' THEN '{BENEFIT_EVENT_BY_ARM[ARM_PCT50]}'
        WHEN '{ARM_FIXED5000}' THEN '{BENEFIT_EVENT_BY_ARM[ARM_FIXED5000]}'
        ELSE NULL
      END
  ) AS already_emitted
FROM signals
ORDER BY signal_at, user_id;
""".strip()


def write_snapshot(rows: list[dict[str, Any]], run_date: str) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / f"eng1559_addorder_signal_batch_{run_date.replace('-', '')}.csv"
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "run_date",
                "user_id",
                "first_order_id",
                "first_order_at",
                "first_order_date",
                "eligible_date",
                "variant",
                "signal_at",
                "benefit_event_type",
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
                    "eligible_date": row["eligible_date"],
                    "variant": row["variant"],
                    "signal_at": row["signal_at"],
                    "benefit_event_type": row["benefit_event_type"],
                    "already_emitted": row["already_emitted"],
                }
            )
    return path


def build_event(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "subjectType": "user",
        "subjectId": row["user_id"],
        "type": row["benefit_event_type"],
        "data": {
            "userId": row["user_id"],
            "first_order_id": row["first_order_id"],
            "first_order_at": row["first_order_at"],
            "first_order_date": row["first_order_date"],
            "eligible_date": row["eligible_date"],
            "signal_at": row["signal_at"],
            "signal_event": ADD_ORDER_SIGNAL_EVENT,
            "experiment_key": EXPERIMENT_KEY,
            "arm": row["variant"],
            "source": BENEFIT_EVENT_SOURCE,
        },
    }


def build_event_history_insert_sql(rows: list[dict[str, Any]]) -> str:
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
  'benefit' AS event_kind,
  '{row["benefit_event_type"]}' AS event_type,
  '{BENEFIT_EVENT_SOURCE}' AS source,
  DATE '{row["eligible_date"]}' AS eligible_date,
  TIMESTAMP('{row["signal_at"]}') AS signal_at,
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


def insert_event_history(rows: list[dict[str, Any]]) -> None:
    sql = build_event_history_insert_sql(rows)
    if not sql:
        return
    run_bq_command(DATA_DIR, LOG_PREFIX, sql)


def summarize_variant_counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    return {
        ARM_PCT50: sum(1 for row in rows if row["variant"] == ARM_PCT50),
        ARM_FIXED5000: sum(1 for row in rows if row["variant"] == ARM_FIXED5000),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Emit ENG-1559 AddOrder benefit events")
    parser.add_argument("--run-date", default=kst_today_string(), help="KST 기준 실행일 YYYY-MM-DD")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="앞에서 N명만 발송")
    parser.add_argument("--user-id", default="", help="특정 user_id만 발송")
    parser.add_argument("--sleep-ms", type=int, default=0, help="이벤트 간 sleep milliseconds")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    run_bq_command(DATA_DIR, LOG_PREFIX, build_signal_prepare_sql())
    rows = normalize_rows(run_bq_query(DATA_DIR, LOG_PREFIX, build_signal_select_sql(args.run_date)))
    if args.user_id:
        rows = [row for row in rows if row["user_id"] == args.user_id.strip()]
    if args.limit > 0:
        rows = rows[: args.limit]
    snapshot_path = write_snapshot(rows, args.run_date)
    emit_summary, successful_rows = emit_to_flarelane(
        rows,
        build_event,
        payload_key="events",
        total_label="total_candidates",
        dry_run=args.dry_run,
        sleep_ms=args.sleep_ms,
    )
    if not args.dry_run:
        insert_event_history(successful_rows)

    summary = {
        "run_date": args.run_date,
        "experiment_key": EXPERIMENT_KEY,
        "signal_event": ADD_ORDER_SIGNAL_EVENT,
        "event_source": BENEFIT_EVENT_SOURCE,
        "snapshot": str(snapshot_path),
        "row_count": len(rows),
        "variant_counts": summarize_variant_counts(rows),
        "already_emitted_counts": summarize_variant_counts([row for row in rows if row["already_emitted"]]),
        "user_id_filter": args.user_id or None,
        "limit": args.limit or None,
        "dry_run": args.dry_run,
        "emit": emit_summary,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"[error] {exc}", file=sys.stderr)
        raise SystemExit(1)
