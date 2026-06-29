#!/usr/bin/env python3
"""Daily Slack report for regular covering bag monitoring."""

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
APP_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_STATE_FILE = APP_ROOT / "logs" / "regular_covering_bag_report_state.json"
DASHBOARD_URL = "https://grafana.covering.app/d/regular-covering-bag-monitoring/b176239"
LOG_DIR = APP_ROOT / "logs"
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
    return logging.getLogger("regular-covering-bag-monitoring-report")


_load_env_file()
logger = setup_logging()


REPORT_SQL = """
WITH params AS (
  SELECT
    @report_date AS report_date,
    DATE_SUB(@report_date, INTERVAL 1 DAY) AS previous_date,
    DATE_SUB(@report_date, INTERVAL 7 DAY) AS week_date,
    DATE_SUB(@report_date, INTERVAL 30 DAY) AS month_date
),
anchor_periods AS (
  SELECT 'current' AS period, 0 AS day_offset
  UNION ALL SELECT 'day_1', 1
  UNION ALL SELECT 'day_2', 2
  UNION ALL SELECT 'day_3', 3
  UNION ALL SELECT 'day_4', 4
  UNION ALL SELECT 'day_5', 5
  UNION ALL SELECT 'day_6', 6
  UNION ALL SELECT 'week', 7
  UNION ALL SELECT 'month', 30
),
daily_anchors AS (
  SELECT
    ap.period,
    ap.day_offset,
    DATE_SUB(p.report_date, INTERVAL ap.day_offset DAY) AS day
  FROM params p
  CROSS JOIN anchor_periods ap
),
d30_anchors AS (
  SELECT
    ap.period,
    ap.day_offset,
    DATE_SUB(DATE_SUB(p.report_date, INTERVAL 30 DAY), INTERVAL ap.day_offset DAY) AS day
  FROM params p
  CROSS JOIN anchor_periods ap
),
m1_anchors AS (
  SELECT
    ap.period,
    ap.day_offset,
    DATE_SUB(DATE_SUB(p.report_date, INTERVAL 60 DAY), INTERVAL ap.day_offset DAY) AS day
  FROM params p
  CROSS JOIN anchor_periods ap
),
bag_orders AS (
  SELECT
    o.id AS order_id,
    o.user_id,
    o.created_at,
    DATE(o.created_at, 'Asia/Seoul') AS order_day
  FROM `covering-app-ccd23.secure_dataset.order_v2` o
  JOIN `covering-app-ccd23.secure_dataset.order_line` ol
    ON ol.order_id = o.id
   AND ol.deleted_at IS NULL
  JOIN `covering-app-ccd23.secure_dataset.product` p
    ON p.id = ol.product_id
  WHERE o.user_id IS NOT NULL
    AND o.deleted_at IS NULL
    AND o.status != 'CANCELED'
    AND p.product_code = 'COVERING_BAG'
),
pickup_orders AS (
  SELECT
    o.id AS order_id,
    o.user_id,
    o.created_at,
    DATE(o.created_at, 'Asia/Seoul') AS order_day
  FROM `covering-app-ccd23.secure_dataset.order_v2` o
  JOIN `covering-app-ccd23.secure_dataset.order_line` ol
    ON ol.order_id = o.id
   AND ol.deleted_at IS NULL
  JOIN `covering-app-ccd23.secure_dataset.product` p
    ON p.id = ol.product_id
  WHERE o.user_id IS NOT NULL
    AND o.deleted_at IS NULL
    AND o.status != 'CANCELED'
    AND o.payment_policy_id IS NOT NULL
    AND p.product_code = 'PICKUP_COVERING_BAG'
),
pickup_orders_all_status AS (
  SELECT
    o.id AS order_id,
    o.user_id,
    o.created_at,
    DATE(o.created_at, 'Asia/Seoul') AS order_day
  FROM `covering-app-ccd23.secure_dataset.order_v2` o
  JOIN `covering-app-ccd23.secure_dataset.order_line` ol
    ON ol.order_id = o.id
   AND ol.deleted_at IS NULL
  JOIN `covering-app-ccd23.secure_dataset.product` p
    ON p.id = ol.product_id
  WHERE o.user_id IS NOT NULL
    AND o.deleted_at IS NULL
    AND o.payment_policy_id IS NOT NULL
    AND p.product_code = 'PICKUP_COVERING_BAG'
),
bag_daily AS (
  SELECT
    a.period,
    a.day_offset,
    a.day,
    COUNT(DISTINCT bo.order_id) AS bag_orders,
    COUNT(DISTINCT bo.user_id) AS bag_users
  FROM daily_anchors a
  LEFT JOIN bag_orders bo
    ON bo.order_day = a.day
  GROUP BY 1, 2, 3
),
pickup_daily AS (
  SELECT
    a.period,
    a.day_offset,
    a.day,
    COUNT(DISTINCT po.order_id) AS pickup_orders,
    COUNT(DISTINCT po.user_id) AS pickup_users
  FROM daily_anchors a
  LEFT JOIN pickup_orders po
    ON po.order_day = a.day
  GROUP BY 1, 2, 3
),
regular_pickup_order_ids AS (
  SELECT DISTINCT order_id FROM pickup_orders
),
completed_fulfillment AS (
  SELECT
    f.order_id,
    ARRAY_AGG(STRUCT(f.completed_at, f.scheduled_start_at, f.scheduled_end_at) ORDER BY f.completed_at LIMIT 1)[OFFSET(0)] AS completed
  FROM `covering-app-ccd23.secure_dataset.fulfillment` f
  JOIN regular_pickup_order_ids ro
    ON ro.order_id = f.order_id
  WHERE f.status = 'COMPLETED'
    AND f.completed_at IS NOT NULL
  GROUP BY 1
),
completion_daily AS (
  SELECT
    a.period,
    a.day_offset,
    a.day,
    COUNT(DISTINCT cf.order_id) AS completed_orders,
    COUNT(DISTINCT IF(
      DATETIME(cf.completed.completed_at, 'Asia/Seoul') >= DATETIME(a.day, TIME '07:00:00'),
      cf.order_id,
      NULL
    )) AS after_7_orders,
    APPROX_QUANTILES(
      GREATEST(
        DATETIME_DIFF(
          DATETIME(cf.completed.completed_at, 'Asia/Seoul'),
          DATETIME(a.day, TIME '00:00:00'),
          MINUTE
        ) / 60.0,
        0
      ),
      100
    )[OFFSET(90)] AS completed_hour_p90
  FROM daily_anchors a
  LEFT JOIN completed_fulfillment cf
    ON DATE(COALESCE(cf.completed.scheduled_end_at, cf.completed.scheduled_start_at, cf.completed.completed_at), 'Asia/Seoul') = a.day
  GROUP BY 1, 2, 3
),
fulfillment_ranked AS (
  SELECT
    f.order_id,
    f.status,
    f.failure_reason_code,
    COALESCE(f.completed_at, f.updated_at, f.created_at) AS event_at,
    ROW_NUMBER() OVER (PARTITION BY f.order_id ORDER BY COALESCE(f.completed_at, f.updated_at, f.created_at) DESC, f.id DESC) AS rn
  FROM `covering-app-ccd23.secure_dataset.fulfillment` f
  JOIN regular_pickup_order_ids ro
    ON ro.order_id = f.order_id
),
order_result AS (
  SELECT
    order_id,
    DATE(MAX(IF(status = 'COMPLETED', event_at, NULL)), 'Asia/Seoul') AS completed_day,
    LOGICAL_OR(status = 'COMPLETED') AS has_completed,
    MAX(IF(rn = 1, status, NULL)) AS latest_status,
    MAX(IF(rn = 1, failure_reason_code, NULL)) AS latest_failure_reason,
    MAX(IF(rn = 1, event_at, NULL)) AS latest_event_at
  FROM fulfillment_ranked
  GROUP BY 1
),
fail_daily AS (
  SELECT
    a.period,
    a.day_offset,
    a.day,
    COUNT(DISTINCT IF(r.has_completed, r.order_id, NULL)) AS completed_orders,
    COUNT(DISTINCT IF(NOT r.has_completed AND r.latest_status = 'FAILED', r.order_id, NULL)) AS final_failed_orders,
    COUNT(DISTINCT IF(NOT r.has_completed AND r.latest_status = 'FAILED' AND r.latest_failure_reason = 'POLICY_FAIL', r.order_id, NULL)) AS policy_fail_orders,
    COUNT(DISTINCT IF(NOT r.has_completed AND r.latest_status = 'FAILED' AND r.latest_failure_reason = 'ENTER_FAIL', r.order_id, NULL)) AS enter_fail_orders,
    COUNT(DISTINCT IF(NOT r.has_completed AND r.latest_status = 'FAILED' AND r.latest_failure_reason = 'NOTFOUND_FAIL', r.order_id, NULL)) AS notfound_fail_orders
  FROM daily_anchors a
  LEFT JOIN order_result r
    ON IF(r.has_completed, r.completed_day, DATE(r.latest_event_at, 'Asia/Seoul')) = a.day
  GROUP BY 1, 2, 3
),
cancel_events AS (
  SELECT
    order_id,
    LOGICAL_OR(actor_type = 'USER') AS has_user_cancel,
    LOGICAL_OR(actor_type = 'MANAGER') AS has_manager_cancel
  FROM `covering-app-ccd23.secure_dataset.order_status_event`
  WHERE to_status = 'CANCELED'
  GROUP BY 1
),
cancel_daily AS (
  SELECT
    a.period,
    a.day_offset,
    a.day,
    COUNT(DISTINCT poa.order_id) AS pickup_orders,
    COUNT(DISTINCT IF(ce.has_user_cancel, poa.order_id, NULL)) AS user_cancel_orders,
    COUNT(DISTINCT IF(ce.has_manager_cancel, poa.order_id, NULL)) AS manager_cancel_orders
  FROM daily_anchors a
  LEFT JOIN pickup_orders_all_status poa
    ON poa.order_day = a.day
  LEFT JOIN cancel_events ce
    ON ce.order_id = poa.order_id
  GROUP BY 1, 2, 3
),
first_bag AS (
  SELECT *
  FROM bag_orders
  QUALIFY ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at, order_id) = 1
),
d30_cohort AS (
  SELECT
    a.period,
    a.day_offset,
    a.day,
    fb.user_id,
    fb.order_id AS first_bag_order_id,
    fb.created_at AS first_bag_at,
    fb.order_day AS bag_day
  FROM d30_anchors a
  JOIN first_bag fb
    ON fb.order_day = a.day
),
other_orders AS (
  SELECT
    o.id AS order_id,
    o.user_id,
    o.created_at,
    LOGICAL_OR(p.product_code = 'PICKUP_BOX') AS has_large_waste,
    LOGICAL_OR(p.product_code IN ('LARGE_COVERING_BAG', 'PICKUP_LARGE_COVERING_BAG')) AS has_large_covering_bag
  FROM `covering-app-ccd23.secure_dataset.order_v2` o
  JOIN `covering-app-ccd23.secure_dataset.order_line` ol
    ON ol.order_id = o.id
   AND ol.deleted_at IS NULL
  JOIN `covering-app-ccd23.secure_dataset.product` p
    ON p.id = ol.product_id
  WHERE o.user_id IS NOT NULL
    AND o.deleted_at IS NULL
    AND o.status != 'CANCELED'
    AND p.product_code IN ('PICKUP_BOX', 'LARGE_COVERING_BAG', 'PICKUP_LARGE_COVERING_BAG')
  GROUP BY 1, 2, 3
),
d30_flags AS (
  SELECT
    c.period,
    c.day_offset,
    c.day,
    c.user_id,
    EXISTS (
      SELECT 1 FROM pickup_orders po
      WHERE po.user_id = c.user_id
        AND po.created_at > c.first_bag_at
        AND po.created_at <= TIMESTAMP_ADD(c.first_bag_at, INTERVAL 30 DAY)
    ) AS has_pickup_d30,
    EXISTS (
      SELECT 1 FROM bag_orders bo
      WHERE bo.user_id = c.user_id
        AND bo.order_id != c.first_bag_order_id
        AND bo.created_at > c.first_bag_at
        AND bo.created_at <= TIMESTAMP_ADD(c.first_bag_at, INTERVAL 30 DAY)
    ) AS has_repeat_bag_d30,
    (
      SELECT COUNT(DISTINCT po.order_id) FROM pickup_orders po
      WHERE po.user_id = c.user_id
        AND po.created_at > c.first_bag_at
        AND po.created_at <= TIMESTAMP_ADD(c.first_bag_at, INTERVAL 30 DAY)
    ) >= 2 AS has_repeat_pickup_d30,
    EXISTS (
      SELECT 1 FROM other_orders oo
      WHERE oo.user_id = c.user_id
        AND oo.has_large_waste
        AND oo.created_at > c.first_bag_at
        AND oo.created_at <= TIMESTAMP_ADD(c.first_bag_at, INTERVAL 30 DAY)
    ) AS has_large_waste_d30,
    EXISTS (
      SELECT 1 FROM other_orders oo
      WHERE oo.user_id = c.user_id
        AND oo.has_large_covering_bag
        AND oo.created_at > c.first_bag_at
        AND oo.created_at <= TIMESTAMP_ADD(c.first_bag_at, INTERVAL 30 DAY)
    ) AS has_large_covering_bag_d30
  FROM d30_cohort c
),
d30_daily AS (
  SELECT
    period,
    day_offset,
    day,
    COUNT(DISTINCT user_id) AS cohort_users,
    COUNT(DISTINCT IF(has_pickup_d30, user_id, NULL)) AS pickup_d30_users,
    COUNT(DISTINCT IF(NOT has_pickup_d30, user_id, NULL)) AS unused_d30_users,
    COUNT(DISTINCT IF(has_repeat_bag_d30, user_id, NULL)) AS repeat_bag_d30_users,
    COUNT(DISTINCT IF(has_repeat_pickup_d30, user_id, NULL)) AS repeat_pickup_d30_users,
    COUNT(DISTINCT IF(has_large_waste_d30, user_id, NULL)) AS large_waste_d30_users,
    COUNT(DISTINCT IF(has_large_covering_bag_d30, user_id, NULL)) AS large_covering_bag_d30_users
  FROM d30_flags
  GROUP BY 1, 2, 3
),
paid_service_receipts AS (
  SELECT DISTINCT
    r.id AS receipt_id,
    o.user_id,
    r.created_at,
    DATE(r.created_at, 'Asia/Seoul') AS paid_day,
    r.total_amount
  FROM `covering-app-ccd23.secure_dataset.order_v2` o
  JOIN `covering-app-ccd23.secure_dataset.order_line` ol
    ON ol.order_id = o.id
   AND ol.deleted_at IS NULL
  JOIN `covering-app-ccd23.secure_dataset.product` p
    ON p.id = ol.product_id
   AND p.product_type = 'SERVICE'
  JOIN `covering-app-ccd23.secure_dataset.order_invoice` oi
    ON oi.order_id = o.id
  JOIN `covering-app-ccd23.secure_dataset.invoice` i
    ON i.id = oi.invoice_id
  JOIN `covering-app-ccd23.secure_dataset.receipt` r
    ON r.invoice_id = i.id
   AND r.status = 'PAID'
   AND r.deleted_at IS NULL
  WHERE o.user_id IS NOT NULL
    AND o.deleted_at IS NULL
    AND o.status != 'CANCELED'
),
m1_cohort AS (
  SELECT
    a.period,
    a.day_offset,
    a.day,
    fb.user_id,
    fb.created_at AS first_bag_at,
    fb.order_day AS bag_day
  FROM m1_anchors a
  JOIN first_bag fb
    ON fb.order_day = a.day
),
m1_daily AS (
  SELECT
    c.period,
    c.day_offset,
    c.day,
    COUNT(DISTINCT c.user_id) AS cohort_users,
    COUNT(DISTINCT psr.user_id) AS m1_follow_paid_users,
    SUM(COALESCE(psr.total_amount, 0)) AS m1_follow_revenue
  FROM m1_cohort c
  LEFT JOIN paid_service_receipts psr
    ON psr.user_id = c.user_id
   AND DATE(psr.created_at, 'Asia/Seoul') BETWEEN DATE_ADD(c.bag_day, INTERVAL 31 DAY) AND DATE_ADD(c.bag_day, INTERVAL 60 DAY)
  GROUP BY 1, 2, 3
),
arpu_window_user AS (
  SELECT
    a.period,
    a.day_offset,
    a.day,
    psr.user_id,
    SUM(psr.total_amount) AS revenue_30d,
    EXISTS (
      SELECT 1 FROM bag_orders bo
      WHERE bo.user_id = psr.user_id
        AND bo.order_day BETWEEN DATE_SUB(a.day, INTERVAL 29 DAY) AND a.day
    ) AS has_bag_30d
  FROM daily_anchors a
  JOIN paid_service_receipts psr
    ON psr.paid_day BETWEEN DATE_SUB(a.day, INTERVAL 29 DAY) AND a.day
  GROUP BY 1, 2, 3, 4
),
arpu_daily AS (
  SELECT
    period,
    day_offset,
    day,
    SAFE_DIVIDE(SUM(IF(has_bag_30d, revenue_30d, 0)), COUNT(DISTINCT IF(has_bag_30d, user_id, NULL))) AS bag_user_arpu_30d,
    SAFE_DIVIDE(SUM(IF(NOT has_bag_30d, revenue_30d, 0)), COUNT(DISTINCT IF(NOT has_bag_30d, user_id, NULL))) AS non_bag_user_arpu_30d
  FROM arpu_window_user
  GROUP BY 1, 2, 3
),
metrics AS (
  SELECT 10 AS sort_order, 'bag_application_orders' AS metric_key, '일반 봉투 신청' AS label, 'count' AS unit, period, day_offset, day, CAST(bag_orders AS FLOAT64) AS value FROM bag_daily
  UNION ALL SELECT 20, 'pickup_orders', '일반 수거 신청', 'count', period, day_offset, day, CAST(pickup_orders AS FLOAT64) FROM pickup_daily
  UNION ALL SELECT 30, 'after_7_rate', '오전 7시 이후 수거율', 'pct', period, day_offset, day, 100 * SAFE_DIVIDE(after_7_orders, completed_orders) FROM completion_daily
  UNION ALL SELECT 40, 'completion_p90_hour', '수거 완료시각 p90', 'hour', period, day_offset, day, completed_hour_p90 FROM completion_daily
  UNION ALL SELECT 50, 'first_bag_to_pickup_d30', '첫 봉투 -> 수거 D30 전환', 'pct', period, day_offset, day, 100 * SAFE_DIVIDE(pickup_d30_users, cohort_users) FROM d30_daily
  UNION ALL SELECT 60, 'unused_d30', '구매 후 D30 미사용률', 'pct', period, day_offset, day, 100 * SAFE_DIVIDE(unused_d30_users, cohort_users) FROM d30_daily
  UNION ALL SELECT 70, 'repeat_bag_d30', 'D30 재구매율', 'pct', period, day_offset, day, 100 * SAFE_DIVIDE(repeat_bag_d30_users, cohort_users) FROM d30_daily
  UNION ALL SELECT 80, 'repeat_pickup_d30', 'D30 재수거율', 'pct', period, day_offset, day, 100 * SAFE_DIVIDE(repeat_pickup_d30_users, cohort_users) FROM d30_daily
  UNION ALL SELECT 90, 'large_waste_cross_sell_d30', '대폐 D30 크로스셀', 'pct', period, day_offset, day, 100 * SAFE_DIVIDE(large_waste_d30_users, cohort_users) FROM d30_daily
  UNION ALL SELECT 100, 'large_covering_bag_cross_sell_d30', '대커봉 D30 크로스셀', 'pct', period, day_offset, day, 100 * SAFE_DIVIDE(large_covering_bag_d30_users, cohort_users) FROM d30_daily
  UNION ALL SELECT 110, 'bag_user_arpu_30d', '일반 봉투 유저 ARPU', 'krw', period, day_offset, day, bag_user_arpu_30d FROM arpu_daily
  UNION ALL SELECT 120, 'non_bag_user_arpu_30d', '비사용 유저 ARPU', 'krw', period, day_offset, day, non_bag_user_arpu_30d FROM arpu_daily
  UNION ALL SELECT 130, 'arpu_ratio', 'ARPU 배율', 'ratio', period, day_offset, day, SAFE_DIVIDE(bag_user_arpu_30d, non_bag_user_arpu_30d) FROM arpu_daily
  UNION ALL SELECT 140, 'm1_follow_payment_arpu', 'M1 후속 결제', 'krw', period, day_offset, day, SAFE_DIVIDE(m1_follow_revenue, cohort_users) FROM m1_daily
  UNION ALL SELECT 150, 'm1_follow_payment_rate', 'M1 후속 결제율', 'pct', period, day_offset, day, 100 * SAFE_DIVIDE(m1_follow_paid_users, cohort_users) FROM m1_daily
  UNION ALL SELECT 160, 'fail_rate', '일반 수거 실패율', 'pct', period, day_offset, day, 100 * SAFE_DIVIDE(final_failed_orders, completed_orders + final_failed_orders) FROM fail_daily
  UNION ALL SELECT 170, 'notfound_fail_share', '실패 사유: 미발견', 'pct', period, day_offset, day, 100 * SAFE_DIVIDE(notfound_fail_orders, final_failed_orders) FROM fail_daily
  UNION ALL SELECT 180, 'enter_fail_share', '실패 사유: 출입', 'pct', period, day_offset, day, 100 * SAFE_DIVIDE(enter_fail_orders, final_failed_orders) FROM fail_daily
  UNION ALL SELECT 190, 'policy_fail_share', '실패 사유: 정책', 'pct', period, day_offset, day, 100 * SAFE_DIVIDE(policy_fail_orders, final_failed_orders) FROM fail_daily
  UNION ALL SELECT 200, 'user_cancel_rate', '고객 취소율', 'pct', period, day_offset, day, 100 * SAFE_DIVIDE(user_cancel_orders, pickup_orders) FROM cancel_daily
  UNION ALL SELECT 210, 'manager_cancel_rate', '운영 취소율', 'pct', period, day_offset, day, 100 * SAFE_DIVIDE(manager_cancel_orders, pickup_orders) FROM cancel_daily
),
metric_values AS (
  SELECT
    sort_order,
    metric_key,
    label,
    unit,
    MAX(IF(period = 'current', value, NULL)) AS value,
    MAX(IF(period = 'day_1', value, NULL)) AS value_1d_ago,
    MAX(IF(period = 'week', value, NULL)) AS value_7d_ago,
    MAX(IF(period = 'month', value, NULL)) AS value_30d_ago
  FROM metrics
  GROUP BY 1, 2, 3, 4
),
daily_offsets AS (
  SELECT offset_value
  FROM UNNEST(GENERATE_ARRAY(6, 0, -1)) AS offset_value
),
metric_daily_values AS (
  SELECT
    mv.metric_key,
    ARRAY_AGG(
      STRUCT(DATE_SUB(p.report_date, INTERVAL do.offset_value DAY) AS day, m.value AS value)
      ORDER BY do.offset_value DESC
    ) AS daily_values
  FROM metric_values mv
  CROSS JOIN params p
  CROSS JOIN daily_offsets do
  LEFT JOIN metrics m
    ON m.metric_key = mv.metric_key
   AND m.day_offset = do.offset_value
  GROUP BY mv.metric_key
)
SELECT
  p.report_date,
  p.previous_date,
  p.week_date,
  p.month_date,
  mv.sort_order,
  mv.metric_key,
  mv.label,
  mv.unit,
  mv.value,
  mv.value_1d_ago,
  mv.value_7d_ago,
  mv.value_30d_ago,
  mdv.daily_values
FROM metric_values mv
CROSS JOIN params p
LEFT JOIN metric_daily_values mdv
  ON mdv.metric_key = mv.metric_key
ORDER BY mv.sort_order
"""


