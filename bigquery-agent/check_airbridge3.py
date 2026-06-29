import warnings
warnings.filterwarnings("ignore")
from google.cloud import bigquery
client = bigquery.Client(project="covering-app-ccd23")

# airbridge_dataset 테이블 목록
print("=== airbridge_dataset 테이블 ===")
for r in client.query("SELECT table_name FROM `covering-app-ccd23.airbridge_dataset.INFORMATION_SCHEMA.TABLES`").result():
    print(f"  {r.table_name}")

# 스키마 확인
print("\n=== airbridge_dataset 스키마 ===")
for r in client.query("SELECT table_name, column_name, data_type FROM `covering-app-ccd23.airbridge_dataset.INFORMATION_SCHEMA.COLUMNS` ORDER BY table_name, ordinal_position").result():
    print(f"  [{r.table_name}] {r.column_name}: {r.data_type}")
