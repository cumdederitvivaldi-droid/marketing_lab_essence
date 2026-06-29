#!/usr/bin/env python3
"""D7 CRM post-test analysis without hardcoded secrets or BigQuery writes."""

from __future__ import annotations

import argparse
import csv
import os
import sys
import time
from pathlib import Path

import requests
from google.cloud import bigquery


def _load_env_file() -> None:
    """Load shared VM environment variables for cron and SSH executions."""
    env_path = Path("/shared/.env")
    try:
        lines = env_path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return
    except OSError:
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
PROMO_START = os.environ.get("D7CRM_PROMO_START", "2026-04-22")
PROMO_END = os.environ.get("D7CRM_PROMO_END", "2026-05-06")
DEFAULT_GROUPS_CSV = Path(__file__).with_name("d7crm_ab_groups.csv")

TAG_GROUP_MAP = {
    "first_d+3_treatment": "d3_treatment",
    "first_d+3_control": "d3_control",
    "first_d+8_variant1": "d8_v1",
    "first_d+8_variant2": "d8_v2",
    "first_d+8_control": "d8_control",
}

BASE_CTES = f"""
paid_orders AS (
  SELECT DISTINCT o.id AS order_id, o.user_id, o.created_at
  FROM `{PROJECT}.{DATASET}.order_v2` o
  JOIN `{PROJECT}.{DATASET}.order_invoice` oi ON oi.order_id = o.id
  JOIN `{PROJECT}.{DATASET}.receipt` r ON r.invoice_id = oi.invoice_id
  WHERE o.deleted_at IS NULL
    AND o.status != 'CANCELED'
    AND r.status = 'PAID'
    AND r.deleted_at IS NULL
),
first_bag AS (
  SELECT po.user_id, MIN(po.created_at) AS first_bag_ts
  FROM paid_orders po
  JOIN `{PROJECT}.{DATASET}.order_line` ol ON ol.order_id = po.order_id AND ol.deleted_at IS NULL
  JOIN `{PROJECT}.{DATASET}.product` p ON p.id = ol.product_id
  WHERE p.product_code IN ('COVERING_BAG', 'LARGE_COVERING_BAG')
  GROUP BY po.user_id
),
pickup_orders AS (
  SELECT po.user_id, po.created_at AS pickup_ts
  FROM paid_orders po
  JOIN `{PROJECT}.{DATASET}.order_line` ol ON ol.order_id = po.order_id AND ol.deleted_at IS NULL
  JOIN `{PROJECT}.{DATASET}.product` p ON p.id = ol.product_id
  WHERE p.product_type = 'SERVICE'
),
crm_cohort AS (
  SELECT fb.user_id, fb.first_bag_ts, MIN(po.pickup_ts) AS first_pickup_ts
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


def bq_literal(value: str) -> str:
    """Escape a string value for use in a BigQuery SQL literal."""
    escaped = (
        value.replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
        .replace("\f", "\\f")
        .replace("\v", "\\v")
        .replace("\0", "\\x00")
    )
    return "'" + escaped + "'"


def read_groups(path: Path) -> list[dict[str, str]]:
    """Read user-level A/B group assignments from a CSV file."""
    with path.open(newline="", encoding="utf-8") as f:
        rows = [
            {
                "user_id": row["user_id"].strip(),
                "group": row["group"].strip(),
                "has_conflict": row.get("has_conflict", "false").strip().lower(),
            }
            for row in csv.DictReader(f)
            if row.get("user_id") and row.get("group")
        ]
    if not rows:
        raise SystemExit(f"분석 그룹 CSV가 비어 있습니다: {path}")
    normalized = dedupe_users(rows)
    conflicts = [
        row
        for row in normalized
        if row["has_conflict"] == "true" or row["group"].startswith("MULTIPLE:")
    ]
    if conflicts:
        raise SystemExit(f"분석 그룹 CSV에 복수 그룹 충돌이 있습니다: {len(conflicts)}명")
    return [{"user_id": row["user_id"], "group": row["group"]} for row in normalized]


def groups_cte(groups: list[dict[str, str]]) -> str:
    """Build a BigQuery CTE for the in-memory A/B group assignments."""
    values = ",\n    ".join(
        f"STRUCT({bq_literal(row['user_id'])} AS user_id, {bq_literal(row['group'])} AS `group`)"
        for row in groups
    )
    return f"ab_groups AS (SELECT user_id, `group` FROM UNNEST([{values}]))"


def analysis_query(groups: list[dict[str, str]], group_filter: str | None, max_day: int) -> str:
    """Build the conversion analysis query for the requested group filter."""
    filter_sql = f"WHERE `group` LIKE {bq_literal(group_filter)}" if group_filter else ""
    return f"""
