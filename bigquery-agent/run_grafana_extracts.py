#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Grafana 대시보드 CSV 추출 스크립트
short_link_id 없음 → signup_referral_channel을 campaign_name으로 대체
"""
import subprocess, sys, os, re
from datetime import datetime

BQ = r"C:\Users\hound\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\bq.cmd"
PROJECT = "covering-app-ccd23"
TS = datetime.now().strftime("%Y%m%d_%H%M%S")
OUT = "datas"
os.makedirs(OUT, exist_ok=True)

def run(name, sql, desc):
    csv_f = os.path.join(OUT, f"{TS}_{name}.csv")
    txt_f = os.path.join(OUT, f"{TS}_{name}.txt")
    print(f"\n[{name}] 실행 중...")
    sql_flat = re.sub(r'\s+', ' ', sql).strip()
    r = subprocess.run(
        [BQ, "query", "--use_legacy_sql=false", "--format=csv",
         f"--project_id={PROJECT}", "--max_rows=100000", sql_flat],
        capture_output=True, text=True, encoding="utf-8", errors="replace"
    )
    if r.returncode != 0:
        print(f"  ERROR:\n{r.stderr[:800]}")
        return False
    with open(csv_f, "w", encoding="utf-8-sig", newline="") as f:
        f.write(r.stdout)
    with open(txt_f, "w", encoding="utf-8") as f:
        f.write(f"분석명: {name}\n")
        f.write(f"설명: {desc}\n")
        f.write(f"추출일시: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"프로젝트: {PROJECT}\n")
        f.write(f"비고: short_link_id 없음 → user.signup_referral_channel 대체\n")
        f.write(f"\n=== 실행 SQL ===\n{sql}\n")
    rows = max(0, r.stdout.count("\n") - 1)
    print(f"  완료: {rows}행 → {csv_f}")
    return True


# ──────────────────────────────────────────────────────────────────────────────
# Q1: 마케팅 채널별 코호트 전환 퍼널 (가입 → 첫 주문 D1/D3/D7/D14/D30/D60)
# ──────────────────────────────────────────────────────────────────────────────
Q1 = """
WITH signup_cohorts AS (
  SELECT
    u.id AS user_id,
    DATE(u.created_date) AS signup_date,
    DATE_TRUNC(DATE(u.created_date), WEEK(MONDAY)) AS cohort_week,
    COALESCE(NULLIF(TRIM(u.signup_referral_channel), ''), 'organic') AS campaign_name
  FROM `covering-app-ccd23.secure_dataset.user` u
  WHERE u.withdrawal_date IS NULL
    AND DATE(u.created_date) >= DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 16 WEEK)
    AND DATE(u.created_date) <= DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 30 DAY)
),
first_orders AS (
  SELECT
    o.user_id,
    MIN(DATE(o.created_at, 'Asia/Seoul')) AS first_order_date
  FROM `covering-app-ccd23.secure_dataset.order_v2` o
  WHERE o.company_id IS NULL
    AND o.deleted_at IS NULL
    AND o.status IN ('COMPLETED','IN_PROGRESS','READY','CREATED')
  GROUP BY o.user_id
)
SELECT
  s.cohort_week,
  s.campaign_name,
  COUNT(DISTINCT s.user_id)                                                                         AS cohort_size,
  COUNT(DISTINCT fo.user_id)                                                                        AS ever_ordered,
  ROUND(SAFE_DIVIDE(COUNT(DISTINCT fo.user_id)*100.0,         COUNT(DISTINCT s.user_id)),2)         AS overall_conversion_pct,
  COUNT(DISTINCT CASE WHEN DATE_DIFF(fo.first_order_date, s.signup_date, DAY) <=  1 THEN s.user_id END) AS d1_orders,
  COUNT(DISTINCT CASE WHEN DATE_DIFF(fo.first_order_date, s.signup_date, DAY) <=  3 THEN s.user_id END) AS d3_orders,
  COUNT(DISTINCT CASE WHEN DATE_DIFF(fo.first_order_date, s.signup_date, DAY) <=  7 THEN s.user_id END) AS d7_orders,
  COUNT(DISTINCT CASE WHEN DATE_DIFF(fo.first_order_date, s.signup_date, DAY) <= 14 THEN s.user_id END) AS d14_orders,
  COUNT(DISTINCT CASE WHEN DATE_DIFF(fo.first_order_date, s.signup_date, DAY) <= 30 THEN s.user_id END) AS d30_orders,
  COUNT(DISTINCT CASE WHEN DATE_DIFF(fo.first_order_date, s.signup_date, DAY) <= 60 THEN s.user_id END) AS d60_orders,
  ROUND(SAFE_DIVIDE(COUNT(DISTINCT CASE WHEN DATE_DIFF(fo.first_order_date, s.signup_date, DAY) <=  1 THEN s.user_id END)*100.0, COUNT(DISTINCT s.user_id)),2) AS d1_rate_pct,
  ROUND(SAFE_DIVIDE(COUNT(DISTINCT CASE WHEN DATE_DIFF(fo.first_order_date, s.signup_date, DAY) <=  3 THEN s.user_id END)*100.0, COUNT(DISTINCT s.user_id)),2) AS d3_rate_pct,
  ROUND(SAFE_DIVIDE(COUNT(DISTINCT CASE WHEN DATE_DIFF(fo.first_order_date, s.signup_date, DAY) <=  7 THEN s.user_id END)*100.0, COUNT(DISTINCT s.user_id)),2) AS d7_rate_pct,
  ROUND(SAFE_DIVIDE(COUNT(DISTINCT CASE WHEN DATE_DIFF(fo.first_order_date, s.signup_date, DAY) <= 14 THEN s.user_id END)*100.0, COUNT(DISTINCT s.user_id)),2) AS d14_rate_pct,
  ROUND(SAFE_DIVIDE(COUNT(DISTINCT CASE WHEN DATE_DIFF(fo.first_order_date, s.signup_date, DAY) <= 30 THEN s.user_id END)*100.0, COUNT(DISTINCT s.user_id)),2) AS d30_rate_pct,
  ROUND(SAFE_DIVIDE(COUNT(DISTINCT CASE WHEN DATE_DIFF(fo.first_order_date, s.signup_date, DAY) <= 60 THEN s.user_id END)*100.0, COUNT(DISTINCT s.user_id)),2) AS d60_rate_pct
