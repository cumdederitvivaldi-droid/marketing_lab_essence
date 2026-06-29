from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests
from google.api_core.exceptions import BadRequest
from google.cloud import bigquery

KST = timezone(timedelta(hours=9))
APP_ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = APP_ROOT / "logs"
LOG_PATH = LOG_DIR / "batch.log"


def _load_env_file(path: Path) -> None:
    try:
        lines = path.read_text().splitlines()
    except (FileNotFoundError, PermissionError):
        return
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env_file(Path("/shared/.env"))
_load_env_file(APP_ROOT / ".env")

PROJECT_ID = os.getenv("GCP_PROJECT", "covering-app-ccd23")
LOCATION = os.getenv("BQ_LOCATION", "asia-northeast3")
DATASET = "ads_data"
AIRBRIDGE_DATASET = "airbridge_dataset"
SECURE_DATASET = "secure_dataset"
COST_TABLE = "daily_cost_creative"
MAPPING_TABLE = "user_acquisition_channel"
AIRBRIDGE_APP = os.getenv("AIRBRIDGE_APP", "coveringprod")
BQ_STREAMING_BUFFER_RETRIES = int(os.getenv("BQ_STREAMING_BUFFER_RETRIES", "12"))
BQ_STREAMING_BUFFER_SLEEP_SECONDS = int(os.getenv("BQ_STREAMING_BUFFER_SLEEP_SECONDS", "300"))
MIN_SIGNUP_DATE = os.getenv("MIN_SIGNUP_DATE", "2026-02-10")

PAID_CHANNELS = [
    "facebook.business",
    "google.adwords",
    "apple.searchads",
    "tiktok",
    "instagram",
]

METRICS = [
    "impressions",
    "clicks",
    "app_installs",
    "cost_channel",
    "cpi_channel",
    "roas_channel",
]


def setup_logging() -> logging.Logger:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler(LOG_PATH),
        ],
    )
    return logging.getLogger("airbridge-ads-cost-sync")


logger = setup_logging()


class AirbridgeError(RuntimeError):
    pass


@dataclass(frozen=True)
class SyncResult:
    target_date: date
    row_count: int
    paid_row_count: int
    other_row_count: int
    channel_counts: dict[str, int]
    error_count: int = 0


def parse_date(value: str) -> date:
    if value == "yesterday":
        return (datetime.now(KST) - timedelta(days=1)).date()
    return datetime.strptime(value, "%Y-%m-%d").date()


def parse_iso_date(value: str, name: str) -> date:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValueError(f"{name} must be YYYY-MM-DD: {value}") from exc


def iter_dates(start: date, end: date) -> list[date]:
    if start > end:
        raise ValueError("--start must be earlier than or equal to --end")
    days = []
    current = start
    while current <= end:
        days.append(current)
        current += timedelta(days=1)
    return days


def is_retryable_error(message: str) -> bool:
    normalized = message.lower()
    return any(
        needle in normalized
        for needle in [
            "429",
            "quota",
            "rate limit",
            "too many",
            "bandwidth",
            "대역폭",
            "temporarily",
            "timeout",
        ]
    )


