import subprocess, json, sys

bq = r"C:\Users\hound\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\bq.cmd"

query = """
WITH target_users AS (
  SELECT DISTINCT u.id as user_id
  FROM `covering-app-ccd23.secure_dataset.user` u
  JOIN `covering-app-ccd23.secure_dataset.order_v2` o ON u.id = o.user_id
  JOIN `covering-app-ccd23.secure_dataset.order_address_snapshot` a ON o.id = a.order_id
  WHERE LEFT(a.h_code,2) IN ('30','36','43')
    AND o.deleted_at IS NULL
),
coupon_orders AS (
  SELECT o.id as order_id, o.user_id, o.status,
    CASE
      WHEN cp.id = 189 THEN '2500원_DCJ25'
      WHEN cp.id = 188 THEN '50pct_DCJ50'
      WHEN cp.id = 187 THEN '100pct_DCJ100'
      WHEN cp.id IN (185,183) THEN '100pct_EARLY'
      WHEN cp.id IN (182,184) THEN '20000원_OPEN'
      ELSE CONCAT('other_id',CAST(cp.id AS STRING))
    END as coupon_label,
    r.total_amount as receipt_amount
  FROM `covering-app-ccd23.secure_dataset.order_v2` o
  JOIN target_users tu ON o.user_id = tu.user_id
  JOIN `covering-app-ccd23.secure_dataset.order_address_snapshot` a ON o.id = a.order_id
  JOIN `covering-app-ccd23.secure_dataset.user_coupon` uc ON o.user_coupon_id = uc.id
  JOIN `covering-app-ccd23.secure_dataset.coupon_policy` cp ON uc.coupon_policy_id = cp.id
  LEFT JOIN `covering-app-ccd23.secure_dataset.order_invoice` oi ON o.id = oi.order_id
  LEFT JOIN `covering-app-ccd23.secure_dataset.invoice` inv ON oi.invoice_id = inv.id
  LEFT JOIN `covering-app-ccd23.secure_dataset.receipt` r ON inv.id = r.invoice_id
  WHERE o.deleted_at IS NULL
    AND LEFT(a.h_code,2) IN ('30','36','43')
    AND DATE(o.created_at) >= '2025-10-01'
)
SELECT
  coupon_label,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(order_id) as total_orders,
  COUNTIF(status='COMPLETED') as completed,
  COUNTIF(status='CANCELED') as canceled,
  ROUND(COUNTIF(status='COMPLETED')*100.0/NULLIF(COUNT(order_id),0),1) as completion_rate_pct,
  ROUND(AVG(CASE WHEN status='COMPLETED' THEN receipt_amount END),0) as avg_receipt_completed,
  SUM(CASE WHEN status='COMPLETED' THEN receipt_amount ELSE 0 END) as total_revenue
FROM coupon_orders
GROUP BY 1
ORDER BY unique_users DESC
"""

result = subprocess.run(
    [bq, 'query', '--use_legacy_sql=false', '--format=json', query],
    capture_output=True,
    encoding='utf-8',
    errors='replace'
)

out = result.stdout.strip()
print(f"returncode={result.returncode}")
print(f"stdout len={len(result.stdout)}, stripped len={len(out)}")
print("STDOUT[:300]:", repr(result.stdout[:300]))
print("STDERR[:500]:", result.stderr[:500])
if not out:
    sys.exit(1)

data = json.loads(out)
with open('C:/Users/hound/OneDrive/바탕 화면/bigquery-agent/datas/coupon_main.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"Saved {len(data)} rows")
for row in data:
    print(row)
