#!/usr/bin/env python3
"""D7 CRM daily monitoring queries using current Covering order tables."""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from pathlib import Path

from google.cloud import bigquery


def _load_env_file() -> None:
    """Load shared VM environment variables for cron executions."""
    env_path = Path("/shared/.env")
    try:
        lines = env_path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return
    except OSError as exc:
        logging.getLogger("d7-crm-monitoring").warning("환경변수 파일 로드 실패: %s", exc)
        return

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file()

PROJECT = os.environ.get("GCP_PROJECT", "covering-app-ccd23")
DATASET = os.environ.get("D7CRM_BQ_DATASET", "secure_dataset")
LOG_DIR = Path(__file__).resolve().parents[1] / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_DIR / "batch.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger("d7-crm-monitoring")

PAID_ORDER_CTE = f"""
paid_orders AS (
  SELECT DISTINCT o.id AS order_id, o.user_id, o.created_at
  FROM `{PROJECT}.{DATASET}.order_v2` o
  JOIN `{PROJECT}.{DATASET}.order_invoice` oi ON oi.order_id = o.id
  JOIN `{PROJECT}.{DATASET}.receipt` r ON r.invoice_id = oi.invoice_id
  WHERE o.deleted_at IS NULL
    AND o.status != 'CANCELED'
    AND r.status = 'PAID'
    AND r.deleted_at IS NULL
)
"""

FIRST_BAG_CTE = f"""
first_bag AS (
  SELECT po.user_id, MIN(po.created_at) AS first_bag_ts
  FROM paid_orders po
  JOIN `{PROJECT}.{DATASET}.order_line` ol ON ol.order_id = po.order_id AND ol.deleted_at IS NULL
  JOIN `{PROJECT}.{DATASET}.product` p ON p.id = ol.product_id
  WHERE p.product_code IN ('COVERING_BAG', 'LARGE_COVERING_BAG')
  GROUP BY po.user_id
)
"""

PICKUP_ORDER_CTE = f"""
pickup_orders AS (
  SELECT po.user_id, po.created_at AS pickup_ts
  FROM paid_orders po
  JOIN `{PROJECT}.{DATASET}.order_line` ol ON ol.order_id = po.order_id AND ol.deleted_at IS NULL
  JOIN `{PROJECT}.{DATASET}.product` p ON p.id = ol.product_id
  WHERE p.product_type = 'SERVICE'
)
"""

CRM_COHORT_CTE = """
crm_cohort AS (
  SELECT
    fb.user_id,
    fb.first_bag_ts,
    MIN(po.pickup_ts) AS first_pickup_ts
  FROM first_bag fb
  LEFT JOIN pickup_orders po
    ON po.user_id = fb.user_id
   AND po.pickup_ts > fb.first_bag_ts
  WHERE NOT EXISTS (
    SELECT 1
    FROM pickup_orders prev
    WHERE prev.user_id = fb.user_id
      AND prev.pickup_ts <= fb.first_bag_ts
  )
  GROUP BY fb.user_id, fb.first_bag_ts
)
"""

Q1_DAILY_ENTRY = f"""
WITH {PAID_ORDER_CTE}, {FIRST_BAG_CTE}, {PICKUP_ORDER_CTE}, {CRM_COHORT_CTE}
SELECT
  DATE(first_bag_ts, 'Asia/Seoul') AS purchase_date,
  COUNT(*) AS first_bag_users
FROM crm_cohort
WHERE first_bag_ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY)
GROUP BY purchase_date
ORDER BY purchase_date DESC
"""

Q2_CONVERSION_FUNNEL = f"""
WITH {PAID_ORDER_CTE}, {FIRST_BAG_CTE}, {PICKUP_ORDER_CTE}, {CRM_COHORT_CTE},
cohort AS (
  SELECT
    user_id,
    first_bag_ts,
    TIMESTAMP_DIFF(first_pickup_ts, first_bag_ts, DAY) AS days_to_convert
  FROM crm_cohort
  WHERE first_bag_ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
),
days AS (SELECT d_plus FROM UNNEST(GENERATE_ARRAY(1, 14)) AS d_plus)
SELECT
  d.d_plus,
  COUNTIF(c.first_bag_ts <= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL d.d_plus DAY)) AS eligible_users,
  COUNTIF(
    c.first_bag_ts <= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL d.d_plus DAY)
    AND c.days_to_convert IS NOT NULL
    AND c.days_to_convert <= d.d_plus
  ) AS converted_users,
  ROUND(
    SAFE_DIVIDE(
      COUNTIF(
        c.first_bag_ts <= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL d.d_plus DAY)
        AND c.days_to_convert IS NOT NULL
        AND c.days_to_convert <= d.d_plus
      ),
      COUNTIF(c.first_bag_ts <= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL d.d_plus DAY))
    ) * 100,
    1
  ) AS conversion_pct
FROM days d
CROSS JOIN cohort c
GROUP BY d.d_plus
ORDER BY d.d_plus
"""

