WITH params AS (
  SELECT @report_date AS report_day
),
anchors AS (
  SELECT 'current' AS anchor_label, report_day AS anchor_day FROM params
  UNION ALL
  SELECT 'd30', DATE_SUB(report_day, INTERVAL 30 DAY) FROM params
  UNION ALL
  SELECT 'd7', DATE_SUB(report_day, INTERVAL 7 DAY) FROM params
),
segment_def AS (
  SELECT
    10 AS section_sort,
    '대커봉 구매 맥락' AS section_title,
    'large_covering_bag_purchase' AS segment_key,
    'GOODS' AS denominator_scope,
    ['LARGE_COVERING_BAG'] AS product_codes
  UNION ALL
  SELECT
    20,
    '대형폐기물 이용 맥락',
    'large_waste_pickup',
    'SERVICE',
    ['PICKUP_LARGE_COVERING_BAG']
  UNION ALL
  SELECT
    30,
    '일반 커버링 봉투 신청 맥락',
    'regular_covering_bag',
    'GOODS',
    ['COVERING_BAG']
  UNION ALL
  SELECT
    40,
    '생쓰 주문 맥락',
    'default_garbage',
    'SERVICE',
    ['PICKUP_COVERING_BAG']
),
paid_orders AS (
  SELECT
    o.id AS order_id,
    o.user_id,
    MIN(r.created_at) AS paid_at,
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
    AND DATE(r.created_at, 'Asia/Seoul') BETWEEN DATE_SUB(p.report_day, INTERVAL 150 DAY) AND p.report_day
  GROUP BY 1, 2
),
order_flags AS (
  SELECT
    po.order_id,
    po.user_id,
    po.paid_at,
    po.paid_day,
    po.paid_amount,
    LOGICAL_OR(p.product_type = 'SERVICE') AS has_service,
    LOGICAL_OR(p.product_type = 'GOODS') AS has_goods,
    ARRAY_AGG(DISTINCT p.product_code IGNORE NULLS) AS product_codes,
    CASE
      WHEN COUNTIF(p.product_code = 'PICKUP_LARGE_COVERING_BAG') > 0 THEN 'large_waste'
      WHEN COUNTIF(p.product_code = 'PICKUP_COVERING_BAG') > 0 THEN 'default_garbage'
      ELSE 'other_service'
    END AS service_group
  FROM paid_orders AS po
  JOIN `covering-app-ccd23.secure_dataset.order_line` AS ol
    ON ol.order_id = po.order_id
   AND ol.deleted_at IS NULL
  JOIN `covering-app-ccd23.secure_dataset.product` AS p
    ON p.id = ol.product_id
  GROUP BY 1, 2, 3, 4, 5
),
scope_def AS (
  SELECT 'SERVICE' AS denominator_scope
  UNION ALL
  SELECT 'GOODS'
),
denominator_metrics AS (
  SELECT
    a.anchor_label,
    s.denominator_scope,
    COUNT(DISTINCT ord.user_id) AS total_paid_users,
    COUNT(DISTINCT ord.order_id) AS total_paid_orders,
    SUM(ord.paid_amount) AS total_revenue
  FROM anchors AS a
  CROSS JOIN scope_def AS s
  LEFT JOIN order_flags AS ord
    ON ord.paid_day BETWEEN DATE_SUB(a.anchor_day, INTERVAL 29 DAY) AND a.anchor_day
   AND (
     (s.denominator_scope = 'SERVICE' AND ord.has_service)
     OR (s.denominator_scope = 'GOODS' AND ord.has_goods)
   )
  GROUP BY 1, 2
),
segment_orders AS (
  SELECT
    sd.section_sort,
    sd.section_title,
    sd.segment_key,
    sd.denominator_scope,
    ord.order_id,
    ord.user_id,
    ord.paid_day,
    ord.paid_amount
  FROM order_flags AS ord
  CROSS JOIN segment_def AS sd
  WHERE EXISTS (
    SELECT 1
    FROM UNNEST(ord.product_codes) AS product_code
    WHERE product_code IN UNNEST(sd.product_codes)
  )
),
segment_window_metrics AS (
  SELECT
    a.anchor_label,
    sd.section_sort,
    sd.section_title,
    sd.segment_key,
    sd.denominator_scope,
    COUNT(DISTINCT so.user_id) AS paid_users,
    COUNT(DISTINCT so.order_id) AS paid_orders,
    SUM(so.paid_amount) AS revenue
  FROM anchors AS a
  JOIN segment_def AS sd
    ON TRUE
  LEFT JOIN segment_orders AS so
    ON so.segment_key = sd.segment_key
   AND so.paid_day BETWEEN DATE_SUB(a.anchor_day, INTERVAL 29 DAY) AND a.anchor_day
  GROUP BY 1, 2, 3, 4, 5
),
first_segment_paid AS (
  SELECT
    segment_key,
    user_id,
    MIN(paid_day) AS first_paid_day
  FROM segment_orders
  GROUP BY 1, 2
),
m1_metrics AS (
  SELECT
    a.anchor_label,
    sd.segment_key,
    COUNT(DISTINCT fp.user_id) AS cohort_users,
    COUNT(DISTINCT IF(followup.order_id IS NOT NULL, fp.user_id, NULL)) AS followup_users
  FROM anchors AS a
  JOIN segment_def AS sd
    ON TRUE
  LEFT JOIN first_segment_paid AS fp
    ON fp.segment_key = sd.segment_key
   AND fp.first_paid_day BETWEEN DATE_SUB(a.anchor_day, INTERVAL 60 DAY) AND DATE_SUB(a.anchor_day, INTERVAL 31 DAY)
  LEFT JOIN order_flags AS followup
    ON followup.user_id = fp.user_id
   AND followup.has_service
   AND followup.paid_day BETWEEN DATE_ADD(fp.first_paid_day, INTERVAL 31 DAY)
                             AND DATE_ADD(fp.first_paid_day, INTERVAL 60 DAY)
  GROUP BY 1, 2
),
segment_values AS (
  SELECT
    swm.anchor_label,
    swm.section_sort,
    swm.section_title,
    swm.segment_key,
    swm.paid_users,
    swm.paid_orders,
    swm.revenue,
    SAFE_DIVIDE(swm.revenue, swm.paid_orders) AS aov,
    100 * SAFE_DIVIDE(swm.paid_users, dm.total_paid_users) AS user_share_pct,
    100 * SAFE_DIVIDE(swm.revenue, dm.total_revenue) AS revenue_share_pct,
    100 * SAFE_DIVIDE(mm.followup_users, mm.cohort_users) AS m1_followup_rate_pct
  FROM segment_window_metrics AS swm
  LEFT JOIN denominator_metrics AS dm
    ON dm.anchor_label = swm.anchor_label
   AND dm.denominator_scope = swm.denominator_scope
  LEFT JOIN m1_metrics AS mm
    ON mm.anchor_label = swm.anchor_label
   AND mm.segment_key = swm.segment_key
),
pivoted_segments AS (
  SELECT
    section_sort,
    section_title,
    segment_key,
    MAX(IF(anchor_label = 'current', paid_users, NULL)) AS cur_paid_users,
    MAX(IF(anchor_label = 'current', paid_orders, NULL)) AS cur_paid_orders,
    MAX(IF(anchor_label = 'current', revenue, NULL)) AS cur_revenue,
    MAX(IF(anchor_label = 'current', aov, NULL)) AS cur_aov,
    MAX(IF(anchor_label = 'current', user_share_pct, NULL)) AS cur_user_share_pct,
    MAX(IF(anchor_label = 'current', revenue_share_pct, NULL)) AS cur_revenue_share_pct,
    MAX(IF(anchor_label = 'current', m1_followup_rate_pct, NULL)) AS cur_m1_followup_rate_pct,
    MAX(IF(anchor_label = 'd30', paid_users, NULL)) AS d30_paid_users,
    MAX(IF(anchor_label = 'd30', paid_orders, NULL)) AS d30_paid_orders,
    MAX(IF(anchor_label = 'd30', revenue, NULL)) AS d30_revenue,
    MAX(IF(anchor_label = 'd30', aov, NULL)) AS d30_aov,
    MAX(IF(anchor_label = 'd30', user_share_pct, NULL)) AS d30_user_share_pct,
    MAX(IF(anchor_label = 'd30', m1_followup_rate_pct, NULL)) AS d30_m1_followup_rate_pct,
    MAX(IF(anchor_label = 'd7', paid_users, NULL)) AS d7_paid_users,
    MAX(IF(anchor_label = 'd7', paid_orders, NULL)) AS d7_paid_orders,
    MAX(IF(anchor_label = 'd7', revenue, NULL)) AS d7_revenue,
    MAX(IF(anchor_label = 'd7', aov, NULL)) AS d7_aov,
    MAX(IF(anchor_label = 'd7', user_share_pct, NULL)) AS d7_user_share_pct,
    MAX(IF(anchor_label = 'd7', m1_followup_rate_pct, NULL)) AS d7_m1_followup_rate_pct
  FROM segment_values
  GROUP BY 1, 2, 3
),
service_first_paid AS (
  SELECT
    user_id,
    ARRAY_AGG(service_group ORDER BY paid_day, order_id LIMIT 1)[SAFE_OFFSET(0)] AS first_service_group,
    MIN(paid_day) AS first_paid_day
  FROM order_flags
  WHERE has_service
  GROUP BY 1
),
all_service_order_flags AS (
  SELECT
    o.id AS order_id,
    o.user_id,
    MIN(r.created_at) AS paid_at,
    DATE(MIN(r.created_at), 'Asia/Seoul') AS paid_day,
    CASE
      WHEN COUNTIF(p.product_code = 'PICKUP_LARGE_COVERING_BAG') > 0 THEN 'large_waste'
      WHEN COUNTIF(p.product_code = 'PICKUP_COVERING_BAG') > 0 THEN 'default_garbage'
      ELSE 'other_service'
    END AS service_group
  FROM `covering-app-ccd23.secure_dataset.order_v2` AS o
  JOIN `covering-app-ccd23.secure_dataset.order_invoice` AS oi
    ON oi.order_id = o.id
  JOIN `covering-app-ccd23.secure_dataset.invoice` AS i
    ON i.id = oi.invoice_id
  JOIN `covering-app-ccd23.secure_dataset.receipt` AS r
    ON r.invoice_id = i.id
   AND r.status = 'PAID'
   AND r.deleted_at IS NULL
  JOIN `covering-app-ccd23.secure_dataset.order_line` AS ol
    ON ol.order_id = o.id
   AND ol.deleted_at IS NULL
  JOIN `covering-app-ccd23.secure_dataset.product` AS p
    ON p.id = ol.product_id
   AND p.product_type = 'SERVICE'
  CROSS JOIN params AS prm
  WHERE o.user_id IS NOT NULL
    AND o.deleted_at IS NULL
    AND o.status != 'CANCELED'
    AND DATE(r.created_at, 'Asia/Seoul') <= prm.report_day
  GROUP BY 1, 2
),
first_service_paid_all AS (
  SELECT
    user_id,
    ARRAY_AGG(
      STRUCT(
        service_group AS service_group,
        paid_day AS paid_day
      )
      ORDER BY paid_at, order_id
      LIMIT 1
    )[SAFE_OFFSET(0)] AS first_paid
  FROM all_service_order_flags
  GROUP BY 1
),
first_pay_mix_by_anchor AS (
  SELECT
    a.anchor_label,
    COUNTIF(fp.first_paid.paid_day BETWEEN DATE_SUB(a.anchor_day, INTERVAL 29 DAY) AND a.anchor_day) AS first_paid_users,
    COUNTIF(
      fp.first_paid.paid_day BETWEEN DATE_SUB(a.anchor_day, INTERVAL 29 DAY) AND a.anchor_day
      AND fp.first_paid.service_group = 'large_waste'
    ) AS large_waste_first_paid_users
  FROM anchors AS a
  CROSS JOIN first_service_paid_all AS fp
  GROUP BY 1
),
pivoted_first_pay_mix AS (
  SELECT
    MAX(IF(anchor_label = 'current', first_paid_users, NULL)) AS cur_first_paid_users,
    MAX(IF(anchor_label = 'current', large_waste_first_paid_users, NULL)) AS cur_large_waste_first_paid_users,
    100 * SAFE_DIVIDE(
      MAX(IF(anchor_label = 'current', large_waste_first_paid_users, NULL)),
      MAX(IF(anchor_label = 'current', first_paid_users, NULL))
    ) AS cur_large_waste_first_paid_share_pct,
    100 * SAFE_DIVIDE(
      MAX(IF(anchor_label = 'd30', large_waste_first_paid_users, NULL)),
      MAX(IF(anchor_label = 'd30', first_paid_users, NULL))
    ) AS d30_large_waste_first_paid_share_pct,
    100 * SAFE_DIVIDE(
      MAX(IF(anchor_label = 'd7', large_waste_first_paid_users, NULL)),
      MAX(IF(anchor_label = 'd7', first_paid_users, NULL))
    ) AS d7_large_waste_first_paid_share_pct
  FROM first_pay_mix_by_anchor
),
user_service_mix_by_anchor AS (
  SELECT
    a.anchor_label,
    user_mix.user_id,
    CASE
      WHEN user_mix.has_default_garbage AND user_mix.has_large_waste THEN 'both'
      WHEN user_mix.has_large_waste AND NOT user_mix.has_default_garbage AND NOT user_mix.has_other_service THEN 'large_waste_only'
      WHEN user_mix.has_default_garbage AND NOT user_mix.has_large_waste AND NOT user_mix.has_other_service THEN 'default_garbage_only'
      ELSE 'other_service'
    END AS mix_key,
    user_mix.service_revenue
  FROM anchors AS a
  JOIN (
    SELECT
      a.anchor_label,
      ord.user_id,
      LOGICAL_OR(ord.service_group = 'default_garbage') AS has_default_garbage,
      LOGICAL_OR(ord.service_group = 'large_waste') AS has_large_waste,
      LOGICAL_OR(ord.service_group = 'other_service') AS has_other_service,
      SUM(ord.paid_amount) AS service_revenue
    FROM anchors AS a
    JOIN order_flags AS ord
      ON ord.has_service
     AND ord.paid_day BETWEEN DATE_SUB(a.anchor_day, INTERVAL 29 DAY) AND a.anchor_day
    GROUP BY 1, 2
  ) AS user_mix
    ON user_mix.anchor_label = a.anchor_label
),
service_mix_metrics AS (
  SELECT
    anchor_label,
    mix_key,
    COUNT(DISTINCT user_id) AS users,
    SUM(service_revenue) AS revenue,
    SAFE_DIVIDE(SUM(service_revenue), COUNT(DISTINCT user_id)) AS arpu
  FROM user_service_mix_by_anchor
  WHERE mix_key IN ('default_garbage_only', 'large_waste_only', 'both')
  GROUP BY 1, 2
),
pivoted_service_mix AS (
  SELECT
    mix_key,
    MAX(IF(anchor_label = 'current', users, NULL)) AS cur_users,
    MAX(IF(anchor_label = 'current', arpu, NULL)) AS cur_arpu,
    MAX(IF(anchor_label = 'd30', arpu, NULL)) AS d30_arpu,
    MAX(IF(anchor_label = 'd7', arpu, NULL)) AS d7_arpu
  FROM service_mix_metrics
  GROUP BY 1
),
service_mix_arpu_comparison AS (
  SELECT
    default_mix.cur_arpu AS cur_default_arpu,
    default_mix.d30_arpu AS d30_default_arpu,
    default_mix.d7_arpu AS d7_default_arpu,
    large_mix.cur_arpu AS cur_large_arpu,
    large_mix.d30_arpu AS d30_large_arpu,
    large_mix.d7_arpu AS d7_large_arpu,
    both_mix.cur_arpu AS cur_both_arpu,
    both_mix.d30_arpu AS d30_both_arpu,
    both_mix.d7_arpu AS d7_both_arpu
  FROM pivoted_service_mix AS default_mix
  CROSS JOIN pivoted_service_mix AS large_mix
  CROSS JOIN pivoted_service_mix AS both_mix
  WHERE default_mix.mix_key = 'default_garbage_only'
    AND large_mix.mix_key = 'large_waste_only'
    AND both_mix.mix_key = 'both'
),
crosssell_by_anchor AS (
  SELECT
    a.anchor_label,
    first_service_group,
    COUNT(DISTINCT sfp.user_id) AS cohort_users,
    COUNT(DISTINCT IF(target.order_id IS NOT NULL, sfp.user_id, NULL)) AS converted_users
  FROM anchors AS a
  JOIN service_first_paid AS sfp
    ON sfp.first_paid_day BETWEEN DATE_SUB(a.anchor_day, INTERVAL 59 DAY) AND DATE_SUB(a.anchor_day, INTERVAL 30 DAY)
   AND sfp.first_service_group IN ('default_garbage', 'large_waste')
  LEFT JOIN order_flags AS target
    ON target.user_id = sfp.user_id
   AND target.paid_day BETWEEN DATE_ADD(sfp.first_paid_day, INTERVAL 1 DAY)
                           AND DATE_ADD(sfp.first_paid_day, INTERVAL 30 DAY)
   AND (
     (sfp.first_service_group = 'default_garbage' AND target.service_group = 'large_waste')
     OR (sfp.first_service_group = 'large_waste' AND target.service_group = 'default_garbage')
   )
  GROUP BY 1, 2
),
pivoted_crosssell AS (
  SELECT
    first_service_group,
    MAX(IF(anchor_label = 'current', cohort_users, NULL)) AS cur_cohort_users,
    MAX(IF(anchor_label = 'current', converted_users, NULL)) AS cur_converted_users,
    100 * SAFE_DIVIDE(MAX(IF(anchor_label = 'current', converted_users, NULL)), MAX(IF(anchor_label = 'current', cohort_users, NULL))) AS cur_rate_pct,
    100 * SAFE_DIVIDE(MAX(IF(anchor_label = 'd30', converted_users, NULL)), MAX(IF(anchor_label = 'd30', cohort_users, NULL))) AS d30_rate_pct,
    100 * SAFE_DIVIDE(MAX(IF(anchor_label = 'd7', converted_users, NULL)), MAX(IF(anchor_label = 'd7', cohort_users, NULL))) AS d7_rate_pct
  FROM crosssell_by_anchor
  GROUP BY 1
),
large_bag_d7_cohort_days AS (
  SELECT cohort_day
  FROM params AS p,
    UNNEST(GENERATE_DATE_ARRAY(DATE_SUB(p.report_day, INTERVAL 13 DAY), DATE_SUB(p.report_day, INTERVAL 7 DAY))) AS cohort_day
),
large_bag_applicant_days AS (
  SELECT
    o.user_id,
    DATE(o.created_at, 'Asia/Seoul') AS cohort_day,
    MIN(o.created_at) AS application_at
  FROM `covering-app-ccd23.secure_dataset.order_v2` AS o
  JOIN `covering-app-ccd23.secure_dataset.order_line` AS ol
    ON ol.order_id = o.id
   AND ol.deleted_at IS NULL
  JOIN `covering-app-ccd23.secure_dataset.product` AS p
    ON p.id = ol.product_id
   AND p.product_code = 'LARGE_COVERING_BAG'
  CROSS JOIN params AS prm
  WHERE o.user_id IS NOT NULL
    AND o.deleted_at IS NULL
    AND o.status != 'CANCELED'
    AND DATE(o.created_at, 'Asia/Seoul') BETWEEN DATE_SUB(prm.report_day, INTERVAL 13 DAY)
                                             AND DATE_SUB(prm.report_day, INTERVAL 7 DAY)
  GROUP BY 1, 2
),
large_bag_to_large_waste_d7_daily AS (
  SELECT
    d.cohort_day,
    COUNT(DISTINCT cohort.user_id) AS applicant_users,
    COUNT(DISTINCT IF(target.order_id IS NOT NULL, cohort.user_id, NULL)) AS converted_users,
    COUNT(DISTINCT target.order_id) AS target_paid_orders,
    SUM(target.paid_amount) AS target_revenue,
    SAFE_DIVIDE(SUM(target.paid_amount), COUNT(DISTINCT target.order_id)) AS target_aov,
    100 * SAFE_DIVIDE(
      COUNT(DISTINCT IF(target.order_id IS NOT NULL, cohort.user_id, NULL)),
      COUNT(DISTINCT cohort.user_id)
    ) AS conversion_rate_pct
  FROM large_bag_d7_cohort_days AS d
  LEFT JOIN large_bag_applicant_days AS cohort
    ON cohort.cohort_day = d.cohort_day
  LEFT JOIN order_flags AS target
    ON target.user_id = cohort.user_id
   AND target.service_group = 'large_waste'
   AND target.paid_at >= cohort.application_at
   AND target.paid_at <= TIMESTAMP_ADD(cohort.application_at, INTERVAL 7 DAY)
  GROUP BY 1
),
large_bag_to_large_waste_d7_summary AS (
  SELECT
    ARRAY_AGG(
      IF(
        applicant_users > 0,
        STRUCT(
          cohort_day,
          applicant_users,
          converted_users,
          target_paid_orders,
          target_aov,
          conversion_rate_pct
        ),
        NULL
      )
      IGNORE NULLS
      ORDER BY cohort_day DESC
      LIMIT 1
    )[SAFE_OFFSET(0)] AS latest,
    STRING_AGG(
      IF(
        applicant_users > 0,
        FORMAT(
          '%s %s',
          FORMAT_DATE('%m/%d', cohort_day),
          FORMAT('%.1f%%(%d/%d명)', conversion_rate_pct, CAST(converted_users AS INT64), CAST(applicant_users AS INT64))
        ),
        NULL
      ),
      ' · '
      ORDER BY cohort_day
    ) AS rate_daily_text,
    STRING_AGG(
      IF(
        applicant_users > 0,
        IF(
          target_paid_orders = 0,
          FORMAT('%s 표본 없음', FORMAT_DATE('%m/%d', cohort_day)),
          FORMAT('%s %d원(%d건)', FORMAT_DATE('%m/%d', cohort_day), CAST(ROUND(target_aov) AS INT64), CAST(target_paid_orders AS INT64))
        ),
        NULL
      ),
      ' · '
      ORDER BY cohort_day
    ) AS aov_daily_text
  FROM large_bag_to_large_waste_d7_daily
),
kr1 AS (
  SELECT *
  FROM pivoted_segments
  WHERE segment_key = 'large_waste_pickup'
),
metric_rows AS (
  SELECT
    1 AS section_sort,
    '제품팀 KR1' AS section_title,
    1 AS line_sort,
    'MAU 대비 대형폐기물 D30 이용률' AS metric,
    FORMAT('%.1f%% / 목표 13.0%% / %.1f%%p 남음', cur_user_share_pct, GREATEST(13.0 - cur_user_share_pct, 0)) AS current_value,
    FORMAT('%+.1f%%p', cur_user_share_pct - d30_user_share_pct) AS vs_30d,
    FORMAT('%+.1f%%p', cur_user_share_pct - d7_user_share_pct) AS vs_7d
  FROM kr1
  UNION ALL
  SELECT
    6,
    '첫 결제 구성',
    1,
    '첫 결제자 중 대폐 비중',
    FORMAT(
      '%.1f%% (%d/%d명)',
      cur_large_waste_first_paid_share_pct,
      CAST(cur_large_waste_first_paid_users AS INT64),
      CAST(cur_first_paid_users AS INT64)
    ),
    FORMAT('%+.1f%%p', cur_large_waste_first_paid_share_pct - d30_large_waste_first_paid_share_pct),
    FORMAT('%+.1f%%p', cur_large_waste_first_paid_share_pct - d7_large_waste_first_paid_share_pct)
  FROM pivoted_first_pay_mix
  UNION ALL
  SELECT
    7,
    '이용자 mix ARPU',
    CASE
      WHEN mix_key = 'default_garbage_only' THEN 1
      WHEN mix_key = 'large_waste_only' THEN 2
      WHEN mix_key = 'both' THEN 3
    END,
    CASE
      WHEN mix_key = 'default_garbage_only' THEN '생쓰만 이용자 ARPU'
      WHEN mix_key = 'large_waste_only' THEN '대폐만 이용자 ARPU'
      WHEN mix_key = 'both' THEN '생쓰+대폐 이용자 ARPU'
    END,
    FORMAT('%d원 (%d명)', CAST(ROUND(cur_arpu) AS INT64), CAST(cur_users AS INT64)),
    FORMAT('%+.1f%%', 100 * SAFE_DIVIDE(cur_arpu - d30_arpu, d30_arpu)),
    FORMAT('%+.1f%%', 100 * SAFE_DIVIDE(cur_arpu - d7_arpu, d7_arpu))
  FROM pivoted_service_mix
  UNION ALL
  SELECT
    7,
    '이용자 mix ARPU',
    4,
    '대폐만 vs 생쓰만 ARPU 증가',
    FORMAT(
      '%+d원 / %+.1f%% / %.2f배',
      CAST(ROUND(cur_large_arpu - cur_default_arpu) AS INT64),
      100 * SAFE_DIVIDE(cur_large_arpu - cur_default_arpu, cur_default_arpu),
      SAFE_DIVIDE(cur_large_arpu, cur_default_arpu)
    ),
    FORMAT(
      '%+d원',
      CAST(ROUND((cur_large_arpu - cur_default_arpu) - (d30_large_arpu - d30_default_arpu)) AS INT64)
    ),
    FORMAT(
      '%+d원',
      CAST(ROUND((cur_large_arpu - cur_default_arpu) - (d7_large_arpu - d7_default_arpu)) AS INT64)
    )
  FROM service_mix_arpu_comparison
  UNION ALL
  SELECT
    7,
    '이용자 mix ARPU',
    5,
    '생쓰+대폐 vs 생쓰만 ARPU 증가',
    FORMAT(
      '%+d원 / %+.1f%% / %.2f배',
      CAST(ROUND(cur_both_arpu - cur_default_arpu) AS INT64),
      100 * SAFE_DIVIDE(cur_both_arpu - cur_default_arpu, cur_default_arpu),
      SAFE_DIVIDE(cur_both_arpu, cur_default_arpu)
    ),
    FORMAT(
      '%+d원',
      CAST(ROUND((cur_both_arpu - cur_default_arpu) - (d30_both_arpu - d30_default_arpu)) AS INT64)
    ),
    FORMAT(
      '%+d원',
      CAST(ROUND((cur_both_arpu - cur_default_arpu) - (d7_both_arpu - d7_default_arpu)) AS INT64)
    )
  FROM service_mix_arpu_comparison
  UNION ALL
  SELECT
    section_sort,
    section_title,
    1,
    '결제 유저',
    FORMAT('%d명 / 전체 대비 %.1f%%', CAST(cur_paid_users AS INT64), cur_user_share_pct),
    FORMAT('%+.1f%%', 100 * SAFE_DIVIDE(cur_paid_users - d30_paid_users, d30_paid_users)),
    FORMAT('%+.1f%%', 100 * SAFE_DIVIDE(cur_paid_users - d7_paid_users, d7_paid_users))
  FROM pivoted_segments
  UNION ALL
  SELECT
    section_sort,
    section_title,
    2,
    '결제 건수',
    FORMAT('%d건', CAST(cur_paid_orders AS INT64)),
    FORMAT('%+.1f%%', 100 * SAFE_DIVIDE(cur_paid_orders - d30_paid_orders, d30_paid_orders)),
    FORMAT('%+.1f%%', 100 * SAFE_DIVIDE(cur_paid_orders - d7_paid_orders, d7_paid_orders))
  FROM pivoted_segments
  UNION ALL
  SELECT
    section_sort,
    section_title,
    3,
    '매출',
    CASE
      WHEN cur_revenue IS NULL THEN '표본 없음'
      WHEN cur_revenue < 10000000 THEN FORMAT('%d만원 / 전체 대비 %.1f%%', CAST(ROUND(cur_revenue / 10000) AS INT64), cur_revenue_share_pct)
      ELSE FORMAT('%.1f억 / 전체 대비 %.1f%%', cur_revenue / 100000000, cur_revenue_share_pct)
    END,
    FORMAT('%+.1f%%', 100 * SAFE_DIVIDE(cur_revenue - d30_revenue, d30_revenue)),
    FORMAT('%+.1f%%', 100 * SAFE_DIVIDE(cur_revenue - d7_revenue, d7_revenue))
  FROM pivoted_segments
  UNION ALL
  SELECT
    section_sort,
    section_title,
    4,
    '객단가',
    FORMAT('%d원', CAST(ROUND(cur_aov) AS INT64)),
    FORMAT('%+.1f%%', 100 * SAFE_DIVIDE(cur_aov - d30_aov, d30_aov)),
    FORMAT('%+.1f%%', 100 * SAFE_DIVIDE(cur_aov - d7_aov, d7_aov))
  FROM pivoted_segments
  UNION ALL
  SELECT
    section_sort,
    section_title,
    5,
    'M1 후속 결제',
    IF(cur_m1_followup_rate_pct IS NULL, '표본 없음', FORMAT('%.1f%%', cur_m1_followup_rate_pct)),
    FORMAT('%+.1f%%p', cur_m1_followup_rate_pct - d30_m1_followup_rate_pct),
    FORMAT('%+.1f%%p', cur_m1_followup_rate_pct - d7_m1_followup_rate_pct)
  FROM pivoted_segments
  UNION ALL
  SELECT
    8,
    '대커봉→대폐 D7 전환',
    1,
    'D7 결제 전환율',
    IF(
      latest IS NULL,
      '관측 완료 코호트 없음',
      FORMAT(
        '관측 완료 %s 코호트 %s / 일별 %s',
        FORMAT_DATE('%m/%d', latest.cohort_day),
        FORMAT('%.1f%% (%d/%d명)', latest.conversion_rate_pct, CAST(latest.converted_users AS INT64), CAST(latest.applicant_users AS INT64)),
        COALESCE(rate_daily_text, '표본 없음')
      )
    ),
    '',
    ''
  FROM large_bag_to_large_waste_d7_summary
  UNION ALL
  SELECT
    8,
    '대커봉→대폐 D7 전환',
    2,
    'D7 대폐 결제 객단가',
    IF(
      latest IS NULL,
      '관측 완료 코호트 없음',
      FORMAT(
        '관측 완료 %s 코호트 %s / 일별 %s',
        FORMAT_DATE('%m/%d', latest.cohort_day),
        IF(
          latest.target_paid_orders = 0,
          '표본 없음',
          FORMAT('%d원 (%d건)', CAST(ROUND(latest.target_aov) AS INT64), CAST(latest.target_paid_orders AS INT64))
        ),
        COALESCE(aov_daily_text, '표본 없음')
      )
    ),
    '',
    ''
  FROM large_bag_to_large_waste_d7_summary
  UNION ALL
  SELECT
    45,
    '크로스셀',
    1,
    '첫 결제가 생쓰인 유저의 대폐 D30 전환율',
    FORMAT('%.1f%% (%d/%d명)', cur_rate_pct, CAST(cur_converted_users AS INT64), CAST(cur_cohort_users AS INT64)),
    FORMAT('%+.1f%%p', cur_rate_pct - d30_rate_pct),
    FORMAT('%+.1f%%p', cur_rate_pct - d7_rate_pct)
  FROM pivoted_crosssell
  WHERE first_service_group = 'default_garbage'
  UNION ALL
  SELECT
    45,
    '크로스셀',
    2,
    '첫 결제가 대폐인 유저의 생쓰 D30 전환율',
    FORMAT('%.1f%% (%d/%d명)', cur_rate_pct, CAST(cur_converted_users AS INT64), CAST(cur_cohort_users AS INT64)),
    FORMAT('%+.1f%%p', cur_rate_pct - d30_rate_pct),
    FORMAT('%+.1f%%p', cur_rate_pct - d7_rate_pct)
  FROM pivoted_crosssell
  WHERE first_service_group = 'large_waste'
)
SELECT *
FROM metric_rows
ORDER BY section_sort, line_sort
