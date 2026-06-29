@echo off
chcp 65001 >/dev/null
set PATH=%PATH%;C:\Users\hound\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin
bq query --use_legacy_sql=false --format=csv --max_rows=2000 "SELECT table_schema, table_name, table_type FROM `covering-app-ccd23`.INFORMATION_SCHEMA.TABLES ORDER BY table_schema, table_name"
