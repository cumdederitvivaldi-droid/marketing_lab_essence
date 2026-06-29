# -*- coding: utf-8 -*-
import sys, io, os, csv, glob
from google.cloud import bigquery
import warnings; warnings.filterwarnings('ignore')

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

client = bigquery.Client(project='covering-app-ccd23')

FOLDER  = "C:/Users/hound/OneDrive/바탕 화면/bigquery-agent/datas/crm_발송파일_26.04.22/새 폴더/"
OUT_DIR = "C:/Users/hound/OneDrive/바탕 화면/bigquery-agent/datas/crm_발송파일_26.04.29"
BATCH   = 20000

os.makedirs(OUT_DIR, exist_ok=True)

# ── 1. 기존 A/B 그룹 CSV 로드 ──────────────────────────────────────────
def load_ids(pattern):
    ids = []
    for f in sorted(glob.glob(FOLDER + pattern)):
        with open(f, encoding='utf-8-sig') as fp:
            for row in csv.DictReader(fp):
                try: ids.append(int(row['user_id']))
                except: pass
    return ids

print("기존 CSV 로드 중...")
a_ids = load_ids("crm_A*.csv")
b_ids = load_ids("crm_B*.csv")
print(f"  기존A: {len(a_ids):,}명 / 기존B: {len(b_ids):,}명")

# ── 2. 쿠폰 198/199 완료 유저 제외 ────────────────────────────────────
print("쿠폰 결제 완료 유저 조회...")
q_paid = """
SELECT DISTINCT ov.user_id, uc.coupon_policy_id
FROM `covering-app-ccd23.secure_dataset.order_v2` ov
JOIN `covering-app-ccd23.secure_dataset.user_coupon` uc ON ov.user_coupon_id = uc.id
WHERE uc.coupon_policy_id IN (198, 199)
  AND ov.status = 'COMPLETED' AND ov.deleted_at IS NULL AND ov.user_id IS NOT NULL
"""
paid_198, paid_199 = set(), set()
for r in client.query(q_paid).result():
    (paid_198 if r.coupon_policy_id == 198 else paid_199).add(r.user_id)

a_set = set(a_ids) - paid_198
b_set = set(b_ids) - paid_199
final_a = sorted(a_set)
final_b = sorted(b_set)
print(f"  기존A 최종: {len(final_a):,}명 (제외 {len(paid_198 & set(a_ids)):,}명)")
print(f"  기존B 최종: {len(final_b):,}명 (제외 {len(paid_199 & set(b_ids)):,}명)")

