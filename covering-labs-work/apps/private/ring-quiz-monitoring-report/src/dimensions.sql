WITH params AS (
  SELECT @report_date AS report_date
),
windows AS (
  SELECT
    'report_day' AS period,
    1 AS sort_order,
    report_date AS start_date,
    report_date AS end_date
  FROM params
  UNION ALL
  SELECT
    'last_7d',
    2,
    DATE_SUB(report_date, INTERVAL 6 DAY),
    report_date
  FROM params
),
result_events AS (
  SELECT
    w.period,
    w.sort_order,
    COALESCE(JSON_VALUE(e.properties, '$.session_id'), e.distinct_id, e.insert_id) AS session_key,
    JSON_VALUE(e.properties, '$.recommendation') AS recommendation,
    JSON_VALUE(e.properties, '$.length_range') AS length_range,
    JSON_VALUE(e.properties, '$.weight_range') AS weight_range,
    JSON_VALUE(e.properties, '$.perceived_weight') AS perceived_weight,
    JSON_VALUE(e.properties, '$.splittable_status') AS splittable_status,
    SAFE_CAST(JSON_VALUE(e.properties, '$.has_food_waste') AS BOOL) AS has_food_waste,
    JSON_QUERY_ARRAY(e.properties, '$.categories') AS categories_json,
    DATETIME(e.time, 'Asia/Seoul') AS event_kst
  FROM windows w
  JOIN `covering-app-ccd23.mixpanel.mp_master_event` e
    ON DATE(e.time, 'Asia/Seoul') BETWEEN w.start_date AND w.end_date
  WHERE e.event_name = '[VIEW] GuideServiceRecommendationResultScreen_result'
    AND JSON_VALUE(e.properties, '$.url') LIKE 'https://public-labs.covering.app/disposal-guide%'
),
latest_result AS (
  SELECT * EXCEPT(row_num)
  FROM (
    SELECT
      *,
      ROW_NUMBER() OVER (PARTITION BY period, session_key ORDER BY event_kst DESC) AS row_num
    FROM result_events
  )
  WHERE row_num = 1
),
flattened_categories AS (
  SELECT
    period,
    sort_order,
    session_key,
    JSON_VALUE(category_json, '$') AS value
  FROM latest_result, UNNEST(IFNULL(categories_json, [])) AS category_json
),
dimension_counts AS (
  SELECT period, sort_order, 'category' AS dimension, value, COUNT(DISTINCT session_key) AS sessions
  FROM flattened_categories
  WHERE value IS NOT NULL
  GROUP BY 1, 2, 3, 4
  UNION ALL
  SELECT period, sort_order, 'recommendation', recommendation, COUNT(DISTINCT session_key)
  FROM latest_result
  WHERE recommendation IS NOT NULL
  GROUP BY 1, 2, 3, 4
  UNION ALL
  SELECT period, sort_order, 'length_range', length_range, COUNT(DISTINCT session_key)
  FROM latest_result
  WHERE length_range IS NOT NULL
  GROUP BY 1, 2, 3, 4
  UNION ALL
  SELECT period, sort_order, 'weight_range', weight_range, COUNT(DISTINCT session_key)
  FROM latest_result
  WHERE weight_range IS NOT NULL
  GROUP BY 1, 2, 3, 4
  UNION ALL
  SELECT period, sort_order, 'perceived_weight', perceived_weight, COUNT(DISTINCT session_key)
  FROM latest_result
  WHERE perceived_weight IS NOT NULL
  GROUP BY 1, 2, 3, 4
  UNION ALL
  SELECT period, sort_order, 'splittable_status', splittable_status, COUNT(DISTINCT session_key)
  FROM latest_result
  WHERE splittable_status IS NOT NULL
  GROUP BY 1, 2, 3, 4
  UNION ALL
  SELECT period, sort_order, 'has_food_waste', CAST(has_food_waste AS STRING), COUNT(DISTINCT session_key)
  FROM latest_result
  WHERE has_food_waste IS NOT NULL
  GROUP BY 1, 2, 3, 4
),
ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY period, dimension
      ORDER BY sessions DESC, value
    ) AS rank
  FROM dimension_counts
)
SELECT
  period,
  sort_order,
  dimension,
  value,
  sessions,
  rank
FROM ranked
WHERE rank <= 8
ORDER BY sort_order, dimension, rank