WITH {BASE_CTES},
{groups_cte(groups)},
selected_groups AS (
  SELECT user_id, `group`
  FROM ab_groups
  {filter_sql}
),
analysis AS (
  SELECT
    g.`group` AS ab_group,
    fb.user_id,
    fb.first_bag_ts,
    TIMESTAMP_DIFF(fb.first_pickup_ts, fb.first_bag_ts, DAY) AS days_to_convert,
    CASE
      WHEN DATE(fb.first_bag_ts, 'Asia/Seoul') BETWEEN '{PROMO_START}' AND '{PROMO_END}'
      THEN 'promo_period'
      ELSE 'clean_period'
    END AS period
  FROM selected_groups g
  JOIN crm_cohort fb ON CAST(g.user_id AS STRING) = CAST(fb.user_id AS STRING)
)
SELECT
  period,
  ab_group,
  COUNT(*) AS total_users,
  COUNTIF(days_to_convert IS NOT NULL AND days_to_convert <= 3) AS d3_conv,
  ROUND(SAFE_DIVIDE(COUNTIF(days_to_convert IS NOT NULL AND days_to_convert <= 3), COUNT(*)) * 100, 1) AS d3_pct,
  COUNTIF(days_to_convert IS NOT NULL AND days_to_convert <= 7) AS d7_conv,
  ROUND(SAFE_DIVIDE(COUNTIF(days_to_convert IS NOT NULL AND days_to_convert <= 7), COUNT(*)) * 100, 1) AS d7_pct,
  COUNTIF(days_to_convert IS NOT NULL AND days_to_convert <= 14) AS d14_conv,
  ROUND(SAFE_DIVIDE(COUNTIF(days_to_convert IS NOT NULL AND days_to_convert <= 14), COUNT(*)) * 100, 1) AS d14_pct,
  COUNTIF(days_to_convert IS NOT NULL AND days_to_convert <= {max_day}) AS d{max_day}_conv,
  ROUND(SAFE_DIVIDE(COUNTIF(days_to_convert IS NOT NULL AND days_to_convert <= {max_day}), COUNT(*)) * 100, 1) AS d{max_day}_pct
