import csv
import os
import warnings
from datetime import datetime
warnings.filterwarnings("ignore")
from google.cloud import bigquery

client = bigquery.Client(project="covering-app-ccd23")

# ── 1. 대형폐기물 포함 세트 내 소재별 집계 ───────────────────────────────
sql_main = """
SELECT
  ad_group,
  ad_creative,
  SUM(cost)         AS total_cost,
  SUM(impressions)  AS total_impressions,
  SUM(clicks)       AS total_clicks,
  SUM(app_installs) AS total_installs,
  SAFE_DIVIDE(SUM(cost), NULLIF(SUM(app_installs), 0)) AS cpi,
  SAFE_DIVIDE(SUM(clicks), NULLIF(SUM(impressions), 0)) * 100 AS ctr,
  MIN(date) AS first_date,
  MAX(date) AS last_date
FROM `covering-app-ccd23.ads_data.daily_cost_creative`
WHERE channel = 'facebook.business'
  AND ad_group LIKE '%대형폐기물%'
GROUP BY ad_group, ad_creative
ORDER BY total_cost DESC
"""

# ── 2. 세트별 집계 ────────────────────────────────────────────────────
sql_adset = """
SELECT
  ad_group,
  SUM(cost)         AS total_cost,
  SUM(impressions)  AS total_impressions,
  SUM(clicks)       AS total_clicks,
  SUM(app_installs) AS total_installs,
  SAFE_DIVIDE(SUM(cost), NULLIF(SUM(app_installs), 0)) AS cpi,
  SAFE_DIVIDE(SUM(clicks), NULLIF(SUM(impressions), 0)) * 100 AS ctr,
  MIN(date) AS first_date,
  MAX(date) AS last_date
FROM `covering-app-ccd23.ads_data.daily_cost_creative`
WHERE channel = 'facebook.business'
  AND ad_group LIKE '%대형폐기물%'
GROUP BY ad_group
ORDER BY total_cost DESC
"""

rows_main = list(client.query(sql_main).result())
rows_adset = list(client.query(sql_adset).result())
print(f"세트 수: {len(rows_adset)}, 소재 수: {len(rows_main)}")

os.makedirs("datas", exist_ok=True)
ts = datetime.now().strftime("%Y%m%d_%H%M%S")

# 소재별 CSV
csv_creative = f"datas/{ts}_대형폐기물_소재분석.csv"
with open(csv_creative, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["ad_group","ad_creative","total_cost","total_impressions",
                "total_clicks","total_installs","cpi","ctr","first_date","last_date"])
    for r in rows_main:
        w.writerow([r.ad_group, r.ad_creative,
                    round(r.total_cost or 0),
                    int(r.total_impressions or 0),
                    int(r.total_clicks or 0),
                    int(r.total_installs or 0),
                    round(r.cpi or 0),
                    round(r.ctr or 0, 3),
                    r.first_date, r.last_date])

# 세트별 CSV
csv_adset = f"datas/{ts}_대형폐기물_세트별집계.csv"
with open(csv_adset, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["ad_group","total_cost","total_impressions","total_clicks",
                "total_installs","cpi","ctr","first_date","last_date"])
    for r in rows_adset:
        w.writerow([r.ad_group,
                    round(r.total_cost or 0),
                    int(r.total_impressions or 0),
                    int(r.total_clicks or 0),
                    int(r.total_installs or 0),
                    round(r.cpi or 0),
                    round(r.ctr or 0, 3),
                    r.first_date, r.last_date])

# ── 콘솔 출력 ─────────────────────────────────────────────────────────
print("\n" + "="*70)
print("광고 세트별 요약 (대형폐기물 세트)")
print("="*70)
for r in rows_adset:
    print(f"\n[{r.ad_group}]")
    cpi_v = r.cpi or 0; ctr_v = r.ctr or 0
    print(f"  지출: {r.total_cost:>10,.0f}원 | 인스톨: {r.total_installs:>6.0f} | CPI: {cpi_v:>7,.0f}원 | CTR: {ctr_v:.2f}% | {r.first_date}~{r.last_date}")

print("\n" + "="*70)
print("소재별 성과 (지출 TOP 전체)")
print("="*70)
for i, r in enumerate(rows_main, 1):
    print(f"\n{i:>2}. [{r.ad_creative}]")
    print(f"    세트: {r.ad_group}")
    cpi_v = r.cpi or 0; ctr_v = r.ctr or 0
    print(f"    지출: {r.total_cost:>10,.0f}원 | 인스톨: {r.total_installs:>5.0f} | CPI: {cpi_v:>7,.0f}원 | CTR: {ctr_v:.2f}%")

print(f"\nCSV 저장: {csv_creative}")
print(f"CSV 저장: {csv_adset}")
