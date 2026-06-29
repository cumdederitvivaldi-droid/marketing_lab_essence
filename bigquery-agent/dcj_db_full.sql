-- DCJ 쿠폰 사용자 전체 주문 이력 (재구매 포함)
-- 대전(30)·세종(36)·청주/충북(43) 지역 기준
WITH dcj_users AS (
  -- DCJ 쿠폰으로 첫 주문한 유저와 쿠폰 종류 식별
  SELECT
    o.user_id,
    cp.id AS coupon_policy_id,
    CASE
      WHEN cp.id = 189 THEN 'DCJ25 (2500원)'
      WHEN cp.id = 188 THEN 'DCJ50 (50%)'
      WHEN cp.id = 187 THEN 'DCJ100 (100%)'
    END AS coupon_label,
    cp.discount_type,
    cp.amount AS coupon_amount,
    cp.max_discount_amount,
    MIN(DATE(o.created_at)) AS first_order_date
  FROM `covering-app-ccd23.secure_dataset.order_v2` o
  JOIN `covering-app-ccd23.secure_dataset.order_address_snapshot` a ON o.id = a.order_id
  JOIN `covering-app-ccd23.secure_dataset.user_coupon` uc ON o.user_coupon_id = uc.id
  JOIN `covering-app-ccd23.secure_dataset.coupon_policy` cp ON uc.coupon_policy_id = cp.id
  WHERE cp.id IN (187, 188, 189)
    AND LEFT(a.h_code, 2) IN ('30','36','43')
    AND o.deleted_at IS NULL
  GROUP BY o.user_id, cp.id, cp.discount_type, cp.amount, cp.max_discount_amount
),
all_orders AS (
  -- DCJ 유저의 전체 주문 이력 (쿠폰 미사용 재주문 포함)
  SELECT
    du.coupon_label,
    o.user_id,
    o.id AS order_id,
    o.status,
    o.user_coupon_id,
    DATE(o.created_at) AS order_date,
    du.first_order_date,
    DATE_DIFF(DATE(o.created_at), du.first_order_date, DAY) AS days_since_first,
    CASE WHEN DATE(o.created_at) = du.first_order_date THEN '첫주문' ELSE '재주문' END AS order_type,
    r.total_amount AS receipt_amount
  FROM dcj_users du
  JOIN `covering-app-ccd23.secure_dataset.order_v2` o ON du.user_id = o.user_id
  JOIN `covering-app-ccd23.secure_dataset.order_address_snapshot` a ON o.id = a.order_id
  LEFT JOIN `covering-app-ccd23.secure_dataset.order_invoice` oi ON o.id = oi.order_id
  LEFT JOIN `covering-app-ccd23.secure_dataset.invoice` inv ON oi.invoice_id = inv.id
  LEFT JOIN `covering-app-ccd23.secure_dataset.receipt` r ON inv.id = r.invoice_id
  WHERE o.deleted_at IS NULL
    AND LEFT(a.h_code, 2) IN ('30','36','43')
)
SELECT
  coupon_label,
  COUNT(DISTINCT user_id)                                          AS unique_users,
  -- 첫 주문 지표
  COUNTIF(order_type = '첫주문' AND status = 'COMPLETED')          AS first_completed,
  COUNTIF(order_type = '첫주문' AND status = 'CANCELED')           AS first_canceled,
  ROUND(COUNTIF(order_type='첫주문' AND status='COMPLETED') * 100.0
    / NULLIF(COUNTIF(order_type='첫주문'), 0), 1)                  AS first_completion_rate,
  -- 재구매 지표
  COUNT(DISTINCT CASE WHEN order_type='재주문' THEN user_id END)    AS repurchase_users,
  ROUND(COUNT(DISTINCT CASE WHEN order_type='재주문' THEN user_id END) * 100.0
    / NULLIF(COUNT(DISTINCT user_id), 0), 1)                       AS repurchase_rate,
  -- 매출 지표
  SUM(CASE WHEN status='COMPLETED' THEN receipt_amount ELSE 0 END) AS total_revenue,
  ROUND(AVG(CASE WHEN status='COMPLETED' AND order_type='첫주문' THEN receipt_amount END), 0)
                                                                    AS avg_first_receipt,
  -- 쿠폰 할인 비용 추정 (첫주문 완료 기준)
  -- DCJ25: 건당 2500원 / DCJ50: receipt_amount 동일 금액 추정 / DCJ100: min(결제액, 20000)
  SUM(CASE
    WHEN coupon_label = 'DCJ25 (2500원)' AND order_type='첫주문' AND status='COMPLETED'
      THEN 2500
    WHEN coupon_label = 'DCJ50 (50%)' AND order_type='첫주문' AND status='COMPLETED'
      THEN LEAST(COALESCE(receipt_amount,0), 20000)
    WHEN coupon_label = 'DCJ100 (100%)' AND order_type='첫주문' AND status='COMPLETED'
      THEN LEAST(COALESCE(receipt_amount,0) + 20000, 20000)
    ELSE 0
  END)                                                              AS estimated_coupon_cost,
  MIN(first_order_date)                                             AS earliest_first_order,
  MAX(first_order_date)                                             AS latest_first_order
FROM all_orders
GROUP BY coupon_label
ORDER BY coupon_label
