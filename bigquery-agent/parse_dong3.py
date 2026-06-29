import json

with open('C:/Users/hound/OneDrive/바탕 화면/bigquery-agent/datas/dong_detail.json', encoding='utf-8-sig') as f:
    raw = f.read()

# 잘못된 인코딩 복원 시도: bq.cmd가 CP949로 출력한 것을 latin-1로 읽힌 경우
def fix_mojibake(s):
    try:
        return s.encode('latin-1').decode('cp949')
    except:
        try:
            return s.encode('utf-8').decode('utf-8')
        except:
            return s

data = json.loads(raw)

from collections import defaultdict
regions = defaultdict(lambda: {'active': [], 'inactive': []})

for r in data:
    code = r['code5']
    h_name_raw = r['h_name']
    sigungu_raw = r['sigungu']

    h_name = fix_mojibake(h_name_raw)
    sigungu = fix_mojibake(sigungu_raw)

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
with open('C:/Users/hound/OneDrive/바탕 화면/bigquery-agent/datas/dong_parsed2.txt', 'w', encoding='utf-8') as f:
    f.write(out)

print("saved dong_parsed2.txt")
