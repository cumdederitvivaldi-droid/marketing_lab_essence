# -*- coding: utf-8 -*-
"""
통합 분석 쿼리 실행 스크립트
Reference_Mapping_Guide.md의 3개 쿼리를 실행하고 datas/에 저장
"""

import sys
import csv
import os
from datetime import datetime

sys.stdout.reconfigure(encoding="utf-8")
from google.cloud import bigquery

client = bigquery.Client(project="covering-app-ccd23")

DATE_START = "2026-04-01"
DATE_END   = "2026-04-29"
FB_CHANNEL = "facebook.business"   # daily_cost_creative.channel 실제 값

os.makedirs("datas", exist_ok=True)
ts = datetime.now().strftime("%Y%m%d_%H%M%S")


def run_query(label: str, sql: str) -> list:
    print(f"\n{'='*60}")
    print(f"[{label}] 실행 중...")
    try:
        rows = list(client.query(sql))
        print(f"  → {len(rows)}행 반환")
        return rows
    except Exception as e:
        print(f"  ⚠️  오류: {e}")
        return []


def save_csv(rows: list, filename: str, fieldnames: list):
    with open(filename, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row[k] for k in fieldnames})
    print(f"  → 저장: {filename}")


def save_txt(content: str, filename: str):
    with open(filename, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  → 저장: {filename}")


# ──────────────────────────────────────────────────────────────
# Q1. 캠페인 단위 통합 성과
#     매체 비용 + Airbridge 귀속 유저 + 실주문 전환
# ──────────────────────────────────────────────────────────────
Q1 = f"""
WITH
media AS (
  SELECT
    campaign,
    SUM(cost)           AS total_cost,
    SUM(impressions)    AS total_impressions,
    SUM(clicks)         AS total_clicks,
    SUM(app_installs)   AS total_installs
  FROM `covering-app-ccd23.ads_data.daily_cost_creative`
  WHERE channel = 'facebook.business'
    AND date BETWEEN '{DATE_START}' AND '{DATE_END}'
  GROUP BY campaign
),
airbridge AS (
  SELECT
    ad_campaign,
    COUNT(DISTINCT user_id) AS attributed_users
  FROM `covering-app-ccd23.ads_data.user_acquisition_channel`
  WHERE ad_channel = 'facebook.business'
    AND signup_date BETWEEN '{DATE_START}' AND '{DATE_END}'
  GROUP BY ad_campaign
),
orders AS (
  SELECT
    u.ad_campaign,
    COUNT(DISTINCT o.user_id)  AS converted_users,
    COUNT(DISTINCT o.id)       AS total_orders
  FROM `covering-app-ccd23.ads_data.user_acquisition_channel` u
  JOIN `covering-app-ccd23.secure_dataset.order_v2` o
    ON u.user_id = o.user_id
    AND DATE(o.created_at) BETWEEN '{DATE_START}' AND '{DATE_END}'
    AND o.deleted_at IS NULL
  WHERE u.ad_channel = 'facebook.business'
    AND u.signup_date BETWEEN '{DATE_START}' AND '{DATE_END}'
  GROUP BY u.ad_campaign
)
SELECT
  m.campaign,
  ROUND(m.total_cost)                                                             AS total_cost,
  m.total_impressions,
  m.total_clicks,
  ROUND(m.total_clicks / NULLIF(m.total_impressions, 0) * 100, 2)                AS ctr_pct,
  m.total_installs,
  ROUND(m.total_cost / NULLIF(m.total_installs, 0), 0)                           AS cpi,
  COALESCE(a.attributed_users, 0)                                                AS attributed_users,
  COALESCE(o.converted_users, 0)                                                 AS converted_users,
  COALESCE(o.total_orders, 0)                                                    AS total_orders,
  ROUND(COALESCE(o.converted_users,0) / NULLIF(a.attributed_users,0) * 100, 1)  AS order_cvr_pct,
  ROUND(m.total_cost / NULLIF(o.total_orders, 0), 0)                             AS cpo
FROM media m
LEFT JOIN airbridge a ON m.campaign = a.ad_campaign
LEFT JOIN orders   o ON m.campaign = o.ad_campaign
ORDER BY m.total_cost DESC
"""

# ──────────────────────────────────────────────────────────────
# Q2. 소재(Ad Creative) 단위 매체 성과
#     daily_cost_creative 기준, 날짜별 합산
# ──────────────────────────────────────────────────────────────
Q2 = f"""
SELECT
  channel,
  campaign,
  ad_group,
  ad_creative,
  SUM(cost)           AS total_cost,
  SUM(impressions)    AS total_impressions,
  SUM(clicks)         AS total_clicks,
  SUM(app_installs)   AS total_installs,
  ROUND(SUM(clicks) / NULLIF(SUM(impressions), 0) * 100, 2)   AS ctr_pct,
  ROUND(SUM(cost) / NULLIF(SUM(clicks), 0), 0)                AS cpc,
  ROUND(SUM(cost) / NULLIF(SUM(app_installs), 0), 0)          AS cpi,
  ROUND(MAX(roas), 4)                                          AS roas_last
FROM `covering-app-ccd23.ads_data.daily_cost_creative`
WHERE channel = 'facebook.business'
  AND date BETWEEN '{DATE_START}' AND '{DATE_END}'
GROUP BY channel, campaign, ad_group, ad_creative
ORDER BY total_cost DESC
"""

# ──────────────────────────────────────────────────────────────
# Q3. Airbridge 귀속 유저의 구독 전환 분석
# ──────────────────────────────────────────────────────────────
Q3 = f"""
WITH ab_users AS (
  SELECT
    user_id,
    ad_channel,
    ad_campaign,
    signup_date
  FROM `covering-app-ccd23.ads_data.user_acquisition_channel`
  WHERE ad_channel = 'facebook.business'
    AND signup_date BETWEEN '{DATE_START}' AND '{DATE_END}'
)
SELECT
  u.ad_campaign,
  COUNT(DISTINCT u.user_id)                                                              AS total_users,
  COUNT(DISTINCT o.user_id)                                                              AS ordered_users,
  COUNT(DISTINCT s.user_id)                                                              AS subscribed_users,
  ROUND(COUNT(DISTINCT o.user_id) / NULLIF(COUNT(DISTINCT u.user_id), 0) * 100, 1)     AS order_cvr_pct,
  ROUND(COUNT(DISTINCT s.user_id) / NULLIF(COUNT(DISTINCT u.user_id), 0) * 100, 1)     AS sub_cvr_pct
FROM ab_users u
LEFT JOIN `covering-app-ccd23.secure_dataset.order_v2` o
  ON u.user_id = o.user_id AND o.deleted_at IS NULL
LEFT JOIN `covering-app-ccd23.secure_dataset.subscription` s
  ON u.user_id = s.user_id AND s.status = 'ACTIVE'
GROUP BY u.ad_campaign
ORDER BY total_users DESC
"""

# ──────────────────────────────────────────────────────────────
# Q4. 채널 전체 비교 (Facebook vs 전체 매체)
# ──────────────────────────────────────────────────────────────
Q4 = f"""
SELECT
  channel,
  COUNT(DISTINCT campaign)  AS campaigns,
  SUM(cost)                 AS total_cost,
  SUM(impressions)          AS total_impressions,
  SUM(clicks)               AS total_clicks,
  SUM(app_installs)         AS total_installs,
  ROUND(SUM(clicks) / NULLIF(SUM(impressions),0) * 100, 2)   AS ctr_pct,
  ROUND(SUM(cost) / NULLIF(SUM(app_installs),0), 0)           AS cpi
FROM `covering-app-ccd23.ads_data.daily_cost_creative`
WHERE date BETWEEN '{DATE_START}' AND '{DATE_END}'
GROUP BY channel
ORDER BY total_cost DESC
"""

# ──────────────────────────────────────────────────────────────
# 실행
# ──────────────────────────────────────────────────────────────

q1_rows = run_query("Q1. 캠페인 단위 통합 (매체+Airbridge+주문)", Q1)
q2_rows = run_query("Q2. 소재 단위 매체 성과", Q2)
q3_rows = run_query("Q3. Airbridge 귀속 유저 구독 전환", Q3)
q4_rows = run_query("Q4. 채널 전체 비교", Q4)

# ── CSV 저장
if q1_rows:
    fields = ["campaign","total_cost","total_impressions","total_clicks","ctr_pct",
              "total_installs","cpi","attributed_users","converted_users",
              "total_orders","order_cvr_pct","cpo"]
    save_csv(q1_rows, f"datas/{ts}_q1_campaign_integrated.csv", fields)

if q2_rows:
    fields = ["channel","campaign","ad_group","ad_creative",
              "total_cost","total_impressions","total_clicks","total_installs",
              "ctr_pct","cpc","cpi","roas_last"]
    save_csv(q2_rows, f"datas/{ts}_q2_creative_performance.csv", fields)

if q3_rows:
    fields = ["ad_campaign","total_users","ordered_users","subscribed_users",
              "order_cvr_pct","sub_cvr_pct"]
    save_csv(q3_rows, f"datas/{ts}_q3_subscription_cvr.csv", fields)

if q4_rows:
    fields = ["channel","campaigns","total_cost","total_impressions","total_clicks",
              "total_installs","ctr_pct","cpi"]
    save_csv(q4_rows, f"datas/{ts}_q4_channel_compare.csv", fields)

# ── 콘솔 출력 + TXT 요약
lines = []
lines.append(f"=== 통합 분석 결과 ({DATE_START} ~ {DATE_END}) ===\n")

# Q4 채널 비교 먼저 출력
lines.append("[ Q4 ] 채널별 전체 성과\n")
lines.append(f"{'채널':<25} {'캠페인수':>7} {'비용':>13} {'노출':>12} {'클릭':>9} {'설치':>7} {'CTR':>7} {'CPI':>9}")
for r in q4_rows:
    ctr_str = f"{float(r['ctr_pct']):>6.2f}%" if r['ctr_pct'] is not None else "     -"
    lines.append(
        f"{str(r['channel']):<25} {int(r['campaigns']):>7,}"
        f" {int(r['total_cost'] or 0):>13,}"
        f" {int(r['total_impressions'] or 0):>12,}"
        f" {int(r['total_clicks'] or 0):>9,}"
        f" {int(r['total_installs'] or 0):>7,}"
        f" {ctr_str:>7}"
        f" {int(r['cpi'] or 0):>9,}"
    )

lines.append("\n" + "─"*90)
lines.append("\n[ Q1 ] Facebook 캠페인 단위 통합 성과\n")
lines.append(
    f"{'캠페인':<50} {'비용':>11} {'설치':>6} {'CPI':>8} "
    f"{'귀속유저':>8} {'주문전환':>8} {'CVR':>6} {'CPO':>9}"
)
for r in q1_rows:
    cvr = f"{float(r['order_cvr_pct']):.1f}%" if r['order_cvr_pct'] else "  -"
    cpo = f"{int(r['cpo']):,}" if r['cpo'] else "  -"
    lines.append(
        f"{str(r['campaign'])[:50]:<50}"
        f" {int(r['total_cost']):>11,}"
        f" {int(r['total_installs']):>6,}"
        f" {int(r['cpi'] or 0):>8,}"
        f" {int(r['attributed_users']):>8,}"
        f" {int(r['converted_users']):>8,}"
        f" {cvr:>6}"
        f" {cpo:>9}"
    )

# Q1 합계
if q1_rows:
    tot_cost  = sum(int(r['total_cost'])  for r in q1_rows)
    tot_inst  = sum(int(r['total_installs']) for r in q1_rows)
    tot_attr  = sum(int(r['attributed_users']) for r in q1_rows)
    tot_conv  = sum(int(r['converted_users']) for r in q1_rows)
    tot_ord   = sum(int(r['total_orders']) for r in q1_rows)
    lines.append("─"*90)
    lines.append(
        f"{'합계':<50}"
        f" {tot_cost:>11,}"
        f" {tot_inst:>6,}"
        f" {round(tot_cost/tot_inst) if tot_inst else 0:>8,}"
        f" {tot_attr:>8,}"
        f" {tot_conv:>8,}"
        f" {round(tot_conv/tot_attr*100,1) if tot_attr else 0:>5.1f}%"
        f" {round(tot_cost/tot_ord) if tot_ord else 0:>9,}"
    )

lines.append("\n" + "─"*90)
lines.append("\n[ Q2 ] Facebook 소재 단위 성과 (Top 30)\n")
lines.append(
    f"{'소재명':<55} {'비용':>11} {'설치':>6} {'CPI':>8} {'CTR':>7} {'ROAS':>7}"
)
for r in q2_rows[:30]:
    roas    = f"{float(r['roas_last']):.2f}" if r['roas_last'] else "  -"
    ctr_str = f"{float(r['ctr_pct']):.2f}%" if r['ctr_pct'] is not None else "  -"
    lines.append(
        f"{str(r['ad_creative'])[:55]:<55}"
        f" {int(r['total_cost'] or 0):>11,}"
        f" {int(r['total_installs'] or 0):>6,}"
        f" {int(r['cpi'] or 0):>8,}"
        f" {ctr_str:>7}"
        f" {roas:>7}"
    )

lines.append("\n" + "─"*90)
lines.append("\n[ Q3 ] Airbridge 귀속 유저 구독 전환\n")
lines.append(
    f"{'캠페인':<50} {'유저':>7} {'주문전환':>8} {'주문CVR':>8} {'구독전환':>8} {'구독CVR':>8}"
)
for r in q3_rows:
    lines.append(
        f"{str(r['ad_campaign'])[:50]:<50}"
        f" {int(r['total_users']):>7,}"
        f" {int(r['ordered_users']):>8,}"
        f" {float(r['order_cvr_pct'] or 0):>7.1f}%"
        f" {int(r['subscribed_users']):>8,}"
        f" {float(r['sub_cvr_pct'] or 0):>7.1f}%"
    )

lines.append(f"\n\n생성 파일:")
lines.append(f"  datas/{ts}_q1_campaign_integrated.csv")
lines.append(f"  datas/{ts}_q2_creative_performance.csv")
lines.append(f"  datas/{ts}_q3_subscription_cvr.csv")
lines.append(f"  datas/{ts}_q4_channel_compare.csv")

txt_content = "\n".join(lines)
print("\n" + txt_content)
save_txt(txt_content, f"datas/{ts}_통합분석_결과요약.txt")
print("\n✅ 완료")