class AirbridgeClient:
    def __init__(self, token: str, app_name: str = AIRBRIDGE_APP) -> None:
        if not token:
            raise ValueError("AIRBRIDGE_TOKEN is required")
        self.session = requests.Session()
        self.base_url = f"https://api.airbridge.io/reports/api/v7/apps/{app_name}/actuals/query"
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    def fetch_actuals(
        self,
        target_date: date,
        group_bys: list[str],
        filters: list[dict[str, Any]],
    ) -> dict[str, Any]:
        payload = {
            "from": target_date.isoformat(),
            "to": target_date.isoformat(),
            "groupBys": group_bys,
            "metrics": METRICS,
            "filters": filters,
        }
        created = self._request_json("post", self.base_url, json=payload)
        task_id = created.get("task", {}).get("taskId")
        if not task_id:
            raise AirbridgeError(f"No taskId from Airbridge: {json.dumps(created, ensure_ascii=False)[:500]}")
        return self._poll_result(task_id)

    def _request_json(self, method: str, url: str, **kwargs: Any) -> dict[str, Any]:
        last_error: Exception | None = None
        for attempt in range(1, 5):
            try:
                response = self.session.request(method, url, headers=self.headers, timeout=60, **kwargs)
                text = response.text
                if response.status_code >= 400:
                    raise AirbridgeError(f"Airbridge HTTP {response.status_code}: {text[:500]}")
                parsed = response.json()
                if isinstance(parsed, dict) and parsed.get("error") and is_retryable_error(str(parsed.get("error"))):
                    raise AirbridgeError(f"Airbridge retryable response: {json.dumps(parsed, ensure_ascii=False)[:500]}")
                return parsed
            except (requests.RequestException, ValueError, AirbridgeError) as exc:
                last_error = exc
                message = str(exc)
                if attempt >= 4 or not is_retryable_error(message):
                    break
                sleep_s = 5 * (2 ** (attempt - 1))
                logger.warning("Airbridge request retry %s/4 after %ss: %s", attempt, sleep_s, message[:240])
                time.sleep(sleep_s)
        raise AirbridgeError(str(last_error))

    def _poll_result(self, task_id: str) -> dict[str, Any]:
        first_result: dict[str, Any] | None = None
        first_url = f"{self.base_url}/{task_id}?size=500"
        for _ in range(30):
            time.sleep(2)
            result = self._request_json("get", first_url)
            status = result.get("task", {}).get("status")
            if status == "SUCCESS" and result.get("actuals"):
                first_result = result
                break
            if status == "FAILED":
                raise AirbridgeError(f"Airbridge task failed: {json.dumps(result.get('task'), ensure_ascii=False)}")

        if first_result is None:
            raise AirbridgeError("Airbridge task timeout")

        all_rows = list(first_result.get("actuals", {}).get("data", {}).get("rows", []))
        row_count = int(first_result.get("actuals", {}).get("metadata", {}).get("rowCount") or len(all_rows))

        for skip in range(500, row_count, 500):
            page = self._request_json("get", f"{self.base_url}/{task_id}?size=500&skip={skip}")
            all_rows.extend(page.get("actuals", {}).get("data", {}).get("rows", []))

        first_result["actuals"]["data"]["rows"] = all_rows
        return first_result


