WITH params AS (
  SELECT
    @report_date AS report_day,
    TIMESTAMP(DATETIME(DATE_ADD(@report_date, INTERVAL 1 DAY), TIME '00:00:00'), 'Asia/Seoul') AS report_end_ts
),
windows AS (
  SELECT 1 AS sort_order, 'D+0' AS window_label, 1 AS horizon_days
  UNION ALL SELECT 2, 'D+1', 2
  UNION ALL SELECT 3, 'D+2', 3
  UNION ALL SELECT 4, 'D+3', 4
  UNION ALL SELECT 5, 'D+7', 8
),
latest_ledger AS (
  SELECT * EXCEPT(rn)
  FROM (
    SELECT
      l.*,
      ROW_NUMBER() OVER (
        PARTITION BY l.user_id
        ORDER BY l.processed_at DESC, l.assigned_at DESC
      ) AS rn
    FROM `covering-app-ccd23.product.first_free_coupon_ledger_v1` AS l
    CROSS JOIN params AS p
    WHERE l.assigned_at < p.report_end_ts
  )
  WHERE rn = 1
),
cohort AS (
  SELECT
    user_id,
    signed_up_at,
    variant
  FROM latest_ledger
  WHERE variant IN ('control', 'treatment')
),
order_base AS (
  SELECT
    o.id AS order_id,
    o.user_id,
    o.created_at AS order_created_at
  FROM `covering-app-ccd23.secure_dataset.order_v2` AS o
  JOIN cohort AS c
    ON c.user_id = o.user_id
  CROSS JOIN params AS p
  WHERE o.user_id IS NOT NULL
    AND o.deleted_at IS NULL
    AND o.status != 'CANCELED'
    AND o.created_at >= c.signed_up_at
    AND o.created_at < p.report_end_ts
),
order_flags AS (
  SELECT
    ob.order_id,
    ob.user_id,
    ob.order_created_at,
    LOGICAL_OR(p.product_code IN ('COVERING_BAG', 'LARGE_COVERING_BAG')) AS has_bag,
    LOGICAL_OR(p.product_type = 'SERVICE') AS has_pickup
  FROM order_base AS ob
  JOIN `covering-app-ccd23.secure_dataset.order_line` AS ol
    ON ol.order_id = ob.order_id
   AND ol.deleted_at IS NULL
  JOIN `covering-app-ccd23.secure_dataset.product` AS p
    ON p.id = ol.product_id
  GROUP BY 1, 2, 3
),
matured AS (
  SELECT
    w.sort_order,
    w.window_label,
    w.horizon_days,
    c.user_id,
    c.variant,
    c.signed_up_at
  FROM windows AS w
  CROSS JOIN cohort AS c
  CROSS JOIN params AS p
  WHERE c.signed_up_at < TIMESTAMP_SUB(p.report_end_ts, INTERVAL w.horizon_days DAY)
),
converted AS (
  SELECT
    m.sort_order,
    m.window_label,
    m.horizon_days,
    m.user_id,
    m.variant,
    LOGICAL_OR(ord.has_bag) AS converted_bag,
    LOGICAL_OR(ord.has_pickup) AS converted_pickup
  FROM matured AS m
  LEFT JOIN order_flags AS ord
    ON ord.user_id = m.user_id
   AND ord.order_created_at >= m.signed_up_at
   AND ord.order_created_at < TIMESTAMP_ADD(m.signed_up_at, INTERVAL m.horizon_days DAY)
  GROUP BY 1, 2, 3, 4, 5
)
SELECT
  w.sort_order,
  w.window_label,
  w.horizon_days,
  COUNT(DISTINCT IF(c.variant = 'control', c.user_id, NULL)) AS control_matured_users,
  COUNT(DISTINCT IF(c.variant = 'treatment', c.user_id, NULL)) AS treatment_matured_users,
  COUNT(DISTINCT IF(c.variant = 'control' AND c.converted_bag, c.user_id, NULL)) AS control_bag_users,
  COUNT(DISTINCT IF(c.variant = 'treatment' AND c.converted_bag, c.user_id, NULL)) AS treatment_bag_users,
  COUNT(DISTINCT IF(c.variant = 'control' AND c.converted_pickup, c.user_id, NULL)) AS control_pickup_users,
  COUNT(DISTINCT IF(c.variant = 'treatment' AND c.converted_pickup, c.user_id, NULL)) AS treatment_pickup_users
FROM windows AS w
LEFT JOIN converted AS c
  ON c.sort_order = w.sort_order
GROUP BY 1, 2, 3
ORDER BY w.sort_order
