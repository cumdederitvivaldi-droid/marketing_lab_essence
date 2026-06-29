import subprocess, json, sys

bq = r"C:\Users\hound\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\bq.cmd"
sql_file = r"C:\Users\hound\OneDrive\바탕 화면\bigquery-agent\coupon_query.sql"
out_file = r"C:\Users\hound\OneDrive\바탕 화면\bigquery-agent\datas\coupon_main.json"

with open(sql_file, encoding='utf-8') as f:
    query = f.read().strip()

print(f"Query length: {len(query)}")
print("Query preview:", query[:100])

result = subprocess.run(
    [bq, 'query', '--use_legacy_sql=false', '--format=json'],
    input=query,
    capture_output=True,
    encoding='utf-8',
    errors='replace'
)

print(f"returncode={result.returncode}")
out = result.stdout.strip()
print("STDOUT[:200]:", out[:200])
if result.stderr:
    print("STDERR[:500]:", result.stderr[:500])

if not out or result.returncode != 0:
    sys.exit(1)

data = json.loads(out)
with open(out_file, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"\nSaved {len(data)} rows to coupon_main.json")
for row in data:
    print(row)
