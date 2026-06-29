#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Grafana 대시보드 CSV 추출 v2
Airbridge Channel/Campaign/Ad_Group 기준으로 4개 파일 재추출
- Q1: Airbridge 직접 집계 (설치→가입→체험→주문 퍼널)
- Q2-Q4: Airbridge User_ID → secure_dataset 조인 (리텐션 분석)
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
    sql_flat = re.sub(r'\s+', ' ', sql).strip()
    print(f"\n[{name}] 실행 중... (SQL {len(sql_flat)}자)")
    # bq on Windows outputs CP949 — capture as bytes, decode, re-encode as UTF-8
    r = subprocess.run(
        [BQ, "query", "--use_legacy_sql=false", "--format=csv",
         f"--project_id={PROJECT}", "--max_rows=200000", sql_flat],
        capture_output=True
    )
    stdout_text = r.stdout.decode("cp949", errors="replace")
    stderr_text = r.stderr.decode("cp949", errors="replace")
    if r.returncode != 0 or stdout_text.startswith('"Error') or stdout_text.startswith('Error'):
        print(f"  ERROR: {(stderr_text or stdout_text)[:500]}")
        return False
    with open(csv_f, "w", encoding="utf-8-sig", newline="") as f:
        f.write(stdout_text)
    with open(txt_f, "w", encoding="utf-8") as f:
        f.write(f"분석명: {name}\n")
        f.write(f"설명: {desc}\n")
        f.write(f"추출일시: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"프로젝트: {PROJECT}\n")
        f.write(f"기준: Airbridge Channel/Campaign/Ad_Group (airbridge_dataset.app_events)\n")
        f.write(f"채널매핑: google.adwords→Google, facebook.business→Meta, apple.searchads→Apple, tiktok→TikTok\n")
        f.write(f"\n=== 실행 SQL ===\n{sql}\n")
    rows = max(0, stdout_text.count("\n") - 1)
    print(f"  완료: {rows}행 → {csv_f}")
    return True


# 채널명 매핑 공통 CASE WHEN
CH_MAP = """CASE ae.Channel
  WHEN 'google.adwords'   THEN 'Google'
  WHEN 'facebook.business' THEN 'Meta'
  WHEN 'apple.searchads'  THEN 'Apple'
  WHEN 'tiktok'           THEN 'TikTok'
  ELSE ae.Channel END"""

# ──────────────────────────────────────────────────────────────────────────────
# Q1: 마케팅 퍼널 — Airbridge 직접 집계
#   Channel/Campaign/Ad_Group × 주차별 설치→가입→체험→주문 퍼널
#   기간: 최근 16주
# ──────────────────────────────────────────────────────────────────────────────
Q1 = f"""
WITH raw AS (
  SELECT
    {CH_MAP}                                                      AS channel,
    ae.Campaign                                                    AS campaign,
    ae.Ad_Group                                                    AS ad_group,
    DATE_TRUNC(PARSE_DATE('%Y-%m-%d', ae.Event_Date), WEEK(MONDAY)) AS event_week,
    ae.Airbridge_Device_ID,
    ae.Event_Category
  FROM `covering-app-ccd23.airbridge_dataset.app_events` ae
  WHERE ae.Channel IS NOT NULL
    AND ae.Channel NOT IN ('unattributed', '')
    AND ae.Ad_Group IS NOT NULL AND ae.Ad_Group != ''
    AND ae.Event_Category IN ('Install (App)','Sign-up (App)','Start Trial (App)','Order Complete (App)')
    AND ae.Event_Date >= FORMAT_DATE('%Y-%m-%d', DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 16 WEEK))
    AND ae.Event_Date <= FORMAT_DATE('%Y-%m-%d', CURRENT_DATE('Asia/Seoul'))
),
funnel AS (
  SELECT
    event_week, channel, campaign, ad_group,
    COUNT(DISTINCT CASE WHEN Event_Category = 'Install (App)'        THEN Airbridge_Device_ID END) AS installs,
    COUNT(DISTINCT CASE WHEN Event_Category = 'Sign-up (App)'        THEN Airbridge_Device_ID END) AS signups,
    COUNT(DISTINCT CASE WHEN Event_Category = 'Start Trial (App)'    THEN Airbridge_Device_ID END) AS trials,
    COUNT(DISTINCT CASE WHEN Event_Category = 'Order Complete (App)' THEN Airbridge_Device_ID END) AS orders
  FROM raw
  GROUP BY 1, 2, 3, 4
)
SELECT
  event_week,
  channel,
  campaign,
  ad_group,
  installs,
  signups,
  ROUND(SAFE_DIVIDE(signups, installs) * 100, 1)  AS signup_rate_pct,
  trials,
  ROUND(SAFE_DIVIDE(trials,  installs) * 100, 1)  AS trial_rate_pct,
  orders,
  ROUND(SAFE_DIVIDE(orders,  installs) * 100, 1)  AS order_rate_pct
FROM funnel
WHERE installs >= 10
ORDER BY event_week DESC, installs DESC
"""

# ──────────────────────────────────────────────────────────────────────────────
# 공통 CTE: Airbridge 첫 귀속 주문 (User_ID ↔ Channel/Campaign/Ad_Group)
# ──────────────────────────────────────────────────────────────────────────────
ATTR_CTE = f"""
airbridge_first AS (
  SELECT
    SAFE_CAST(ae.User_ID AS INT64)                                 AS user_id,
    {CH_MAP}                                                        AS channel,
    ae.Campaign                                                     AS campaign,
    ae.Ad_Group                                                     AS ad_group,
    ROW_NUMBER() OVER (
      PARTITION BY ae.User_ID
      ORDER BY ae.Event_Date, ae.Event_Timestamp
    ) AS rn
  FROM `covering-app-ccd23.airbridge_dataset.app_events` ae
  WHERE ae.Event_Category = 'Order Complete (App)'
    AND ae.Channel IS NOT NULL
    AND ae.Channel NOT IN ('unattributed', '')
    AND ae.Ad_Group IS NOT NULL AND ae.Ad_Group != ''
    AND ae.User_ID IS NOT NULL AND ae.User_ID != ''
    AND SAFE_CAST(ae.User_ID AS INT64) IS NOT NULL
),
attr AS (
  SELECT user_id, channel, campaign, ad_group
  FROM airbridge_first
  WHERE rn = 1
),
first_orders AS (
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
    a.user_id,
    fo.first_order_date,
    DATE_TRUNC(fo.first_order_date, WEEK(MONDAY)) AS cohort_week,
    a.channel, a.campaign, a.ad_group
  FROM attr a
  JOIN first_orders fo ON a.user_id = fo.user_id
  WHERE fo.first_order_date >= DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 16 WEEK)
    AND fo.first_order_date <= DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 30 DAY)
)"""

# ──────────────────────────────────────────────────────────────────────────────
# Q2: 실제 D30 리텐션 (첫 주문 30일 초과 재주문)
# ──────────────────────────────────────────────────────────────────────────────
Q2 = f"""
WITH
{ATTR_CTE},
reorder_check AS (
  SELECT
    cu.user_id, cu.cohort_week, cu.channel, cu.campaign, cu.ad_group,
    MAX(CASE
      WHEN DATE(o.created_at, 'Asia/Seoul') > DATE_ADD(cu.first_order_date, INTERVAL 30 DAY)
      THEN 1 ELSE 0
    END) AS retained_d30
  FROM cohort_users cu
  LEFT JOIN `covering-app-ccd23.secure_dataset.order_v2` o
    ON cu.user_id = o.user_id
    AND o.company_id IS NULL AND o.deleted_at IS NULL
    AND o.status IN ('COMPLETED','IN_PROGRESS','READY')
  GROUP BY cu.user_id, cu.cohort_week, cu.channel, cu.campaign, cu.ad_group
)
SELECT
  cohort_week, channel, campaign, ad_group,
  COUNT(*)                                                           AS total_users,
  SUM(retained_d30)                                                  AS d30_retained,
  ROUND(SAFE_DIVIDE(SUM(retained_d30)*100.0, COUNT(*)), 2)           AS d30_retention_rate_pct
FROM reorder_check
GROUP BY cohort_week, channel, campaign, ad_group
HAVING COUNT(*) >= 5
ORDER BY cohort_week, channel, campaign, ad_group
"""

# ──────────────────────────────────────────────────────────────────────────────
# Q3: 리텐션 선행지표 4종
# ──────────────────────────────────────────────────────────────────────────────
Q3 = f"""
WITH
{ATTR_CTE},
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
    cu.user_id, cu.cohort_week, cu.channel, cu.campaign, cu.ad_group,
    MAX(CASE WHEN oa.order_date > cu.first_order_date
             AND DATE_DIFF(oa.order_date, cu.first_order_date, DAY) <= 7
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
  GROUP BY cu.user_id, cu.cohort_week, cu.channel, cu.campaign, cu.ad_group
)
SELECT
  cohort_week, channel, campaign, ad_group,
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
GROUP BY cohort_week, channel, campaign, ad_group
HAVING COUNT(*) >= 5
ORDER BY cohort_week, channel, campaign, ad_group
"""

# ──────────────────────────────────────────────────────────────────────────────
# Q4: 선행지표 스코어(0~4) vs 실제 D30 리텐션
# ──────────────────────────────────────────────────────────────────────────────
Q4 = f"""
WITH
{ATTR_CTE},
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
    cu.user_id, cu.channel, cu.campaign, cu.ad_group,
    MAX(CASE WHEN oa.order_date > cu.first_order_date
             AND DATE_DIFF(oa.order_date, cu.first_order_date, DAY) <= 7
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
  GROUP BY cu.user_id, cu.channel, cu.campaign, cu.ad_group
),
with_score AS (
  SELECT
    *,
    ind1 + ind2 + ind3 + ind4                AS leading_score,
    (ind1 + ind2 + ind3 + ind4) >= 2         AS predicted_retain
  FROM user_raw
)
SELECT
  channel, campaign, ad_group,
  leading_score,
  predicted_retain,
  COUNT(*)                                                   AS user_count,
  SUM(retained_d30)                                          AS retained_count,
  ROUND(SAFE_DIVIDE(SUM(retained_d30)*100.0, COUNT(*)), 2)   AS actual_d30_retention_pct
FROM with_score
GROUP BY channel, campaign, ad_group, leading_score, predicted_retain
ORDER BY channel, campaign, ad_group, leading_score
"""

QUERIES = [
    ("marketing_conversion_funnel",  Q1,
     "Airbridge 기준 마케팅 퍼널 | Channel/Campaign/Ad_Group × 주차별 설치/가입/체험/주문 | 최근 16주 | installs>=10"),
    ("d30_retention_actual",         Q2,
     "실제 D30 리텐션 | Airbridge 귀속 첫 주문 기준 → secure_dataset 재주문 추적 | 30일 초과 재주문 여부 | n>=5"),
    ("retention_leading_indicators", Q3,
     "D30 리텐션 선행지표 4종 | ind1=D7재주문, ind2=D14재주문, ind3=30일내3회+, ind4=구독활성 | n>=5"),
    ("prediction_vs_actual",         Q4,
     "선행지표 스코어(0-4) vs 실제 D30 리텐션 | 임계값: score>=2 → predicted_retain=TRUE"),
]

print(f"=== Grafana 대시보드 CSV 추출 v2 ({TS}) ===")
print(f"[기준] Airbridge Channel/Campaign/Ad_Group × secure_dataset 리텐션 조인")
print(f"[기간] 최근 16주 코호트, D30 경과 완료 기준\n")

ok = 0
for name, sql, desc in QUERIES:
    if run(name, sql, desc):
        ok += 1

print(f"\n=== 완료: {ok}/{len(QUERIES)}개 파일 추출 ===")