@dataclass(frozen=True)
class DailyPoint:
    day: date
    value: float | None


@dataclass(frozen=True)
class MetricRow:
    sort_order: int
    key: str
    label: str
    unit: str
    value: float | None
    value_7d_ago: float | None
    value_30d_ago: float | None
    value_1d_ago: float | None = None
    daily_values: tuple[DailyPoint, ...] = ()


@dataclass(frozen=True)
class ReportData:
    report_date: date
    week_date: date
    month_date: date
    metrics: list[MetricRow]
    previous_date: date | None = None


def complete_report_date() -> date:
    return datetime.now(KST).date() - timedelta(days=1)


def parse_report_date(value: str | None) -> date:
    if not value:
        return complete_report_date()
    return date.fromisoformat(value)


def as_float(value: Any) -> float:
    if value in (None, ""):
        return 0.0
    return float(value)


def format_value(value: float | None, unit: str) -> str:
    if value is None:
        return "-"
    if unit == "pct":
        return f"{value:.1f}%"
    if unit == "krw":
        return f"{round(value):,}원"
    if unit == "count":
        return f"{round(value):,}건"
    if unit == "hour":
        return f"{value:.1f}시"
    if unit == "ratio":
        return f"{value:.2f}배"
    return f"{value:,.1f}"


