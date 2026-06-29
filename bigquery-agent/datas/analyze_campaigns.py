# -*- coding: utf-8 -*-
import sys
import json
import csv
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')
from google.cloud import bigquery

client = bigquery.Client(project='covering-app-ccd23')

# ────────────────────────────────────────────────────────
# 1. 매체 데이터 (daily_cost_creative)
# ────────────────────────────────────────────────────────

# 천안아산 주목
q_jm = """
SELECT
  date, channel, campaign, ad_group, ad_creative,
  impressions, clicks, app_installs, cost, cpi, roas
FROM `covering-app-ccd23.ads_data.daily_cost_creative`
WHERE date BETWEEN '2026-03-18' AND '2026-04-26'
  AND (
    (LOWER(ad_group) LIKE '%주목%' AND (LOWER(ad_group) LIKE '%천안%' OR LOWER(ad_group) LIKE '%아산%'))
    OR LOWER(ad_group) LIKE '%주목하세요%천안%'
  )
ORDER BY date
"""

# 대전세종청주 신주목
q_sjm = """
SELECT
  date, channel, campaign, ad_group, ad_creative,
  impressions, clicks, app_installs, cost, cpi, roas
FROM `covering-app-ccd23.ads_data.daily_cost_creative`
WHERE date BETWEEN '2026-04-03' AND '2026-04-26'
  AND (
    LOWER(ad_group) LIKE '%신주목%'
    OR (LOWER(campaign) LIKE '%대전세종청주%')
    OR (LOWER(ad_group) LIKE '%신주목%대형폐기물%')
  )
ORDER BY date
"""

print("=== [1] 천안아산 주목 매체 데이터 (3/18~4/26) ===")
jm_rows = list(client.query(q_jm))
print(f"총 {len(jm_rows)}행")

print("\n=== [2] 대전세종청주 신주목 매체 데이터 (4/3~4/26) ===")
sjm_rows = list(client.query(q_sjm))
print(f"총 {len(sjm_rows)}행")

# ────────────────────────────────────────────────────────
# 2. 집계: 소재그룹별 합산
# ────────────────────────────────────────────────────────

def aggregate(rows, label):
    from collections import defaultdict
    agg = defaultdict(lambda: {"impressions":0,"clicks":0,"app_installs":0,"cost":0.0})
    for r in rows:
        key = r["ad_group"] or "(없음)"
        agg[key]["impressions"] += r["impressions"] or 0
        agg[key]["clicks"]      += r["clicks"] or 0
        agg[key]["app_installs"]+= r["app_installs"] or 0
        agg[key]["cost"]        += r["cost"] or 0

    results = []
    total_imp = sum(v["impressions"] for v in agg.values())
    total_clk = sum(v["clicks"] for v in agg.values())
    total_ins = sum(v["app_installs"] for v in agg.values())
    total_cost= sum(v["cost"] for v in agg.values())

    print(f"\n[{label}] 소재그룹별 집계")
    print(f"{'광고그룹':<55} {'노출':>8} {'클릭':>7} {'설치':>6} {'비용':>10} {'CTR':>6} {'설치율':>7} {'CPI':>8}")
    for ad_group, v in sorted(agg.items(), key=lambda x: -x[1]["cost"]):
        ctr = v["clicks"]/v["impressions"]*100 if v["impressions"] else 0
        cvr = v["app_installs"]/v["clicks"]*100 if v["clicks"] else 0
        cpi = v["cost"]/v["app_installs"] if v["app_installs"] else 0
        print(f"{ad_group[:55]:<55} {v['impressions']:>8,.0f} {v['clicks']:>7,.0f} {v['app_installs']:>6,.0f} {v['cost']:>10,.0f} {ctr:>5.2f}% {cvr:>6.2f}% {cpi:>8,.0f}")
        results.append({
            "label": label, "ad_group": ad_group,
            **v, "CTR": round(ctr,2), "CVR_install": round(cvr,2),
            "CPI": round(cpi,0)
        })
    print(f"\n합계: 노출 {total_imp:,.0f} | 클릭 {total_clk:,.0f} | 설치 {total_ins:,.0f} | 비용 {total_cost:,.0f}원")
    print(f"전체 CTR: {total_clk/total_imp*100:.2f}%" if total_imp else "전체 CTR: N/A")
    print(f"전체 설치율: {total_ins/total_clk*100:.2f}%" if total_clk else "전체 설치율: N/A")
    print(f"전체 CPI: {total_cost/total_ins:,.0f}원" if total_ins else "전체 CPI: N/A")
    return results, {"impressions":total_imp,"clicks":total_clk,"app_installs":total_ins,"cost":total_cost}

