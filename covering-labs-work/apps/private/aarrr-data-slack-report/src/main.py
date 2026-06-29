#!/usr/bin/env python3
"""AARRR Slack report for PO-level product monitoring."""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import tempfile
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests
from google.cloud import bigquery

from config import _load_env_file


PROJECT = "covering-app-ccd23"
KST = timezone(timedelta(hours=9))
DEFAULT_SLACK_CHANNEL = "C0A198Z0P2N"  # 제품팀_data
DEFAULT_STATE_FILE = Path(__file__).resolve().parents[1] / "logs" / "aarrr_data_slack_state.json"
AARRR_DASHBOARD_URL = "https://grafana.covering.app/d/b12e4598-b833-4561-a223-8adc8ae94252"
GROWTH_ROI_DASHBOARD_URL = (
    "https://grafana.covering.app/d/d7b013bb-d5dd-4b1d-aa68-0ff35b11e7b7"
)
LOG_DIR = Path(__file__).resolve().parents[1] / "logs"
LOG_PATH = LOG_DIR / "batch.log"


def setup_logging() -> logging.Logger:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(LOG_PATH, encoding="utf-8"),
        ],
    )
    return logging.getLogger("aarrr-data-slack-report")


_load_env_file()
logger = setup_logging()


AARRR_SQL = """
WITH params AS (
  SELECT
    @report_date AS report_date,
    @lookback_days AS lookback_days,
    DATE_SUB(@report_date, INTERVAL (@lookback_days - 1) DAY) AS curr_start,
    @report_date AS curr_end,
    DATE_SUB(@report_date, INTERVAL (@lookback_days * 2 - 1) DAY) AS prev_start,
    DATE_SUB(@report_date, INTERVAL @lookback_days DAY) AS prev_end,
    DATE_SUB(@report_date, INTERVAL (@lookback_days + 6) DAY) AS week_start,
    DATE_SUB(@report_date, INTERVAL 7 DAY) AS week_end,
    DATE_SUB(@report_date, INTERVAL (@lookback_days + 6) DAY) AS d7_curr_start,
    DATE_SUB(@report_date, INTERVAL 7 DAY) AS d7_curr_end,
    DATE_SUB(@report_date, INTERVAL (@lookback_days * 2 + 6) DAY) AS d7_prev_start,
    DATE_SUB(@report_date, INTERVAL (@lookback_days + 7) DAY) AS d7_prev_end,
    DATE_SUB(@report_date, INTERVAL (@lookback_days + 13) DAY) AS d7_week_start,
    DATE_SUB(@report_date, INTERVAL 14 DAY) AS d7_week_end,
    DATE_SUB(DATE_SUB(@report_date, INTERVAL 60 DAY), INTERVAL (@lookback_days - 1) DAY) AS ret_curr_start,
    DATE_SUB(@report_date, INTERVAL 60 DAY) AS ret_curr_end,
    DATE_SUB(DATE_SUB(@report_date, INTERVAL 90 DAY), INTERVAL (@lookback_days - 1) DAY) AS ret_prev_start,
    DATE_SUB(@report_date, INTERVAL 90 DAY) AS ret_prev_end,
    DATE_SUB(DATE_SUB(@report_date, INTERVAL 67 DAY), INTERVAL (@lookback_days - 1) DAY) AS ret_week_start,
    DATE_SUB(@report_date, INTERVAL 67 DAY) AS ret_week_end
),
order_categories AS (
  SELECT
    o.id AS order_id,
    o.user_id
  FROM `covering-app-ccd23.secure_dataset.order_v2` AS o
  JOIN `covering-app-ccd23.secure_dataset.order_line` AS ol
    ON ol.order_id = o.id
   AND ol.deleted_at IS NULL
  JOIN `covering-app-ccd23.secure_dataset.product` AS p
    ON p.id = ol.product_id
   AND p.product_type = 'SERVICE'
  WHERE o.user_id IS NOT NULL
    AND o.deleted_at IS NULL
  GROUP BY 1, 2
),
paid_receipts AS (
  SELECT DISTINCT
    r.id AS receipt_id,
    oc.order_id,
    oc.user_id,
    DATE(r.created_at, 'Asia/Seoul') AS paid_date,
    r.total_amount
  FROM order_categories AS oc
  JOIN `covering-app-ccd23.secure_dataset.order_invoice` AS oi
    ON oi.order_id = oc.order_id
  JOIN `covering-app-ccd23.secure_dataset.invoice` AS i
    ON i.id = oi.invoice_id
  JOIN `covering-app-ccd23.secure_dataset.receipt` AS r
    ON r.invoice_id = i.id
  CROSS JOIN params AS p
  WHERE r.status = 'PAID'
    AND r.deleted_at IS NULL
    AND DATE(r.created_at, 'Asia/Seoul') <= p.curr_end
),
first_paid AS (
  SELECT
    user_id,
    MIN(paid_date) AS first_paid_date
  FROM paid_receipts
  GROUP BY 1
),
signups AS (
  SELECT
    id AS user_id,
    DATE(created_date, 'Asia/Seoul') AS signup_date,
    COALESCE(signup_referral_channel, 'UNKNOWN') AS signup_channel
  FROM `covering-app-ccd23.secure_dataset.user`
  WHERE created_date IS NOT NULL
),
period_windows AS (
  SELECT 'current' AS period, curr_start AS start_date, curr_end AS end_date FROM params
  UNION ALL
  SELECT 'previous' AS period, prev_start AS start_date, prev_end AS end_date FROM params
  UNION ALL
  SELECT 'week' AS period, week_start AS start_date, week_end AS end_date FROM params
),
agg_period AS (
  SELECT
    w.period,
    COUNT(DISTINCT pr.user_id) AS mau,
    COUNT(DISTINCT pr.receipt_id) AS paid_receipts,
    SUM(pr.total_amount) AS revenue,
    SAFE_DIVIDE(SUM(pr.total_amount), COUNT(DISTINCT pr.user_id)) AS arpu
  FROM paid_receipts AS pr
  JOIN period_windows AS w
    ON pr.paid_date BETWEEN w.start_date AND w.end_date
  GROUP BY 1
),
first_paid_period AS (
  SELECT
    w.period,
    COUNT(DISTINCT fp.user_id) AS first_paid_users
  FROM first_paid AS fp
  JOIN period_windows AS w
    ON fp.first_paid_date BETWEEN w.start_date AND w.end_date
  GROUP BY 1
),
signup_period AS (
  SELECT
    w.period,
    COUNT(DISTINCT s.user_id) AS signups,
    COUNT(DISTINCT IF(s.signup_channel = 'ADS', s.user_id, NULL)) AS ads_signups,
    COUNT(DISTINCT IF(s.signup_channel = 'FRIEND_REFERRAL', s.user_id, NULL)) AS friend_referral_signups
  FROM signups AS s
  JOIN period_windows AS w
    ON s.signup_date BETWEEN w.start_date AND w.end_date
  GROUP BY 1
),
ad_period AS (
  SELECT
    w.period,
    SUM(c.cost) AS ad_cost,
    SUM(c.app_installs) AS app_installs
  FROM `covering-app-ccd23.ads_data.daily_cost_creative` AS c
  JOIN period_windows AS w
    ON c.date BETWEEN w.start_date AND w.end_date
  GROUP BY 1
),
d7_windows AS (
  SELECT 'current' AS period, d7_curr_start AS start_date, d7_curr_end AS end_date FROM params
  UNION ALL
  SELECT 'previous' AS period, d7_prev_start AS start_date, d7_prev_end AS end_date FROM params
  UNION ALL
  SELECT 'week' AS period, d7_week_start AS start_date, d7_week_end AS end_date FROM params
),
d7_conversion AS (
  SELECT
    w.period,
    COUNT(DISTINCT s.user_id) AS mature_signups,
    COUNT(DISTINCT IF(fp.first_paid_date BETWEEN s.signup_date AND DATE_ADD(s.signup_date, INTERVAL 7 DAY), s.user_id, NULL)) AS d7_first_paid_users,
    SAFE_DIVIDE(
      COUNT(DISTINCT IF(fp.first_paid_date BETWEEN s.signup_date AND DATE_ADD(s.signup_date, INTERVAL 7 DAY), s.user_id, NULL)),
      COUNT(DISTINCT s.user_id)
    ) AS d7_first_paid_rate
  FROM signups AS s
  LEFT JOIN first_paid AS fp
    ON fp.user_id = s.user_id
  JOIN d7_windows AS w
    ON s.signup_date BETWEEN w.start_date AND w.end_date
  GROUP BY 1
),
retention_windows AS (
  SELECT 'current' AS period, ret_curr_start AS start_date, ret_curr_end AS end_date FROM params
  UNION ALL
  SELECT 'previous' AS period, ret_prev_start AS start_date, ret_prev_end AS end_date FROM params
  UNION ALL
  SELECT 'week' AS period, ret_week_start AS start_date, ret_week_end AS end_date FROM params
),
m1_retention AS (
  SELECT
    w.period,
    COUNT(DISTINCT fp.user_id) AS first_paid_cohort,
    COUNT(DISTINCT IF(EXISTS (
      SELECT 1
      FROM paid_receipts AS pr2
      WHERE pr2.user_id = fp.user_id
        AND pr2.paid_date BETWEEN DATE_ADD(fp.first_paid_date, INTERVAL 31 DAY)
                              AND DATE_ADD(fp.first_paid_date, INTERVAL 60 DAY)
    ), fp.user_id, NULL)) AS retained_users,
    SAFE_DIVIDE(
      COUNT(DISTINCT IF(EXISTS (
        SELECT 1
        FROM paid_receipts AS pr2
        WHERE pr2.user_id = fp.user_id
          AND pr2.paid_date BETWEEN DATE_ADD(fp.first_paid_date, INTERVAL 31 DAY)
                                AND DATE_ADD(fp.first_paid_date, INTERVAL 60 DAY)
      ), fp.user_id, NULL)),
      COUNT(DISTINCT fp.user_id)
    ) AS m1_retention_rate
  FROM first_paid AS fp
  JOIN retention_windows AS w
    ON fp.first_paid_date BETWEEN w.start_date AND w.end_date
  GROUP BY 1
),
subscription_period AS (
  SELECT COUNT(DISTINCT s.user_id) AS active_subscribers
  FROM `covering-app-ccd23.secure_dataset.subscription` AS s
  CROSS JOIN params AS p
  WHERE s.status = 'ACTIVE'
    AND s.current_period_start_date <= p.curr_end
    AND s.current_period_end_date >= p.curr_end
),
refunds AS (
  SELECT
    w.period,
    COUNTIF(r.status IN ('REFUNDED', 'PARTIALLY_REFUNDED')) AS refund_receipts,
    COUNT(*) AS total_receipts,
    SAFE_DIVIDE(COUNTIF(r.status IN ('REFUNDED', 'PARTIALLY_REFUNDED')), COUNT(*)) AS refund_rate
  FROM `covering-app-ccd23.secure_dataset.receipt` AS r
  JOIN period_windows AS w
    ON DATE(r.created_at, 'Asia/Seoul') BETWEEN w.start_date AND w.end_date
  WHERE r.status IN ('PAID', 'REFUNDED', 'PARTIALLY_REFUNDED')
    AND r.deleted_at IS NULL
  GROUP BY 1
)
SELECT
  p.report_date,
  p.curr_start,
  p.curr_end,
  p.prev_start,
  p.prev_end,
  p.week_start,
  p.week_end,
  p.d7_curr_start,
  p.d7_curr_end,
  p.ret_curr_start,
  p.ret_curr_end,
  curr.mau,
  prev.mau AS prev_mau,
  SAFE_DIVIDE(curr.mau - prev.mau, prev.mau) AS mau_change,
  week.mau AS week_mau,
  SAFE_DIVIDE(curr.mau - week.mau, week.mau) AS mau_week_change,
  sp.signups,
  spp.signups AS prev_signups,
  SAFE_DIVIDE(sp.signups - spp.signups, spp.signups) AS signup_change,
  spw.signups AS week_signups,
  SAFE_DIVIDE(sp.signups - spw.signups, spw.signups) AS signup_week_change,
  fp.first_paid_users,
  fpp.first_paid_users AS prev_first_paid_users,
  SAFE_DIVIDE(fp.first_paid_users - fpp.first_paid_users, fpp.first_paid_users) AS first_paid_change,
  fpw.first_paid_users AS week_first_paid_users,
  SAFE_DIVIDE(fp.first_paid_users - fpw.first_paid_users, fpw.first_paid_users) AS first_paid_week_change,
  curr.paid_receipts,
  prev.paid_receipts AS prev_paid_receipts,
  SAFE_DIVIDE(curr.paid_receipts - prev.paid_receipts, prev.paid_receipts) AS paid_receipts_change,
  week.paid_receipts AS week_paid_receipts,
  SAFE_DIVIDE(curr.paid_receipts - week.paid_receipts, week.paid_receipts) AS paid_receipts_week_change,
  curr.revenue,
  prev.revenue AS prev_revenue,
  SAFE_DIVIDE(curr.revenue - prev.revenue, prev.revenue) AS revenue_change,
  week.revenue AS week_revenue,
  SAFE_DIVIDE(curr.revenue - week.revenue, week.revenue) AS revenue_week_change,
  curr.arpu,
  prev.arpu AS prev_arpu,
  SAFE_DIVIDE(curr.arpu - prev.arpu, prev.arpu) AS arpu_change,
  week.arpu AS week_arpu,
  SAFE_DIVIDE(curr.arpu - week.arpu, week.arpu) AS arpu_week_change,
  sp.ads_signups,
  ad.ad_cost,
  SAFE_DIVIDE(ad.ad_cost, sp.ads_signups) AS ads_signup_cac,
  sp.friend_referral_signups,
  SAFE_DIVIDE(sp.friend_referral_signups, curr.mau) AS friend_referral_to_mau_rate,
  d7.mature_signups,
  d7.d7_first_paid_users,
  d7.d7_first_paid_rate,
  d7p.d7_first_paid_rate AS prev_d7_first_paid_rate,
  d7.d7_first_paid_rate - d7p.d7_first_paid_rate AS d7_first_paid_rate_p_diff,
  d7w.d7_first_paid_rate AS week_d7_first_paid_rate,
  d7.d7_first_paid_rate - d7w.d7_first_paid_rate AS d7_first_paid_rate_week_p_diff,
  m1.first_paid_cohort,
  m1.retained_users,
  m1.m1_retention_rate,
  m1p.m1_retention_rate AS prev_m1_retention_rate,
  m1.m1_retention_rate - m1p.m1_retention_rate AS m1_retention_rate_p_diff,
  m1w.m1_retention_rate AS week_m1_retention_rate,
  m1.m1_retention_rate - m1w.m1_retention_rate AS m1_retention_rate_week_p_diff,
  sub.active_subscribers,
  SAFE_DIVIDE(sub.active_subscribers, curr.mau) AS subscription_penetration,
  rf.refund_rate,
  rfp.refund_rate AS prev_refund_rate,
  rf.refund_rate - rfp.refund_rate AS refund_rate_p_diff,
  rfw.refund_rate AS week_refund_rate,
  rf.refund_rate - rfw.refund_rate AS refund_rate_week_p_diff
FROM params AS p
LEFT JOIN agg_period AS curr ON curr.period = 'current'
LEFT JOIN agg_period AS prev ON prev.period = 'previous'
LEFT JOIN agg_period AS week ON week.period = 'week'
LEFT JOIN first_paid_period AS fp ON fp.period = 'current'
LEFT JOIN first_paid_period AS fpp ON fpp.period = 'previous'
LEFT JOIN first_paid_period AS fpw ON fpw.period = 'week'
LEFT JOIN signup_period AS sp ON sp.period = 'current'
LEFT JOIN signup_period AS spp ON spp.period = 'previous'
LEFT JOIN signup_period AS spw ON spw.period = 'week'
LEFT JOIN ad_period AS ad ON ad.period = 'current'
LEFT JOIN d7_conversion AS d7 ON d7.period = 'current'
LEFT JOIN d7_conversion AS d7p ON d7p.period = 'previous'
LEFT JOIN d7_conversion AS d7w ON d7w.period = 'week'
LEFT JOIN m1_retention AS m1 ON m1.period = 'current'
LEFT JOIN m1_retention AS m1p ON m1p.period = 'previous'
LEFT JOIN m1_retention AS m1w ON m1w.period = 'week'
CROSS JOIN subscription_period AS sub
LEFT JOIN refunds AS rf ON rf.period = 'current'
LEFT JOIN refunds AS rfp ON rfp.period = 'previous'
LEFT JOIN refunds AS rfw ON rfw.period = 'week'
"""


