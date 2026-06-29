-- 수거 지연 리포트: 전날 수거 예정이었으나 오전 8시 기준 미완료된 개인 주문
-- - scheduled_start_at 기준 전날(KST) 수거 건
-- - fulfillment status COMPLETED/CANCELED 제외 (미완료만)
-- - 개인 주문(company_id IS NULL)만, 봉투배송(product_type=GOODS 전용) 제외
SELECT
  o.order_number,
  FORMAT_DATETIME('%H:%M', DATETIME(f.scheduled_start_at, 'Asia/Seoul')) AS scheduled_time,
  f.status                                                                AS fulfillment_status,
  o.status                                                                AS order_status,
  COALESCE(sr.region_1_depth_name, '')                                   AS city,
  COALESCE(sr.region_2_depth_name, '')                                   AS district,
  COALESCE(r.username, '미배차')                                          AS rider_name
FROM `covering-app-ccd23.secure_dataset.order_v2` AS o
JOIN `covering-app-ccd23.secure_dataset.fulfillment` AS f
  ON f.order_id = o.id
JOIN `covering-app-ccd23.secure_dataset.order_line` AS ol
  ON ol.order_id = o.id
JOIN `covering-app-ccd23.secure_dataset.product` AS p
  ON p.id = ol.product_id
LEFT JOIN `covering-app-ccd23.secure_dataset.rider` AS r
  ON r.id = f.rider_id
LEFT JOIN `covering-app-ccd23.secure_dataset.order_address_snapshot` AS oas
  ON oas.order_id = o.id
LEFT JOIN `covering-app-ccd23.secure_dataset.service_region` AS sr
  ON sr.h_code = oas.h_code
WHERE
  DATE(f.scheduled_start_at, 'Asia/Seoul') = DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 1 DAY)
  AND f.status NOT IN ('COMPLETED', 'CANCELED', 'FAILED')
  AND o.status != 'CANCELED'
  AND o.company_id IS NULL
  AND o.deleted_at IS NULL
  AND p.product_type = 'SERVICE'
QUALIFY ROW_NUMBER() OVER (PARTITION BY f.id ORDER BY oas.order_id NULLS LAST) = 1
ORDER BY
  f.scheduled_start_at ASC
