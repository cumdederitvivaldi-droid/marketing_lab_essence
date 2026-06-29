@echo off
chcp 65001 >nul
set BQ=C:\Users\hound\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\bq.cmd
set QUERY_FILE=%~dp0query_7day.sql
%BQ% query --use_legacy_sql=false --format=csv --max_rows=100 < %QUERY_FILE% > %~dp0datas\result_7day.csv 2>&1
echo 완료: %~dp0datas\result_7day.csv
