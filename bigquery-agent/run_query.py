"""BigQuery 쿼리를 stdin으로 전달하여 실행합니다."""
import subprocess
import sys
import os

def run_bq_query(sql_file, output_csv):
    bq = r"C:\Users\hound\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\bq.cmd"
    with open(sql_file, "r", encoding="utf-8") as f:
        query = f.read()

    # stdin으로 쿼리 전달 (긴 쿼리/특수문자 문제 우회)
    result = subprocess.run(
        [bq, "query", "--use_legacy_sql=false", "--format=csv", "--max_rows=1000"],
        input=query,
        capture_output=True,
        encoding="utf-8",
        errors="replace",
    )

    if result.returncode != 0:
        print("STDOUT:", result.stdout[:1000])
        print("STDERR:", result.stderr[:1000])
        sys.exit(1)

    os.makedirs(os.path.dirname(output_csv), exist_ok=True)
    with open(output_csv, "w", encoding="utf-8-sig", newline="") as f:
        f.write(result.stdout)

    print(result.stdout)
    print(f"\n저장 완료: {output_csv}")

if __name__ == "__main__":
    sql_file   = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\hound\OneDrive\바탕 화면\bigquery-agent\query_7day.sql"
    output_csv = sys.argv[2] if len(sys.argv) > 2 else r"C:\Users\hound\OneDrive\바탕 화면\bigquery-agent\datas\7day_conversion.csv"
    run_bq_query(sql_file, output_csv)
