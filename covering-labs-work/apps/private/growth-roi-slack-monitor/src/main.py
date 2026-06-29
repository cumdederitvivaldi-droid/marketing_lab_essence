#!/usr/bin/env python3
"""Slack monitor for Growth Marketing ROI recommendations and follow-up."""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests
from google.cloud import bigquery


def _load_env_file() -> None:
    from pathlib import Path
    env_path = Path(os.environ.get("ENV_FILE", "/shared/.env"))
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env_file()

PROJECT = "covering-app-ccd23"
KST = timezone(timedelta(hours=9))
DEFAULT_SLACK_CHANNEL = "#실험실_notifications"
DEFAULT_STATE_FILE = Path(__file__).resolve().parents[1] / "logs" / "growth_roi_slack_state.json"
DASHBOARD_URL = "https://grafana.covering.app/d/d7b013bb-d5dd-4b1d-aa68-0ff35b11e7b7/growth-marketing-roi-eb8c80-ec8b9c-ebb3b4-eb939c"

SCALE_ACTIONS = {
    "10~20% 증액 테스트": (5.0, 30.0),
    "5~10% 증액 테스트": (3.0, 20.0),
    "소액 증액으로 관측": (1.0, 15.0),
}
REDUCE_ACTIONS = {
    "감액/중단 검토",
    "ARPU 개선 전 증액 금지",
    "D14 첫 결제 CAC 낮춘 뒤 재판단",
    "CAC 낮춘 뒤 재판단",
}
HOLD_ACTIONS = {"상한 유지·소재/타겟 분리", "관찰만"}
OPTIMIZATION_BUCKETS = [
    "저CAC·고ARPU·확장가능",
    "저CAC·고ARPU·저예산",
    "저CAC·고ARPU·증액취약",
    "저CAC·저ARPU",
    "고CAC·고ARPU",
    "고CAC·저ARPU",
    "표본부족",
]