def parse_cost_rows(result: dict[str, Any], target_date: date) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in result.get("actuals", {}).get("data", {}).get("rows", []):
        group_bys = item.get("groupBys") or []
        values = item.get("values") or {}
        cost = float((values.get("cost_channel") or {}).get("value") or 0)
        installs = float((values.get("app_installs") or {}).get("value") or 0)
        if cost == 0 and installs == 0:
            continue
        rows.append(
            {
                "date": target_date.isoformat(),
                "channel": group_bys[0] if len(group_bys) > 0 and group_bys[0] else "",
                "campaign": group_bys[1] if len(group_bys) > 1 and group_bys[1] else "",
                "ad_group": group_bys[2] if len(group_bys) > 2 and group_bys[2] else "",
                "ad_creative": group_bys[3] if len(group_bys) > 3 and group_bys[3] else "",
                "impressions": float((values.get("impressions") or {}).get("value") or 0),
                "clicks": float((values.get("clicks") or {}).get("value") or 0),
                "app_installs": installs,
                "cost": cost,
                "cpi": float((values.get("cpi_channel") or {}).get("value") or 0),
                "roas": float((values.get("roas_channel") or {}).get("value") or 0),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
    return rows


def fetch_channel_rows(client: AirbridgeClient, target_date: date, channel: str | None) -> list[dict[str, Any]]:
    if channel:
        result = client.fetch_actuals(
            target_date,
            ["channel", "campaign", "ad_group", "ad_creative"],
            [{"dimension": "channel", "filterType": "IN", "values": [channel]}],
        )
    else:
        result = client.fetch_actuals(target_date, ["channel", "campaign"], [])
    return parse_cost_rows(result, target_date)


def fetch_cost_rows_for_date(client: AirbridgeClient, target_date: date) -> tuple[list[dict[str, Any]], dict[str, int]]:
    all_rows: list[dict[str, Any]] = []
    channel_counts: dict[str, int] = {}
    paid_errors: list[str] = []

    for channel in PAID_CHANNELS:
        try:
            rows = fetch_channel_rows(client, target_date, channel)
            channel_counts[channel] = len(rows)
            all_rows.extend(rows)
            logger.info("%s %s rows=%s", target_date, channel, len(rows))
            time.sleep(1)
        except Exception as exc:
            paid_errors.append(f"{channel}: {exc}")
            logger.exception("%s %s fetch failed", target_date, channel)

    if paid_errors:
        raise AirbridgeError("Paid channel fetch failed; skipped overwrite: " + " | ".join(paid_errors))

    paid_keys = {f"{row['channel']}|{row['campaign']}" for row in all_rows}
    other_rows = fetch_channel_rows(client, target_date, None)
    deduped_other_rows = [row for row in other_rows if f"{row['channel']}|{row['campaign']}" not in paid_keys]
    channel_counts["other_before_dedup"] = len(other_rows)
    channel_counts["other_after_dedup"] = len(deduped_other_rows)
    all_rows.extend(deduped_other_rows)
    return all_rows, channel_counts


def bq_client() -> bigquery.Client:
    return bigquery.Client(project=PROJECT_ID)


def full_table(table: str) -> str:
    return f"`{PROJECT_ID}.{DATASET}.{table}`"


def replace_cost_rows(
    client: bigquery.Client,
    target_date: date,
    rows: list[dict[str, Any]],
    approve_bq_write: bool,
) -> None:
    if not approve_bq_write:
        raise ValueError("BigQuery write requires --approve-bq-write")
    if not rows:
        raise ValueError(f"No rows for {target_date}; skipped overwrite")

    query = f"""
BEGIN TRANSACTION;
DELETE FROM {full_table(COST_TABLE)}
WHERE date = @sync_date;

INSERT INTO {full_table(COST_TABLE)}
  (date, channel, campaign, ad_group, ad_creative, impressions, clicks, app_installs, cost, cpi, roas, created_at)
SELECT
  DATE(JSON_EXTRACT_SCALAR(row, "$.date")),
  JSON_EXTRACT_SCALAR(row, "$.channel"),
  JSON_EXTRACT_SCALAR(row, "$.campaign"),
  JSON_EXTRACT_SCALAR(row, "$.ad_group"),
  JSON_EXTRACT_SCALAR(row, "$.ad_creative"),
  SAFE_CAST(JSON_EXTRACT_SCALAR(row, "$.impressions") AS FLOAT64),
  SAFE_CAST(JSON_EXTRACT_SCALAR(row, "$.clicks") AS FLOAT64),
  SAFE_CAST(JSON_EXTRACT_SCALAR(row, "$.app_installs") AS FLOAT64),
  SAFE_CAST(JSON_EXTRACT_SCALAR(row, "$.cost") AS FLOAT64),
  SAFE_CAST(JSON_EXTRACT_SCALAR(row, "$.cpi") AS FLOAT64),
  SAFE_CAST(JSON_EXTRACT_SCALAR(row, "$.roas") AS FLOAT64),
  TIMESTAMP(JSON_EXTRACT_SCALAR(row, "$.created_at"))
FROM UNNEST(JSON_EXTRACT_ARRAY(@rows_json)) AS row;
COMMIT TRANSACTION;
"""
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("sync_date", "DATE", target_date.isoformat()),
            bigquery.ScalarQueryParameter("rows_json", "STRING", json.dumps(rows, ensure_ascii=False)),
        ]
    )
    for attempt in range(BQ_STREAMING_BUFFER_RETRIES + 1):
        try:
            client.query(query, job_config=job_config, location=LOCATION).result()
            return
        except BadRequest as exc:
            message = str(exc)
            if "streaming buffer" not in message or attempt >= BQ_STREAMING_BUFFER_RETRIES:
                raise
            logger.warning(
                "BigQuery streaming buffer blocks %s replace. retry %s/%s after %ss",
                target_date,
                attempt + 1,
                BQ_STREAMING_BUFFER_RETRIES,
                BQ_STREAMING_BUFFER_SLEEP_SECONDS,
            )
            time.sleep(BQ_STREAMING_BUFFER_SLEEP_SECONDS)


