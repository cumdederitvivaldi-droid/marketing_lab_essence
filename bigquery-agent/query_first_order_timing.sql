WITH first_service_order AS (
  SELECT DISTINCT o.id AS order_id, o.user_id, o.created_at
  FROM `covering-app-ccd23.secure_dataset.order_v2` o
  WHERE o.status = 'COMPLETED'
    AND o.deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM `covering-app-ccd23.secure_dataset.order_line` ol
      JOIN `covering-app-ccd23.secure_dataset.product` p ON p.id = ol.product_id
      WHERE ol.order_id = o.id
        AND ol.deleted_at IS NULL
        AND p.product_type = 'SERVICE'
    )
),
filtered_user AS (
  SELECT
    u.id,
    DATE_DIFF(
      DATE(MIN(fso.created_at), 'Asia/Seoul'),
      DATE(u.created_date, 'Asia/Seoul'),
      DAY
    ) AS day_diff
  FROM `covering-app-ccd23.secure_dataset.user` u
  JOIN first_service_order fso ON fso.user_id = u.id
  WHERE DATE(u.created_date, 'Asia/Seoul') = '2026-04-23'
  GROUP BY u.id, u.created_date
),
total_signups AS (
  SELECT COUNT(*) AS cnt
  FROM `covering-app-ccd23.secure_dataset.user`
  WHERE DATE(created_date, 'Asia/Seoul') = '2026-04-23'
    AND withdrawal_date IS NULL
)
SELECT
  day_diff + 1                                                          AS within_n_days,
  SUM(COUNT(*)) OVER (ORDER BY day_diff + 1)                           AS cum_users,
  (SELECT cnt FROM total_signups)                                       AS total_signups_cnt,
  ROUND(
    SAFE_DIVIDE(
      SUM(COUNT(*)) OVER (ORDER BY day_diff + 1),
      (SELECT cnt FROM total_signups)
    ) * 100,
    1
  )                                                                     AS ratio_pct
FROM filtered_user
GROUP BY day_diff
ORDER BY day_diff