LEDGER_SQL = """
WITH params AS (
  SELECT
    @end_date AS report_end,
    @cohort_days AS cohort_days,
    DATE_SUB(@end_date, INTERVAL (@cohort_days + 13) DAY) AS d14_start,
    DATE_SUB(@end_date, INTERVAL 14 DAY) AS d14_end,
    DATE_SUB(@end_date, INTERVAL (@cohort_days + 29) DAY) AS d30_start,
    DATE_SUB(@end_date, INTERVAL 30 DAY) AS d30_end,
    DATE_SUB(@end_date, INTERVAL 6 DAY) AS current_7d_start,
    DATE_SUB(@end_date, INTERVAL 13 DAY) AS prev_7d_start,
    DATE_SUB(@end_date, INTERVAL 7 DAY) AS prev_7d_end
),
cost_by_day AS (
  SELECT
    c.date AS day,
    CASE c.channel
      WHEN 'google.adwords' THEN 'Google'
      WHEN 'facebook.business' THEN 'Meta'
      WHEN 'instagram' THEN 'Meta'
      WHEN 'apple.searchads' THEN 'Apple'
      WHEN 'tiktok' THEN 'TikTok'
      ELSE c.channel
    END AS channel,
    c.campaign,
    COALESCE(NULLIF(c.ad_group, ''), '(no ad_group)') AS ad_group,
    COALESCE(NULLIF(c.ad_creative, ''), NULLIF(c.ad_group, ''), NULLIF(c.campaign, ''), '(unknown)') AS creative_key,
    CASE
      WHEN c.ad_creative IS NOT NULL AND c.ad_creative != '' THEN 'creative'
      WHEN c.ad_group IS NOT NULL AND c.ad_group != '' THEN 'ad_group fallback'
      WHEN c.campaign IS NOT NULL AND c.campaign != '' THEN 'campaign fallback'
      ELSE 'unknown'
    END AS creative_source,
    SUM(c.cost) AS spend_won,
    SUM(c.app_installs) AS installs
  FROM `covering-app-ccd23.ads_data.daily_cost_creative` AS c
  CROSS JOIN params AS p
  WHERE c.date >= p.d30_start
    AND c.date <= p.report_end
    AND c.cost > 0
  GROUP BY 1, 2, 3, 4, 5, 6
),
cost_daily_with_median AS (
  SELECT
    c.*,
    m.median_spend_won,
    AVG(c.spend_won) OVER (
      PARTITION BY c.channel, c.campaign, c.ad_group, c.creative_key
      ORDER BY c.day
      ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING
    ) AS prev3_avg_spend_won
  FROM cost_by_day AS c
  JOIN (
    SELECT
      channel,
      campaign,
      ad_group,
      creative_key,
      APPROX_QUANTILES(spend_won, 2)[OFFSET(1)] AS median_spend_won
    FROM cost_by_day
    GROUP BY 1, 2, 3, 4
  ) AS m
    ON c.channel = m.channel
   AND c.campaign = m.campaign
   AND c.ad_group = m.ad_group
   AND c.creative_key = m.creative_key
),
cost_summary AS (
  SELECT
    c.channel,
    c.campaign,
    c.ad_group,
    c.creative_key,
    ANY_VALUE(c.creative_source) AS creative_source,
    SUM(IF(c.day BETWEEN p.d14_start AND p.d14_end, c.spend_won, 0)) AS spend_d14_won,
    SUM(IF(c.day BETWEEN p.d30_start AND p.d30_end, c.spend_won, 0)) AS spend_d30_won,
    SUM(IF(c.day BETWEEN p.current_7d_start AND p.report_end, c.spend_won, 0)) AS current_7d_spend_won,
    SUM(IF(c.day BETWEEN p.prev_7d_start AND p.prev_7d_end, c.spend_won, 0)) AS prev_7d_spend_won,
    SUM(IF(c.day BETWEEN p.d14_start AND p.d14_end, c.installs, 0)) AS installs_d14,
    COUNT(DISTINCT IF(c.day BETWEEN p.d14_start AND p.d14_end, c.day, NULL)) AS spend_days_d14,
    AVG(IF(c.day BETWEEN p.d14_start AND p.d14_end, c.spend_won, NULL)) AS avg_daily_spend_d14_won,
    MAX(IF(c.day BETWEEN p.d14_start AND p.d14_end, c.spend_won, NULL)) AS max_daily_spend_d14_won
  FROM cost_by_day AS c
  CROSS JOIN params AS p
  GROUP BY 1, 2, 3, 4
),
signup_raw AS (
  SELECT
    DATE(e.Event_Datetime) AS signup_day,
    TIMESTAMP(e.Event_Datetime) AS signup_ts,
    CASE e.Channel
      WHEN 'google.adwords' THEN 'Google'
      WHEN 'facebook.business' THEN 'Meta'
      WHEN 'instagram' THEN 'Meta'
      WHEN 'apple.searchads' THEN 'Apple'
      WHEN 'tiktok' THEN 'TikTok'
      ELSE e.Channel
    END AS channel,
    e.Campaign AS campaign,
    COALESCE(NULLIF(e.Ad_Group, ''), '(no ad_group)') AS ad_group,
    COALESCE(NULLIF(e.Ad_Creative, ''), NULLIF(e.Ad_Group, ''), NULLIF(e.Campaign, ''), '(unknown)') AS creative_key,
    e.Airbridge_Device_ID AS device_id,
    SAFE_CAST(e.User_ID AS INT64) AS direct_user_id
  FROM `covering-app-ccd23.airbridge_dataset.app_events` AS e
  CROSS JOIN params AS p
  WHERE e.Event_Name = 'Sign-up'
    AND e.Event_Date >= FORMAT_DATE('%Y-%m-%d', p.d30_start)
    AND e.Event_Date <= FORMAT_DATE('%Y-%m-%d', p.d14_end)
    AND e.Channel IS NOT NULL
    AND e.Channel NOT IN ('unattributed', '')
),
device_user_fallback AS (
  SELECT
    sr.device_id,
    sr.signup_ts,
    ARRAY_AGG(SAFE_CAST(e.User_ID AS INT64) IGNORE NULLS ORDER BY TIMESTAMP(e.Event_Datetime) LIMIT 1)[SAFE_OFFSET(0)] AS fallback_user_id
  FROM signup_raw AS sr
  CROSS JOIN params AS p
  JOIN `covering-app-ccd23.airbridge_dataset.app_events` AS e
    ON sr.device_id = e.Airbridge_Device_ID
   AND SAFE_CAST(e.User_ID AS INT64) IS NOT NULL
   AND TIMESTAMP(e.Event_Datetime) >= sr.signup_ts
   AND TIMESTAMP(e.Event_Datetime) < TIMESTAMP_ADD(sr.signup_ts, INTERVAL 7 DAY)
   AND e.Event_Date >= FORMAT_DATE('%Y-%m-%d', p.d30_start)
   AND e.Event_Date <= FORMAT_DATE('%Y-%m-%d', p.report_end)
  GROUP BY 1, 2
),
signup_mapped AS (
  SELECT
    sr.signup_day,
    sr.signup_ts,
    sr.channel,
    sr.campaign,
    sr.ad_group,
    sr.creative_key,
    COALESCE(sr.direct_user_id, df.fallback_user_id) AS user_id,
    COALESCE(CAST(COALESCE(sr.direct_user_id, df.fallback_user_id) AS STRING), sr.device_id) AS signup_key
  FROM signup_raw AS sr
  LEFT JOIN device_user_fallback AS df
    ON sr.device_id = df.device_id
   AND sr.signup_ts = df.signup_ts
),
paid_receipts AS (
  SELECT
    o.user_id,
    DATE(r.created_at, 'Asia/Seoul') AS paid_day,
    r.total_amount
  FROM `covering-app-ccd23.secure_dataset.order_v2` AS o
  JOIN `covering-app-ccd23.secure_dataset.order_invoice` AS oi ON o.id = oi.order_id
  JOIN `covering-app-ccd23.secure_dataset.receipt` AS r ON oi.invoice_id = r.invoice_id
  CROSS JOIN params AS p
  WHERE r.status = 'PAID'
    AND r.deleted_at IS NULL
    AND o.user_id IS NOT NULL
    AND DATE(r.created_at, 'Asia/Seoul') >= p.d30_start
    AND DATE(r.created_at, 'Asia/Seoul') <= p.report_end
    AND EXISTS (
      SELECT 1
      FROM `covering-app-ccd23.secure_dataset.order_line` AS ol
      JOIN `covering-app-ccd23.secure_dataset.product` AS product ON ol.product_id = product.id
      WHERE ol.order_id = o.id
        AND product.product_type = 'SERVICE'
    )
),
signup_revenue AS (
  SELECT
    sm.signup_day,
    sm.channel,
    sm.campaign,
    sm.ad_group,
    sm.creative_key,
    sm.user_id,
    sm.signup_key,
    MIN(IF(DATE_DIFF(pr.paid_day, sm.signup_day, DAY) BETWEEN 0 AND 14, pr.paid_day, NULL)) AS first_paid_day_d14,
    MIN(IF(DATE_DIFF(pr.paid_day, sm.signup_day, DAY) BETWEEN 0 AND 30, pr.paid_day, NULL)) AS first_paid_day_d30,
    SUM(IF(DATE_DIFF(pr.paid_day, sm.signup_day, DAY) BETWEEN 0 AND 14, pr.total_amount, 0)) AS revenue_d14_won,
    SUM(IF(DATE_DIFF(pr.paid_day, sm.signup_day, DAY) BETWEEN 0 AND 30, pr.total_amount, 0)) AS revenue_d30_won
  FROM signup_mapped AS sm
  LEFT JOIN paid_receipts AS pr
    ON sm.user_id = pr.user_id
   AND pr.paid_day >= sm.signup_day
   AND pr.paid_day <= DATE_ADD(sm.signup_day, INTERVAL 30 DAY)
  GROUP BY 1, 2, 3, 4, 5, 6, 7
),
signup_summary_by_day AS (
  SELECT
    sr.signup_day,
    sr.channel,
    sr.campaign,
    sr.ad_group,
    sr.creative_key,
    COUNT(DISTINCT IF(sr.signup_day BETWEEN p.d14_start AND p.d14_end, sr.signup_key, NULL)) AS signups_d14,
    COUNT(DISTINCT IF(sr.signup_day BETWEEN p.d14_start AND p.d14_end AND sr.first_paid_day_d14 IS NOT NULL, sr.user_id, NULL)) AS first_payment_users_d14,
    SUM(IF(sr.signup_day BETWEEN p.d14_start AND p.d14_end, sr.revenue_d14_won, 0)) AS revenue_d14_won,
    COUNT(DISTINCT IF(sr.signup_day BETWEEN p.d30_start AND p.d30_end, sr.signup_key, NULL)) AS signups_d30,
    COUNT(DISTINCT IF(sr.signup_day BETWEEN p.d30_start AND p.d30_end AND sr.first_paid_day_d30 IS NOT NULL, sr.user_id, NULL)) AS first_payment_users_d30,
    SUM(IF(sr.signup_day BETWEEN p.d30_start AND p.d30_end, sr.revenue_d14_won, 0)) AS revenue_d14_on_d30_cohort_won,
    SUM(IF(sr.signup_day BETWEEN p.d30_start AND p.d30_end, sr.revenue_d30_won, 0)) AS revenue_d30_won
  FROM signup_revenue AS sr
  CROSS JOIN params AS p
  GROUP BY 1, 2, 3, 4, 5
),
daily_joined AS (
  SELECT
    c.day,
    c.channel,
    c.campaign,
    c.ad_group,
    c.creative_key,
    c.spend_won,
    c.median_spend_won,
    c.prev3_avg_spend_won,
    COALESCE(ss.signups_d14, 0) AS signups_d14,
    COALESCE(ss.first_payment_users_d14, 0) AS first_payment_users_d14,
    COALESCE(ss.revenue_d14_won, 0) AS revenue_d14_won
  FROM cost_daily_with_median AS c
  LEFT JOIN signup_summary_by_day AS ss
    ON c.day = ss.signup_day
   AND c.channel = ss.channel
   AND c.campaign = ss.campaign
   AND c.ad_group = ss.ad_group
   AND c.creative_key = ss.creative_key
),
summary AS (
  SELECT
    cs.channel,
    cs.campaign,
    cs.ad_group,
    cs.creative_key,
    cs.creative_source,
    cs.spend_d14_won,
    cs.spend_d30_won,
    cs.current_7d_spend_won,
    cs.prev_7d_spend_won,
    cs.installs_d14,
    cs.spend_days_d14,
    cs.avg_daily_spend_d14_won,
    cs.max_daily_spend_d14_won,
    SUM(ss.signups_d14) AS signups_d14,
    SUM(ss.first_payment_users_d14) AS first_payment_users_d14,
    SUM(ss.revenue_d14_won) AS revenue_d14_won,
    SUM(ss.signups_d30) AS signups_d30,
    SUM(ss.first_payment_users_d30) AS first_payment_users_d30,
    SUM(ss.revenue_d14_on_d30_cohort_won) AS revenue_d14_on_d30_cohort_won,
    SUM(ss.revenue_d30_won) AS revenue_d30_won,
    SUM(IF(dj.spend_won < dj.median_spend_won, dj.revenue_d14_won, NULL)) AS low_spend_revenue_d14_won,
    SUM(IF(dj.spend_won < dj.median_spend_won, dj.spend_won, NULL)) AS low_spend_won,
    SUM(IF(dj.spend_won >= dj.median_spend_won, dj.revenue_d14_won, NULL)) AS high_spend_revenue_d14_won,
    SUM(IF(dj.spend_won >= dj.median_spend_won, dj.spend_won, NULL)) AS high_spend_won
  FROM cost_summary AS cs
  LEFT JOIN signup_summary_by_day AS ss
    ON cs.channel = ss.channel
   AND cs.campaign = ss.campaign
   AND cs.ad_group = ss.ad_group
   AND cs.creative_key = ss.creative_key
  LEFT JOIN daily_joined AS dj
    ON ss.signup_day = dj.day
   AND ss.channel = dj.channel
   AND ss.campaign = dj.campaign
   AND ss.ad_group = dj.ad_group
   AND ss.creative_key = dj.creative_key
  WHERE cs.spend_d14_won > 0
  GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13
),
scale_events AS (
  SELECT
    dj.channel,
    dj.campaign,
    dj.ad_group,
    dj.creative_key,
    dj.day AS scale_day
  FROM daily_joined AS dj
  CROSS JOIN params AS p
  WHERE dj.day BETWEEN p.d14_start AND p.d14_end
    AND dj.prev3_avg_spend_won IS NOT NULL
    AND dj.spend_won >= dj.prev3_avg_spend_won * 1.3
    AND dj.spend_won >= 100000
),
scale_summary AS (
  SELECT
    se.channel,
    se.campaign,
    se.ad_group,
    se.creative_key,
    COUNT(DISTINCT se.scale_day) AS scale_event_days,
    SUM(IF(dj.day BETWEEN DATE_SUB(se.scale_day, INTERVAL 3 DAY) AND DATE_SUB(se.scale_day, INTERVAL 1 DAY), dj.revenue_d14_won, 0)) AS before_scale_revenue_d14_won,
    SUM(IF(dj.day BETWEEN DATE_SUB(se.scale_day, INTERVAL 3 DAY) AND DATE_SUB(se.scale_day, INTERVAL 1 DAY), dj.spend_won, 0)) AS before_scale_spend_won,
    SUM(IF(dj.day BETWEEN se.scale_day AND DATE_ADD(se.scale_day, INTERVAL 2 DAY), dj.revenue_d14_won, 0)) AS after_scale_revenue_d14_won,
    SUM(IF(dj.day BETWEEN se.scale_day AND DATE_ADD(se.scale_day, INTERVAL 2 DAY), dj.spend_won, 0)) AS after_scale_spend_won
  FROM scale_events AS se
  JOIN daily_joined AS dj
    ON se.channel = dj.channel
   AND se.campaign = dj.campaign
   AND se.ad_group = dj.ad_group
   AND se.creative_key = dj.creative_key
   AND dj.day BETWEEN DATE_SUB(se.scale_day, INTERVAL 3 DAY) AND DATE_ADD(se.scale_day, INTERVAL 2 DAY)
  GROUP BY 1, 2, 3, 4
),
benchmarks AS (
  SELECT
    SAFE_DIVIDE(SUM(spend_d14_won), NULLIF(SUM(first_payment_users_d14), 0)) AS avg_first_payment_cac_d14_won,
    SAFE_DIVIDE(SUM(revenue_d14_won), NULLIF(SUM(signups_d14), 0)) AS avg_arpu_d14_won,
    SAFE_DIVIDE(SUM(revenue_d14_won), NULLIF(SUM(first_payment_users_d14), 0)) AS avg_payer_arppu_d14_won,
    SAFE_DIVIDE(SUM(revenue_d14_won), NULLIF(SUM(spend_d14_won), 0)) * 100 AS avg_roas_d14_pct
  FROM summary
),
scored AS (
  SELECT
    ROW_NUMBER() OVER (ORDER BY s.spend_d14_won DESC) AS spend_rank,
    s.channel,
    s.campaign,
    s.ad_group,
    s.creative_key,
    s.creative_source,
    ROUND(s.spend_d14_won / 10000, 0) AS spend_manwon,
    ROUND(s.current_7d_spend_won / 10000, 0) AS current_7d_spend_manwon,
    ROUND(SAFE_DIVIDE(s.current_7d_spend_won - s.prev_7d_spend_won, NULLIF(s.prev_7d_spend_won, 0)) * 100, 1) AS current_vs_prev7_delta_pct,
    s.spend_days_d14,
    ROUND(SAFE_DIVIDE(s.spend_d14_won, NULLIF(s.spend_days_d14, 0)) / 10000, 1) AS avg_daily_spend_manwon,
    ROUND(s.max_daily_spend_d14_won / 10000, 1) AS max_daily_spend_manwon,
    CAST(s.installs_d14 AS INT64) AS installs,
    CAST(s.signups_d14 AS INT64) AS signups_d14,
    CAST(s.first_payment_users_d14 AS INT64) AS first_payment_users_d14,
    ROUND(SAFE_DIVIDE(s.spend_d14_won, NULLIF(s.first_payment_users_d14, 0)), 0) AS first_payment_cac_d14_won,
    ROUND(SAFE_DIVIDE(s.revenue_d14_won, NULLIF(s.signups_d14, 0)), 0) AS arpu_d14_won,
    ROUND(SAFE_DIVIDE(s.revenue_d14_won, NULLIF(s.first_payment_users_d14, 0)), 0) AS payer_arppu_d14_won,
    ROUND(SAFE_DIVIDE(s.revenue_d14_won, NULLIF(s.first_payment_users_d14, 0)), 0) AS payer_arpu_d14_won,
    ROUND(SAFE_DIVIDE(s.revenue_d14_won, NULLIF(s.spend_d14_won, 0)) * 100, 1) AS roas_d14_pct,
    ROUND(s.revenue_d14_won / 10000, 0) AS revenue_d14_manwon,
    CAST(s.signups_d30 AS INT64) AS signups_d30,
    CAST(s.first_payment_users_d30 AS INT64) AS first_payment_users_d30,
    ROUND(SAFE_DIVIDE(s.spend_d30_won, NULLIF(s.first_payment_users_d30, 0)), 0) AS first_payment_cac_d30_won,
    ROUND(SAFE_DIVIDE(s.revenue_d14_on_d30_cohort_won, NULLIF(s.signups_d30, 0)), 0) AS arpu_d14_on_d30_cohort_won,
    ROUND(SAFE_DIVIDE(s.revenue_d30_won, NULLIF(s.signups_d30, 0)), 0) AS arpu_d30_won,
    ROUND(SAFE_DIVIDE(s.revenue_d30_won, NULLIF(s.first_payment_users_d30, 0)), 0) AS payer_arppu_d30_won,
    ROUND(SAFE_DIVIDE(s.revenue_d30_won, NULLIF(s.first_payment_users_d30, 0)), 0) AS payer_arpu_d30_won,
    ROUND(SAFE_DIVIDE(s.revenue_d30_won, NULLIF(s.spend_d30_won, 0)) * 100, 1) AS roas_d30_pct,
    ROUND(s.revenue_d30_won / 10000, 0) AS revenue_d30_manwon,
    ROUND(SAFE_DIVIDE(s.high_spend_revenue_d14_won, NULLIF(s.high_spend_won, 0)) * 100 - SAFE_DIVIDE(s.low_spend_revenue_d14_won, NULLIF(s.low_spend_won, 0)) * 100, 1) AS high_vs_low_delta_pp,
    COALESCE(ss.scale_event_days, 0) AS scale_event_days,
    ROUND(SAFE_DIVIDE(ss.after_scale_revenue_d14_won, NULLIF(ss.after_scale_spend_won, 0)) * 100, 1) AS after_scale_roas_d14_pct,
    ROUND(SAFE_DIVIDE(ss.after_scale_revenue_d14_won, NULLIF(ss.after_scale_spend_won, 0)) * 100 - SAFE_DIVIDE(ss.before_scale_revenue_d14_won, NULLIF(ss.before_scale_spend_won, 0)) * 100, 1) AS after_scale_delta_pp,
    ROUND(b.avg_first_payment_cac_d14_won, 0) AS period_avg_first_payment_cac_d14_won,
    ROUND(b.avg_arpu_d14_won, 0) AS period_avg_arpu_d14_won,
    ROUND(b.avg_payer_arppu_d14_won, 0) AS period_avg_payer_arppu_d14_won,
    ROUND(b.avg_payer_arppu_d14_won, 0) AS period_avg_payer_arpu_d14_won,
    ROUND(b.avg_roas_d14_pct, 1) AS period_avg_roas_d14_pct,
    p.d14_start AS d14_cohort_start,
    p.d14_end AS d14_cohort_end,
    p.d30_start AS d30_cohort_start,
    p.d30_end AS d30_cohort_end,
    p.report_end
  FROM summary AS s
  CROSS JOIN benchmarks AS b
  CROSS JOIN params AS p
  LEFT JOIN scale_summary AS ss
    ON s.channel = ss.channel
   AND s.campaign = ss.campaign
   AND s.ad_group = ss.ad_group
   AND s.creative_key = ss.creative_key
),
ledger AS (
  SELECT
    spend_rank,
    CASE
      WHEN first_payment_users_d14 < 3 THEN '관찰부족'
      WHEN first_payment_cac_d14_won <= period_avg_first_payment_cac_d14_won
        AND arpu_d14_won >= period_avg_arpu_d14_won
        THEN '저D14 CAC·고D14 ARPU'
      WHEN first_payment_cac_d14_won <= period_avg_first_payment_cac_d14_won THEN '저D14 CAC·저D14 ARPU'
      WHEN arpu_d14_won >= period_avg_arpu_d14_won THEN '고D14 ARPU·고D14 CAC'
      ELSE 'D14 CAC·ARPU 모두 약함'
    END AS target_fit,
    CASE
      WHEN spend_manwon >= 500 AND spend_days_d14 >= 14 THEN '현재 물량 큼'
      WHEN spend_manwon >= 100 AND spend_days_d14 >= 7 THEN '현재 물량 중간'
      WHEN spend_manwon >= 30 THEN '현재 물량 작음'
      ELSE '소액 관찰'
    END AS budget_capacity,
    CASE
      WHEN first_payment_users_d14 < 3 THEN '관찰부족'
      WHEN scale_event_days >= 1 AND (after_scale_delta_pp IS NULL OR after_scale_delta_pp >= -15) THEN '증액 후 D14 ROAS 유지/개선'
      WHEN scale_event_days >= 1 AND after_scale_delta_pp < -15 THEN '증액 후 D14 ROAS 하락'
      WHEN scale_event_days = 0 AND (high_vs_low_delta_pp IS NULL OR high_vs_low_delta_pp >= -20) THEN '고지출일 D14 ROAS 유지'
      WHEN scale_event_days = 0 AND high_vs_low_delta_pp < -20 THEN '고지출일 D14 ROAS 하락'
      ELSE '증액 데이터 부족'
    END AS budget_change_evidence,
    CASE
      WHEN first_payment_users_d14 < 3 THEN 'D14 첫 결제 표본 부족'
      WHEN first_payment_cac_d14_won <= period_avg_first_payment_cac_d14_won
        AND arpu_d14_won >= period_avg_arpu_d14_won
        AND roas_d14_pct >= 50
        AND (high_vs_low_delta_pp IS NULL OR high_vs_low_delta_pp >= -20)
        AND (after_scale_delta_pp IS NULL OR after_scale_delta_pp >= -15)
        THEN '첫 결제 CAC D14 낮고 ARPU D14도 높으며 물량 변화에도 버틴 신호'
      WHEN first_payment_cac_d14_won <= period_avg_first_payment_cac_d14_won
        AND arpu_d14_won >= period_avg_arpu_d14_won
        THEN '첫 결제 CAC D14와 ARPU D14는 좋지만 증액 관측은 부족'
      WHEN first_payment_cac_d14_won <= period_avg_first_payment_cac_d14_won THEN '첫 결제 CAC D14는 낮지만 ARPU D14 약함'
      WHEN arpu_d14_won >= period_avg_arpu_d14_won THEN 'ARPU D14는 높지만 첫 결제 CAC D14 높음'
      ELSE '첫 결제 CAC D14 높고 ARPU D14도 약함'
    END AS likely_reason,
    CASE
      WHEN first_payment_users_d14 < 3 THEN '관찰만'
      WHEN first_payment_cac_d14_won <= period_avg_first_payment_cac_d14_won
        AND arpu_d14_won >= period_avg_arpu_d14_won
        AND roas_d14_pct >= 50
        AND spend_manwon >= 100
        AND scale_event_days >= 1
        AND (after_scale_delta_pp IS NULL OR after_scale_delta_pp >= -15)
        AND (high_vs_low_delta_pp IS NULL OR high_vs_low_delta_pp >= -20)
        THEN '10~20% 증액 테스트'
      WHEN first_payment_cac_d14_won <= period_avg_first_payment_cac_d14_won
        AND arpu_d14_won >= period_avg_arpu_d14_won
        AND (high_vs_low_delta_pp < -20 OR after_scale_delta_pp < -15)
        THEN '상한 유지·소재/타겟 분리'
      WHEN first_payment_cac_d14_won <= period_avg_first_payment_cac_d14_won
        AND arpu_d14_won >= period_avg_arpu_d14_won
        AND roas_d14_pct >= 35
        AND spend_manwon >= 100
        THEN '5~10% 증액 테스트'
      WHEN first_payment_cac_d14_won <= period_avg_first_payment_cac_d14_won
        AND arpu_d14_won >= period_avg_arpu_d14_won
        THEN '소액 증액으로 관측'
      WHEN first_payment_cac_d14_won <= period_avg_first_payment_cac_d14_won THEN 'ARPU 개선 전 증액 금지'
      WHEN arpu_d14_won >= period_avg_arpu_d14_won THEN 'D14 첫 결제 CAC 낮춘 뒤 재판단'
      ELSE '감액/중단 검토'
    END AS next_budget_action,
    s.* EXCEPT(spend_rank)
  FROM scored AS s
)
SELECT *
FROM ledger
ORDER BY spend_rank
"""