def sync_date(target_date: date, dry_run: bool = False, approve_bq_write: bool = False) -> SyncResult:
    airbridge = AirbridgeClient(required_airbridge_token())
    rows, channel_counts = fetch_cost_rows_for_date(airbridge, target_date)
    paid_count = sum(channel_counts.get(channel, 0) for channel in PAID_CHANNELS)
    other_count = channel_counts.get("other_after_dedup", 0)

    if dry_run:
        logger.info("dry-run: %s rows fetched for %s", len(rows), target_date)
    else:
        replace_cost_rows(bq_client(), target_date, rows, approve_bq_write=approve_bq_write)
        logger.info("BigQuery replaced: %s rows for %s", len(rows), target_date)

    return SyncResult(target_date, len(rows), paid_count, other_count, channel_counts)


def ensure_mapping_schema(client: bigquery.Client) -> None:
    query = f"""
ALTER TABLE {full_table(MAPPING_TABLE)}
ADD COLUMN IF NOT EXISTS ad_group STRING;
ALTER TABLE {full_table(MAPPING_TABLE)}
ADD COLUMN IF NOT EXISTS ad_creative STRING;
"""
    client.query(query, location=LOCATION).result()


def refresh_mapping() -> None:
    client = bq_client()
    ensure_mapping_schema(client)
    min_signup_date = parse_iso_date(MIN_SIGNUP_DATE, "MIN_SIGNUP_DATE")
    query = f"""
WITH ab AS (
  SELECT
    CASE WHEN Channel = 'instagram' THEN 'facebook.business' ELSE Channel END AS ad_channel,
    TRIM(COALESCE(Campaign, '')) AS ad_campaign,
    TRIM(COALESCE(Ad_Group, '')) AS ad_group,
    TRIM(COALESCE(Ad_Creative, '')) AS ad_creative,
    SAFE.PARSE_TIMESTAMP("%Y-%m-%dT%H:%M:%S+09:00", Event_Datetime) AS ab_ts,
    ROW_NUMBER() OVER (ORDER BY Event_Datetime, Event_ID) AS ab_rid
  FROM `{PROJECT_ID}.{AIRBRIDGE_DATASET}.app_events`
  WHERE Event_Category = "Sign-up (App)"
),
usr AS (
  SELECT
    id AS user_id,
    created_date AS user_ts,
    signup_referral_channel
  FROM `{PROJECT_ID}.{SECURE_DATASET}.user`
  WHERE withdrawal_date IS NULL
    AND DATE(created_date, "Asia/Seoul") >= @min_signup_date
),
matched AS (
  SELECT
    ab.ab_rid,
    ab.ad_channel,
    ab.ad_campaign,
    ab.ad_group,
    ab.ad_creative,
    ab.ab_ts,
    usr.user_id,
    usr.user_ts,
    usr.signup_referral_channel,
    ABS(TIMESTAMP_DIFF(ab.ab_ts, usr.user_ts, SECOND)) AS diff_sec,
    ROW_NUMBER() OVER (PARTITION BY ab.ab_rid ORDER BY ABS(TIMESTAMP_DIFF(ab.ab_ts, usr.user_ts, SECOND))) AS rn_ab,
    ROW_NUMBER() OVER (PARTITION BY usr.user_id ORDER BY ABS(TIMESTAMP_DIFF(ab.ab_ts, usr.user_ts, SECOND))) AS rn_user
  FROM ab
  JOIN usr
    ON DATE(ab.ab_ts, "Asia/Seoul") = DATE(usr.user_ts, "Asia/Seoul")
  WHERE ab.ab_ts IS NOT NULL
    AND ABS(TIMESTAMP_DIFF(ab.ab_ts, usr.user_ts, SECOND)) <= 60
)
SELECT
  user_id,
  ad_channel,
  ad_campaign,
  ad_group,
  ad_creative,
  ab_ts AS airbridge_signup_time,
  user_ts AS user_created_date,
  diff_sec AS match_diff_seconds,
  signup_referral_channel,
  DATE(ab_ts, "Asia/Seoul") AS signup_date
FROM matched
WHERE rn_ab = 1 AND rn_user = 1;
"""
    job_config = bigquery.QueryJobConfig(
        destination=f"{PROJECT_ID}.{DATASET}.{MAPPING_TABLE}",
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        query_parameters=[
            bigquery.ScalarQueryParameter("min_signup_date", "DATE", min_signup_date),
        ],
    )
    client.query(query, job_config=job_config, location=LOCATION).result()
    logger.info("Mapping refreshed")