FROM signup_cohorts s
LEFT JOIN first_orders fo ON s.user_id = fo.user_id
GROUP BY s.cohort_week, s.campaign_name
ORDER BY s.cohort_week, s.campaign_name
"""

# ──────────────────────────────────────────────────────────────────────────────
# Q2: 실제 D30 리텐션 — 첫 주문 후 30일 초과 시점에 재주문 (COMPLETED/IN_PROGRESS/READY)
# ──────────────────────────────────────────────────────────────────────────────
Q2 = """
WITH first_orders AS (
  SELECT
    o.user_id,
    MIN(DATE(o.created_at, 'Asia/Seoul')) AS first_order_date
  FROM `covering-app-ccd23.secure_dataset.order_v2` o
  WHERE o.company_id IS NULL AND o.deleted_at IS NULL
    AND o.status IN ('COMPLETED','IN_PROGRESS','READY')
  GROUP BY o.user_id
),
cohort_users AS (
  SELECT
    fo.user_id, fo.first_order_date,
    DATE_TRUNC(fo.first_order_date, WEEK(MONDAY)) AS cohort_week,
    COALESCE(NULLIF(TRIM(u.signup_referral_channel), ''), 'organic') AS campaign_name
  FROM first_orders fo
  JOIN `covering-app-ccd23.secure_dataset.user` u ON fo.user_id = u.id
  WHERE fo.first_order_date >= DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 16 WEEK)
    AND fo.first_order_date <= DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 30 DAY)
),
reorder_check AS (
  SELECT
    cu.user_id, cu.cohort_week, cu.campaign_name,
    MAX(CASE
      WHEN DATE(o.created_at, 'Asia/Seoul') > DATE_ADD(cu.first_order_date, INTERVAL 30 DAY)
      THEN 1 ELSE 0
    END) AS retained_d30
  FROM cohort_users cu
  LEFT JOIN `covering-app-ccd23.secure_dataset.order_v2` o
    ON cu.user_id = o.user_id
    AND o.company_id IS NULL
    AND o.deleted_at IS NULL
    AND o.status IN ('COMPLETED','IN_PROGRESS','READY')
  GROUP BY cu.user_id, cu.cohort_week, cu.campaign_name
)
SELECT
  cohort_week,
  campaign_name,
  COUNT(*)                                                          AS total_first_order_users,
  SUM(retained_d30)                                                 AS d30_retained,
  ROUND(SAFE_DIVIDE(SUM(retained_d30)*100.0, COUNT(*)), 2)          AS d30_retention_rate_pct
