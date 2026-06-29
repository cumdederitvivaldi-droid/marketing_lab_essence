import json, sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

with open('C:/Users/hound/OneDrive/바탕 화면/bigquery-agent/datas/sr_sigungu.json', encoding='utf-8-sig') as f:
    data = json.load(f)

active_list = []
inactive_list = []

for r in data:
    entry = {
        'sido': r['region_1_depth_name'],
        'sigungu': r['region_2_depth_name'],
        'code': r['sigungu_code'],
        'cnt': int(r['dong_cnt'])
    }
    if r['active_flag'] == 'true':
        active_list.append(entry)
    else:
        inactive_list.append(entry)

print('=== 현재 운영 지역 (active) ===')
for r in sorted(active_list, key=lambda x: (-x['cnt'], x['sido'])):
    print(f"  {r['sido']:12s} | {r['sigungu']:20s} | code={r['code']} | {r['cnt']}개동")

print()
print('=== 미운영 지역 (inactive) ===')
for r in sorted(inactive_list, key=lambda x: (-x['cnt'], x['sido'])):
    print(f"  {r['sido']:12s} | {r['sigungu']:20s} | code={r['code']} | {r['cnt']}개동")

# 시도별 요약
from collections import defaultdict
sido_active = defaultdict(int)
sido_inactive = defaultdict(int)
for r in active_list:
    sido_active[r['sido']] += r['cnt']
for r in inactive_list:
    sido_inactive[r['sido']] += r['cnt']

print()
print('=== 시도별 활성 행정동 수 ===')
for k in sorted(sido_active, key=lambda x: -sido_active[x]):
    print(f"  {k:15s}: active={sido_active[k]:4d}  inactive={sido_inactive.get(k,0):4d}")
