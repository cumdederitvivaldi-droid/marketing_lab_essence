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
    'previous_day',
    2,
    DATE_SUB(report_date, INTERVAL 1 DAY),
    DATE_SUB(report_date, INTERVAL 1 DAY)
  FROM params
  UNION ALL
  SELECT
    'last_7d',
    3,
    DATE_SUB(report_date, INTERVAL 6 DAY),
    report_date
  FROM params
),
base AS (
  SELECT
    w.period,
    w.sort_order,
    COALESCE(JSON_VALUE(e.properties, '$.session_id'), e.distinct_id, e.insert_id) AS session_key,
    e.event_name,
    JSON_VALUE(e.properties, '$.recommendation') AS recommendation,
    JSON_VALUE(e.properties, '$.feedback_sentiment') AS feedback_sentiment,
    JSON_VALUE(e.properties, '$.length_range') AS length_range,
    JSON_VALUE(e.properties, '$.item_search_keyword') AS item_search_keyword,
    DATETIME(e.time, 'Asia/Seoul') AS event_kst
  FROM windows w
  JOIN `covering-app-ccd23.mixpanel.mp_master_event` e
    ON DATE(e.time, 'Asia/Seoul') BETWEEN w.start_date AND w.end_date
  WHERE (
      JSON_VALUE(e.properties, '$.app_name') = 'disposal-guide'
      OR JSON_VALUE(e.properties, '$.guide_name') = 'service_recommendation'
      OR e.event_name LIKE '%GuideServiceRecommendation%'
    )
    AND JSON_VALUE(e.properties, '$.url') LIKE 'https://public-labs.covering.app/disposal-guide%'
),
session_flags AS (
  SELECT
    period,
    sort_order,
    session_key,
    COUNT(*) AS events,
    COUNTIF(event_name = '[ROUTE] GuideServiceRecommendationIntroScreen') > 0 AS intro,
    COUNTIF(event_name = '[CLICK] GuideServiceRecommendationIntroScreen_startButton') > 0 AS start_click,
    COUNTIF(event_name IN (
      '[ROUTE] GuideServiceRecommendationResultScreen',
      '[VIEW] GuideServiceRecommendationResultScreen_result'
    )) > 0 AS result_enter,
    COUNTIF(event_name = '[CLICK] GuideServiceRecommendationResultScreen_cta') > 0 AS cta_click,
    COUNTIF(event_name = '[CLICK] GuideServiceRecommendationResultScreen_feedback') > 0 AS feedback_choice,
    COUNTIF(
      event_name = '[CLICK] GuideServiceRecommendationResultScreen_feedback'
      AND feedback_sentiment = 'positive'
    ) > 0 AS feedback_positive,
    COUNTIF(
      event_name = '[CLICK] GuideServiceRecommendationResultScreen_feedback'
      AND feedback_sentiment = 'negative'
    ) > 0 AS feedback_negative,
    COUNTIF(event_name = '[CLICK] GuideServiceRecommendationResultScreen_openFeedbackDialog') > 0 AS feedback_dialog,
    COUNTIF(event_name = '[CLICK] GuideServiceRecommendationResultScreen_submitFeedback') > 0 AS feedback_submit,
    COUNTIF(
      event_name IN ('[ROUTE] GuideServiceRecommendationResultScreen', '[VIEW] GuideServiceRecommendationResultScreen_result')
      AND recommendation = 'VISIT_PICKUP'
    ) > 0 AS visit_pickup_result,
    COUNTIF(
      event_name IN ('[ROUTE] GuideServiceRecommendationResultScreen', '[VIEW] GuideServiceRecommendationResultScreen_result')
      AND recommendation = 'VISIT_PICKUP'
      AND length_range = 'UNDER_80'
    ) > 0 AS under80_visit_pickup,
    COUNTIF(
      event_name = '[CLICK] GuideServiceRecommendationItemDescriptionScreen_nextButton'
      AND item_search_keyword IS NOT NULL
      AND item_search_keyword != ''
    ) > 0 AS item_text_input,
    MIN(event_kst) AS first_event_kst,
    MAX(event_kst) AS last_event_kst
  FROM base
  GROUP BY 1, 2, 3
)
SELECT
  period,
  sort_order,
  COUNT(*) AS sessions,
  SUM(events) AS events,
  COUNTIF(intro) AS intro_sessions,
  COUNTIF(start_click) AS start_sessions,
  COUNTIF(result_enter) AS result_sessions,
  COUNTIF(cta_click) AS cta_sessions,
  COUNTIF(feedback_choice) AS feedback_choice_sessions,
  COUNTIF(feedback_positive) AS feedback_positive_sessions,
  COUNTIF(feedback_negative) AS feedback_negative_sessions,
  COUNTIF(feedback_dialog) AS feedback_dialog_sessions,
  COUNTIF(feedback_submit) AS feedback_submit_sessions,
  COUNTIF(visit_pickup_result) AS visit_pickup_result_sessions,
  COUNTIF(under80_visit_pickup) AS under80_visit_pickup_sessions,
  COUNTIF(item_text_input) AS item_text_input_sessions,
  SAFE_DIVIDE(COUNTIF(start_click), COUNTIF(intro)) AS start_per_intro_rate,
  SAFE_DIVIDE(COUNTIF(result_enter), COUNTIF(intro)) AS result_per_intro_rate,
  SAFE_DIVIDE(COUNTIF(result_enter), COUNTIF(start_click)) AS result_per_start_rate,
  SAFE_DIVIDE(COUNTIF(cta_click), COUNTIF(result_enter)) AS cta_per_result_rate,
  SAFE_DIVIDE(COUNTIF(feedback_choice), COUNTIF(result_enter)) AS feedback_choice_per_result_rate,
  SAFE_DIVIDE(COUNTIF(feedback_negative), COUNTIF(feedback_choice)) AS negative_share_rate,
  SAFE_DIVIDE(COUNTIF(feedback_dialog), COUNTIF(feedback_choice)) AS dialog_per_choice_rate,
  SAFE_DIVIDE(COUNTIF(feedback_submit), COUNTIF(feedback_dialog)) AS submit_per_dialog_rate,
  SAFE_DIVIDE(COUNTIF(under80_visit_pickup), COUNTIF(visit_pickup_result)) AS under80_share_of_visit_pickup_rate,
  FORMAT_DATETIME('%Y-%m-%d %H:%M:%S', MIN(first_event_kst)) AS first_event_kst,
  FORMAT_DATETIME('%Y-%m-%d %H:%M:%S', MAX(last_event_kst)) AS latest_event_kst
FROM session_flags
GROUP BY 1, 2
ORDER BY sort_order
