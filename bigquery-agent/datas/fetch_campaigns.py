
# -*- coding: utf-8 -*-
import sys
import json
sys.stdout.reconfigure(encoding='utf-8')

from google.cloud import bigquery

client = bigquery.Client(project='covering-app-ccd23')

query = """
SELECT DISTINCT campaign, ad_group, ad_creative
FROM `covering-app-ccd23.ads_data.daily_cost_creative`
WHERE date BETWEEN '2026-03-18' AND '2026-04-26'
ORDER BY campaign, ad_group
"""

results = list(client.query(query))
rows = [{"campaign": r["campaign"], "ad_group": r["ad_group"], "ad_creative": r["ad_creative"]} for r in results]

with open("datas/campaigns_utf8.json", "w", encoding="utf-8") as f:
    json.dump(rows, f, ensure_ascii=False, indent=2)

print(f"Total rows: {len(rows)}")
for r in rows:
    print(r["campaign"], "|", r["ad_group"])
