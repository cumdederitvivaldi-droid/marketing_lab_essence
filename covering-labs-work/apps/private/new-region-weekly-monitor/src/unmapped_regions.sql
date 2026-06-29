WITH region_definitions AS (
  SELECT '충청남도' AS city, '천안시 동남구' AS region
  UNION ALL SELECT '충청남도', '천안시 서북구'
  UNION ALL SELECT '충청남도', '아산시'
  UNION ALL SELECT '대전광역시', '유성구'
  UNION ALL SELECT '대전광역시', '서구'
  UNION ALL SELECT '대전광역시', '중구'
  UNION ALL SELECT '대전광역시', '대덕구'
  UNION ALL SELECT '대전광역시', '동구'
  UNION ALL SELECT '세종특별자치시', NULL
  UNION ALL SELECT '충청북도', '청주시 상당구'
  UNION ALL SELECT '충청북도', '청주시 서원구'
  UNION ALL SELECT '충청북도', '청주시 흥덕구'
  UNION ALL SELECT '충청북도', '청주시 청원구'
),
group_map AS (
  SELECT DISTINCT sr.h_code
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
)
SELECT
  sr.region_1_depth_name AS city,
  sr.region_2_depth_name AS region,
  COUNT(DISTINCT o.user_id) AS unmapped_mau_30d
FROM `covering-app-ccd23.secure_dataset.order_v2` o
JOIN service_orders so
  ON so.order_id = o.id
JOIN `covering-app-ccd23.secure_dataset.order_address_snapshot` oas
  ON o.id = oas.order_id
JOIN `covering-app-ccd23.secure_dataset.service_region` sr
  ON sr.h_code = oas.h_code
 AND sr.active_flag = TRUE
 AND sr.deleted_date IS NULL
LEFT JOIN group_map gm
  ON gm.h_code = sr.h_code
WHERE gm.h_code IS NULL
  AND o.payment_policy_id IS NOT NULL
  AND (
    o.deleted_at IS NULL
    OR DATE_TRUNC(DATE(o.deleted_at, 'Asia/Seoul'), MONTH) > DATE_TRUNC(DATE(o.created_at, 'Asia/Seoul'), MONTH)
  )
  AND o.status IN ('READY', 'IN_PROGRESS', 'COMPLETED')
  AND DATE(o.created_at, 'Asia/Seoul') > DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 30 DAY)
  AND DATE(o.created_at, 'Asia/Seoul') <= DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 1 DAY)
  AND (
    sr.region_1_depth_name IN ('대전광역시', '세종특별자치시')
    OR (sr.region_1_depth_name = '충청북도' AND STARTS_WITH(sr.region_2_depth_name, '청주시 '))
    OR (sr.region_1_depth_name = '충청남도' AND (STARTS_WITH(sr.region_2_depth_name, '천안시 ') OR sr.region_2_depth_name = '아산시'))
  )
GROUP BY 1, 2
HAVING COUNT(DISTINCT o.user_id) > 0
ORDER BY unmapped_mau_30d DESC, city, region;
