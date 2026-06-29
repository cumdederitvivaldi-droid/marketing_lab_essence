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
keyword_counts AS (
  SELECT
    w.period,
    w.sort_order,
    JSON_VALUE(e.properties, '$.item_search_keyword') AS item_search_keyword,
    COUNT(*) AS events,
    COUNT(DISTINCT COALESCE(JSON_VALUE(e.properties, '$.session_id'), e.distinct_id, e.insert_id)) AS sessions,
    FORMAT_DATETIME('%Y-%m-%d %H:%M:%S', MIN(DATETIME(e.time, 'Asia/Seoul'))) AS first_event_kst,
    FORMAT_DATETIME('%Y-%m-%d %H:%M:%S', MAX(DATETIME(e.time, 'Asia/Seoul'))) AS last_event_kst
  FROM windows w
  JOIN `covering-app-ccd23.mixpanel.mp_master_event` e
    ON DATE(e.time, 'Asia/Seoul') BETWEEN w.start_date AND w.end_date
  WHERE e.event_name = '[CLICK] GuideServiceRecommendationItemDescriptionScreen_nextButton'
    AND JSON_VALUE(e.properties, '$.url') LIKE 'https://public-labs.covering.app/disposal-guide%'
    AND JSON_VALUE(e.properties, '$.item_search_keyword') IS NOT NULL
    AND JSON_VALUE(e.properties, '$.item_search_keyword') != ''
  GROUP BY 1, 2, 3
),
ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY period
      ORDER BY sessions DESC, events DESC, item_search_keyword
    ) AS rank
  FROM keyword_counts
)
SELECT
  period,
  sort_order,
  rank,
  item_search_keyword,
  sessions,
  events,
  first_event_kst,
  last_event_kst
FROM ranked
WHERE rank <= 10
ORDER BY sort_order, rank