SEGMENT_SQL = """
WITH params AS (
  SELECT
    @report_date AS report_date,
    @lookback_days AS lookback_days,
    DATE_SUB(@report_date, INTERVAL (@lookback_days - 1) DAY) AS curr_start,
    @report_date AS curr_end,
    DATE_SUB(@report_date, INTERVAL (@lookback_days * 2 - 1) DAY) AS prev_start,
    DATE_SUB(@report_date, INTERVAL @lookback_days DAY) AS prev_end,
    DATE_SUB(@report_date, INTERVAL (@lookback_days + 6) DAY) AS week_start,
    DATE_SUB(@report_date, INTERVAL 7 DAY) AS week_end,
    DATE_SUB(@report_date, INTERVAL (@lookback_days + 6) DAY) AS d7_curr_start,
    DATE_SUB(@report_date, INTERVAL 7 DAY) AS d7_curr_end,
    DATE_SUB(@report_date, INTERVAL (@lookback_days * 2 + 6) DAY) AS d7_prev_start,
    DATE_SUB(@report_date, INTERVAL (@lookback_days + 7) DAY) AS d7_prev_end,
    DATE_SUB(@report_date, INTERVAL (@lookback_days + 13) DAY) AS d7_week_start,
    DATE_SUB(@report_date, INTERVAL 14 DAY) AS d7_week_end
),
order_categories AS (
  SELECT
    o.id AS order_id,
    o.user_id
  FROM `covering-app-ccd23.secure_dataset.order_v2` AS o
  JOIN `covering-app-ccd23.secure_dataset.order_line` AS ol
    ON ol.order_id = o.id
   AND ol.deleted_at IS NULL
  JOIN `covering-app-ccd23.secure_dataset.product` AS p
    ON p.id = ol.product_id
   AND p.product_type = 'SERVICE'
  WHERE o.user_id IS NOT NULL
    AND o.deleted_at IS NULL
  GROUP BY 1, 2
),
paid_receipts AS (
  SELECT DISTINCT
    r.id AS receipt_id,
    oc.order_id,
    oc.user_id,
    DATE(r.created_at, 'Asia/Seoul') AS paid_date,
    r.total_amount
  FROM order_categories AS oc
  JOIN `covering-app-ccd23.secure_dataset.order_invoice` AS oi
    ON oi.order_id = oc.order_id
  JOIN `covering-app-ccd23.secure_dataset.invoice` AS i
    ON i.id = oi.invoice_id
  JOIN `covering-app-ccd23.secure_dataset.receipt` AS r
    ON r.invoice_id = i.id
  CROSS JOIN params AS p
  WHERE r.status = 'PAID'
    AND r.deleted_at IS NULL
    AND DATE(r.created_at, 'Asia/Seoul') <= p.curr_end
),
first_paid AS (
  SELECT
    user_id,
    MIN(paid_date) AS first_paid_date
  FROM paid_receipts
  GROUP BY 1
),
signups AS (
  SELECT
    id AS user_id,
    DATE(created_date, 'Asia/Seoul') AS signup_date,
    COALESCE(signup_referral_channel, 'UNKNOWN') AS signup_channel
  FROM `covering-app-ccd23.secure_dataset.user`
  WHERE created_date IS NOT NULL
),
d7_windows AS (
  SELECT 'current' AS period, d7_curr_start AS start_date, d7_curr_end AS end_date FROM params
  UNION ALL
  SELECT 'previous' AS period, d7_prev_start AS start_date, d7_prev_end AS end_date FROM params
  UNION ALL
  SELECT 'week' AS period, d7_week_start AS start_date, d7_week_end AS end_date FROM params
),
channel_period AS (
  SELECT
    w.period,
    s.signup_channel,
    COUNT(DISTINCT s.user_id) AS signups,
    COUNT(DISTINCT IF(fp.first_paid_date BETWEEN s.signup_date AND DATE_ADD(s.signup_date, INTERVAL 7 DAY), s.user_id, NULL)) AS d7_first_paid_users,
    SAFE_DIVIDE(
      COUNT(DISTINCT IF(fp.first_paid_date BETWEEN s.signup_date AND DATE_ADD(s.signup_date, INTERVAL 7 DAY), s.user_id, NULL)),
      COUNT(DISTINCT s.user_id)
    ) AS d7_rate
  FROM signups AS s
  LEFT JOIN first_paid AS fp
    ON fp.user_id = s.user_id
  JOIN d7_windows AS w
    ON s.signup_date BETWEEN w.start_date AND w.end_date
  GROUP BY 1, 2
),
channel_compare AS (
  SELECT
    'channel' AS section,
    c.signup_channel AS name,
    c.signups AS users,
    p.signups AS prev_users,
    SAFE_DIVIDE(c.signups - p.signups, p.signups) AS users_change,
    w.signups AS week_users,
    SAFE_DIVIDE(c.signups - w.signups, w.signups) AS users_week_change,
    c.d7_rate,
    p.d7_rate AS prev_d7_rate,
    c.d7_rate - p.d7_rate AS d7_rate_p_diff,
    w.d7_rate AS week_d7_rate,
    c.d7_rate - w.d7_rate AS d7_rate_week_p_diff
  FROM channel_period AS c
  LEFT JOIN channel_period AS p
    ON p.period = 'previous'
   AND p.signup_channel = c.signup_channel
  LEFT JOIN channel_period AS w
    ON w.period = 'week'
   AND w.signup_channel = c.signup_channel
  WHERE c.period = 'current'
)
SELECT * FROM channel_compare
"""