def format_delta(value: float | None, baseline: float | None, unit: str) -> str:
    if value is None or baseline in (None, 0):
        return "-"
    if unit == "pct":
        return f"{value - baseline:+.1f}%p"
    if unit == "hour":
        return f"{value - baseline:+.1f}h"
    if unit == "ratio":
        return f"{value - baseline:+.2f}x"
    return f"{((value - baseline) / baseline) * 100:+.1f}%"


def short_date(value: date) -> str:
    return value.strftime("%m/%d")


def metric_by_key(report: ReportData, key: str) -> MetricRow:
    for metric in report.metrics:
        if metric.key == key:
            return metric
    raise KeyError(key)


def metric_line(metric: MetricRow) -> str:
    return (
        f"- {metric.label}: {format_value(metric.value, metric.unit)} "
        f"(전일 {format_delta(metric.value, metric.value_1d_ago, metric.unit)} / "
        f"1주전 {format_delta(metric.value, metric.value_7d_ago, metric.unit)} / "
        f"30일전 {format_delta(metric.value, metric.value_30d_ago, metric.unit)})"
    )


def parse_daily_values(values: Any) -> tuple[DailyPoint, ...]:
    points: list[DailyPoint] = []
    for item in values or []:
        if isinstance(item, dict):
            day_value = item.get("day")
            metric_value_raw = item.get("value")
        else:
            day_value = item["day"]
            metric_value_raw = item["value"]
        if isinstance(day_value, datetime):
            day_value = day_value.date()
        points.append(
            DailyPoint(
                day=day_value,
                value=None if metric_value_raw is None else float(metric_value_raw),
            )
        )
    return tuple(points)


