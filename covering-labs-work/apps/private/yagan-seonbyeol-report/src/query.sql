-- 당일 야간 배차된 기사님의 도착지(선별장)별 기사 수 및 봉투 배차 수
SELECT
  COALESCE(r.final_destination, '미지정') AS destination,
  COUNT(DISTINCT f.rider_id)              AS rider_count,
  COUNT(DISTINCT f.id)                    AS bag_count
FROM `covering-app-ccd23.secure_dataset.fulfillment` AS f
JOIN `covering-app-ccd23.secure_dataset.order_v2` AS o
  ON o.id = f.order_id
LEFT JOIN `covering-app-ccd23.secure_dataset.rider` AS r
  ON r.id = f.rider_id
WHERE
  DATE(f.scheduled_start_at, 'Asia/Seoul') = CURRENT_DATE('Asia/Seoul')
  AND f.rider_id IS NOT NULL
  AND f.status != 'CANCELED'
  AND o.status != 'CANCELED'
  AND o.deleted_at IS NULL
  AND COALESCE(r.username, '') NOT IN ('김형주', '부정빈', '양승묵', '채지훈', '최인준', '프로덕션테스트')
GROUP BY r.final_destination
ORDER BY r.final_destination ASC
