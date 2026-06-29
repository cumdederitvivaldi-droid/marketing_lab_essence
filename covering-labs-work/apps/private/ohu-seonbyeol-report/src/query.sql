-- work_days: JSON 배열, 인덱스 0=월 ~ 6=일
-- DAYOFWEEK: 1=일, 2=월, ..., 7=토 → (DAYOFWEEK + 5) % 7 로 월=0 인덱스로 변환
SELECT
  COALESCE(r.final_destination, '미지정') AS destination,
  COUNT(*)                                AS rider_count
FROM `covering-app-ccd23.secure_dataset.rider` AS r
WHERE
  r.active_flag = true
  AND r.work_shift = 'NIGHT'
  AND r.username NOT IN ('김형주', '부정빈', '양승묵', '채지훈', '최인준', '프로덕션테스트')
  AND JSON_VALUE(
        r.work_days,
        CONCAT('$[', CAST(MOD(EXTRACT(DAYOFWEEK FROM CURRENT_DATE('Asia/Seoul')) + 5, 7) AS STRING), ']')
      ) = '1'
GROUP BY r.final_destination
ORDER BY r.final_destination ASC