jm_agg,  jm_total  = aggregate(jm_rows,  "천안아산 주목")
sjm_agg, sjm_total = aggregate(sjm_rows, "대전세종청주 신주목")

# ────────────────────────────────────────────────────────
# 3. MMP 데이터 (user_acquisition_channel)
# ────────────────────────────────────────────────────────
q_mmp_jm = """
SELECT
  ad_channel, ad_campaign,
  COUNT(DISTINCT user_id) AS installs,
  MIN(airbridge_signup_time) AS first_install,
  MAX(airbridge_signup_time) AS last_install
FROM `covering-app-ccd23.ads_data.user_acquisition_channel`
WHERE signup_date BETWEEN '2026-03-18' AND '2026-04-26'
  AND (
    LOWER(ad_campaign) LIKE '%주목%천안%'
    OR LOWER(ad_campaign) LIKE '%주목%아산%'
    OR LOWER(ad_campaign) LIKE '%주목하세요%천안%'
    OR LOWER(ad_campaign) LIKE '%천안%주목%'
    OR LOWER(ad_campaign) LIKE '%아산%주목%'
  )
GROUP BY ad_channel, ad_campaign
ORDER BY installs DESC
"""

q_mmp_sjm = """
SELECT
  ad_channel, ad_campaign,
  COUNT(DISTINCT user_id) AS installs,
  MIN(airbridge_signup_time) AS first_install,
  MAX(airbridge_signup_time) AS last_install
FROM `covering-app-ccd23.ads_data.user_acquisition_channel`
WHERE signup_date BETWEEN '2026-04-03' AND '2026-04-26'
  AND (
    LOWER(ad_campaign) LIKE '%신주목%'
    OR LOWER(ad_campaign) LIKE '%대전세종청주%'
  )
GROUP BY ad_channel, ad_campaign
ORDER BY installs DESC
"""

print("\n=== [3] 천안아산 주목 MMP 데이터 (Airbridge) ===")
mmp_jm = list(client.query(q_mmp_jm))
if mmp_jm:
    for r in mmp_jm:
        print(f"  채널: {r['ad_channel']} | 캠페인: {r['ad_campaign']} | 설치: {r['installs']}")
    jm_mmp_total = sum(r['installs'] for r in mmp_jm)
    print(f"  MMP 총 설치: {jm_mmp_total}")
else:
    print("  결과 없음 — 캠페인명 매칭 안됨")

print("\n=== [4] 대전세종청주 신주목 MMP 데이터 (Airbridge) ===")
mmp_sjm = list(client.query(q_mmp_sjm))
if mmp_sjm:
    for r in mmp_sjm:
        print(f"  채널: {r['ad_channel']} | 캠페인: {r['ad_campaign']} | 설치: {r['installs']}")
    sjm_mmp_total = sum(r['installs'] for r in mmp_sjm)
    print(f"  MMP 총 설치: {sjm_mmp_total}")
else:
    print("  결과 없음 — 캠페인명 매칭 안됨")

