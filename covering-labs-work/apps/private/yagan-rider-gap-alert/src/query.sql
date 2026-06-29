-- 야간기사 중 마지막 완료(수거·봉투배송 성공·실패) 이후 30분 이상 다음 완료 없는 기사
-- (세션 내 완료 이력 없는 기사도 포함)
-- - 야간 세션(22:00~08:00) 전체 대상 — scheduled_start_at 기준 세션 필터로 날짜 경계 버그 수정
-- - fulfillment.updated_at 기준으로 마지막 완료 시각 산출
WITH
session_start AS (
  -- 22:00~23:59 → 오늘 22:00 KST, 00:00~07:59 → 어제 22:00 KST
  SELECT TIMESTAMP(
    CASE
      WHEN EXTRACT(HOUR FROM CURRENT_DATETIME('Asia/Seoul')) >= 22
      THEN DATETIME(CURRENT_DATE('Asia/Seoul'), TIME(22, 0, 0))
      ELSE DATETIME(DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 1 DAY), TIME(22, 0, 0))
    END,
    'Asia/Seoul'
  ) AS start_ts
),
rider_stats AS (
  SELECT
    f.rider_id,
    MAX(CASE WHEN f.status IN ('COMPLETED', 'FAILED') THEN f.updated_at END) AS last_completed_at,
    MIN(f.scheduled_start_at)                                                 AS first_scheduled_at,
    COUNTIF(f.status NOT IN ('COMPLETED', 'FAILED', 'CANCELED'))              AS pending_count
  FROM `covering-app-ccd23.secure_dataset.fulfillment` AS f
  CROSS JOIN session_start AS ss
  WHERE
    -- 세션 시작(22:00 KST) 이후 10시간(08:00 KST)까지의 건만 포함 — CURRENT_DATE 대신 사용
    f.scheduled_start_at >= ss.start_ts
    AND f.scheduled_start_at <  TIMESTAMP_ADD(ss.start_ts, INTERVAL 10 HOUR)
    AND f.rider_id IS NOT NULL
  GROUP BY f.rider_id
)
SELECT
  rs.rider_id,
  COALESCE(r.username, '이름없음')                                              AS rider_name,
  COALESCE(
    FORMAT_DATETIME('%H:%M', DATETIME(rs.last_completed_at, 'Asia/Seoul')),
    '완료없음'
  )                                                                            AS last_completed_time,
  TIMESTAMP_DIFF(
    CURRENT_TIMESTAMP(),
    COALESCE(rs.last_completed_at, rs.first_scheduled_at),
    MINUTE
  )                                                                            AS minutes_since_last,
  rs.pending_count
FROM rider_stats AS rs
CROSS JOIN session_start AS ss
LEFT JOIN `covering-app-ccd23.secure_dataset.rider` AS r
  ON r.id = rs.rider_id
WHERE
  rs.pending_count > 0
  AND (
    -- 세션 내 완료 이력 있음 + 마지막 완료 후 30분 이상 경과
    (rs.last_completed_at IS NOT NULL
     AND rs.last_completed_at >= ss.start_ts
     AND TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), rs.last_completed_at, MINUTE) >= 30)
    OR
    -- 세션 내 완료 이력 없음 + 첫 배정 건 시작 후 30분 이상 경과
    (rs.last_completed_at IS NULL
     AND TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), rs.first_scheduled_at, MINUTE) >= 30)
  )
ORDER BY COALESCE(rs.last_completed_at, rs.first_scheduled_at) ASC
