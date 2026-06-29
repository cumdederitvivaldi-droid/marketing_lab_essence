WITH params AS (
  SELECT @report_date AS report_day
),
paid_orders AS (
  SELECT
    o.id AS order_id,
    o.user_id,
    DATE(MIN(r.created_at), 'Asia/Seoul') AS paid_day,
    SUM(r.total_amount) AS paid_amount
  FROM `covering-app-ccd23.secure_dataset.order_v2` AS o
  JOIN `covering-app-ccd23.secure_dataset.order_invoice` AS oi
    ON oi.order_id = o.id
  JOIN `covering-app-ccd23.secure_dataset.invoice` AS i
    ON i.id = oi.invoice_id
  JOIN `covering-app-ccd23.secure_dataset.receipt` AS r
    ON r.invoice_id = i.id
   AND r.status = 'PAID'
   AND r.deleted_at IS NULL
  CROSS JOIN params AS p
  WHERE o.user_id IS NOT NULL
    AND o.deleted_at IS NULL
    AND o.status != 'CANCELED'
    AND DATE(r.created_at, 'Asia/Seoul') BETWEEN DATE_SUB(p.report_day, INTERVAL 6 DAY) AND p.report_day
  GROUP BY 1, 2
),
order_flags AS (
  SELECT
    po.order_id,
    po.user_id,
    po.paid_day,
    po.paid_amount,
    LOGICAL_OR(p.product_type = 'SERVICE') AS has_service,
    LOGICAL_OR(p.product_code = 'PICKUP_LARGE_COVERING_BAG') AS has_large_waste
  FROM paid_orders AS po
  JOIN `covering-app-ccd23.secure_dataset.order_line` AS ol
    ON ol.order_id = po.order_id
   AND ol.deleted_at IS NULL
  JOIN `covering-app-ccd23.secure_dataset.product` AS p
    ON p.id = ol.product_id
  GROUP BY 1, 2, 3, 4
),
daily_paid AS (
  SELECT
    paid_day,
    COUNT(DISTINCT IF(has_service, order_id, NULL)) AS service_orders,
    COUNT(DISTINCT IF(has_large_waste, order_id, NULL)) AS large_orders,
    COUNT(DISTINCT IF(has_large_waste, user_id, NULL)) AS large_users,
    SUM(IF(has_large_waste, paid_amount, 0)) AS large_revenue
  FROM order_flags
  GROUP BY 1
),
large_order_ids AS (
  SELECT DISTINCT o.id AS order_id
  FROM `covering-app-ccd23.secure_dataset.order_v2` AS o
  JOIN `covering-app-ccd23.secure_dataset.order_line` AS ol
    ON ol.order_id = o.id
   AND ol.deleted_at IS NULL
  JOIN `covering-app-ccd23.secure_dataset.product` AS p
    ON p.id = ol.product_id
   AND p.product_code = 'PICKUP_LARGE_COVERING_BAG'
  CROSS JOIN params AS prm
  WHERE o.deleted_at IS NULL
    AND o.status != 'CANCELED'
    AND DATE(o.created_at, 'Asia/Seoul') BETWEEN DATE_SUB(prm.report_day, INTERVAL 90 DAY) AND prm.report_day
),
fulfillment_base AS (
  SELECT
    f.order_id,
    DATE(COALESCE(f.scheduled_start_at, f.created_at), 'Asia/Seoul') AS scheduled_day,
    f.status,
    f.completed_at,
    f.updated_at,
    f.failure_reason_code
  FROM `covering-app-ccd23.secure_dataset.fulfillment` AS f
  JOIN large_order_ids AS loi
    ON loi.order_id = f.order_id
  CROSS JOIN params AS p
  WHERE DATE(COALESCE(f.scheduled_start_at, f.created_at), 'Asia/Seoul')
        BETWEEN DATE_SUB(p.report_day, INTERVAL 6 DAY) AND p.report_day
),
order_day_status AS (
  SELECT
    order_id,
    scheduled_day,
    COUNTIF(status = 'COMPLETED') AS completed_visits,
    COUNTIF(status = 'FAILED') AS failed_visits,
    COUNTIF(
      status = 'COMPLETED'
      AND completed_at IS NOT NULL
      AND TIME(completed_at, 'Asia/Seoul') >= TIME '07:00:00'
    ) AS after_7am_completed_visits,
    ARRAY_AGG(
      IF(status = 'FAILED', COALESCE(failure_reason_code, 'UNKNOWN'), NULL)
      IGNORE NULLS
      ORDER BY updated_at DESC
      LIMIT 1
    )[SAFE_OFFSET(0)] AS failure_reason
  FROM fulfillment_base
  GROUP BY 1, 2
),
ops_daily AS (
  SELECT
    scheduled_day,
    COUNT(*) AS total_orders,
    COUNTIF(completed_visits > 0) AS completed_orders,
    COUNTIF(completed_visits = 0 AND failed_visits > 0) AS failed_orders,
    COUNTIF(completed_visits > 0 AND after_7am_completed_visits > 0) AS after_7am_completed_orders,
    SAFE_DIVIDE(COUNTIF(completed_visits = 0 AND failed_visits > 0), COUNT(*)) AS fail_rate,
    SAFE_DIVIDE(COUNTIF(completed_visits > 0 AND after_7am_completed_visits > 0), COUNTIF(completed_visits > 0)) AS after_7am_rate
  FROM order_day_status
  GROUP BY 1
),
ops_summary AS (
  SELECT
    MAX(IF(scheduled_day = p.report_day, total_orders, NULL)) AS today_total_orders,
    MAX(IF(scheduled_day = p.report_day, completed_orders, NULL)) AS today_completed_orders,
    MAX(IF(scheduled_day = p.report_day, failed_orders, NULL)) AS today_failed_orders,
    MAX(IF(scheduled_day = p.report_day, after_7am_completed_orders, NULL)) AS today_after_7am_completed_orders,
    100 * MAX(IF(scheduled_day = p.report_day, fail_rate, NULL)) AS today_fail_rate_pct,
    100 * AVG(fail_rate) AS avg_7d_fail_rate_pct,
    100 * MAX(IF(scheduled_day = p.report_day, after_7am_rate, NULL)) AS today_after_7am_rate_pct,
    100 * AVG(after_7am_rate) AS avg_7d_after_7am_rate_pct
  FROM ops_daily
  CROSS JOIN params AS p
),
failure_reason_rows AS (
  SELECT
    COALESCE(failure_reason, 'UNKNOWN') AS failure_reason,
    COUNT(*) AS failed_orders,
    SAFE_DIVIDE(COUNT(*), SUM(COUNT(*)) OVER ()) AS reason_share
  FROM order_day_status AS ods
  CROSS JOIN params AS p
  WHERE ods.scheduled_day = p.report_day
    AND ods.completed_visits = 0
    AND ods.failed_visits > 0
  GROUP BY 1
),
failure_reason_summary AS (
  SELECT
    COALESCE(
      STRING_AGG(
        FORMAT('%s %.1f%% (%d건)', failure_reason, 100 * reason_share, failed_orders),
        ', '
        ORDER BY failed_orders DESC
        LIMIT 3
      ),
      '실패 주문 없음'
    ) AS top_reasons
  FROM failure_reason_rows
),
today_paid AS (
  SELECT
    p.report_day AS paid_day,
    COALESCE(d.service_orders, 0) AS service_orders,
    COALESCE(d.large_orders, 0) AS large_orders,
    COALESCE(d.large_users, 0) AS large_users,
    COALESCE(d.large_revenue, 0) AS large_revenue
  FROM params AS p
  LEFT JOIN daily_paid AS d
    ON d.paid_day = p.report_day
),
output_rows AS (
  SELECT
    5 AS section_sort,
    '대폐 일별 실적' AS section_title,
    1 AS line_sort,
    '대폐 유료 신청량' AS metric,
    FORMAT('%d건 / %d명 / %.1f억', CAST(COALESCE(large_orders, 0) AS INT64), CAST(COALESCE(large_users, 0) AS INT64), COALESCE(large_revenue, 0) / 100000000) AS current_value,
    '' AS vs_30d,
    '' AS vs_7d
  FROM today_paid
  UNION ALL
  SELECT
    5,
    '대폐 일별 실적',
    2,
    '전체 수거 신청 중 대폐 비중',
    FORMAT('%.1f%% (%d/%d건)', 100 * SAFE_DIVIDE(large_orders, service_orders), CAST(COALESCE(large_orders, 0) AS INT64), CAST(COALESCE(service_orders, 0) AS INT64)),
    '',
    ''
  FROM today_paid
  UNION ALL
  SELECT
    50,
    '운영 가드레일',
    1,
    '수거 실패율',
    FORMAT('%.1f%% (%d/%d건) / 최근7일 평균 %.1f%%', COALESCE(today_fail_rate_pct, 0), CAST(COALESCE(today_failed_orders, 0) AS INT64), CAST(COALESCE(today_total_orders, 0) AS INT64), COALESCE(avg_7d_fail_rate_pct, 0)),
    '',
    ''
  FROM ops_summary
  UNION ALL
  SELECT
    50,
    '운영 가드레일',
    2,
    '오전 7시 이후 수거율',
    FORMAT('%.1f%% (%d/%d건) / 최근7일 평균 %.1f%%', COALESCE(today_after_7am_rate_pct, 0), CAST(COALESCE(today_after_7am_completed_orders, 0) AS INT64), CAST(COALESCE(today_completed_orders, 0) AS INT64), COALESCE(avg_7d_after_7am_rate_pct, 0)),
    '',
    ''
  FROM ops_summary
  UNION ALL
  SELECT
    50,
    '운영 가드레일',
    3,
    '수거 실패 사유 비중',
    top_reasons,
    '',
    ''
  FROM failure_reason_summary
)
SELECT *
FROM output_rows
ORDER BY section_sort, line_sort
