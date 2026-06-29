WITH

base_users AS (
  SELECT
    id                                              AS user_id,
    nickname,
    DATE(DATETIME(created_date, 'Asia/Seoul'))      AS signup_date,
    withdrawal_date
  FROM `covering-app-ccd23.secure_dataset.user`
  WHERE DATE(DATETIME(created_date, 'Asia/Seoul')) <= '2026-04-19'
    AND withdrawal_date IS NULL
),

marketing_consent AS (
  SELECT user_id, is_marketing_agree AS has_consent
  FROM (
    SELECT
      user_id,
      is_marketing_agree,
      ROW_NUMBER() OVER (
        PARTITION BY user_id
        ORDER BY COALESCE(updated_is_marketing_agree_date, updated_date, created_date) DESC NULLS LAST
      ) AS rn
    FROM `covering-app-ccd23.secure_dataset.device`
    WHERE user_id IS NOT NULL
  )
  WHERE rn = 1
),

users_over_0kg AS (
  SELECT DISTINCT o.user_id
  FROM `covering-app-ccd23.secure_dataset.order_v2` o
  JOIN `covering-app-ccd23.secure_dataset.fulfillment`      f  ON o.id = f.order_id
  JOIN `covering-app-ccd23.secure_dataset.fulfillment_item` fi ON f.id = fi.fulfillment_id
  WHERE fi.actual_weight_grams > 0
    AND fi.deleted_at IS NULL
    AND o.deleted_at  IS NULL
    AND o.user_id     IS NOT NULL
),

bag_delivery_completed AS (
  SELECT DISTINCT o.user_id
  FROM `covering-app-ccd23.secure_dataset.order_v2`   o
  JOIN `covering-app-ccd23.secure_dataset.order_line` ol ON o.id  = ol.order_id
  JOIN `covering-app-ccd23.secure_dataset.product`    p  ON ol.product_id = p.id
  WHERE p.product_code IN ('free_home_kit', 'paid_home_kit')
    AND o.status       = 'COMPLETED'
    AND ol.deleted_at IS NULL
    AND o.deleted_at  IS NULL
    AND o.user_id     IS NOT NULL
),

bag_delivery_7days AS (
  SELECT DISTINCT o.user_id
  FROM `covering-app-ccd23.secure_dataset.order_v2`   o
  JOIN `covering-app-ccd23.secure_dataset.order_line` ol ON o.id  = ol.order_id
  JOIN `covering-app-ccd23.secure_dataset.product`    p  ON ol.product_id = p.id
  WHERE p.product_code IN ('free_home_kit', 'paid_home_kit')
    AND o.status        = 'COMPLETED'
    AND DATE(DATETIME(o.updated_at, 'Asia/Seoul'))
          >= DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 7 DAY)
    AND ol.deleted_at  IS NULL
    AND o.deleted_at   IS NULL
    AND o.user_id      IS NOT NULL
),

service_order_stats AS (
  SELECT
    o.user_id,
    COUNT(DISTINCT o.id)       AS total_cnt,
    COUNTIF(o.status = 'CANCELED') AS canceled_cnt
  FROM `covering-app-ccd23.secure_dataset.order_v2`   o
  JOIN `covering-app-ccd23.secure_dataset.order_line` ol ON o.id  = ol.order_id
  JOIN `covering-app-ccd23.secure_dataset.product`    p  ON ol.product_id = p.id
  WHERE p.product_type  = 'SERVICE'
    AND o.deleted_at   IS NULL
    AND o.user_id      IS NOT NULL
    AND ol.deleted_at  IS NULL
  GROUP BY o.user_id
),

only_canceled_users AS (
  SELECT user_id
  FROM service_order_stats
  WHERE total_cnt > 0 AND total_cnt = canceled_cnt
),

users_with_failure AS (
  SELECT DISTINCT o.user_id
  FROM `covering-app-ccd23.secure_dataset.order_v2` o
  JOIN `covering-app-ccd23.secure_dataset.fulfillment` f ON o.id = f.order_id
  WHERE f.failure_reason_code IN ('ENTER_FAIL', 'NOTFOUND_FAIL', 'POLICY_FAIL')
    AND f.status       = 'FAILED'
    AND o.deleted_at  IS NULL
    AND o.user_id     IS NOT NULL
),

user_active_address AS (
  SELECT ua.user_id, a.road_address, a.h_code
  FROM (
    SELECT
      user_id,
      address_id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id
        ORDER BY updated_date DESC NULLS LAST
      ) AS rn
    FROM `covering-app-ccd23.secure_dataset.user_address`
    WHERE active       = TRUE
      AND deleted_date IS NULL
  ) ua
  JOIN `covering-app-ccd23.secure_dataset.address` a
    ON ua.address_id = a.id
   AND a.deleted_date IS NULL
  WHERE ua.rn = 1
),

active_service_h_codes AS (
  SELECT DISTINCT h_code
  FROM `covering-app-ccd23.secure_dataset.service_region`
  WHERE active_flag  = TRUE
    AND deleted_date IS NULL
),

last_order_products AS (
  SELECT
    o.user_id,
    STRING_AGG(DISTINCT p.name ORDER BY p.name) AS products,
    o.created_at
  FROM `covering-app-ccd23.secure_dataset.order_v2`   o
  JOIN `covering-app-ccd23.secure_dataset.order_line` ol ON o.id  = ol.order_id
  JOIN `covering-app-ccd23.secure_dataset.product`    p  ON ol.product_id = p.id
  WHERE o.deleted_at IS NULL
    AND o.user_id    IS NOT NULL
    AND ol.deleted_at IS NULL
  GROUP BY o.user_id, o.id, o.created_at
),

last_event AS (
  SELECT user_id, products AS last_products, created_at AS last_order_at
  FROM (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
    FROM last_order_products
  )
  WHERE rn = 1
)

SELECT
  u.nickname                                                        AS nickname,
  u.user_id                                                         AS user_id,
  u.signup_date                                                     AS signup_date,
  CASE WHEN mc.has_consent THEN 'Y' ELSE 'N' END                    AS marketing_agree,
  'N'                                                               AS is_withdrawn,
  'N'                                                               AS has_over_0kg,
  COALESCE(le.last_products, 'no_history')                          AS last_event_type,
  FORMAT_DATETIME('%Y-%m-%d %H:%M:%S',
    DATETIME(le.last_order_at, 'Asia/Seoul'))                       AS last_event_datetime,
  COALESCE(ua.road_address,  'no_address')                          AS current_address,
  CASE WHEN ash.h_code IS NOT NULL THEN 'Y' ELSE 'N' END            AS in_service_area

FROM base_users u
LEFT JOIN marketing_consent      mc  ON u.user_id  = mc.user_id
LEFT JOIN user_active_address    ua  ON u.user_id  = ua.user_id
LEFT JOIN active_service_h_codes ash ON ua.h_code  = ash.h_code
LEFT JOIN last_event             le  ON u.user_id  = le.user_id

WHERE
  ash.h_code IS NOT NULL
  AND mc.has_consent = TRUE
  AND u.user_id NOT IN (SELECT user_id FROM users_over_0kg)
  AND u.user_id NOT IN (SELECT user_id FROM bag_delivery_completed)
  AND u.user_id NOT IN (SELECT user_id FROM bag_delivery_7days)
  AND u.user_id NOT IN (SELECT user_id FROM only_canceled_users)
  AND u.user_id NOT IN (SELECT user_id FROM users_with_failure)

ORDER BY u.signup_date, u.user_id