# ── 3. 신규 A/B 그룹 조회 ─────────────────────────────────────────────
print("신규 그룹 조회...")
q_new = """
WITH
coupon_holders AS (
  SELECT uc.user_id, uc.coupon_policy_id
  FROM `covering-app-ccd23.secure_dataset.user_coupon` uc
  WHERE uc.coupon_policy_id IN (196, 197)
    AND uc.disabled_date IS NULL AND uc.deleted_date IS NULL
    AND (uc.expire_date IS NULL OR uc.expire_date > CURRENT_TIMESTAMP())
),
in_service_area AS (
  SELECT DISTINCT ua.user_id
  FROM `covering-app-ccd23.secure_dataset.user_address` ua
  JOIN `covering-app-ccd23.secure_dataset.address` a ON ua.address_id = a.id
  JOIN `covering-app-ccd23.secure_dataset.service_region` sr ON a.h_code = sr.h_code
  WHERE ua.deleted_date IS NULL AND ua.active = true
    AND sr.active_flag = true AND sr.deleted_date IS NULL
),
marketing_agree AS (
  SELECT DISTINCT user_id FROM `covering-app-ccd23.secure_dataset.device`
  WHERE is_marketing_agree = true
),
already_used AS (
  SELECT DISTINCT ov.user_id, uc.coupon_policy_id
  FROM `covering-app-ccd23.secure_dataset.order_v2` ov
  JOIN `covering-app-ccd23.secure_dataset.user_coupon` uc ON ov.user_coupon_id = uc.id
  WHERE uc.coupon_policy_id IN (196, 197) AND ov.status = 'COMPLETED' AND ov.deleted_at IS NULL
),
all_canceled AS (
  SELECT user_id FROM `covering-app-ccd23.secure_dataset.order_v2`
  WHERE deleted_at IS NULL AND user_id IS NOT NULL
  GROUP BY user_id HAVING COUNTIF(status != 'CANCELED') = 0
),
home_kit_delivered AS (
  SELECT DISTINCT ov.user_id
  FROM `covering-app-ccd23.secure_dataset.order_v2` ov
  JOIN (
    SELECT ol.order_id,
      COUNTIF(p.product_code IN ('COVERING_BAG','LARGE_COVERING_BAG')) AS bag_cnt,
      COUNTIF(p.product_code LIKE 'PICKUP%') AS pickup_cnt
    FROM `covering-app-ccd23.secure_dataset.order_line` ol
    JOIN `covering-app-ccd23.secure_dataset.product` p ON ol.product_id = p.id
    WHERE ol.deleted_at IS NULL GROUP BY ol.order_id
  ) opt ON ov.id = opt.order_id
  WHERE ov.status='COMPLETED' AND ov.deleted_at IS NULL
    AND opt.bag_cnt > 0 AND opt.pickup_cnt = 0 AND ov.user_id IS NOT NULL
),
all_pickup_failed AS (
  SELECT ov.user_id
  FROM `covering-app-ccd23.secure_dataset.order_v2` ov
  JOIN `covering-app-ccd23.secure_dataset.fulfillment` f ON ov.id = f.order_id
  WHERE ov.deleted_at IS NULL AND ov.user_id IS NOT NULL
  GROUP BY ov.user_id
  HAVING COUNTIF(f.status='COMPLETED')=0 AND COUNTIF(f.status='FAILED')>0
)
SELECT ch.user_id, ch.coupon_policy_id
FROM coupon_holders ch
JOIN in_service_area isa ON ch.user_id = isa.user_id
JOIN marketing_agree ma ON ch.user_id = ma.user_id
JOIN `covering-app-ccd23.secure_dataset.user` u ON ch.user_id = u.id
LEFT JOIN already_used au ON ch.user_id=au.user_id AND ch.coupon_policy_id=au.coupon_policy_id
LEFT JOIN all_canceled ac ON ch.user_id = ac.user_id
LEFT JOIN home_kit_delivered hk ON ch.user_id = hk.user_id
LEFT JOIN all_pickup_failed apf ON ch.user_id = apf.user_id
WHERE au.user_id IS NULL AND u.withdrawal_date IS NULL
  AND ac.user_id IS NULL AND hk.user_id IS NULL AND apf.user_id IS NULL
ORDER BY ch.coupon_policy_id, ch.user_id
"""
new_a, new_b = [], []
for r in client.query(q_new).result():
    (new_a if r.coupon_policy_id == 196 else new_b).append(r.user_id)
print(f"  신규A: {len(new_a):,}명 / 신규B: {len(new_b):,}명")

# ── 4. 발송 스케줄 & CSV 저장 ──────────────────────────────────────────
# 봄맞이(B) 먼저, 지구의날(A) 나중 / 11:30 시작, 10분 간격
h, m = 11, 30

def hhmm(h, m): return f"{h:02d}{m:02d}"
def hm_str(h, m): return f"{h:02d}:{m:02d}"
def advance(h, m): m += 10; h += m // 60; return h, m % 60

schedule = []

# 기존B 배치
for i in range(0, len(final_b), BATCH):
    batch = final_b[i:i+BATCH]
    seq = i // BATCH + 1
    schedule.append((hm_str(h,m), f"기존B_봄맞이_{seq}차_{hhmm(h,m)}_{len(batch)}명.csv", batch))
    h, m = advance(h, m)

# 신규B (별도)
schedule.append((hm_str(h,m), f"신규B_봄맞이_{hhmm(h,m)}_{len(new_b)}명.csv", new_b))
h, m = advance(h, m)

# 기존A 배치
for i in range(0, len(final_a), BATCH):
    batch = final_a[i:i+BATCH]
    seq = i // BATCH + 1
    schedule.append((hm_str(h,m), f"기존A_지구의날_{seq}차_{hhmm(h,m)}_{len(batch)}명.csv", batch))
    h, m = advance(h, m)

# 신규A (별도)
schedule.append((hm_str(h,m), f"신규A_지구의날_{hhmm(h,m)}_{len(new_a)}명.csv", new_a))

# 저장
print(f"\n{'발송시각':<8}  {'파일명':<58}  {'인원':>8}")
print("-" * 80)
for send_t, fname, ids in schedule:
    fpath = os.path.join(OUT_DIR, fname)
    with open(fpath, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(["user_id"])
        for uid in ids:
            w.writerow([uid])
    print(f"{send_t:<8}  {fname:<58}  {len(ids):>8,}명")

print(f"\n✅ {len(schedule)}개 파일 → {OUT_DIR}")
print(f"   전체 {sum(len(x[2]) for x in schedule):,}명")
