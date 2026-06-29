import subprocess
import sys

bq = r"C:\Users\hound\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\bq.cmd"

query = "SELECT DISTINCT ad_group, ad_creative FROM `covering-app-ccd23.ads_data.daily_cost_creative` WHERE ad_group LIKE '%대형%' AND channel = 'meta' ORDER BY ad_group, ad_creative LIMIT 5"

r = subprocess.run([bq, "query", "--use_legacy_sql=false", "--format=csv", "--max_rows=10", query], capture_output=True)
print("RC:", r.returncode)
print("stdout len:", len(r.stdout))
print("stderr:", r.stderr[:500].decode("utf-8", errors="replace"))
if r.stdout:
    try:
        text = r.stdout.decode("utf-8")
    except:
        text = r.stdout.decode("cp949", errors="replace")
    print("OUTPUT:", text[:2000])