Q3_WEEKLY_COHORT = f"""
WITH {PAID_ORDER_CTE}, {FIRST_BAG_CTE}, {PICKUP_ORDER_CTE}, {CRM_COHORT_CTE},
cohort AS (
  SELECT
    user_id,
    first_bag_ts,
    DATE_TRUNC(DATE(first_bag_ts, 'Asia/Seoul'), WEEK(MONDAY)) AS cohort_week,
    TIMESTAMP_DIFF(first_pickup_ts, first_bag_ts, DAY) AS days_to_convert
  FROM crm_cohort
  WHERE first_bag_ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 DAY)
)
SELECT
  cohort_week,
  COUNT(*) AS total_users,
  COUNTIF(first_bag_ts <= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 3 DAY)) AS d3_eligible,
  COUNTIF(first_bag_ts <= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 3 DAY) AND days_to_convert IS NOT NULL AND days_to_convert <= 3) AS d3_converted,
  ROUND(SAFE_DIVIDE(
    COUNTIF(first_bag_ts <= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 3 DAY) AND days_to_convert IS NOT NULL AND days_to_convert <= 3),
    COUNTIF(first_bag_ts <= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 3 DAY))
  ) * 100, 1) AS d3_pct,
  COUNTIF(first_bag_ts <= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)) AS d7_eligible,
  COUNTIF(first_bag_ts <= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY) AND days_to_convert IS NOT NULL AND days_to_convert <= 7) AS d7_converted,
  ROUND(SAFE_DIVIDE(
    COUNTIF(first_bag_ts <= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY) AND days_to_convert IS NOT NULL AND days_to_convert <= 7),
    COUNTIF(first_bag_ts <= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY))
  ) * 100, 1) AS d7_pct,
  COUNTIF(first_bag_ts <= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY)) AS d14_eligible,
  COUNTIF(first_bag_ts <= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY) AND days_to_convert IS NOT NULL AND days_to_convert <= 14) AS d14_converted,
  ROUND(SAFE_DIVIDE(
    COUNTIF(first_bag_ts <= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY) AND days_to_convert IS NOT NULL AND days_to_convert <= 14),
    COUNTIF(first_bag_ts <= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY))
  ) * 100, 1) AS d14_pct
FROM cohort
GROUP BY cohort_week
ORDER BY cohort_week DESC
"""

Q4_COUPON_USAGE = f"""
SELECT
  DATE(time, 'Asia/Seoul') AS event_date,
  COUNT(*) AS total_events,
  COUNTIF(JSON_VALUE(properties, '$.is_coupon_apply') = 'true') AS coupon_applied,
  COUNTIF(JSON_VALUE(properties, '$.coupon_policy_id') = '194') AS first30_used
FROM `{PROJECT}.mixpanel.mp_master_event`
WHERE event_name = '[EVENT] ProductPurchaseResult'
  AND time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY event_date
ORDER BY event_date DESC
"""

QUERIES = {
    "1": ("일별 첫 봉투 구매자", Q1_DAILY_ENTRY),
    "2": ("D+N 수거 신청 전환율", Q2_CONVERSION_FUNNEL),
    "3": ("주간 코호트 D3/D7/D14 전환율", Q3_WEEKLY_COHORT),
    "4": ("FIRST30 쿠폰 사용 현황", Q4_COUPON_USAGE),
}


def select_query_keys(query: str) -> list[str]:
    """Return query keys for the requested CLI mode."""
    if query == "all":
        return list(QUERIES.keys())
    if query == "daily":
        return ["1", "2", "3"]
    return [query]


def run_query(client: bigquery.Client, key: str, query: str) -> None:
    """Execute one BigQuery query and print a tab-separated result."""
    name = QUERIES[key][0]
    logger.info("조회 시작: %s", name)
    print(f"\n=== {key}. {name} ===")
    rows = list(client.query(query).result())
    if not rows:
        print("(결과 없음)")
        logger.info("조회 완료: %s / 0행", name)
        return
    headers = list(rows[0].keys())
    print("\t".join(headers))
    for row in rows:
        print("\t".join(str(row[h]) for h in headers))
    print(f"총 {len(rows)}행")
    logger.info("조회 완료: %s / %d행", name, len(rows))


def main() -> int:
    """Parse CLI arguments and run the selected monitoring queries."""
    parser = argparse.ArgumentParser(description="D7 CRM monitoring")
    parser.add_argument("query", nargs="?", default="daily", choices=["daily", "all", *QUERIES.keys()])
    parser.add_argument("--print-sql", action="store_true")
    args = parser.parse_args()

    selected = select_query_keys(args.query)
    if args.print_sql:
        for key in selected:
            print(QUERIES[key][1])
        return 0

    started_at = time.time()
    logger.info("시작: %s", args.query)
    client = bigquery.Client(project=PROJECT)
    for key in selected:
        run_query(client, key, QUERIES[key][1])
    logger.info("완료 : %.1f초", time.time() - started_at)
    return 0


if __name__ == "__main__":
    sys.exit(main())
