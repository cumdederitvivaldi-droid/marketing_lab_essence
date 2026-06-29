import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

with open('C:/Users/hound/OneDrive/바탕 화면/bigquery-agent/datas/dong_detail.json', encoding='utf-8-sig') as f:
    data = json.load(f)

from collections import defaultdict
regions = defaultdict(lambda: {'active': [], 'inactive': []})

for r in data:
    code = r['code5']
    name = r['h_name']
    sigungu = r['sigungu']
    key = f"{code}|{sigungu}"
    if r['active_flag'] == 'true':
        regions[key]['active'].append(name)
    else:
        regions[key]['inactive'].append(name)

for key in sorted(regions.keys()):
    code, sigungu = key.split('|', 1)
    info = regions[key]
    print(f"\n{'='*60}")
    print(f"[{code}] {sigungu}")
    print(f"  active({len(info['active'])}): {', '.join(sorted(info['active']))}")
    print(f"  inactive({len(info['inactive'])}): {', '.join(sorted(info['inactive']))}")
