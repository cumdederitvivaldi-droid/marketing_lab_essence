import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

with open('C:/Users/hound/OneDrive/바탕 화면/bigquery-agent/datas/sr_summary2.json', encoding='utf-8-sig') as f:
    data = json.load(f)

sido_map = {
    '11': '서울특별시', '26': '부산광역시', '27': '대구광역시', '28': '인천광역시',
    '29': '광주광역시', '30': '대전광역시', '31': '울산광역시', '36': '세종특별자치시',
    '41': '경기도', '42': '강원특별자치도', '43': '충청북도', '44': '충청남도',
    '45': '전북특별자치도', '46': '전라남도', '47': '경상북도', '48': '경상남도',
    '50': '제주특별자치도', '51': '강원특별자치도'
}

print('=== active_flag / 시도 별 행정동 수 ===')
for r in data:
    code = r['sido_code']
    prefix = code[:2]
    sido = sido_map.get(prefix, f'코드:{code}')
    print(f"active={r['active_flag']:5s}  sido_code={code}  시도={sido:15s}  행정동수={r['cnt']}")