FROM reorder_check
GROUP BY cohort_week, campaign_name
ORDER BY cohort_week, campaign_name
"""

# ──────────────────────────────────────────────────────────────────────────────
# Q3: D30 리텐션 선행지표 4종 (코호트×캠페인별)
#   ind1: 첫 주문 후 7일 이내 재주문
#   ind2: 첫 주문 후 14일 이내 재주문
#   ind3: 첫 30일 내 3회 이상 주문
#   ind4: 첫 주문 후 30일 이내 구독 활성화
# ──────────────────────────────────────────────────────────────────────────────
Q3 = """
WITH first_orders AS (
  SELECT
    o.user_id,
    MIN(DATE(o.created_at, 'Asia/Seoul')) AS first_order_date
  FROM `covering-app-ccd23.secure_dataset.order_v2` o
  WHERE o.company_id IS NULL AND o.deleted_at IS NULL
    AND o.status IN ('COMPLETED','IN_PROGRESS','READY')
  GROUP BY o.user_id
),
cohort_users AS (
  SELECT
    fo.user_id, fo.first_order_date,
    DATE_TRUNC(fo.first_order_date, WEEK(MONDAY)) AS cohort_week,
    COALESCE(NULLIF(TRIM(u.signup_referral_channel), ''), 'organic') AS campaign_name
  FROM first_orders fo
  JOIN `covering-app-ccd23.secure_dataset.user` u ON fo.user_id = u.id
  WHERE fo.first_order_date >= DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 16 WEEK)
    AND fo.first_order_date <= DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 30 DAY)
),
order_activity AS (
  SELECT o.user_id, DATE(o.created_at, 'Asia/Seoul') AS order_date
  FROM `covering-app-ccd23.secure_dataset.order_v2` o
  WHERE o.company_id IS NULL AND o.deleted_at IS NULL
    AND o.status IN ('COMPLETED','IN_PROGRESS','READY')
),
sub_dates AS (
  SELECT user_id, MIN(DATE(created_at)) AS first_sub_date
  FROM `covering-app-ccd23.secure_dataset.subscription`
  GROUP BY user_id
),
user_indicators AS (
  SELECT
    cu.user_id, cu.cohort_week, cu.campaign_name,
    MAX(CASE WHEN oa.order_date > cu.first_order_date
             AND DATE_DIFF(oa.order_date, cu.first_order_date, DAY) <=  7
             THEN 1 ELSE 0 END)                                      AS ind_reorder_d7,
    MAX(CASE WHEN oa.order_date > cu.first_order_date
             AND DATE_DIFF(oa.order_date, cu.first_order_date, DAY) <= 14
             THEN 1 ELSE 0 END)                                      AS ind_reorder_d14,
    CASE WHEN COUNT(DISTINCT CASE
           WHEN oa.order_date >= cu.first_order_date
            AND DATE_DIFF(oa.order_date, cu.first_order_date, DAY) <= 30
           THEN oa.order_date END) >= 3 THEN 1 ELSE 0 END            AS ind_3plus_d30,
    MAX(CASE WHEN sd.first_sub_date IS NOT NULL
             AND sd.first_sub_date >= cu.first_order_date
             AND DATE_DIFF(sd.first_sub_date, cu.first_order_date, DAY) <= 30
             THEN 1 ELSE 0 END)                                      AS ind_subscribed_d30
  FROM cohort_users cu
  LEFT JOIN order_activity oa ON cu.user_id = oa.user_id
  LEFT JOIN sub_dates sd ON cu.user_id = sd.user_id
  GROUP BY cu.user_id, cu.cohort_week, cu.campaign_name
)
SELECT
  cohort_week,
  campaign_name,
  COUNT(*)                                                               AS total_users,
  SUM(ind_reorder_d7)                                                    AS reorder_d7_users,
  ROUND(SAFE_DIVIDE(SUM(ind_reorder_d7)*100.0,     COUNT(*)), 2)         AS reorder_d7_pct,
  SUM(ind_reorder_d14)                                                   AS reorder_d14_users,
  ROUND(SAFE_DIVIDE(SUM(ind_reorder_d14)*100.0,    COUNT(*)), 2)         AS reorder_d14_pct,
  SUM(ind_3plus_d30)                                                     AS orders_3plus_users,
  ROUND(SAFE_DIVIDE(SUM(ind_3plus_d30)*100.0,      COUNT(*)), 2)         AS orders_3plus_pct,
  SUM(ind_subscribed_d30)                                                AS subscribed_d30_users,
  ROUND(SAFE_DIVIDE(SUM(ind_subscribed_d30)*100.0, COUNT(*)), 2)         AS subscribed_d30_pct