def query_report(client: bigquery.Client, report_date: date) -> ReportData:
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("report_date", "DATE", report_date)]
    )
    rows = [dict(row.items()) for row in client.query(REPORT_SQL, job_config=job_config).result()]
    if not rows:
        raise RuntimeError("report query returned no rows")
    first = rows[0]
    return ReportData(
        report_date=first["report_date"],
        week_date=first["week_date"],
        month_date=first["month_date"],
        previous_date=first["previous_date"],
        metrics=[
            MetricRow(
                sort_order=int(row["sort_order"]),
                key=str(row["metric_key"]),
                label=str(row["label"]),
                unit=str(row["unit"]),
                value=None if row["value"] is None else float(row["value"]),
                value_7d_ago=None if row["value_7d_ago"] is None else float(row["value_7d_ago"]),
                value_30d_ago=None if row["value_30d_ago"] is None else float(row["value_30d_ago"]),
                value_1d_ago=None if row["value_1d_ago"] is None else float(row["value_1d_ago"]),
                daily_values=parse_daily_values(row["daily_values"]),
            )
            for row in rows
        ],
    )


def build_root_message(report: ReportData) -> str:
    bag_orders = metric_by_key(report, "bag_application_orders")
    pickup_orders = metric_by_key(report, "pickup_orders")
    after_7 = metric_by_key(report, "after_7_rate")
    m1_payment = metric_by_key(report, "m1_follow_payment_arpu")
    return (
        f"*일반 커버링 봉투 리포트 | {report.report_date.isoformat()}* "
        f"봉투 신청 {format_value(bag_orders.value, bag_orders.unit)}, "
        f"수거 신청 {format_value(pickup_orders.value, pickup_orders.unit)}, "
        f"오전7시 이후 {format_value(after_7.value, after_7.unit)}, "
        f"M1 후속 결제 {format_value(m1_payment.value, m1_payment.unit)} "
        f"/ 전일대비 봉투 {format_delta(bag_orders.value, bag_orders.value_1d_ago, bag_orders.unit)}, "
        f"수거 {format_delta(pickup_orders.value, pickup_orders.value_1d_ago, pickup_orders.unit)}, "
        f"오전7시 {format_delta(after_7.value, after_7.value_1d_ago, after_7.unit)}"
    )


