import warnings
warnings.filterwarnings("ignore")
from google.cloud import bigquery
client = bigquery.Client(project="covering-app-ccd23")

# ads_data 테이블 전체
print("=== ads_data 테이블 ===")
for r in client.query("SELECT table_name FROM `covering-app-ccd23.ads_data.INFORMATION_SCHEMA.TABLES`").result():
    print(f"  {r.table_name}")

# user_acquisition_channel 스키마
print("\n=== user_acquisition_channel 스키마 ===")
for r in client.query("SELECT column_name, data_type FROM `covering-app-ccd23.ads_data.INFORMATION_SCHEMA.COLUMNS` WHERE table_name='user_acquisition_channel'").result():
    print(f"  {r.column_name}: {r.data_type}")

# 샘플 데이터
print("\n=== user_acquisition_channel 샘플 (10행) ===")
for r in client.query("SELECT * FROM `covering-app-ccd23.ads_data.user_acquisition_channel` LIMIT 10").result():
    print(dict(r))

# daily_cost_creative 샘플 - impressions, CTR 확인
print("\n=== daily_cost_creative CTR 데이터 확인 (대형폐기물 소재) ===")
q = """
SELECT ad_group, ad_creative, date, impressions, clicks, app_installs, cost,
       SAFE_DIVIDE(clicks, impressions)*100 AS ctr
FROM `covering-app-ccd23.ads_data.daily_cost_creative`
WHERE channel = 'facebook.business'
  AND ad_group LIKE '%대형폐기물%'
  AND impressions > 0
ORDER BY cost DESC
LIMIT 10
"""
for r in client.query(q).result():
    print(f"  {r.ad_creative[:50]}: impressions={r.impressions}, clicks={r.clicks}, CTR={r.ctr:.2f}%")
