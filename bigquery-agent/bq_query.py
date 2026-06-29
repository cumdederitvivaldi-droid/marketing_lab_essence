import subprocess, json, sys, os

bq = r"C:\Users\hound\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\bq.cmd"

query = """
SELECT region_2_depth_name as sigungu, h_name, LEFT(h_code,5) as code5, active_flag
FROM `covering-app-ccd23.secure_dataset.service_region`
WHERE deleted_date IS NULL
  AND LEFT(h_code,5) IN (
    '41590','41591','41593','41595','41597',
    '41360','41480','41610','41550','41630'
  )
ORDER BY code5, active_flag DESC, h_name
"""

result = subprocess.run(
    [bq, 'query', '--use_legacy_sql=false', '--format=json', query],
    capture_output=True,
    encoding='cp949',
    errors='replace'
)

out = result.stdout.strip()
if not out:
    print("STDERR:", result.stderr[:500])
    sys.exit(1)

data = json.loads(out)
print(f"rows: {len(data)}")

from collections import defaultdict
regions = defaultdict(lambda: {'active': [], 'inactive': []})

for r in data:
    code = r['code5']
    h_name = r['h_name']
    sigungu = r['sigungu']
    key = f"{code}|||{sigungu}"
    if r['active_flag'] == 'true':
        regions[key]['active'].append(h_name)
    else:
        regions[key]['inactive'].append(h_name)

lines = []
for key in sorted(regions.keys()):
    code, sigungu = key.split('|||', 1)
    info = regions[key]
    lines.append(f"\n[{code}] {sigungu}")
    lines.append(f"  active({len(info['active'])}): {', '.join(sorted(info['active']))}")
    lines.append(f"  inactive({len(info['inactive'])}): {', '.join(sorted(info['inactive']))}")

out_text = '\n'.join(lines)
with open('C:/Users/hound/OneDrive/바탕 화면/bigquery-agent/datas/dong_final.txt', 'w', encoding='utf-8') as f:
    f.write(out_text)
print("saved dong_final.txt")
