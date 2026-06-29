-- 당일 배차된 야간기사 중 22:20 기준 수거 완료 건이 없는 기사
-- - 개인·기업 주문 및 봉투배송 모두 포함
-- - COMPLETED 또는 FAILED가 0건인 기사만 추출 (성공·실패 모두 완료로 인정)
SELECT
  COALESCE(r.username, '이름없음') AS rider_name,
  COUNT(DISTINCT f.id)             AS assigned_count
FROM `covering-app-ccd23.secure_dataset.fulfillment` AS f
JOIN `covering-app-ccd23.secure_dataset.order_v2` AS o
  ON o.id = f.order_id
LEFT JOIN `covering-app-ccd23.secure_dataset.rider` AS r
  ON r.id = f.rider_id
WHERE
  DATE(f.scheduled_start_at, 'Asia/Seoul') = CURRENT_DATE('Asia/Seoul')
  AND f.status != 'CANCELED'
  AND f.rider_id IS NOT NULL
  AND o.status != 'CANCELED'
  AND o.deleted_at IS NULL
GROUP BY f.rider_id, r.username
HAVING COUNTIF(f.status IN ('COMPLETED', 'FAILED')) = 0
ORDER BY r.username ASC