# ────────────────────────────────────────────────────────
# 4. MMP 넓은 범위로 재탐색 (매칭 안 될 경우)
# ────────────────────────────────────────────────────────
print("\n=== [5] MMP 캠페인명 전체 목록 (3/18~4/26) ===")
q_mmp_all = """
SELECT DISTINCT ad_campaign, ad_channel, COUNT(DISTINCT user_id) as installs
FROM `covering-app-ccd23.ads_data.user_acquisition_channel`
WHERE signup_date BETWEEN '2026-03-18' AND '2026-04-26'
GROUP BY ad_campaign, ad_channel
ORDER BY installs DESC
LIMIT 50
"""
mmp_all = list(client.query(q_mmp_all))
for r in mmp_all:
    print(f"  [{r['ad_channel']}] {r['ad_campaign']} → {r['installs']}건")

# ────────────────────────────────────────────────────────
# 5. 실제 주문 전환 (MMP 유저 → order_v2 확인)
# ────────────────────────────────────────────────────────
print("\n=== [6] 천안아산 주목 유입 유저의 주문 전환 ===")
q_order_jm = """
WITH mmp_users AS (
  SELECT DISTINCT user_id
  FROM `covering-app-ccd23.ads_data.user_acquisition_channel`
  WHERE signup_date BETWEEN '2026-03-18' AND '2026-04-26'
    AND (
      LOWER(ad_campaign) LIKE '%주목%천안%'
      OR LOWER(ad_campaign) LIKE '%주목%아산%'
      OR LOWER(ad_campaign) LIKE '%주목하세요%천안%'
    )
)
SELECT
  COUNT(DISTINCT m.user_id) AS mmp_users,
  COUNT(DISTINCT o.user_id) AS converted_users,
  COUNT(DISTINCT o.id) AS total_orders,
  ROUND(COUNT(DISTINCT o.user_id) * 100.0 / NULLIF(COUNT(DISTINCT m.user_id), 0), 1) AS cvr_pct
FROM mmp_users m
LEFT JOIN `covering-app-ccd23.secure_dataset.order_v2` o
  ON m.user_id = o.user_id
  AND DATE(o.created_at) BETWEEN '2026-03-18' AND '2026-04-26'
  AND o.deleted_at IS NULL
"""

print("\n=== [7] 대전세종청주 신주목 유입 유저의 주문 전환 ===")
q_order_sjm = """
WITH mmp_users AS (
  SELECT DISTINCT user_id
  FROM `covering-app-ccd23.ads_data.user_acquisition_channel`
  WHERE signup_date BETWEEN '2026-04-03' AND '2026-04-26'
    AND (
      LOWER(ad_campaign) LIKE '%신주목%'
      OR LOWER(ad_campaign) LIKE '%대전세종청주%'
    )
)
SELECT
  COUNT(DISTINCT m.user_id) AS mmp_users,
  COUNT(DISTINCT o.user_id) AS converted_users,
  COUNT(DISTINCT o.id) AS total_orders,
  ROUND(COUNT(DISTINCT o.user_id) * 100.0 / NULLIF(COUNT(DISTINCT m.user_id), 0), 1) AS cvr_pct
FROM mmp_users m
LEFT JOIN `covering-app-ccd23.secure_dataset.order_v2` o
  ON m.user_id = o.user_id
  AND DATE(o.created_at) BETWEEN '2026-04-03' AND '2026-04-26'
  AND o.deleted_at IS NULL
"""

try:
    r_jm_order = list(client.query(q_order_jm))[0]
    print(f"천안아산 주목: MMP유저 {r_jm_order['mmp_users']} → 주문전환 {r_jm_order['converted_users']}명 ({r_jm_order['cvr_pct']}%) | 총주문 {r_jm_order['total_orders']}건")
except Exception as e:
    print(f"주문전환 조회 오류: {e}")

try:
    r_sjm_order = list(client.query(q_order_sjm))[0]
    print(f"대전세종청주 신주목: MMP유저 {r_sjm_order['mmp_users']} → 주문전환 {r_sjm_order['converted_users']}명 ({r_sjm_order['cvr_pct']}%) | 총주문 {r_sjm_order['total_orders']}건")
except Exception as e:
    print(f"주문전환 조회 오류: {e}")

print("\n=== 완료 ===")