FROM analysis
GROUP BY period, ab_group
ORDER BY period, ab_group
"""


def dedupe_users(users: list[dict[str, str]]) -> list[dict[str, str]]:
    """Collapse repeated user rows and mark conflicting group assignments."""
    groups_by_user: dict[str, set[str]] = {}
    marked_conflicts: set[str] = set()
    for user in users:
        user_id = user["user_id"].strip()
        group = user["group"].strip()
        if not user_id or not group:
            continue
        groups_by_user.setdefault(user_id, set()).add(group)
        if user.get("has_conflict", "false").strip().lower() == "true":
            marked_conflicts.add(user_id)

    deduped: list[dict[str, str]] = []
    for user_id in sorted(groups_by_user):
        groups = sorted(groups_by_user[user_id])
        has_conflict = len(groups) > 1 or user_id in marked_conflicts
        deduped.append(
            {
                "user_id": user_id,
                "group": groups[0] if len(groups) == 1 else "MULTIPLE:" + "|".join(groups),
                "has_conflict": "true" if has_conflict else "false",
            }
        )
    return deduped


def _flarelane_data(resp: requests.Response) -> list[dict[str, object]]:
    """Validate and return one FlareLane devices page."""
    payload = resp.json()
    if not isinstance(payload, dict):
        raise SystemExit("FlareLane 응답 스키마 변경 감지: JSON object 아님")
    data = payload.get("data") or []
    if not isinstance(data, list):
        raise SystemExit("FlareLane 응답 스키마 변경 감지: data list 아님")
    if any(not isinstance(item, dict) for item in data):
        raise SystemExit("FlareLane 응답 스키마 변경 감지: data item object 아님")
    return data


def _flarelane_user_id(item: dict[str, object]) -> str | None:
    """Extract a user identifier from one FlareLane device object."""
    if "userId" in item:
        return str(item["userId"]) if item["userId"] else None
    if "user_id" in item:
        return str(item["user_id"]) if item["user_id"] else None
    raise SystemExit("FlareLane 응답 스키마 변경 감지: userId 필드 없음")


def _request_with_retry(
    session: requests.Session,
    url: str,
    params: dict[str, str | int],
    max_retries: int = 3,
    backoff: float = 2.0,
) -> requests.Response:
    """Fetch a FlareLane page, retrying transient failures only."""
    last_error: requests.RequestException | None = None
    last_status: int | None = None
    for attempt in range(max_retries):
        try:
            resp = session.get(url, params=params, timeout=30)
        except requests.RequestException as exc:
            last_error = exc
            if attempt < max_retries - 1:
                time.sleep(backoff**attempt)
                continue
            break

        if resp.status_code == 200:
            return resp
        last_status = resp.status_code
        if resp.status_code >= 500 and attempt < max_retries - 1:
            time.sleep(backoff**attempt)
            continue
        raise SystemExit(f"FlareLane 조회 실패: {resp.status_code}")

    if last_status is not None:
        raise SystemExit(f"FlareLane 조회 재시도 횟수 초과: {last_status}")
    raise SystemExit(f"FlareLane 조회 재시도 횟수 초과: {last_error}")


def extract_users_by_tag(output: Path) -> None:
    """Extract FlareLane-tagged users and write a deduplicated CSV."""
    api_key = os.environ.get("FLARELANE_API_KEY")
    project_id = os.environ.get("FLARELANE_PROJECT_ID")
    if not api_key or not project_id:
        raise SystemExit("FLARELANE_API_KEY와 FLARELANE_PROJECT_ID 환경변수가 필요합니다.")

    base_url = f"https://api.flarelane.com/v1/projects/{project_id}"
    users: list[dict[str, str]] = []
    with requests.Session() as session:
        session.headers.update({"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})
        for tag_key, group_name in TAG_GROUP_MAP.items():
            offset = 0
            while True:
                resp = _request_with_retry(
                    session,
                    f"{base_url}/devices",
                    params={"tagKey": tag_key, "offset": offset, "limit": 100},
                )
                data = _flarelane_data(resp)
                users.extend(
                    {"user_id": user_id, "group": group_name}
                    for item in data
                    if (user_id := _flarelane_user_id(item))
                )
                if len(data) < 100:
                    break
                offset += 100

    deduped_users = dedupe_users(users)
    with output.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["user_id", "group", "has_conflict"])
        writer.writeheader()
        writer.writerows(deduped_users)
    conflict_count = sum(1 for user in deduped_users if user["has_conflict"] == "true")
    print(f"저장 완료: {output} ({len(deduped_users)}명, 충돌 {conflict_count}명)")


def run_query(query: str) -> None:
    """Run one analysis query and print a tab-separated result."""
    rows = list(bigquery.Client(project=PROJECT).query(query).result())
    if not rows:
        print("(결과 없음)")
        return
    headers = list(rows[0].keys())
    print("\t".join(headers))
    for row in rows:
        print("\t".join(str(row[h]) for h in headers))
    print(f"총 {len(rows)}행")


def main() -> int:
    """Parse CLI arguments and run the requested analysis command."""
    parser = argparse.ArgumentParser(description="D7 CRM post-test analysis")
    parser.add_argument("command", choices=["extract", "d3", "d8", "summary"])
    parser.add_argument("--groups-csv", type=Path, default=DEFAULT_GROUPS_CSV)
    parser.add_argument("--print-sql", action="store_true")
    args = parser.parse_args()

    if args.command == "extract":
        extract_users_by_tag(args.groups_csv)
        return 0

    groups = read_groups(args.groups_csv)
    if args.command == "d3":
        query = analysis_query(groups, "d3_%", 14)
    elif args.command == "d8":
        query = analysis_query(groups, "d8_%", 21)
    else:
        query = analysis_query(groups, None, 21)

    if args.print_sql:
        print(query)
        return 0
    run_query(query)
    return 0


if __name__ == "__main__":
    sys.exit(main())
