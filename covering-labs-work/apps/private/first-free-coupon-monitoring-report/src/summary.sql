WITH params AS (
  SELECT
    @report_date AS report_day,
    @coupon_policy_id AS coupon_policy_id,
    @coupon_amount AS coupon_amount,
    @contribution_margin_rate AS contribution_margin_rate,
    TIMESTAMP(DATETIME(@report_date, TIME '00:00:00'), 'Asia/Seoul') AS report_start_ts,
    TIMESTAMP(DATETIME(DATE_ADD(@report_date, INTERVAL 1 DAY), TIME '00:00:00'), 'Asia/Seoul') AS report_end_ts
),
latest_ledger AS (
  SELECT * EXCEPT(rn)
  FROM (
    SELECT
      l.*,
      ROW_NUMBER() OVER (
        PARTITION BY l.user_id
        ORDER BY l.processed_at DESC, l.assigned_at DESC
      ) AS rn
    FROM `covering-app-ccd23.product.first_free_coupon_ledger_v1` AS l
    CROSS JOIN params AS p
    WHERE l.assigned_at < p.report_end_ts
  )
  WHERE rn = 1
),
cohort AS (
  SELECT
    user_id,
    signed_up_at,
    assigned_at,
    DATE(assigned_at, 'Asia/Seoul') AS assigned_day,
    variant,
    status
  FROM latest_ledger
  WHERE variant IN ('control', 'treatment')
),
issued_coupon AS (
  SELECT
    c.user_id,
    MIN(uc.created_date) AS first_coupon_created_at,
    COUNT(*) AS coupon_rows
  FROM cohort AS c
  JOIN `covering-app-ccd23.secure_dataset.user_coupon` AS uc
    ON uc.user_id = c.user_id
  CROSS JOIN params AS p
  WHERE c.variant = 'treatment'
    AND uc.coupon_policy_id = p.coupon_policy_id
    AND uc.created_date >= TIMESTAMP_SUB(c.assigned_at, INTERVAL 5 MINUTE)
    AND uc.created_date < p.report_end_ts
  GROUP BY 1
),
order_base AS (
  SELECT
    o.id AS order_id,
    o.user_id,
    o.created_at AS order_created_at,
    o.user_coupon_id,
    c.variant
  FROM `covering-app-ccd23.secure_dataset.order_v2` AS o
  JOIN cohort AS c
    ON c.user_id = o.user_id
  CROSS JOIN params AS p
  WHERE o.user_id IS NOT NULL
    AND o.deleted_at IS NULL
    AND o.status != 'CANCELED'
    AND o.created_at >= c.signed_up_at
    AND o.created_at < p.report_end_ts
),
order_products AS (
  SELECT
    ob.order_id,
    ob.user_id,
    ob.order_created_at,
    ob.user_coupon_id,
    ob.variant,
    LOGICAL_OR(p.product_code IN ('COVERING_BAG', 'LARGE_COVERING_BAG')) AS has_bag,
    LOGICAL_OR(p.product_type = 'SERVICE') AS has_pickup
  FROM order_base AS ob
  JOIN `covering-app-ccd23.secure_dataset.order_line` AS ol
    ON ol.order_id = ob.order_id
   AND ol.deleted_at IS NULL
  JOIN `covering-app-ccd23.secure_dataset.product` AS p
    ON p.id = ol.product_id
  GROUP BY 1, 2, 3, 4, 5
),
order_revenue AS (
  SELECT
    ob.order_id,
    SUM(r.total_amount) AS paid_amount
  FROM order_base AS ob
  JOIN `covering-app-ccd23.secure_dataset.order_invoice` AS oi
    ON oi.order_id = ob.order_id
  JOIN `covering-app-ccd23.secure_dataset.receipt` AS r
    ON r.invoice_id = oi.invoice_id
   AND r.status = 'PAID'
   AND r.deleted_at IS NULL
  GROUP BY 1
),
order_flags AS (
  SELECT
    op.*,
    COALESCE(rev.paid_amount, 0) AS paid_amount,
    used_uc.id IS NOT NULL AS used_first_free_coupon
  FROM order_products AS op
  CROSS JOIN params AS p
  LEFT JOIN order_revenue AS rev
    ON rev.order_id = op.order_id
  LEFT JOIN `covering-app-ccd23.secure_dataset.user_coupon` AS used_uc
    ON used_uc.id = op.user_coupon_id
   AND used_uc.coupon_policy_id = p.coupon_policy_id
),
cohort_summary AS (
  SELECT
    p.report_day,
    p.coupon_policy_id,
    p.coupon_amount,
    p.contribution_margin_rate,
    COUNT(DISTINCT IF(c.assigned_day = p.report_day AND c.variant = 'control', c.user_id, NULL)) AS yesterday_control_assigned,
    COUNT(DISTINCT IF(c.assigned_day = p.report_day AND c.variant = 'treatment', c.user_id, NULL)) AS yesterday_treatment_assigned,
    COUNT(DISTINCT IF(c.assigned_day = p.report_day AND c.variant = 'treatment' AND ic.user_id IS NOT NULL, c.user_id, NULL)) AS yesterday_coupon_issued_users,
    COUNT(DISTINCT IF(c.assigned_day = p.report_day AND c.variant = 'treatment' AND c.status = 'sent' AND ic.user_id IS NULL, c.user_id, NULL)) AS yesterday_coupon_missing_users,
    COUNT(DISTINCT IF(c.variant = 'control', c.user_id, NULL)) AS control_assigned,
    COUNT(DISTINCT IF(c.variant = 'treatment', c.user_id, NULL)) AS treatment_assigned,
    COUNT(DISTINCT IF(c.variant = 'treatment' AND ic.user_id IS NOT NULL, c.user_id, NULL)) AS coupon_issued_users
  FROM params AS p
  LEFT JOIN cohort AS c
    ON TRUE
  LEFT JOIN issued_coupon AS ic
    ON ic.user_id = c.user_id
  GROUP BY 1, 2, 3, 4
),
order_summary AS (
  SELECT
    COUNT(DISTINCT IF(ord.variant = 'control' AND ord.has_bag, ord.user_id, NULL)) AS control_bag_users,
    COUNT(DISTINCT IF(ord.variant = 'treatment' AND ord.has_bag, ord.user_id, NULL)) AS treatment_bag_users,
    COUNT(DISTINCT IF(ord.variant = 'control' AND ord.has_pickup, ord.user_id, NULL)) AS control_pickup_users,
    COUNT(DISTINCT IF(ord.variant = 'treatment' AND ord.has_pickup, ord.user_id, NULL)) AS treatment_pickup_users,
    COUNT(DISTINCT IF(ord.used_first_free_coupon, ord.order_id, NULL)) AS coupon_used_orders,
    COALESCE(SUM(IF(ord.variant = 'treatment' AND ord.has_pickup, ord.paid_amount, 0)), 0) AS treatment_pickup_revenue
  FROM order_flags AS ord
),
summary AS (
  SELECT
    cs.*,
    os.control_bag_users,
    os.treatment_bag_users,
    os.control_pickup_users,
    os.treatment_pickup_users,
    os.coupon_used_orders,
    os.treatment_pickup_revenue
  FROM cohort_summary AS cs
  CROSS JOIN order_summary AS os
)
SELECT
  *,
  SAFE_DIVIDE(coupon_issued_users, treatment_assigned) AS coupon_issue_rate,
  coupon_used_orders * coupon_amount AS coupon_budget_won,
  coupon_used_orders * coupon_amount * contribution_margin_rate AS coupon_budget_margin_deduction_won,
  treatment_pickup_revenue * contribution_margin_rate AS treatment_pickup_contribution_won,
  treatment_pickup_revenue * contribution_margin_rate
    - coupon_used_orders * coupon_amount * contribution_margin_rate AS net_contribution_won
FROM summary