def run_coverage(start: date, end: date) -> list[dict[str, Any]]:
    query = f"""
SELECT
  date,
  COUNT(*) AS row_count,
  COUNTIF(NULLIF(ad_group, "") IS NOT NULL) AS ad_group_rows,
  COUNTIF(NULLIF(ad_creative, "") IS NOT NULL) AS creative_rows,
  COUNTIF(channel IN UNNEST(@paid_channels)) AS paid_rows,
  ROUND(SUM(cost), 0) AS cost
FROM {full_table(COST_TABLE)}
WHERE date BETWEEN @start_date AND @end_date
GROUP BY 1
ORDER BY 1
"""
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("start_date", "DATE", start.isoformat()),
            bigquery.ScalarQueryParameter("end_date", "DATE", end.isoformat()),
            bigquery.ArrayQueryParameter("paid_channels", "STRING", PAID_CHANNELS),
        ]
    )
    rows = [dict(row) for row in bq_client().query(query, job_config=job_config, location=LOCATION).result()]
    for row in rows:
        logger.info(
            "coverage %s rows=%s creative=%s ad_group=%s cost=%s",
            row["date"],
            row["row_count"],
            row["creative_rows"],
            row["ad_group_rows"],
            row["cost"],
        )
    return rows


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Airbridge ads cost sync")
    sub = parser.add_subparsers(dest="command", required=True)

    sync = sub.add_parser("sync")
    sync.add_argument("--date", default="yesterday")
    sync.add_argument("--dry-run", action="store_true")
    sync.add_argument("--approve-bq-write", action="store_true")

    backfill = sub.add_parser("backfill")
    backfill.add_argument("--start", required=True)
    backfill.add_argument("--end", required=True)
    backfill.add_argument("--sleep-seconds", type=float, default=5.0)
    backfill.add_argument("--dry-run", action="store_true")
    backfill.add_argument("--approve-bq-write", action="store_true")

    mapping = sub.add_parser("refresh-mapping")
    mapping.set_defaults(refresh_mapping=True)

    coverage = sub.add_parser("coverage")
    coverage.add_argument("--start", required=True)
    coverage.add_argument("--end", required=True)

    debug = sub.add_parser("debug-api")
    debug.add_argument("--date", required=True)
    debug.add_argument("--channel", default="facebook.business")

    return parser


def required_airbridge_token() -> str:
    token = os.getenv("AIRBRIDGE_TOKEN", "")
    if not token:
        raise ValueError("AIRBRIDGE_TOKEN is required")
    return token


def main(argv: list[str] | None = None) -> int:
    started_at = time.time()
    parser = build_parser()
    args = parser.parse_args(argv)
    logger.info("시작: %s", args.command)

    try:
        if args.command in {"sync", "backfill", "debug-api"}:
            required_airbridge_token()
        if args.command == "sync":
            result = sync_date(parse_date(args.date), dry_run=args.dry_run, approve_bq_write=args.approve_bq_write)
            logger.info(
                "처리 완료: date=%s rows=%s paid=%s other=%s error_count=%s channels=%s",
                result.target_date,
                result.row_count,
                result.paid_row_count,
                result.other_row_count,
                result.error_count,
                result.channel_counts,
            )
        elif args.command == "backfill":
            for target in iter_dates(parse_date(args.start), parse_date(args.end)):
                result = sync_date(target, dry_run=args.dry_run, approve_bq_write=args.approve_bq_write)
                logger.info("backfill done: %s rows=%s error_count=%s", result.target_date, result.row_count, result.error_count)
                time.sleep(args.sleep_seconds)
        elif args.command == "refresh-mapping":
            refresh_mapping()
        elif args.command == "coverage":
            rows = run_coverage(parse_date(args.start), parse_date(args.end))
            print(json.dumps(rows, ensure_ascii=False, default=str, indent=2))
        elif args.command == "debug-api":
            client = AirbridgeClient(required_airbridge_token())
            rows = fetch_channel_rows(client, parse_date(args.date), args.channel)
            print(json.dumps(rows[:10], ensure_ascii=False, indent=2))
            logger.info("debug rows=%s channel=%s date=%s", len(rows), args.channel, args.date)
        elapsed = time.time() - started_at
        logger.info("完了 : %.1f초", elapsed)
        return 0
    except Exception:
        logger.exception("실패")
        return 1


if __name__ == "__main__":
    sys.exit(main())
