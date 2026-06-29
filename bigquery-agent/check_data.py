from google.cloud import bigquery
import warnings
warnings.filterwarnings("ignore")

client = bigquery.Client(project="covering-app-ccd23")

# 채널 목록
print("=== 채널 목록 ===")
for r in client.query("SELECT DISTINCT channel, COUNT(*) as cnt FROM `covering-app-ccd23.ads_data.daily_cost_creative` GROUP BY channel ORDER BY cnt DESC").result():
    print(f"  {r.channel}: {r.cnt}건")

# ad_group 샘플
print("\n=== ad_group 샘플 (처음 20개) ===")
for r in client.query("SELECT DISTINCT ad_group FROM `covering-app-ccd23.ads_data.daily_cost_creative` LIMIT 20").result():
    print(f"  {repr(r.ad_group)}")

# 대형 포함 여부 확인
print("\n=== 대형 포함 ad_group ===")
for r in client.query("SELECT DISTINCT ad_group FROM `covering-app-ccd23.ads_data.daily_cost_creative` WHERE LOWER(ad_group) LIKE '%대형%' LIMIT 10").result():
    print(f"  {repr(r.ad_group)}")

print("\n=== 폐기물 포함 ad_group ===")
for r in client.query("SELECT DISTINCT ad_group FROM `covering-app-ccd23.ads_data.daily_cost_creative` WHERE ad_group LIKE '%폐기물%' LIMIT 10").result():
    print(f"  {repr(r.ad_group)}")
