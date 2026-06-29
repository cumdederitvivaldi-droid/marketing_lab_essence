import json, sys, io

with open('C:/Users/hound/OneDrive/바탕 화면/bigquery-agent/datas/dong_detail.json', encoding='utf-8-sig') as f:
    data = json.load(f)

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

output_lines = []
for key in sorted(regions.keys()):
    code, sigungu = key.split('|||', 1)
    info = regions[key]
    output_lines.append(f"\n[{code}] {sigungu}")
    output_lines.append(f"  active({len(info['active'])}): {', '.join(sorted(info['active']))}")
    output_lines.append(f"  inactive({len(info['inactive'])}): {', '.join(sorted(info['inactive']))}")

out = '\n'.join(output_lines)
with open('C:/Users/hound/OneDrive/바탕 화면/bigquery-agent/datas/dong_parsed.txt', 'w', encoding='utf-8') as f:
    f.write(out)

print("saved")
print(f"total rows: {len(data)}")
print(f"codes found: {sorted(set(r['code5'] for r in data))}")