def metric_value(report: ReportData, key: str) -> float | None:
    try:
        return metric_by_key(report, key).value
    except KeyError:
        return None


def report_log_fields(report: ReportData) -> dict[str, Any]:
    return {
        "report_date": report.report_date.isoformat(),
        "metric_count": len(report.metrics),
        "bag_application_orders": metric_value(report, "bag_application_orders"),
        "pickup_orders": metric_value(report, "pickup_orders"),
        "after_7_rate": metric_value(report, "after_7_rate"),
        "completion_p90_hour": metric_value(report, "completion_p90_hour"),
        "fail_rate": metric_value(report, "fail_rate"),
        "m1_follow_payment_arpu": metric_value(report, "m1_follow_payment_arpu"),
    }


def log_report_event(event: str, report: ReportData, **fields: Any) -> None:
    payload = {"event": event, **report_log_fields(report), **fields}
    logger.info("report_event=%s", json.dumps(payload, ensure_ascii=False, sort_keys=True))


def sparkline(points: tuple[DailyPoint, ...], point_width: int = 4) -> str:
    bars = "▁▂▃▄▅▆▇█"
    values = [point.value for point in points if point.value is not None]
    if not values:
        return " ".join("-" * point_width for _ in points)
    min_value = min(values)
    max_value = max(values)
    if min_value == max_value:
        middle_bar = bars[(len(bars) - 1) // 2]
        return " ".join(
            middle_bar * point_width if point.value is not None else "-" * point_width
            for point in points
        )
    scale = max_value - min_value
    return " ".join(
        "-" * point_width
        if point.value is None
        else bars[int(((point.value - min_value) / scale) * (len(bars) - 1))] * point_width
        for point in points
    )


def daily_trend_line(metric: MetricRow) -> str:
    if not metric.daily_values:
        return f"- {metric.label}: 일별 값 없음"
    start_day = short_date(metric.daily_values[0].day)
    end_day = short_date(metric.daily_values[-1].day)
    start_value = metric.daily_values[0].value
    end_value = metric.daily_values[-1].value
    return (
        f"- {metric.label} ({start_day}~{end_day}): {sparkline(metric.daily_values)} "
        f"/ {format_value(start_value, metric.unit)} -> {format_value(end_value, metric.unit)} "
        f"/ 7일 {format_delta(end_value, start_value, metric.unit)} "
        f"/ 전일 {format_delta(metric.value, metric.value_1d_ago, metric.unit)}"
    )


def build_message(report: ReportData) -> str:
    sections = [
        (
            "*P0 신청/수거*",
            ["bag_application_orders", "pickup_orders", "after_7_rate", "completion_p90_hour"],
        ),
        (
            "*전환/반복*",
            ["first_bag_to_pickup_d30", "unused_d30", "repeat_bag_d30", "repeat_pickup_d30"],
        ),
        (
            "*수익성/M1*",
            ["bag_user_arpu_30d", "non_bag_user_arpu_30d", "arpu_ratio", "m1_follow_payment_arpu", "m1_follow_payment_rate"],
        ),
        (
            "*크로스셀*",
            ["large_waste_cross_sell_d30", "large_covering_bag_cross_sell_d30"],
        ),
        (
            "*운영 품질*",
            ["fail_rate", "notfound_fail_share", "enter_fail_share", "policy_fail_share", "user_cancel_rate", "manager_cancel_rate"],
        ),
    ]
    metrics = {metric.key: metric for metric in report.metrics}
    trend_keys = [
        "bag_application_orders",
        "pickup_orders",
        "after_7_rate",
        "completion_p90_hour",
        "m1_follow_payment_arpu",
        "fail_rate",
    ]
    previous_date = report.previous_date or report.report_date - timedelta(days=1)
    lines = [
        f"*일반 커버링 봉투 리포트 | {report.report_date.isoformat()}*",
        f"비교: 전일 {previous_date.isoformat()} / 1주전 {report.week_date.isoformat()} / 30일전 {report.month_date.isoformat()}",
        "",
        "*최근 7일 변화*",
    ]
    for key in trend_keys:
        metric = metrics.get(key)
        if metric:
            lines.append(daily_trend_line(metric))
    lines += [
        "",
        "*기준*",
        "- 수거 지연율은 scheduled_end_at 날짜 기준 오전 7시 이후 완료 비율입니다.",
        "- D30 지표는 30일 관측이 끝난 첫 일반 봉투 구매 cohort 기준입니다.",
        "- M1 후속 결제는 첫 일반 봉투 구매 후 31~60일 SERVICE PAID receipt 기준입니다.",
        "",
    ]
    for title, keys in sections:
        lines.append(title)
        for key in keys:
            metric = metrics.get(key)
            if metric:
                lines.append(metric_line(metric))
        lines.append("")
    lines += [
        "*상세*",
        DASHBOARD_URL,
    ]
    return "\n".join(lines).rstrip()


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("상태 파일 로드 실패, 새 상태로 진행: %s", exc)
        return {}
    return state if isinstance(state, dict) else {}


def send_state_key(report_date: date, channel: str) -> str:
    return f"{report_date.isoformat()}::{channel}"


def find_existing_send(
    state: dict[str, Any],
    report_date: date,
    channel: str,
) -> dict[str, Any] | None:
    key = send_state_key(report_date, channel)
    sends_by_key = state.get("sends_by_key")
    if isinstance(sends_by_key, dict) and isinstance(sends_by_key.get(key), dict):
        return sends_by_key[key]

    recent_sends = state.get("recent_sends")
    if isinstance(recent_sends, list):
        for send in reversed(recent_sends):
            if (
                isinstance(send, dict)
                and send.get("report_date") == report_date.isoformat()
                and send.get("channel") == channel
            ):
                return send
    return None


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
    detail_ts: str,
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
    recent_sends.append(last_send)
    sends_by_key = state.get("sends_by_key")
    if not isinstance(sends_by_key, dict):
        sends_by_key = {}
    sends_by_key[send_state_key(report_date, channel)] = last_send
    return {
        "last_send": last_send,
        "recent_sends": recent_sends[-30:],
        "sends_by_key": sends_by_key,
    }


def post_to_slack(token: str, channel: str, text: str, thread_ts: str | None) -> str:
    payload: dict[str, Any] = {"channel": channel, "text": text}
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-slack", "--dry-run", action="store_true", help="Slack 발송 없이 메시지만 출력")
    parser.add_argument("--report-date", help="KST 기준 닫힌 보고일 YYYY-MM-DD")
    parser.add_argument(
        "--state-file",
        default=os.environ.get("REGULAR_BAG_REPORT_STATE_FILE", str(DEFAULT_STATE_FILE)),
    )
    return parser.parse_args()


def main() -> int:
    started_at = time.time()
    logger.info("시작")
    args = parse_args()
    report_date = parse_report_date(args.report_date)
    state_path = Path(args.state_file)
    client = bigquery.Client(project=PROJECT)
    report = query_report(client, report_date=report_date)
    log_report_event("report_built", report)
    root_message = build_root_message(report)
    message = build_message(report)

    if args.no_slack:
        sys.stdout.write(root_message + "\n\n" + message + "\n")
        log_report_event("dry_run_completed", report, elapsed_sec=round(time.time() - started_at, 1))
        return 0

    token = os.environ.get("SLACK_BOT_TOKEN", "").strip()
    channel = os.environ.get("REGULAR_BAG_REPORT_SLACK_CHANNEL", DEFAULT_SLACK_CHANNEL).strip()
    if not token:
        raise RuntimeError("SLACK_BOT_TOKEN 환경변수가 필요합니다.")

    state = load_state(state_path)
    existing_send = find_existing_send(state, report_date, channel)
    if existing_send:
        elapsed_sec = round(time.time() - started_at, 1)
        log_report_event(
            "slack_send_skipped_duplicate",
            report,
            channel=channel,
            root_ts=existing_send.get("root_ts"),
            detail_ts=existing_send.get("detail_ts"),
            elapsed_sec=elapsed_sec,
        )
        logger.info(
            "완료 : %.1f초 (duplicate-skip, report_date=%s, channel=%s, root_ts=%s, detail_ts=%s)",
            elapsed_sec,
            report_date.isoformat(),
            channel,
            existing_send.get("root_ts"),
            existing_send.get("detail_ts"),
        )
        return 0

    root_ts = post_to_slack(token, channel, root_message, thread_ts=None)
    detail_ts = post_to_slack(token, channel, message, thread_ts=root_ts)
    save_state(state_path, update_state_with_send(state, report_date, channel, root_ts, detail_ts))
    log_report_event(
        "slack_send_completed",
        report,
        channel=channel,
        root_ts=root_ts,
        detail_ts=detail_ts,
        elapsed_sec=round(time.time() - started_at, 1),
    )
    logger.info(
        "완료 : %.1f초 (report_date=%s, channel=%s, root_ts=%s, detail_ts=%s)",
        time.time() - started_at,
        report_date.isoformat(),
        channel,
        root_ts,
        detail_ts,
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        logger.error("실패: %s", exc, exc_info=True)
        raise SystemExit(1) from exc