@dataclass(frozen=True)
class Period:
    start: date
    end: date


@dataclass(frozen=True)
class Evaluation:
    key: str
    action: str
    status: str
    result: str
    reason: str
    previous: dict[str, Any]
    current: dict[str, Any] | None


def complete_period(days: int) -> Period:
    today = datetime.now(KST).date()
    end = today - timedelta(days=1)
    return Period(start=end - timedelta(days=days - 1), end=end)


def query_ledger(client: bigquery.Client, period: Period) -> list[dict[str, Any]]:
    cohort_days = (period.end - period.start).days + 1
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("end_date", "DATE", period.end),
            bigquery.ScalarQueryParameter("cohort_days", "INT64", cohort_days),
        ]
    )
    return [normalize_row(dict(row.items())) for row in client.query(LEDGER_SQL, job_config=job_config).result()]


def normalize_row(row: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for key, value in row.items():
        if isinstance(value, date):
            normalized[key] = value.isoformat()
        else:
            normalized[key] = value
    normalized["creative_id"] = creative_id(normalized)
    return normalized


def creative_id(row: dict[str, Any]) -> str:
    return "||".join(str(row.get(field) or "") for field in ("channel", "campaign", "ad_group", "creative_key"))


def as_int(value: Any) -> int:
    if value in (None, ""):
        return 0
    return int(float(value))


def as_float(value: Any) -> float:
    if value in (None, ""):
        return 0.0
    return float(value)


def won(value: Any) -> str:
    return f"{as_int(value):,}원"


def won_optional(value: Any, missing: str = "계산불가") -> str:
    if value in (None, ""):
        return missing
    return won(value)


def manwon(value: Any) -> str:
    return f"{as_int(value):,}만원"


def pct(value: Any) -> str:
    return f"{as_float(value):+.1f}%"


def pct_plain(value: Any) -> str:
    return f"{as_float(value):.1f}%"


def short_creative(row: dict[str, Any]) -> str:
    text = str(row.get("creative_key") or row.get("ad_group") or row.get("campaign") or "(unknown)")
    if len(text) <= 54:
        return text
    return text[:51] + "..."


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def action_counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in rows:
        action = str(row.get("next_budget_action") or "unknown")
        counts[action] = counts.get(action, 0) + 1
    return counts


def optimization_bucket(row: dict[str, Any]) -> str:
    payers = as_int(row.get("first_payment_users_d14"))
    if payers < 3:
        return "표본부족"

    cac = as_float(row.get("first_payment_cac_d14_won"))
    arpu = as_float(row.get("arpu_d14_won"))
    avg_cac = as_float(row.get("period_avg_first_payment_cac_d14_won"))
    avg_arpu = as_float(row.get("period_avg_arpu_d14_won"))
    low_cac = cac > 0 and avg_cac > 0 and cac <= avg_cac
    high_arpu = arpu > 0 and avg_arpu > 0 and arpu >= avg_arpu

    if low_cac and high_arpu:
        if as_float(row.get("spend_manwon")) < 100:
            return "저CAC·고ARPU·저예산"
        if scale_fragile(row):
            return "저CAC·고ARPU·증액취약"
        return "저CAC·고ARPU·확장가능"
    if low_cac:
        return "저CAC·저ARPU"
    if high_arpu:
        return "고CAC·고ARPU"
    return "고CAC·저ARPU"


def scale_fragile(row: dict[str, Any]) -> bool:
    high_vs_low = row.get("high_vs_low_delta_pp")
    after_scale = row.get("after_scale_delta_pp")
    return (
        high_vs_low not in (None, "") and as_float(high_vs_low) < -20
    ) or (
        after_scale not in (None, "") and as_float(after_scale) < -15
    )


def bucket_priority(bucket: str) -> int:
    try:
        return OPTIMIZATION_BUCKETS.index(bucket)
    except ValueError:
        return len(OPTIMIZATION_BUCKETS)


def bucket_summaries(rows: list[dict[str, Any]]) -> dict[str, dict[str, float]]:
    summaries = {
        bucket: {"count": 0, "spend": 0.0, "signups": 0.0, "payers": 0.0, "revenue": 0.0}
        for bucket in OPTIMIZATION_BUCKETS
    }
    for row in rows:
        bucket = optimization_bucket(row)
        if bucket not in summaries:
            summaries[bucket] = {"count": 0, "spend": 0.0, "signups": 0.0, "payers": 0.0, "revenue": 0.0}
        summaries[bucket]["count"] += 1
        summaries[bucket]["spend"] += as_float(row.get("spend_manwon"))
        summaries[bucket]["signups"] += as_int(row.get("signups_d14"))
        summaries[bucket]["payers"] += as_int(row.get("first_payment_users_d14"))
        summaries[bucket]["revenue"] += as_float(row.get("revenue_d14_manwon"))
    return summaries


def bucket_line(bucket: str, summary: dict[str, float]) -> str:
    spend = summary["spend"]
    payers = summary["payers"]
    revenue = summary["revenue"]
    signups = summary["signups"]
    cac = spend * 10000 / payers if payers else 0
    arpu = revenue * 10000 / signups if signups else 0
    roas = revenue / spend * 100 if spend else 0
    conversion = payers / signups * 100 if signups else 0
    if bucket == "표본부족":
        return (
            f"- {bucket}: {as_int(summary['count'])}개 / 개별 소재 첫 결제자 3명 미만 / "
            f"묶음 광고비 {manwon(spend)} / 묶음 ROAS {pct_plain(roas)} / "
            f"가입→첫결제 {pct_plain(conversion)}"
        )
    return (
        f"- {bucket}: {as_int(summary['count'])}개 / 광고비 {manwon(spend)} / "
        f"첫 결제 CAC {won(cac) if cac else '첫 결제 없음'} / "
        f"ARPU D14 {won(arpu) if arpu else '표본 없음'} / "
        f"ROAS {pct_plain(roas)} / 가입→첫결제 {pct_plain(conversion)}"
    )


def top_rows_for_bucket(rows: list[dict[str, Any]], bucket: str, limit: int) -> list[dict[str, Any]]:
    bucket_rows = [row for row in rows if optimization_bucket(row) == bucket]
    if bucket == "저CAC·고ARPU·저예산":
        return sorted(bucket_rows, key=lambda row: -as_float(row.get("roas_d14_pct")))[:limit]
    if bucket == "저CAC·고ARPU·증액취약":
        return sorted(
            bucket_rows,
            key=lambda row: min(as_float(row.get("high_vs_low_delta_pp")), as_float(row.get("after_scale_delta_pp"))),
        )[:limit]
    if bucket == "저CAC·저ARPU":
        return sorted(bucket_rows, key=lambda row: -as_float(row.get("spend_manwon")))[:limit]
    if bucket == "고CAC·저ARPU":
        return sorted(bucket_rows, key=lambda row: -as_float(row.get("spend_manwon")))[:limit]
    return sorted(bucket_rows, key=lambda row: -as_float(row.get("spend_manwon")))[:limit]


def compact_metric(row: dict[str, Any]) -> str:
    return (
        f"{short_creative(row)} / 광고비 {manwon(row.get('spend_manwon'))}, "
        f"CAC {won_optional(row.get('first_payment_cac_d14_won'), '첫 결제 없음')}, "
        f"ARPU D14 {won_optional(row.get('arpu_d14_won'), '표본 없음')}, "
        f"ARPU D30 {won_optional(row.get('arpu_d30_won'), '표본 없음')}, "
        f"ARPPU D14 {won_optional(row.get('payer_arppu_d14_won'), '표본 없음')}, "
        f"ROAS {pct_plain(row.get('roas_d14_pct'))}"
    )


def pick_plan_rows(rows: list[dict[str, Any]], scale_limit: int, reduce_limit: int) -> list[dict[str, Any]]:
    scale = [row for row in rows if row.get("next_budget_action") in SCALE_ACTIONS]
    reduce = [row for row in rows if row.get("next_budget_action") == "감액/중단 검토"]
    scale = sorted(scale, key=lambda row: (action_priority(str(row.get("next_budget_action"))), -as_float(row.get("spend_manwon"))))
    reduce = sorted(reduce, key=lambda row: -as_float(row.get("spend_manwon")))
    return [compact_plan_row(row) for row in scale[:scale_limit] + reduce[:reduce_limit]]


def action_priority(action: str) -> int:
    order = {"10~20% 증액 테스트": 1, "5~10% 증액 테스트": 2, "소액 증액으로 관측": 3}
    return order.get(action, 99)


def compact_plan_row(row: dict[str, Any]) -> dict[str, Any]:
    keys = [
        "creative_id",
        "channel",
        "campaign",
        "ad_group",
        "creative_key",
        "next_budget_action",
        "optimization_bucket",
        "likely_reason",
        "budget_change_evidence",
        "spend_manwon",
        "current_7d_spend_manwon",
        "signups_d14",
        "first_payment_users_d14",
        "first_payment_cac_d14_won",
        "arpu_d14_won",
        "arpu_d14_on_d30_cohort_won",
        "arpu_d30_won",
        "payer_arppu_d14_won",
        "payer_arppu_d30_won",
        "payer_arpu_d14_won",
        "payer_arpu_d30_won",
        "roas_d14_pct",
        "roas_d30_pct",
        "revenue_d14_manwon",
        "revenue_d30_manwon",
        "period_avg_first_payment_cac_d14_won",
        "period_avg_arpu_d14_won",
        "period_avg_payer_arppu_d14_won",
        "period_avg_payer_arpu_d14_won",
        "d14_cohort_start",
        "d14_cohort_end",
        "d30_cohort_start",
        "d30_cohort_end",
    ]
    compacted = {key: row.get(key) for key in keys}
    compacted["optimization_bucket"] = optimization_bucket(row)
    return compacted


def build_next_plan(rows: list[dict[str, Any]], period: Period, scale_limit: int, reduce_limit: int) -> dict[str, Any]:
    return {
        "period_start": period.start.isoformat(),
        "period_end": period.end.isoformat(),
        "created_at": datetime.now(KST).isoformat(),
        "recommendations": pick_plan_rows(rows, scale_limit=scale_limit, reduce_limit=reduce_limit),
    }


def evaluate_previous(previous_plan: dict[str, Any] | None, current_rows: list[dict[str, Any]]) -> list[Evaluation]:
    if not previous_plan:
        return []
    current_by_id = {row["creative_id"]: row for row in current_rows}
    evaluations: list[Evaluation] = []
    for item in previous_plan.get("recommendations") or []:
        action = str(item.get("next_budget_action") or "")
        current = current_by_id.get(str(item.get("creative_id")))
        status, result, reason = evaluate_item(item, current, action)
        evaluations.append(
            Evaluation(
                key=str(item.get("creative_id") or ""),
                action=action,
                status=status,
                result=result,
                reason=reason,
                previous=item,
                current=current,
            )
        )
    return evaluations


def evaluate_item(previous: dict[str, Any], current: dict[str, Any] | None, action: str) -> tuple[str, str, str]:
    if current is None:
        if action in REDUCE_ACTIONS:
            return "이행", "비효율 지속 관찰 종료", "이번 주 관측 집행액 0원"
        return "미이행/불명", "성과 관측 불가", "이번 주 집행 데이터 없음"

    previous_spend = as_float(previous.get("current_7d_spend_manwon") or previous.get("spend_manwon"))
    current_spend = as_float(current.get("current_7d_spend_manwon") or current.get("spend_manwon"))
    spend_delta = percentage_delta(current_spend, previous_spend)
    previous_cac = as_float(previous.get("first_payment_cac_d14_won"))
    current_cac = as_float(current.get("first_payment_cac_d14_won"))
    previous_arpu = as_float(previous.get("arpu_d14_won") or previous.get("payer_arpu_d14_won"))
    current_arpu = as_float(current.get("arpu_d14_won") or current.get("payer_arpu_d14_won"))

    if action in SCALE_ACTIONS:
        low, high = SCALE_ACTIONS[action]
        followed = low <= spend_delta <= high
        status = "이행" if followed else "미이행/범위밖"
        cac_ok = current_cac > 0 and previous_cac > 0 and current_cac <= previous_cac * 1.05
        arpu_ok = current_arpu > 0 and previous_arpu > 0 and current_arpu >= previous_arpu * 0.9
        if followed and cac_ok and arpu_ok:
            result = "증액 후 첫 결제 CAC D14 유지·ARPU D14 동반"
        elif followed and cac_ok:
            result = "증액 후 첫 결제 CAC D14는 유지, ARPU D14 추가 관찰"
        elif followed:
            result = "증액은 했지만 효율 방어 실패"
        else:
            result = "증액 지침 미검증"
        reason = (
            f"관측 집행액 {pct(spend_delta)} / "
            f"첫 결제 CAC D14 {won_optional(previous.get('first_payment_cac_d14_won'), '첫 결제 없음')}->{won_optional(current.get('first_payment_cac_d14_won'), '첫 결제 없음')} / "
            f"ARPU D14 {won_optional(previous.get('arpu_d14_won') or previous.get('payer_arpu_d14_won'), '표본 없음')}->{won_optional(current.get('arpu_d14_won') or current.get('payer_arpu_d14_won'), '표본 없음')}"
        )
        return status, result, reason

    if action in REDUCE_ACTIONS:
        followed = spend_delta <= -10.0 or current_spend == 0
        status = "이행" if followed else "미이행"
        inefficient = current_cac == 0 or current_arpu == 0 or as_float(current.get("roas_d14_pct")) < 35
        result = "감액 후 손실 제한" if followed else ("감액 안 했고 비효율 지속" if inefficient else "감액 안 했지만 일부 회복")
        reason = (
            f"관측 집행액 {pct(spend_delta)} / 첫 결제 CAC D14 {won_optional(current.get('first_payment_cac_d14_won'), '첫 결제 없음')} / "
            f"ARPU D14 {won_optional(current.get('arpu_d14_won') or current.get('payer_arpu_d14_won'), '표본 없음')} / D14 ROAS {as_float(current.get('roas_d14_pct')):.1f}%"
        )
        return status, result, reason

    if action in HOLD_ACTIONS:
        followed = -10.0 <= spend_delta <= 10.0
        status = "이행" if followed else "범위밖"
        result = "상한 유지 관측" if followed else "지출 변동 발생"
        reason = f"관측 집행액 {pct(spend_delta)}"
        return status, result, reason

    return "관찰", "판정 제외", f"행동 유형 {action}"


def percentage_delta(current: float, previous: float) -> float:
    if previous <= 0:
        return 0.0 if current <= 0 else 100.0
    return (current - previous) / previous * 100


def summarize_evaluations(evaluations: list[Evaluation]) -> dict[str, int]:
    summary = {
        "scale_followed": 0,
        "scale_not_followed": 0,
        "reduce_followed": 0,
        "reduce_not_followed": 0,
        "cac_aarpu_ok": 0,
        "inefficient_continued": 0,
    }
    for ev in evaluations:
        if ev.action in SCALE_ACTIONS:
            if ev.status == "이행":
                summary["scale_followed"] += 1
            else:
                summary["scale_not_followed"] += 1
            if "첫 결제 CAC D14 유지·ARPU D14 동반" in ev.result:
                summary["cac_aarpu_ok"] += 1
        elif ev.action in REDUCE_ACTIONS:
            if ev.status == "이행":
                summary["reduce_followed"] += 1
            else:
                summary["reduce_not_followed"] += 1
            if ev.status != "이행" and "비효율 지속" in ev.result:
                summary["inefficient_continued"] += 1
    return summary


def build_message(
    rows: list[dict[str, Any]],
    period: Period,
    evaluations: list[Evaluation],
    previous_plan: dict[str, Any] | None,
    max_lines: int,
) -> str:
    counts = action_counts(rows)
    summaries = bucket_summaries(rows)
    total_spend = sum(as_float(row.get("spend_manwon")) for row in rows)
    total_signups = sum(as_int(row.get("signups_d14")) for row in rows)
    total_payers = sum(as_int(row.get("first_payment_users_d14")) for row in rows)
    total_revenue = sum(as_float(row.get("revenue_d14_manwon")) for row in rows)
    avg_cac = first_nonzero(rows, "period_avg_first_payment_cac_d14_won")
    avg_arpu = first_nonzero(rows, "period_avg_arpu_d14_won")
    avg_arppu = first_nonzero(rows, "period_avg_payer_arppu_d14_won")
    first_row = rows[0] if rows else {}
    d14_window = f"{first_row.get('d14_cohort_start', '-')}~{first_row.get('d14_cohort_end', '-')}"
    d30_window = f"{first_row.get('d30_cohort_start', '-')}~{first_row.get('d30_cohort_end', '-')}"
    scale_rows = [row for row in rows if row.get("next_budget_action") in SCALE_ACTIONS]
    reduce_rows = [row for row in rows if row.get("next_budget_action") == "감액/중단 검토"]
    scale_rows = sorted(scale_rows, key=lambda row: (action_priority(str(row.get("next_budget_action"))), -as_float(row.get("spend_manwon"))))
    reduce_rows = sorted(reduce_rows, key=lambda row: -as_float(row.get("spend_manwon")))
    title_status = "이행 리포트" if previous_plan else "기준선 생성"
    opportunity_spend = (
        summaries["저CAC·고ARPU·확장가능"]["spend"]
        + summaries["저CAC·고ARPU·저예산"]["spend"]
    )
    caution_spend = (
        summaries["저CAC·고ARPU·증액취약"]["spend"]
        + summaries["저CAC·저ARPU"]["spend"]
        + summaries["고CAC·고ARPU"]["spend"]
        + summaries["고CAC·저ARPU"]["spend"]
    )

    lines = [
        f"*Growth ROI AI 모니터 - {title_status}*",
        f"보고 기준일: {period.end.isoformat()} KST",
        f"D14 코호트: {d14_window} / D30 코호트: {d30_window}",
        "",
        f"결론: D14 관측 가능 코호트 기준 광고비 {manwon(total_spend)}, 가입 {total_signups:,}명, 첫 결제자 {total_payers:,}명, D14 매출 {manwon(total_revenue)}입니다.",
        f"평균 첫 결제 CAC D14 {won(avg_cac)}, 가입자 기준 ARPU D14 {won(avg_arpu)}, 첫 결제자 ARPPU D14 {won(avg_arppu)} 기준으로 증액은 선별 집행만 권장합니다.",
        "",
        "*CAC·ARPU 최적화 품질*",
        (
            f"- 판단: 확장 가능/저예산 기회 예산은 {manwon(opportunity_spend)}, "
            f"증액취약·CAC착시·고CAC 재구조화 예산은 {manwon(caution_spend)}입니다."
        ),
        "- 기준: 첫 결제 CAC D14가 평균 이하인지, 가입자 기준 ARPU D14가 평균 이상인지, 증액·고지출 구간에서 ROAS가 버텼는지를 함께 봅니다.",
        bucket_line("저CAC·고ARPU·확장가능", summaries["저CAC·고ARPU·확장가능"]),
        bucket_line("저CAC·고ARPU·저예산", summaries["저CAC·고ARPU·저예산"]),
        bucket_line("저CAC·고ARPU·증액취약", summaries["저CAC·고ARPU·증액취약"]),
        bucket_line("저CAC·저ARPU", summaries["저CAC·저ARPU"]),
        bucket_line("고CAC·고ARPU", summaries["고CAC·고ARPU"]),
        bucket_line("고CAC·저ARPU", summaries["고CAC·저ARPU"]),
        bucket_line("표본부족", summaries["표본부족"]),
        "",
        "*한눈에 보는 기회·리스크*",
    ]
    top_groups = [
        ("놓친 확장 기회", "저CAC·고ARPU·저예산"),
        ("증액하면 깨질 수 있는 후보", "저CAC·고ARPU·증액취약"),
        ("CAC 착시 후보", "저CAC·저ARPU"),
        ("감액 우선 후보", "고CAC·저ARPU"),
    ]
    for title, bucket in top_groups:
        top_rows = top_rows_for_bucket(rows, bucket, limit=min(3, max_lines))
        if top_rows:
            lines.append(f"*{title}*")
            for row in top_rows:
                lines.append(f"- {compact_metric(row)}")
    lines.append("")

    if evaluations:
        summary = summarize_evaluations(evaluations)
        prev_start = previous_plan.get("period_start", "-") if previous_plan else "-"
        prev_end = previous_plan.get("period_end", "-") if previous_plan else "-"
        lines += [
            f"*지난 지침 이행 여부* ({prev_start}~{prev_end} 기준)",
            (
                f"- 증액 지침: 이행 {summary['scale_followed']}개 / 미이행·범위밖 {summary['scale_not_followed']}개. "
                f"이행 후 첫 결제 CAC D14와 ARPU D14가 같이 버틴 소재 {summary['cac_aarpu_ok']}개."
            ),
            (
                f"- 감액 지침: 이행 {summary['reduce_followed']}개 / 미이행 {summary['reduce_not_followed']}개. "
                f"감액 안 했고 비효율이 지속된 소재 {summary['inefficient_continued']}개."
            ),
        ]
        for ev in evaluations[:max_lines]:
            source = ev.current or ev.previous
            lines.append(f"- {ev.status}: {short_creative(source)} / {ev.result} / {ev.reason}")
        lines.append("")
    else:
        lines += [
            "*지난 지침 이행 여부*",
            "- 첫 실행이라 이전 기준선이 없습니다. 이번 메시지의 추천안을 저장하고 다음 주기부터 수행 여부와 결과를 비교합니다.",
            "",
        ]

    lines += [
        "*이번 주 승인 요청*",
        (
            f"- 10~20% 증액 {counts.get('10~20% 증액 테스트', 0)}개, "
            f"5~10% 증액 {counts.get('5~10% 증액 테스트', 0)}개, "
            f"소액 증액 관측 {counts.get('소액 증액으로 관측', 0)}개"
        ),
        (
            f"- 감액/중단 검토 {counts.get('감액/중단 검토', 0)}개, "
            f"ARPU 개선 전 증액 금지 {counts.get('ARPU 개선 전 증액 금지', 0)}개, "
            f"D14 첫 결제 CAC 낮춘 뒤 재판단 {counts.get('D14 첫 결제 CAC 낮춘 뒤 재판단', 0) + counts.get('CAC 낮춘 뒤 재판단', 0)}개"
        ),
    ]

    for row in scale_rows[:max_lines]:
        lines.append(
            (
                f"- 승인 후보: {row['next_budget_action']} / {short_creative(row)} / "
                f"D14 광고비 {manwon(row.get('spend_manwon'))}, 첫 결제 CAC D14 {won_optional(row.get('first_payment_cac_d14_won'), '첫 결제 없음')}, "
                f"ARPU D14 {won_optional(row.get('arpu_d14_won'), '표본 없음')}, ARPU D30 {won_optional(row.get('arpu_d30_won'), '표본 없음')}, "
                f"ARPPU D14 {won_optional(row.get('payer_arppu_d14_won'), '표본 없음')}, "
                f"D14 ROAS {as_float(row.get('roas_d14_pct')):.1f}% / "
                f"근거: {row.get('likely_reason')}"
            )
        )

    if reduce_rows:
        lines.append("*감액 후보 근거*")
        for row in reduce_rows[:max_lines]:
            lines.append(
                (
                    f"- {short_creative(row)} / D14 광고비 {manwon(row.get('spend_manwon'))}, "
                    f"첫 결제 CAC D14 {won_optional(row.get('first_payment_cac_d14_won'), '첫 결제 없음')}, "
                    f"ARPU D14 {won_optional(row.get('arpu_d14_won'), '표본 없음')}, ARPU D30 {won_optional(row.get('arpu_d30_won'), '표본 없음')}, "
                    f"ARPPU D14 {won_optional(row.get('payer_arppu_d14_won'), '표본 없음')}, "
                    f"D14 ROAS {as_float(row.get('roas_d14_pct')):.1f}% / {row.get('likely_reason')}"
                )
            )

    lines += [
        "",
        "*다음 주기 판정 기준*",
        "- 증액 후보는 관측 집행액이 권장 범위로 늘었는지, 첫 결제 CAC D14가 유지/하락했는지, 가입자 기준 ARPU D14가 90% 이상 따라왔는지 봅니다.",
        "- 감액 후보는 관측 집행액이 10% 이상 줄었는지, 줄이지 않았을 때 D14 ROAS와 가입자 기준 ARPU D14가 계속 약했는지 봅니다.",
        "- 주의: 이행 여부는 매체 예산 설정값이 아니라 BigQuery 관측 집행액 기준입니다.",
        f"Grafana: {DASHBOARD_URL}",
    ]
    return "\n".join(lines)


def first_nonzero(rows: list[dict[str, Any]], key: str) -> float:
    for row in rows:
        value = as_float(row.get(key))
        if value:
            return value
    return 0.0


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
    parser.add_argument("--lookback-days", type=int, default=30)
    parser.add_argument("--max-lines", type=int, default=6)
    parser.add_argument("--scale-limit", type=int, default=8)
    parser.add_argument("--reduce-limit", type=int, default=8)
    parser.add_argument("--save-state-on-no-slack", action="store_true", help="검증용으로 Slack 없이 상태 파일만 갱신")
    parser.add_argument("--state-file", default=os.environ.get("GROWTH_ROI_MONITOR_STATE_FILE", str(DEFAULT_STATE_FILE)))
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    state_path = Path(args.state_file)
    state = load_state(state_path)
    previous_plan = state.get("last_plan")
    period = complete_period(args.lookback_days)
    week_period = complete_period(7)
    client = bigquery.Client(project=PROJECT)
    rows = query_ledger(client, period)
    weekly_rows = query_ledger(client, week_period)
    evaluations = evaluate_previous(previous_plan, weekly_rows)
    message = build_message(rows, period, evaluations, previous_plan, max_lines=args.max_lines)
    next_plan = build_next_plan(rows, period, scale_limit=args.scale_limit, reduce_limit=args.reduce_limit)

    print(message)
    if args.no_slack:
        if args.save_state_on_no_slack:
            save_state(
                state_path,
                {
                    "thread_ts": state.get("thread_ts"),
                    "last_sent_ts": state.get("last_sent_ts"),
                    "last_sent_at": state.get("last_sent_at"),
                    "last_plan": next_plan,
                },
            )
        return 0

    token = os.environ.get("SLACK_BOT_TOKEN", "").strip()
    channel = os.environ.get("GROWTH_ROI_MONITOR_SLACK_CHANNEL", DEFAULT_SLACK_CHANNEL).strip()
    if not token:
        raise RuntimeError("SLACK_BOT_TOKEN 환경변수가 필요합니다.")
    thread_ts = state.get("thread_ts")
    ts = post_to_slack(token, channel, message, thread_ts=thread_ts)
    if not thread_ts:
        thread_ts = ts
    save_state(
        state_path,
        {
            "thread_ts": thread_ts,
            "last_sent_ts": ts,
            "last_sent_at": datetime.now(KST).isoformat(),
            "last_plan": next_plan,
        },
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"[error] {exc}", file=sys.stderr)
        raise SystemExit(1)
