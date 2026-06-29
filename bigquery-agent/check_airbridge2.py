import warnings
warnings.filterwarnings("ignore")
from google.cloud import bigquery
client = bigquery.Client(project="covering-app-ccd23")

# 전체 데이터셋 목록
print("=== 전체 데이터셋 ===")
for ds in client.list_datasets():
    print(f"  {ds.dataset_id}")

# 각 데이터셋의 테이블 목록
for ds_id in ["ads_data", "secure_dataset", "mixpanel", "cx_data"]:
    print(f"\n=== {ds_id} 테이블 ===")
    try:
        for r in client.query(f"SELECT table_name FROM `covering-app-ccd23.{ds_id}.INFORMATION_SCHEMA.TABLES`").result():
            print(f"  {r.table_name}")
    except Exception as e:
        print(f"  접근 불가: {e}")

# daily_cost_creative에서 impressions > 0인 데이터 확인
print("\n=== daily_cost_creative: impressions > 0 rows 수 ===")
for r in client.query("""
    SELECT
      COUNT(*) AS total_rows,
      COUNTIF(impressions > 0) AS rows_with_impressions,
      COUNTIF(clicks > 0) AS rows_with_clicks
    FROM `covering-app-ccd23.ads_data.daily_cost_creative`
    WHERE channel = 'facebook.business'
""").result():
    print(f"  전체: {r.total_rows} | impressions>0: {r.rows_with_impressions} | clicks>0: {r.rows_with_clicks}")

# impressions가 있는 소재 샘플
print("\n=== impressions 있는 샘플 ===")
for r in client.query("""
    SELECT ad_group, ad_creative, date, impressions, clicks, cost
    FROM `covering-app-ccd23.ads_data.daily_cost_creative`
    WHERE channel = 'facebook.business'
      AND impressions > 0
    ORDER BY date DESC
    LIMIT 5
""").result():
    print(f"  {r.ad_creative[:40]} | impr={r.impressions} clicks={r.clicks} cost={r.cost:.0f}")

# mixpanel에서 purchase 이벤트 확인
print("\n=== mixpanel purchase 이벤트 샘플 ===")
try:
    for r in client.query("""
        SELECT event_name, COUNT(*) AS cnt
        FROM `covering-app-ccd23.mixpanel.mp_master_event`
        WHERE LOWER(event_name) LIKE '%purchase%'
           OR LOWER(event_name) LIKE '%order%'
           OR LOWER(event_name) LIKE '%buy%'
        GROUP BY event_name
        ORDER BY cnt DESC
        LIMIT 10
    """).result():
        print(f"  {r.event_name}: {r.cnt}")
except Exception as e:
    print(f"  에러: {e}")

# airbridge 관련 테이블 전체 검색
print("\n=== 'airbridge' 포함 테이블 검색 ===")
for ds_id in ["ads_data"]:
    try:
        for r in client.query(f"""
            SELECT table_name, column_name
            FROM `covering-app-ccd23.{ds_id}.INFORMATION_SCHEMA.COLUMNS`
            WHERE LOWER(table_name) LIKE '%airbridge%'
               OR LOWER(column_name) LIKE '%airbridge%'
        """).result():
            print(f"  {ds_id}.{r.table_name}.{r.column_name}")
    except Exception as e:
        print(f"  {ds_id} 에러: {e}")