FROM user_indicators
GROUP BY cohort_week, campaign_name
ORDER BY cohort_week, campaign_name
"""

# ──────────────────────────────────────────────────────────────────────────────
# Q4: 선행지표 스코어(0~4) vs 실제 D30 리텐션 교차 검증
#   score >= 2 → predicted_retain = TRUE
# ──────────────────────────────────────────────────────────────────────────────
Q4 = """
WITH first_orders AS (
  SELECT
    o.user_id,
    MIN(DATE(o.created_at, 'Asia/Seoul')) AS first_order_date
  FROM `covering-app-ccd23.secure_dataset.order_v2` o
  WHERE o.company_id IS NULL AND o.deleted_at IS NULL
    AND o.status IN ('COMPLETED','IN_PROGRESS','READY')
  GROUP BY o.user_id
),
cohort_users AS (
  SELECT
    fo.user_id, fo.first_order_date,
    COALESCE(NULLIF(TRIM(u.signup_referral_channel), ''), 'organic') AS campaign_name
  FROM first_orders fo
  JOIN `covering-app-ccd23.secure_dataset.user` u ON fo.user_id = u.id
  WHERE fo.first_order_date >= DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 16 WEEK)
    AND fo.first_order_date <= DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 30 DAY)
),
order_activity AS (
  SELECT o.user_id, DATE(o.created_at, 'Asia/Seoul') AS order_date
  FROM `covering-app-ccd23.secure_dataset.order_v2` o
  WHERE o.company_id IS NULL AND o.deleted_at IS NULL
    AND o.status IN ('COMPLETED','IN_PROGRESS','READY')
),
sub_dates AS (
  SELECT user_id, MIN(DATE(created_at)) AS first_sub_date
  FROM `covering-app-ccd23.secure_dataset.subscription`
  GROUP BY user_id
),
user_raw AS (
  SELECT
    cu.user_id, cu.campaign_name,
    MAX(CASE WHEN oa.order_date > cu.first_order_date
             AND DATE_DIFF(oa.order_date, cu.first_order_date, DAY) <=  7
             THEN 1 ELSE 0 END)                                     AS ind1,
    MAX(CASE WHEN oa.order_date > cu.first_order_date
             AND DATE_DIFF(oa.order_date, cu.first_order_date, DAY) <= 14
             THEN 1 ELSE 0 END)                                     AS ind2,
    CASE WHEN COUNT(DISTINCT CASE
           WHEN oa.order_date >= cu.first_order_date
            AND DATE_DIFF(oa.order_date, cu.first_order_date, DAY) <= 30
           THEN oa.order_date END) >= 3 THEN 1 ELSE 0 END           AS ind3,
    MAX(CASE WHEN sd.first_sub_date IS NOT NULL
             AND sd.first_sub_date >= cu.first_order_date
             AND DATE_DIFF(sd.first_sub_date, cu.first_order_date, DAY) <= 30
             THEN 1 ELSE 0 END)                                     AS ind4,
    MAX(CASE WHEN oa.order_date > DATE_ADD(cu.first_order_date, INTERVAL 30 DAY)
             THEN 1 ELSE 0 END)                                     AS retained_d30
  FROM cohort_users cu
  LEFT JOIN order_activity oa ON cu.user_id = oa.user_id
  LEFT JOIN sub_dates sd ON cu.user_id = sd.user_id
  GROUP BY cu.user_id, cu.campaign_name
),
with_score AS (
  SELECT
    *,
    ind1 + ind2 + ind3 + ind4                               AS leading_score,
    (ind1 + ind2 + ind3 + ind4) >= 2                        AS predicted_retain
  FROM user_raw
)
SELECT
  leading_score,
  predicted_retain,
  campaign_name,
  COUNT(*)                                                   AS user_count,
  SUM(retained_d30)                                          AS retained_count,
  ROUND(SAFE_DIVIDE(SUM(retained_d30)*100.0, COUNT(*)), 2)   AS actual_d30_retention_pct
FROM with_score
GROUP BY leading_score, predicted_retain, campaign_name
ORDER BY campaign_name, leading_score
"""

QUERIES = [
    ("marketing_conversion_funnel",  Q1,
     "마케팅 채널별 코호트 전환 퍼널 (가입→첫주문 D1/D3/D7/D14/D30/D60) | 최근 16주 코호트, D30 경과 기준"),
    ("d30_retention_actual",         Q2,
     "실제 D30 리텐션: 첫 주문 후 30일 초과 시점 재주문 여부 (B2C 기준)"),
    ("retention_leading_indicators", Q3,
     "D30 리텐션 선행지표 4종 집계 | ind1=D7재주문, ind2=D14재주문, ind3=30일내3회+, ind4=구독활성"),
    ("prediction_vs_actual",         Q4,
     "선행지표 스코어(0-4) vs 실제 D30 리텐션 교차검증 | 임계값: score>=2 → predicted_retain=TRUE"),
]

print(f"=== Grafana 대시보드 CSV 추출 ({TS}) ===")
print(f"[주의] short_link_id 컬럼 미존재 → user.signup_referral_channel 을 campaign_name으로 대체")
print(f"[기준] B2C 전용 (company_id IS NULL) | 최근 16주 코호트 | D30 경과 완료 코호트만 포함\n")

ok = 0
for name, sql, desc in QUERIES:
    if run(name, sql, desc):
        ok += 1

print(f"\n=== 완료: {ok}/{len(QUERIES)}개 파일 추출 ===")
