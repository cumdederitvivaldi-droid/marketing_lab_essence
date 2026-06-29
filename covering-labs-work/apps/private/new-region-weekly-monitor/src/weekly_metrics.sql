WITH region_definitions AS (
  SELECT 1 AS group_id, '천안' AS group_title, '충청남도' AS city, '천안시 동남구' AS region
  UNION ALL SELECT 1, '천안', '충청남도', '천안시 서북구'
  UNION ALL SELECT 2, '아산', '충청남도', '아산시'
  UNION ALL SELECT 3, '대전 유성', '대전광역시', '유성구'
  UNION ALL SELECT 4, '대전 서중', '대전광역시', '서구'
  UNION ALL SELECT 4, '대전 서중', '대전광역시', '중구'
  UNION ALL SELECT 5, '대전 대덕동', '대전광역시', '대덕구'
  UNION ALL SELECT 5, '대전 대덕동', '대전광역시', '동구'
  UNION ALL SELECT 6, '세종', '세종특별자치시', NULL
  UNION ALL SELECT 7, '청주 상당서원', '충청북도', '청주시 상당구'
  UNION ALL SELECT 7, '청주 상당서원', '충청북도', '청주시 서원구'
  UNION ALL SELECT 8, '청주 흥덕', '충청북도', '청주시 흥덕구'
  UNION ALL SELECT 9, '청주 청원', '충청북도', '청주시 청원구'
),
group_map AS (
  SELECT DISTINCT
    rd.group_id,
    rd.group_title,
    sr.region_1_depth_name AS city,
    sr.region_2_depth_name AS region,
    sr.h_code
  FROM region_definitions rd
  JOIN `covering-app-ccd23.secure_dataset.service_region` sr
    ON sr.region_1_depth_name = rd.city
   AND COALESCE(sr.region_2_depth_name, '') = COALESCE(rd.region, '')
   AND sr.deleted_date IS NULL
   AND sr.active_flag = TRUE
),
service_orders AS (
  SELECT DISTINCT ol.order_id
  FROM `covering-app-ccd23.secure_dataset.order_line` ol
  JOIN `covering-app-ccd23.secure_dataset.product` p
    ON p.id = ol.product_id
  WHERE ol.deleted_at IS NULL
    AND p.product_type = 'SERVICE'
),
paid_service_orders AS (
  SELECT
    o.id AS order_id,
    o.user_id,
    DATE(o.created_at, 'Asia/Seoul') AS order_date,
    gm.group_id,
    gm.group_title,
    gm.city,
    gm.region
  FROM `covering-app-ccd23.secure_dataset.order_v2` o
  JOIN service_orders so
    ON so.order_id = o.id
  JOIN `covering-app-ccd23.secure_dataset.order_address_snapshot` oas
    ON o.id = oas.order_id
  JOIN group_map gm
    ON gm.h_code = oas.h_code
  WHERE o.payment_policy_id IS NOT NULL
    AND (
      o.deleted_at IS NULL
      OR DATE_TRUNC(DATE(o.deleted_at, 'Asia/Seoul'), MONTH) > DATE_TRUNC(DATE(o.created_at, 'Asia/Seoul'), MONTH)
    )
    AND o.status IN ('READY', 'IN_PROGRESS', 'COMPLETED')
    AND o.user_id IS NOT NULL
),
group_open AS (
  SELECT
    group_id,
    ANY_VALUE(group_title) AS group_title,
    MIN(order_date) AS open_date
  FROM paid_service_orders
  GROUP BY group_id
),
current_mau AS (
  SELECT
    group_id,
    COUNT(DISTINCT user_id) AS mau_30d,
    COUNT(*) AS orders_30d
  FROM paid_service_orders
  WHERE order_date > DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 30 DAY)
    AND order_date <= DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 1 DAY)
  GROUP BY 1
),
prev_mau AS (
  SELECT
    group_id,
    COUNT(DISTINCT user_id) AS mau_prev_30d
  FROM paid_service_orders
  WHERE order_date > DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 37 DAY)
    AND order_date <= DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 8 DAY)
  GROUP BY 1
),
first_payers AS (
  SELECT
    user_id,
    MIN(order_date) AS first_pay_date
  FROM paid_service_orders
  GROUP BY 1
),
new_payers_7d AS (
  SELECT
    p.group_id,
    COUNT(DISTINCT p.user_id) AS new_payers_7d
  FROM paid_service_orders p
  JOIN first_payers fp
    ON fp.user_id = p.user_id
   AND fp.first_pay_date = p.order_date
  WHERE p.order_date >= DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 7 DAY)
    AND p.order_date <= DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 1 DAY)
  GROUP BY 1
),
group_regions AS (
  SELECT
    group_id,
    STRING_AGG(DISTINCT COALESCE(region, city), ', ' ORDER BY COALESCE(region, city)) AS regions
  FROM group_map
  GROUP BY 1
)
SELECT
  go.group_id,
  go.group_title,
  gr.regions,
  go.open_date,
  DATE_DIFF(CURRENT_DATE('Asia/Seoul'), go.open_date, DAY) AS days_since_open,
  COALESCE(cm.mau_30d, 0) AS mau_30d,
  COALESCE(pm.mau_prev_30d, 0) AS mau_prev_30d,
  ROUND(
    SAFE_DIVIDE(
      COALESCE(cm.mau_30d, 0) - COALESCE(pm.mau_prev_30d, 0),
      NULLIF(pm.mau_prev_30d, 0)
    ) * 100,
    1
  ) AS wow_pct,
  COALESCE(np.new_payers_7d, 0) AS new_payers_7d,
  COALESCE(cm.orders_30d, 0) AS orders_30d,
  GREATEST(500 - COALESCE(cm.mau_30d, 0), 0) AS gap_to_500,
  CASE
    WHEN COALESCE(cm.mau_30d, 0) >= 500 THEN '통과권'
    WHEN COALESCE(cm.mau_30d, 0) = 0 OR DATE_DIFF(CURRENT_DATE('Asia/Seoul'), go.open_date, DAY) = 0 THEN '보류권'
    WHEN SAFE_DIVIDE(
      500,
      SAFE_DIVIDE(COALESCE(cm.mau_30d, 0), DATE_DIFF(CURRENT_DATE('Asia/Seoul'), go.open_date, DAY))
    ) <= DATE_DIFF(CURRENT_DATE('Asia/Seoul'), go.open_date, DAY) + 90 THEN '근접권'
    ELSE '보류권'
  END AS zone,
  CASE
    WHEN COALESCE(cm.mau_30d, 0) >= 500 THEN NULL
    WHEN COALESCE(cm.mau_30d, 0) = 0 OR DATE_DIFF(CURRENT_DATE('Asia/Seoul'), go.open_date, DAY) = 0 THEN NULL
    ELSE DATE_ADD(
      go.open_date,
      INTERVAL CAST(
        CEIL(
          SAFE_DIVIDE(
            500,
            SAFE_DIVIDE(COALESCE(cm.mau_30d, 0), DATE_DIFF(CURRENT_DATE('Asia/Seoul'), go.open_date, DAY))
          )
        ) AS INT64
      ) DAY
    )
  END AS eta_500_date
FROM group_open go
LEFT JOIN current_mau cm USING (group_id)
LEFT JOIN prev_mau pm USING (group_id)
LEFT JOIN new_payers_7d np USING (group_id)
LEFT JOIN group_regions gr USING (group_id)
ORDER BY
  CASE zone
    WHEN '통과권' THEN 0
    WHEN '근접권' THEN 1
    ELSE 2
  END,
  mau_30d DESC,
  open_date ASC;
