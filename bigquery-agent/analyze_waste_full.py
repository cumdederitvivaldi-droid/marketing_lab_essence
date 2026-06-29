"""
대형폐기물 세트 소재별 통합 성과 분석
- daily_cost_creative: 지출 / 인스톨 / 클릭 / CTR
- airbridge_dataset.app_events: 구매수(Order Complete) / CPA
"""
import csv, os, re, warnings
from datetime import datetime
warnings.filterwarnings("ignore")
from google.cloud import bigquery

client = bigquery.Client(project="covering-app-ccd23")

# ── 1. 소재별 지출 + 클릭 + 인스톨 + CTR ──────────────────────────────
sql_cost = """
SELECT
  ad_group,
  ad_creative,
  SUM(cost)           AS total_cost,
  SUM(impressions)    AS total_impressions,
  SUM(clicks)         AS total_clicks,
  SUM(app_installs)   AS total_installs,
  SAFE_DIVIDE(SUM(clicks), NULLIF(SUM(impressions),0)) * 100  AS ctr,
  SAFE_DIVIDE(SUM(cost), NULLIF(SUM(app_installs),0))         AS cpi,
  SAFE_DIVIDE(SUM(cost), NULLIF(SUM(clicks),0))               AS cpc,
  MIN(date) AS first_date,
  MAX(date) AS last_date
FROM `covering-app-ccd23.ads_data.daily_cost_creative`
WHERE channel = 'facebook.business'
  AND ad_group LIKE '%대형폐기물%'
GROUP BY ad_group, ad_creative
"""

# ── 2. 에어브릿지 구매수 (Order Complete) ────────────────────────────
sql_orders = """
SELECT
  Ad_Group   AS ad_group,
  Ad_Creative AS ad_creative,
  COUNT(*)   AS order_count
FROM `covering-app-ccd23.airbridge_dataset.app_events`
WHERE Channel = 'facebook.business'
  AND Ad_Group LIKE '%대형폐기물%'
  AND Event_Category = 'Order Complete (App)'
GROUP BY Ad_Group, Ad_Creative
"""

# ── 3. 세트별 집계 ────────────────────────────────────────────────────
sql_adset_cost = """
SELECT
  ad_group,
  SUM(cost)           AS total_cost,
  SUM(impressions)    AS total_impressions,
  SUM(clicks)         AS total_clicks,
  SUM(app_installs)   AS total_installs,
  SAFE_DIVIDE(SUM(clicks), NULLIF(SUM(impressions),0)) * 100  AS ctr,
  SAFE_DIVIDE(SUM(cost), NULLIF(SUM(app_installs),0))         AS cpi,
  SAFE_DIVIDE(SUM(cost), NULLIF(SUM(clicks),0))               AS cpc,
  MIN(date) AS first_date,
  MAX(date) AS last_date
FROM `covering-app-ccd23.ads_data.daily_cost_creative`
WHERE channel = 'facebook.business'
  AND ad_group LIKE '%대형폐기물%'
GROUP BY ad_group
ORDER BY total_cost DESC
"""

sql_adset_orders = """
SELECT
  Ad_Group AS ad_group,
  COUNT(*) AS order_count
FROM `covering-app-ccd23.airbridge_dataset.app_events`
WHERE Channel = 'facebook.business'
  AND Ad_Group LIKE '%대형폐기물%'
  AND Event_Category = 'Order Complete (App)'
GROUP BY Ad_Group
"""

print("쿼리 실행 중...")
rows_cost    = {(r.ad_group, r.ad_creative): r for r in client.query(sql_cost).result()}
rows_orders  = {(r.ad_group, r.ad_creative): r.order_count for r in client.query(sql_orders).result()}
rows_adset_c = {r.ad_group: r for r in client.query(sql_adset_cost).result()}
rows_adset_o = {r.ad_group: r.order_count for r in client.query(sql_adset_orders).result()}

# 소재별 병합
merged = []
all_keys = set(rows_cost.keys()) | set(rows_orders.keys())
for key in all_keys:
    ag, cr = key
    c = rows_cost.get(key)
    orders = rows_orders.get(key, 0)
    cost     = c.total_cost if c else 0
    impr     = int(c.total_impressions) if c else 0
    clicks   = int(c.total_clicks) if c else 0
    installs = int(c.total_installs) if c else 0
    cpi      = c.cpi if c else None
    cpc      = c.cpc if c else None
    ctr      = c.ctr if c else None
    cpa      = cost / orders if (orders > 0 and cost > 0) else None
    first    = c.first_date if c else None
    last     = c.last_date if c else None
    merged.append({
        "ad_group": ag, "ad_creative": cr,
        "total_cost": cost, "total_impressions": impr,
        "total_clicks": clicks, "total_installs": installs,
        "order_count": orders,
        "cpi": cpi, "cpc": cpc, "ctr": ctr, "cpa": cpa,
        "first_date": first, "last_date": last
    })
merged.sort(key=lambda x: x["total_cost"], reverse=True)

# 세트별 병합
adset_merged = []
for ag, c in rows_adset_c.items():
    orders = rows_adset_o.get(ag, 0)
    cpa = c.total_cost / orders if (orders > 0 and c.total_cost > 0) else None
    adset_merged.append({
        "ad_group": ag,
        "total_cost": c.total_cost, "total_impressions": int(c.total_impressions),
        "total_clicks": int(c.total_clicks), "total_installs": int(c.total_installs),
        "order_count": orders,
        "cpi": c.cpi, "cpc": c.cpc, "ctr": c.ctr, "cpa": cpa,
        "first_date": c.first_date, "last_date": c.last_date
    })