@dataclass(frozen=True)
class ReportData:
    metrics: dict[str, Any]
    channels: list[dict[str, Any]]


def complete_report_date() -> date:
    return datetime.now(KST).date() - timedelta(days=1)


def query_report(client: bigquery.Client, report_date: date, lookback_days: int) -> ReportData:
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("report_date", "DATE", report_date),
            bigquery.ScalarQueryParameter("lookback_days", "INT64", lookback_days),
        ]
    )
    metrics_rows = list(client.query(AARRR_SQL, job_config=job_config).result())
    if len(metrics_rows) != 1:
        raise RuntimeError(f"AARRR metrics query returned {len(metrics_rows)} rows")
    segment_rows = [dict(row.items()) for row in client.query(SEGMENT_SQL, job_config=job_config).result()]
    return ReportData(
        metrics=normalize_row(dict(metrics_rows[0].items())),
        channels=[normalize_row(row) for row in segment_rows if row.get("section") == "channel"],
    )


def normalize_row(row: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for key, value in row.items():
        if isinstance(value, date):
            normalized[key] = value.isoformat()
        else:
            normalized[key] = value
    return normalized


def as_int(value: Any) -> int:
    if value in (None, ""):
        return 0
    return int(float(value))


def as_float(value: Any) -> float:
    if value in (None, ""):
        return 0.0
    return float(value)


def count_text(value: Any) -> str:
    return f"{as_int(value):,}명"


def count_plain(value: Any) -> str:
    return f"{as_int(value):,}"


def receipt_text(value: Any) -> str:
    return f"{as_int(value):,}건"


def won(value: Any) -> str:
    if value in (None, ""):
        return "n/a"
    return f"{as_int(value):,}원"


def money_text(value: Any) -> str:
    amount = as_float(value)
    if abs(amount) >= 100_000_000:
        return f"{amount / 100_000_000:.1f}억"
    if abs(amount) >= 10_000:
        return f"{amount / 10_000:,.0f}만원"
    return won(amount)


def rate_text(value: Any) -> str:
    if value in (None, ""):
        return "n/a"
    return f"{as_float(value) * 100:.1f}%"


def delta_pct(value: Any) -> str:
    if value in (None, ""):
        return "n/a"
    return f"{as_float(value) * 100:+.1f}%"


def delta_pp(value: Any) -> str:
    if value in (None, ""):
        return "n/a"
    return f"{as_float(value) * 100:+.1f}%p"


def flow_line(label: str, start_label: str, start_value: Any, end_label: str, end_value: Any) -> str:
    return (
        f"{label:<12} {start_label} {count_plain(start_value)}"
        f" -> {end_label} {count_plain(end_value)}"
    )


def find_by_name(rows: list[dict[str, Any]], name: str) -> dict[str, Any] | None:
    for row in rows:
        if row.get("name") == name:
            return row
    return None


def selected_channels(channels: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    preferred = ["ADS", "FRIEND_REFERRAL", "NEIGHBOR_USE"]
    selected: list[dict[str, Any]] = []
    for name in preferred:
        row = find_by_name(channels, name)
        if row:
            selected.append(row)
    if len(selected) < limit:
        rest = [row for row in channels if row not in selected]
        selected.extend(sorted(rest, key=lambda row: as_float(row.get("d7_rate")), reverse=True)[: limit - len(selected)])
    return selected[:limit]


def delta_pair_pct(row: dict[str, Any], thirty_key: str, week_key: str) -> str:
    return f"30일전 {delta_pct(row.get(thirty_key))} / 1주전 {delta_pct(row.get(week_key))}"


def delta_pair_pp(row: dict[str, Any], thirty_key: str, week_key: str) -> str:
    return f"30일전 {delta_pp(row.get(thirty_key))} / 1주전 {delta_pp(row.get(week_key))}"


def channel_line(row: dict[str, Any]) -> str:
    return (
        f"{row['name']:<15} 가입 {count_text(row.get('users')):<10} {delta_pair_pct(row, 'users_change', 'users_week_change')}\n"
        f"{'':<15} D7전환 {rate_text(row.get('d7_rate')):<8} {delta_pair_pp(row, 'd7_rate_p_diff', 'd7_rate_week_p_diff')}"
    )


def retention_mix_read(m: dict[str, Any]) -> str:
    return f"M1 후속 결제는 {rate_text(m.get('m1_retention_rate'))}({delta_pair_pp(m, 'm1_retention_rate_p_diff', 'm1_retention_rate_week_p_diff')})입니다."


def build_message(report: ReportData, max_segments: int) -> str:
    m = report.metrics
    channels = selected_channels(report.channels, max_segments)
    friend = find_by_name(report.channels, "FRIEND_REFERRAL")

    title_date = str(m["report_date"])
    conclusion = (
        f"최근 30일 결제 유저 {count_text(m.get('mau'))}, 매출 {money_text(m.get('revenue'))}, "
        f"가입 {count_text(m.get('signups'))}입니다. "
        f"증감은 30일전과 1주전 기준을 함께 봅니다."
    )
    referral_read = (
        f"친구추천 가입 {count_text(m.get('friend_referral_signups'))}"
        f" / 결제 유저 대비 {rate_text(m.get('friend_referral_to_mau_rate'))}"
    )

    lines = [
        f"*AARRR 리포트 | {title_date}*",
        f"기준: {m['curr_start']}~{m['curr_end']}",
        f"비교: 30일전 {m['prev_start']}~{m['prev_end']} / 1주전 {m['week_start']}~{m['week_end']}",
        "",
        "*결론*",
        conclusion,
        "",
        "*Acquisition*",
        f"가입           {count_text(m.get('signups')):<10} {delta_pair_pct(m, 'signup_change', 'signup_week_change')}",
        f"ADS 가입 CAC   {won(m.get('ads_signup_cac'))}",
        "",
        "*Activation*",
        f"D7 첫 결제     {rate_text(m.get('d7_first_paid_rate')):<10} {delta_pair_pp(m, 'd7_first_paid_rate_p_diff', 'd7_first_paid_rate_week_p_diff')}",
        flow_line("D7 전환", "가입", m.get("mature_signups"), "첫결제", m.get("d7_first_paid_users")),
        "",
        "*Retention*",
        f"M1 후속 결제   {rate_text(m.get('m1_retention_rate')):<10} {delta_pair_pp(m, 'm1_retention_rate_p_diff', 'm1_retention_rate_week_p_diff')}",
        flow_line("M1 후속", "첫결제", m.get("first_paid_cohort"), "후속결제", m.get("retained_users")),
        "",
        "*Revenue*",
        f"최근 30일 결제 유저 {count_text(m.get('mau')):<10} {delta_pair_pct(m, 'mau_change', 'mau_week_change')}",
        f"첫 유료 이용자 {count_text(m.get('first_paid_users')):<10} {delta_pair_pct(m, 'first_paid_change', 'first_paid_week_change')}",
        f"매출           {money_text(m.get('revenue')):<10} {delta_pair_pct(m, 'revenue_change', 'revenue_week_change')}",
        f"결제 건수       {receipt_text(m.get('paid_receipts')):<10} {delta_pair_pct(m, 'paid_receipts_change', 'paid_receipts_week_change')}",
        f"ARPU           {won(m.get('arpu')):<10} {delta_pair_pct(m, 'arpu_change', 'arpu_week_change')}",
        "",
        "*Referral*",
        referral_read,
    ]

    lines += ["", "*유입 품질*"]
    for row in channels:
        lines.append(channel_line(row))

    lines += ["", "*판단*"]
    lines.append(
        f"- Revenue는 매출 {delta_pair_pct(m, 'revenue_change', 'revenue_week_change')}, 결제 건수 {delta_pair_pct(m, 'paid_receipts_change', 'paid_receipts_week_change')}입니다."
    )
    lines.append(
        f"- Retention은 M1 후속 결제 {rate_text(m.get('m1_retention_rate'))}({delta_pair_pp(m, 'm1_retention_rate_p_diff', 'm1_retention_rate_week_p_diff')})입니다."
    )
    if friend:
        lines.append(
            f"- 친구추천은 볼륨은 작지만 D7 첫 결제 전환 {rate_text(friend.get('d7_rate'))}라 품질은 좋습니다."
        )

    lines += [
        "",
        "*상세*",
        f"AARRR: {AARRR_DASHBOARD_URL}",
        f"Growth ROI: {GROWTH_ROI_DASHBOARD_URL}",
    ]
    return "\n".join(lines)


def build_root_message(report: ReportData) -> str:
    m = report.metrics
    return (
        f"*AARRR 리포트 | {m['report_date']}* "
        f"최근 30일 결제 유저 {count_text(m.get('mau'))}({delta_pair_pct(m, 'mau_change', 'mau_week_change')}), "
        f"매출 {money_text(m.get('revenue'))}({delta_pair_pct(m, 'revenue_change', 'revenue_week_change')}), "
        f"가입 {delta_pair_pct(m, 'signup_change', 'signup_week_change')}, "
        f"M1 {delta_pair_pp(m, 'm1_retention_rate_p_diff', 'm1_retention_rate_week_p_diff')}"
    )


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("상태 파일 로드 실패, 새 상태로 진행: %s", exc)
        return {}
    return state if isinstance(state, dict) else {}


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = -1
    temp_path = ""
    try:
        fd, temp_path = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
        with os.fdopen(fd, "w", encoding="utf-8") as temp_file:
            fd = -1
            temp_file.write(json.dumps(state, ensure_ascii=False, indent=2) + "\n")
            temp_file.flush()
            os.fsync(temp_file.fileno())
        os.replace(temp_path, path)
    finally:
        if fd >= 0:
            os.close(fd)
        if temp_path:
            try:
                Path(temp_path).unlink(missing_ok=True)
            except OSError:
                pass


def update_state_with_send(
    state: dict[str, Any],
    report_date: date,
    channel: str,
    root_ts: str,
    detail_ts: str | None,
) -> dict[str, Any]:
    last_send = {
        "channel": channel,
        "root_ts": root_ts,
        "detail_ts": detail_ts,
        "sent_at": datetime.now(KST).isoformat(),
        "report_date": report_date.isoformat(),
    }
    recent_sends = state.get("recent_sends")
    if not isinstance(recent_sends, list):
        recent_sends = []
    updated_existing = False
    for index, recent_send in enumerate(recent_sends):
        if isinstance(recent_send, dict) and recent_send.get("root_ts") == root_ts:
            recent_sends[index] = last_send
            updated_existing = True
            break
    if not updated_existing:
        recent_sends.append(last_send)
    return {"last_send": last_send, "recent_sends": recent_sends[-30:]}


def post_to_slack(token: str, channel: str, text: str, thread_ts: str | None) -> str:
    payload: dict[str, Any] = {
        "channel": channel,
        "text": text,
        "unfurl_links": False,
        "unfurl_media": False,
    }
    if thread_ts:
        payload["thread_ts"] = thread_ts
    response = requests.post(
        "https://slack.com/api/chat.postMessage",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=utf-8"},
        json=payload,
        timeout=20,
    )
    body = response.json()
    if not body.get("ok"):
        raise RuntimeError(f"Slack 발송 실패: {body.get('error', body)}")
    return str(body["ts"])


def parse_report_date(value: str | None) -> date:
    if not value:
        return complete_report_date()
    return date.fromisoformat(value)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-slack", "--dry-run", action="store_true", help="Slack 발송 없이 메시지만 출력")
    parser.add_argument("--report-date", help="KST 기준 닫힌 보고일 YYYY-MM-DD")
    parser.add_argument("--lookback-days", type=int, default=30)
    parser.add_argument("--max-segments", type=int, default=3)
    parser.add_argument("--state-file", default=os.environ.get("AARRR_REPORT_STATE_FILE", str(DEFAULT_STATE_FILE)))
    return parser.parse_args()


def main() -> int:
    started_at = time.time()
    logger.info("시작")
    args = parse_args()
    report_date = parse_report_date(args.report_date)
    state_path = Path(args.state_file)
    client = bigquery.Client(project=PROJECT)
    report = query_report(client, report_date=report_date, lookback_days=args.lookback_days)
    root_message = build_root_message(report)
    message = build_message(report, max_segments=args.max_segments)

    if args.no_slack:
        sys.stdout.write(root_message + "\n\n" + message + "\n")
        logger.info("완료 : %.1f초 (dry-run, report_date=%s)", time.time() - started_at, report_date.isoformat())
        return 0

    token = os.environ.get("SLACK_BOT_TOKEN", "").strip()
    channel = os.environ.get("AARRR_REPORT_SLACK_CHANNEL", DEFAULT_SLACK_CHANNEL).strip()
    if not token:
        raise RuntimeError("SLACK_BOT_TOKEN 환경변수가 필요합니다.")

    state = load_state(state_path)
    root_ts = post_to_slack(token, channel, root_message, thread_ts=None)
    state = update_state_with_send(state, report_date, channel, root_ts, None)
    save_state(state_path, state)
    detail_ts = post_to_slack(token, channel, message, thread_ts=root_ts)
    state = update_state_with_send(state, report_date, channel, root_ts, detail_ts)
    save_state(state_path, state)
    logger.info(
        (
            "완료 : %.1f초 "
            "(report_date=%s, channel=%s, root_ts=%s, detail_ts=%s, "
            "mau=%s, revenue=%s, signups=%s, m1_retention=%s)"
        ),
        time.time() - started_at,
        report_date.isoformat(),
        channel,
        root_ts,
        detail_ts,
        as_int(report.metrics.get("mau")),
        as_int(report.metrics.get("revenue")),
        as_int(report.metrics.get("signups")),
        rate_text(report.metrics.get("m1_retention_rate")),
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        logger.error("실패: %s", exc, exc_info=True)
        raise SystemExit(1)
