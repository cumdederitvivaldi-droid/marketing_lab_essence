@echo off
chcp 65001 >/dev/null
set PATH=%PATH%;C:\Users\hound\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin
bq query --use_legacy_sql=false --format=csv "SELECT SPLIT(oas.road_address, ' ')[OFFSET(0)] AS sido, SPLIT(oas.road_address, ' ')[SAFE_OFFSET(1)] AS sigungu, COUNT(DISTINCT o.id) AS order_count, ROUND(COUNT(DISTINCT o.id) * 100.0 / SUM(COUNT(DISTINCT o.id)) OVER(), 2) AS pct FROM `covering-app-ccd23.secure_dataset.order_v2` o JOIN `covering-app-ccd23.secure_dataset.order_address_snapshot` oas ON o.id = oas.order_id WHERE o.deleted_at IS NULL GROUP BY sido, sigungu ORDER BY order_count DESC LIMIT 30" > "C:\Users\hound\OneDrive\바탕 화면\bigquery-agent\datas\region_raw.csv"
