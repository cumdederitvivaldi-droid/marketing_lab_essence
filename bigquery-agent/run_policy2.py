import subprocess, json

bq = r"C:\Users\hound\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\bq.cmd"

with open(r"C:\Users\hound\OneDrive\바탕 화면\bigquery-agent\coupon_policy2.sql", encoding='utf-8') as f:
    query = f.read().strip()

result = subprocess.run(
    [bq, 'query', '--use_legacy_sql=false', '--format=json'],
    input=query,
    capture_output=True,
    encoding='utf-8',
    errors='replace'
)

print(f"rc={result.returncode}")
out = result.stdout.strip()
out_file = r"C:\Users\hound\OneDrive\바탕 화면\bigquery-agent\datas\coupon_policy2.json"
if result.returncode == 0 and out:
    data = json.loads(out)
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    with open(out_file.replace('.json','.txt'), 'w', encoding='utf-8') as f:
        for row in data:
            f.write(f"id={row['id']:>4} | {row['discount_type']:<12} | {row['amount']:>6} | max={row['max_discount_amount']:>6} | {(row.get('remark') or '')[:80]}\n")
    # Print ascii-safe version
    for row in data:
        remark = (row.get('remark') or '').encode('ascii','replace').decode('ascii')
        print(f"id={row['id']:>4} | {row['discount_type']:<12} | {row['amount']:>6} | max={row['max_discount_amount']:>6} | {remark[:80]}")
else:
    print("ERR:", result.stdout[:300], result.stderr[:300])
