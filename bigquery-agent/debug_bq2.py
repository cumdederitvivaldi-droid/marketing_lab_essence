import subprocess
import sys
import os

bq = r"C:\Users\hound\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\bq.cmd"

query = "SELECT DISTINCT ad_group, ad_creative FROM `covering-app-ccd23.ads_data.daily_cost_creative` WHERE ad_group LIKE '%대형%' AND channel = 'meta' ORDER BY ad_group, ad_creative LIMIT 5"

# Write to temp file approach
out_file = "temp_out.csv"
with open(out_file, "w", encoding="utf-8") as f:
    pass  # create empty

r = subprocess.run(
    [bq, "query", "--use_legacy_sql=false", "--format=csv", "--max_rows=10", query],
    stdout=open(out_file, "wb"),
    stderr=subprocess.PIPE
)
print("RC:", r.returncode)
print("stderr:", r.stderr[:500].decode("utf-8", errors="replace"))

# Read the file
size = os.path.getsize(out_file)
print("File size:", size)
if size > 0:
    for enc in ["utf-8", "cp949", "utf-16", "euc-kr"]:
        try:
            with open(out_file, encoding=enc) as f:
                content = f.read(2000)
            print(f"Read with {enc}:")
            print(content[:500])
            break
        except Exception as e:
            print(f"{enc} failed: {e}")
