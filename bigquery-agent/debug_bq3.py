import subprocess
import sys
import os

bq = r"C:\Users\hound\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\bq.cmd"
out_file = os.path.abspath("temp_out.csv")

query = "SELECT DISTINCT ad_group, ad_creative FROM `covering-app-ccd23.ads_data.daily_cost_creative` WHERE ad_group LIKE '%대형%' AND channel = 'meta' ORDER BY ad_group, ad_creative LIMIT 5"

# Use cmd /c to redirect
cmd_str = f'"{bq}" query --use_legacy_sql=false --format=csv --max_rows=10 "{query}" > "{out_file}" 2>&1'
print("Running:", cmd_str[:200])
r = subprocess.run(cmd_str, shell=True, capture_output=True)
print("RC:", r.returncode)
print("stdout:", r.stdout[:200].decode("utf-8", errors="replace"))
print("stderr:", r.stderr[:200].decode("utf-8", errors="replace"))

size = os.path.getsize(out_file)
print("File size:", size)
if size > 0:
    for enc in ["utf-8", "cp949", "utf-16", "euc-kr"]:
        try:
            with open(out_file, encoding=enc) as f:
                content = f.read(2000)
            print(f"Success with {enc}:")
            print(content[:1000])
            break
        except Exception as e:
            print(f"{enc} failed: {e}")
