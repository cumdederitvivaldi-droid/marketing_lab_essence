"""BigQuery SQL builders for the FlareLane governance batch."""


def audit_sql(project: str) -> str:
    return f"""
SELECT
  experiment_key,
  experiment_name,
  product_labs_status,
  inventory_status,
  latest_activity_date,
  days_since_latest,
  observed_units,
  recommended_action
FROM `{project}.product.v_flarelane_live_experiment_inventory`
WHERE
  inventory_status IN ('registered_without_bigquery_signal', 'needs_triage_recent_signal')
  OR (registered_in_product_labs AND product_labs_status = 'needs_revision')
ORDER BY
  CASE
    WHEN inventory_status = 'registered_without_bigquery_signal' THEN 0
    WHEN product_labs_status = 'needs_revision' THEN 1
    ELSE 2
  END,
  experiment_key
"""


def governance_risk_sql(project: str) -> str:
    return f"""
WITH base AS (
  SELECT
    s.experiment_key,
    COALESCE(s.slot_key, 'unknown') AS slot_key,
    CAST(s.unit_key AS STRING) AS unit_key,
    COALESCE(LOWER(s.arm), 'unknown') AS arm,
    s.activity_date
  FROM `{project}.product.v_flarelane_known_assignment_signals` AS s
  JOIN `{project}.product.v_flarelane_live_experiment_inventory` AS i
    USING (experiment_key)
  WHERE s.unit_key IS NOT NULL
    AND s.activity_date >= DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 30 DAY)
    AND (
      i.registered_in_product_labs
      OR i.inventory_status IN ('registered_recent_signal', 'recent_30d_reference')
    )
),
experiment_totals AS (
  SELECT experiment_key, COUNT(DISTINCT unit_key) AS total_users
  FROM base
  GROUP BY experiment_key
),
multi_arm AS (
  SELECT
    experiment_key,
    COUNT(*) AS affected_users
  FROM (
    SELECT experiment_key, unit_key
    FROM base
    WHERE arm != 'unknown'
    GROUP BY experiment_key, unit_key
    HAVING COUNT(DISTINCT arm) > 1
  )
  GROUP BY experiment_key
),
pair_users AS (
  SELECT
    LEAST(a.experiment_key, b.experiment_key) AS experiment_a,
    GREATEST(a.experiment_key, b.experiment_key) AS experiment_b,
    a.unit_key,
    MIN(ABS(DATE_DIFF(a.activity_date, b.activity_date, DAY))) AS min_day_gap,
    MAX(ABS(DATE_DIFF(a.activity_date, b.activity_date, DAY))) AS max_day_gap
  FROM base AS a
  JOIN base AS b
    ON a.unit_key = b.unit_key
   AND a.experiment_key < b.experiment_key
   AND ABS(DATE_DIFF(a.activity_date, b.activity_date, DAY)) <= 30
  GROUP BY experiment_a, experiment_b, a.unit_key
),
pair_summary AS (
  SELECT
    experiment_a,
    experiment_b,
    COUNT(DISTINCT unit_key) AS overlap_users,
    MIN(min_day_gap) AS min_day_gap,
    MAX(max_day_gap) AS max_day_gap
  FROM pair_users
  GROUP BY experiment_a, experiment_b
)
SELECT
  'same_user_multi_arm' AS metric,
  experiment_key AS key_a,
  CAST(NULL AS STRING) AS key_b,
  affected_users AS user_count,
  CAST(NULL AS FLOAT64) AS rate_a,
  CAST(NULL AS FLOAT64) AS rate_b,
  CAST(NULL AS INT64) AS min_day_gap,
  CAST(NULL AS INT64) AS max_day_gap
FROM multi_arm
UNION ALL
SELECT
  'cross_experiment_overlap_30d' AS metric,
  p.experiment_a AS key_a,
  p.experiment_b AS key_b,
  p.overlap_users AS user_count,
  SAFE_MULTIPLY(SAFE_DIVIDE(p.overlap_users, ta.total_users), 100) AS rate_a,
  SAFE_MULTIPLY(SAFE_DIVIDE(p.overlap_users, tb.total_users), 100) AS rate_b,
  p.min_day_gap,
  p.max_day_gap
FROM pair_summary AS p
JOIN experiment_totals AS ta ON ta.experiment_key = p.experiment_a
JOIN experiment_totals AS tb ON tb.experiment_key = p.experiment_b
ORDER BY metric, user_count DESC
"""


def canonical_ledger_sql(project: str) -> str:
    return f"""
SELECT 'flarelane_experiment_assignments' AS table_name, COUNT(*) AS row_count
FROM `{project}.product.flarelane_experiment_assignments`
UNION ALL
SELECT 'flarelane_experiment_exposures' AS table_name, COUNT(*) AS row_count
FROM `{project}.product.flarelane_experiment_exposures`
UNION ALL
SELECT 'flarelane_experiment_conversions' AS table_name, COUNT(*) AS row_count
FROM `{project}.product.flarelane_experiment_conversions`
"""
