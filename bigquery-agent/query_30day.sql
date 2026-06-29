WITH date_range AS (
  SELECT d AS signup_date
  FROM UNNEST(GENERATE_DATE_ARRAY('2026-02-25', '2026-03-11', INTERVAL 1 DAY)) AS d
),
ranked_orders AS (
  SELECT
    u.id AS user_id,
    DATE(u.created_date, 'Asia/Seoul') AS signup_date,
    CAST(FLOOR(TIMESTAMP_DIFF(o2.created_at, u.created_date, HOUR) / 24) AS INT64) AS day_diff,
    ROW_NUMBER() OVER (PARTITION BY u.id ORDER BY o2.created_at) AS rn
  FROM `covering-app-ccd23.secure_dataset.user` u
  JOIN `covering-app-ccd23.secure_dataset.order_v2` o2
    ON u.id = o2.user_id
   AND o2.status != 'CANCELED'
   AND o2.deleted_at IS NULL
  JOIN `covering-app-ccd23.secure_dataset.order_line` ol ON ol.order_id = o2.id AND ol.deleted_at IS NULL
  JOIN `covering-app-ccd23.secure_dataset.product` p    ON p.id = ol.product_id AND p.product_type = 'SERVICE'
  WHERE DATE(u.created_date, 'Asia/Seoul') BETWEEN '2026-02-25' AND '2026-03-11'
    AND u.withdrawal_date IS NULL
),
first_order AS (
  SELECT user_id, signup_date, day_diff
  FROM ranked_orders
  WHERE rn = 1
),
converted_30d AS (
  SELECT signup_date, COUNT(DISTINCT user_id) AS converted_users
  FROM first_order
  WHERE day_diff <= 29
  GROUP BY signup_date
),
total_signups AS (
  SELECT DATE(created_date, 'Asia/Seoul') AS signup_date, COUNT(DISTINCT id) AS total_users
  FROM `covering-app-ccd23.secure_dataset.user`
  WHERE DATE(created_date, 'Asia/Seoul') BETWEEN '2026-02-25' AND '2026-03-11'
    AND withdrawal_date IS NULL
  GROUP BY DATE(created_date, 'Asia/Seoul')
)
SELECT
  dr.signup_date,
  COALESCE(ts.total_users, 0)     AS total_signups,
  COALESCE(c.converted_users, 0)  AS converted_within_30days,
  ROUND(SAFE_DIVIDE(COALESCE(c.converted_users, 0) * 100.0, ts.total_users), 1) AS conversion_rate_pct
FROM date_range dr
LEFT JOIN total_signups ts ON dr.signup_date = ts.signup_date
LEFT JOIN converted_30d  c ON dr.signup_date = c.signup_date
ORDER BY dr.signup_date ASC
