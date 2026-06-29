import subprocess, json

bq = r"C:\Users\hound\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\bq.cmd"

with open(r"C:\Users\hound\OneDrive\바탕 화면\bigquery-agent\dcj_db_full.sql", encoding='utf-8') as f:
    query = f.read().strip()

result = subprocess.run(
    [bq, 'query', '--use_legacy_sql=false', '--format=json'],
    input=query,
    capture_output=True,
    encoding='utf-8',
    errors='replace'
)

print(f"rc={result.returncode}")
if result.returncode != 0:
    print("ERR:", result.stdout[:500], result.stderr[:300])
else:
    data = json.loads(result.stdout)
    out = r"C:\Users\hound\OneDrive\바탕 화면\bigquery-agent\datas\dcj_db_full.json"
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Saved {len(data)} rows")
    for row in data:
        print(row)