adset_merged.sort(key=lambda x: x["total_cost"], reverse=True)

# CTR 가용 여부 확인
has_impressions = any(r["total_impressions"] > 0 for r in merged)
print(f"소재 수: {len(merged)} | 세트 수: {len(adset_merged)}")
print(f"Impression 데이터 존재: {has_impressions}")

total_cost     = sum(r["total_cost"] for r in adset_merged)
total_installs = sum(r["total_installs"] for r in adset_merged)
total_clicks   = sum(r["total_clicks"] for r in adset_merged)
total_orders   = sum(r["order_count"] for r in adset_merged)

# ── 저장 ─────────────────────────────────────────────────────────────
os.makedirs("datas", exist_ok=True)
ts = datetime.now().strftime("%Y%m%d_%H%M%S")

# 소재별 CSV
csv_cr = f"datas/{ts}_대형폐기물_소재별통합.csv"
with open(csv_cr, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=["ad_group","ad_creative","total_cost",
        "total_impressions","total_clicks","total_installs","order_count",
        "ctr","cpi","cpc","cpa","first_date","last_date"])
    w.writeheader()
    for r in merged:
        w.writerow({k: (round(v,1) if isinstance(v,float) else v) for k,v in r.items()})

# 세트별 CSV
csv_as = f"datas/{ts}_대형폐기물_세트별통합.csv"
with open(csv_as, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=["ad_group","total_cost",
        "total_impressions","total_clicks","total_installs","order_count",
        "ctr","cpi","cpc","cpa","first_date","last_date"])
    w.writeheader()
    for r in adset_merged:
        w.writerow({k: (round(v,1) if isinstance(v,float) else v) for k,v in r.items()})

# TXT 보고서
txt_path = f"datas/{ts}_대형폐기물_통합분석보고서.txt"
def fmt(v, prefix="", suffix="", na="-"):
    if v is None: return na
    return f"{prefix}{v:,.0f}{suffix}"

with open(txt_path, "w", encoding="utf-8") as f:
    f.write("쿼리 설명: Meta 대형폐기물 세트 소재별 통합 성과 (지출+인스톨+클릭+구매)\n")
    f.write("테이블: ads_data.daily_cost_creative + airbridge_dataset.app_events\n")
    f.write(f"추출 일시: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    f.write("분석 기간: 2026-02-09 ~ 2026-05-03\n")
    f.write("※ CTR: Meta impressions 값이 daily_cost_creative에 0으로 수신됨 -> CTR 계산 불가\n")
    f.write("   대신 CPC(클릭당비용)를 효율 보조 지표로 활용\n\n")

    f.write(f"총 지출: {total_cost:,.0f}원 | 총 인스톨: {total_installs:,} | 총 클릭: {total_clicks:,} | 총 구매: {total_orders:,}\n")
    f.write(f"전체 CPI: {total_cost/total_installs:,.0f}원 | 전체 CPA: {total_cost/total_orders:,.0f}원\n\n" if total_orders else "")

    f.write("=== 광고 세트별 통합 성과 ===\n")
    f.write(f"{'광고세트':<55} {'지출':>10} {'클릭':>6} {'인스톨':>7} {'구매':>5} {'CPI':>8} {'CPA':>9} {'CPC':>8}\n")
    f.write("-"*110 + "\n")
    for r in adset_merged:
        ag = r["ad_group"][:54]
        f.write(f"{ag:<55} {r['total_cost']:>10,.0f} {r['total_clicks']:>6,} {r['total_installs']:>7,} "
                f"{r['order_count']:>5,} {fmt(r['cpi']):>8} {fmt(r['cpa']):>9} {fmt(r['cpc']):>8}\n")

    f.write("\n=== 소재별 통합 성과 (지출 상위 50) ===\n")
    f.write(f"{'소재명':<55} {'지출':>10} {'클릭':>6} {'인스톨':>7} {'구매':>5} {'CPI':>8} {'CPA':>9} {'CPC':>8}\n")
    f.write("-"*110 + "\n")
    for r in merged[:50]:
        cr = r["ad_creative"][:54]
        f.write(f"{cr:<55} {r['total_cost']:>10,.0f} {r['total_clicks']:>6,} {r['total_installs']:>7,} "
                f"{r['order_count']:>5,} {fmt(r['cpi']):>8} {fmt(r['cpa']):>9} {fmt(r['cpc']):>8}\n")

print(f"\nCSV: {csv_cr}")
print(f"CSV: {csv_as}")
print(f"TXT: {txt_path}")

# 콘솔 요약 출력
print(f"\n{'='*70}")
print(f"요약: 지출 {total_cost:,.0f}원 | 인스톨 {total_installs:,} | 클릭 {total_clicks:,} | 구매(에어브릿지) {total_orders:,}")
if total_orders:
    print(f"전체 CPI {total_cost/total_installs:,.0f}원 | 전체 CPA {total_cost/total_orders:,.0f}원")
print(f"Meta impressions 데이터: {'있음' if has_impressions else '없음 -> CTR 계산 불가, CPC 대체 사용'}")

print("\n[세트별]")
for r in adset_merged[:15]:
    print(f"  {r['ad_group'][:55]}")
    print(f"    지출 {r['total_cost']:>10,.0f} | 클릭 {r['total_clicks']:>5,} | 인스톨 {r['total_installs']:>5,} | 구매 {r['order_count']:>4,} | CPI {fmt(r['cpi'])} | CPA {fmt(r['cpa'])} | CPC {fmt(r['cpc'])}")
