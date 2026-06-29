import warnings
warnings.filterwarnings("ignore")
from google.cloud import bigquery
client = bigquery.Client(project="covering-app-ccd23")

# 구매 관련 이벤트 이름
print("=== app_events 이벤트 종류 (top 20) ===")
for r in client.query("""
    SELECT Event_Category, Event_Name, COUNT(*) AS cnt
    FROM `covering-app-ccd23.airbridge_dataset.app_events`
    GROUP BY Event_Category, Event_Name
    ORDER BY cnt DESC
    LIMIT 20
""").result():
    print(f"  [{r.Event_Category}] {r.Event_Name}: {r.cnt:,}")

# facebook.business 채널에서의 이벤트
print("\n=== facebook.business 채널 이벤트 ===")
for r in client.query("""
    SELECT Event_Category, Event_Name, COUNT(*) AS cnt
    FROM `covering-app-ccd23.airbridge_dataset.app_events`
    WHERE Channel = 'facebook.business'
    GROUP BY Event_Category, Event_Name
    ORDER BY cnt DESC
    LIMIT 20
""").result():
    print(f"  [{r.Event_Category}] {r.Event_Name}: {r.cnt:,}")

# facebook.business + 대형폐기물 Ad_Group 확인
print("\n=== facebook.business + 대형폐기물 Ad_Group 이벤트 ===")
for r in client.query("""
    SELECT Event_Category, Event_Name, COUNT(*) AS cnt
    FROM `covering-app-ccd23.airbridge_dataset.app_events`
    WHERE Channel = 'facebook.business'
      AND Ad_Group LIKE '%대형폐기물%'
    GROUP BY Event_Category, Event_Name
    ORDER BY cnt DESC
""").result():
    print(f"  [{r.Event_Category}] {r.Event_Name}: {r.cnt:,}")

# 구매 이벤트 + Ad_Creative 샘플
print("\n=== 구매 이벤트에서 Ad_Group, Ad_Creative 샘플 ===")
for r in client.query("""
    SELECT Ad_Group, Ad_Creative, Event_Category, Event_Name, Event_Date
    FROM `covering-app-ccd23.airbridge_dataset.app_events`
    WHERE Channel = 'facebook.business'
      AND Ad_Group LIKE '%대형폐기물%'
      AND (LOWER(Event_Category) LIKE '%order%'
           OR LOWER(Event_Name) LIKE '%order%'
           OR LOWER(Event_Name) LIKE '%purchase%'
           OR LOWER(Event_Category) LIKE '%purchase%')
    LIMIT 10
""").result():
    print(f"  [{r.Event_Category}] {r.Event_Name}")
    print(f"    Ad_Group: {r.Ad_Group}")
    print(f"    Ad_Creative: {r.Ad_Creative}")
    print(f"    Date: {r.Event_Date}")
