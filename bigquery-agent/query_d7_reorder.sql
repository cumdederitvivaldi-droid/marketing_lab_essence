WITH paid_users AS (
  SELECT DISTINCT user_id
  FROM `covering-app-ccd23.ads_data.user_acquisition_channel`
  WHERE ad_channel IN ('google.adwords', 'facebook.business', 'apple.searchads', 'tiktok')
    AND signup_date BETWEEN '2026-04-21' AND '2026-05-21'
),
first_orders AS (
  SELECT
    o.user_id,
    MIN(o.created_at) AS first_order_at,
    DATE(MIN(o.created_at), 'Asia/Seoul') AS first_order_date
  FROM `covering-app-ccd23.secure_dataset.order_v2` o
  JOIN paid_users pu ON o.user_id = pu.user_id
  JOIN `covering-app-ccd23.secure_dataset.order_line` ol ON ol.order_id = o.id AND ol.deleted_at IS NULL
  JOIN `covering-app-ccd23.secure_dataset.product` p ON p.id = ol.product_id AND p.product_type = 'SERVICE'
  WHERE o.status != 'CANCELED'
    AND o.deleted_at IS NULL
    AND DATE(o.created_at, 'Asia/Seoul') BETWEEN '2026-04-21' AND '2026-05-21'
  GROUP BY o.user_id
),
reorders AS (
  SELECT
    fo.user_id,
    fo.first_order_at,
    fo.first_order_date,
    COUNT(o2.id) AS reorder_count
  FROM first_orders fo
  LEFT JOIN `covering-app-ccd23.secure_dataset.order_v2` o2
    ON o2.user_id = fo.user_id
    AND o2.created_at > fo.first_order_at
    AND TIMESTAMP_DIFF(o2.created_at, fo.first_order_at, HOUR) <= 168
    AND o2.status != 'CANCELED'
    AND o2.deleted_at IS NULL
  GROUP BY fo.user_id, fo.first_order_at, fo.first_order_date
)
SELECT
  CASE
    WHEN first_order_date BETWEEN '2026-04-21' AND '2026-05-07' THEN '회고전주'
    WHEN first_order_date BETWEEN '2026-05-08' AND '2026-05-21' THEN '회고주'
  END AS period,
  COUNT(*) AS cohort_size,
  COUNTIF(reorder_count > 0) AS reordered_users,
  ROUND(COUNTIF(reorder_count > 0) * 100.0 / COUNT(*), 1) AS d7_reorder_rate_pct
FROM reorders
WHERE first_order_date BETWEEN '2026-04-21' AND '2026-05-21'
GROUP BY period
ORDER BY period
