"""BQ 집계 쿼리 — ledger 단일 테이블 기반.

status='sent' row 만 KPI 분모/분자에 포함. pending / flarelane_failed 는 발사 미확인이라
통계 왜곡 방지 차원에서 제외. user별 같은 signal_type 의 최신 status 한 건만 dedup.
"""

import logging
from google.cloud import bigquery
from config import LEDGER_TABLE, EXPERIMENT_KEY

_logger = logging.getLogger(__name__)


_LATEST_BASE = f"""
WITH
latest AS (
  SELECT user_id, signal_type, status, matched_at, disqualified_reason
  FROM (
    SELECT
      user_id, signal_type, status, matched_at, disqualified_reason,
      ROW_NUMBER() OVER (PARTITION BY user_id, signal_type ORDER BY processed_at DESC) AS rn
    FROM `{LEDGER_TABLE}`
    WHERE experiment_key = '{EXPERIMENT_KEY}'
  )
  WHERE rn = 1 AND status = 'sent'
),
latest_eligible AS (SELECT * FROM latest WHERE signal_type = 'eligible'),
latest_disqualified AS (SELECT * FROM latest WHERE signal_type = 'disqualified')
"""  # noqa: S608


def query_daily_summary(client: bigquery.Client) -> dict:
    """전일(KST) 신규 + 누적 한 쿼리에 컬럼으로 묶어 반환."""
    query = f"""
    {_LATEST_BASE},
    win AS (
      SELECT
        DATETIME_TRUNC(DATETIME(CURRENT_TIMESTAMP(), 'Asia/Seoul'), DAY) AS today_kst,
        DATETIME_SUB(
          DATETIME_TRUNC(DATETIME(CURRENT_TIMESTAMP(), 'Asia/Seoul'), DAY),
          INTERVAL 1 DAY
        ) AS yesterday_kst
    )
    SELECT
      (SELECT COUNTIF(DATETIME(matched_at, 'Asia/Seoul') >= w.yesterday_kst
                      AND DATETIME(matched_at, 'Asia/Seoul') <  w.today_kst)
       FROM latest_eligible, win w) AS yesterday_eligible,
      (SELECT COUNTIF(DATETIME(matched_at, 'Asia/Seoul') >= w.yesterday_kst
                      AND DATETIME(matched_at, 'Asia/Seoul') <  w.today_kst)
       FROM latest_disqualified, win w) AS yesterday_disqualified_total,
      (SELECT COUNTIF(disqualified_reason = 'coupon_used'
                      AND DATETIME(matched_at, 'Asia/Seoul') >= w.yesterday_kst
                      AND DATETIME(matched_at, 'Asia/Seoul') <  w.today_kst)
       FROM latest_disqualified, win w) AS yesterday_coupon_used,
      (SELECT COUNTIF(disqualified_reason = 'largewaste_submitted'
                      AND DATETIME(matched_at, 'Asia/Seoul') >= w.yesterday_kst
                      AND DATETIME(matched_at, 'Asia/Seoul') <  w.today_kst)
       FROM latest_disqualified, win w) AS yesterday_largewaste_submitted,
      (SELECT COUNT(*) FROM latest_eligible) AS cum_eligible,
      (SELECT COUNT(*) FROM latest_disqualified) AS cum_disqualified_total,
      (SELECT COUNTIF(disqualified_reason = 'coupon_used') FROM latest_disqualified) AS cum_coupon_used,
      (SELECT COUNTIF(disqualified_reason = 'largewaste_submitted') FROM latest_disqualified) AS cum_largewaste_submitted
    """  # noqa: S608
    row = next(client.query(query).result())
    return dict(row.items())


def query_conversions(client: bigquery.Client, windows: list[tuple[str, int, int]]) -> list[dict]:
    """회차별 전환율 — 모든 윈도우를 단일 쿼리에 집계.

    분모: 진입 후 windows.upper_h 이상 경과한 user
    분자: 분모 중 진입 시점부터 [lower_h, upper_h) 안에 자격 해제 발생한 user
    """
    window_rows = " UNION ALL ".join(
        f"SELECT '{label}' AS label, {lower} AS lower_h, {upper} AS upper_h, {idx} AS ord"
        for idx, (label, lower, upper) in enumerate(windows)
    )
    query = f"""
    {_LATEST_BASE},
    windows AS ({window_rows}),
    enter_with_disq AS (
      SELECT
        le.user_id,
        TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), le.matched_at, HOUR) AS age_hours,
        TIMESTAMP_DIFF(ld.matched_at, le.matched_at, HOUR) AS time_to_disq_hours
      FROM latest_eligible le
      LEFT JOIN latest_disqualified ld ON ld.user_id = le.user_id
    )
    SELECT
      w.label, w.lower_h, w.upper_h,
      COUNTIF(ed.age_hours >= w.upper_h) AS denominator,
      COUNTIF(ed.age_hours >= w.upper_h
              AND ed.time_to_disq_hours IS NOT NULL
              AND ed.time_to_disq_hours >= w.lower_h
              AND ed.time_to_disq_hours <  w.upper_h) AS numerator
    FROM windows w
    LEFT JOIN enter_with_disq ed ON TRUE  -- ed 빈 경우에도 windows 모든 행 보존 (분모/분자 0/0)
    GROUP BY w.ord, w.label, w.lower_h, w.upper_h
    ORDER BY w.ord
    """  # noqa: S608
    return [
        {
            "label": r.label,
            "lower": r.lower_h,
            "upper": r.upper_h,
            "denominator": r.denominator,
            "numerator": r.numerator,
        }
        for r in client.query(query).result()
    ]
