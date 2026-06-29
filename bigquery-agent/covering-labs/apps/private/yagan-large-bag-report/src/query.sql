-- 당일 대형 봉투 수거(PICKUP_LARGE_COVERING_BAG) fulfillment 집계
-- order_line 조인으로 f.id가 중복 확장되므로 COUNT(DISTINCT) 방식으로 집계
SELECT
  COUNT(DISTINCT f.id)                                                              AS total_count,
  COUNT(DISTINCT IF(f.status IN ('COMPLETED', 'FAILED'), f.id, NULL))               AS done_count,
  COUNT(DISTINCT IF(f.status NOT IN ('COMPLETED', 'FAILED', 'CANCELED'), f.id, NULL)) AS pending_count
FROM `covering-app-ccd23.secure_dataset.fulfillment` AS f
JOIN `covering-app-ccd23.secure_dataset.order_v2`    AS o  ON o.id = f.order_id
JOIN `covering-app-ccd23.secure_dataset.order_line`  AS ol ON ol.order_id = o.id
JOIN `covering-app-ccd23.secure_dataset.product`     AS p  ON p.id = ol.product_id
WHERE
  DATE(f.scheduled_start_at, 'Asia/Seoul') = CURRENT_DATE('Asia/Seoul')
  AND p.product_code = 'PICKUP_LARGE_COVERING_BAG'
  AND f.status != 'CANCELED'
  AND o.status != 'CANCELED'
  AND o.deleted_at IS NULL
