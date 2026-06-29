"""신규 적격자 / 자격 해제자 매칭 — secure_dataset 기반, ledger 미기록 user만."""

import logging
from google.cloud import bigquery
from config import (
    LEDGER_TABLE,
    ORDER_V2_TABLE,
    ORDER_LINE_TABLE,
    PRODUCT_TABLE,
    USER_COUPON_TABLE,
    DEVICE_TABLE,
    EXPERIMENT_KEY,
    COUPON_POLICY_ID,
    LARGEWASTE_PRODUCT_CODE,
    MATCH_WINDOW_MINUTES,
    PENDING_RETRY_AFTER_MINUTES,
)

_logger = logging.getLogger(__name__)


def _marketing_agreed_users_cte() -> str:
    """device 최신 1건 dedup → is_marketing_agree=true user_id 셋."""
    return f"""
    marketing_agreed_users AS (
      SELECT user_id
      FROM (
        SELECT
          SAFE_CAST(user_id AS INT64) AS user_id,
          is_marketing_agree,
          ROW_NUMBER() OVER (
            PARTITION BY SAFE_CAST(user_id AS INT64)
            ORDER BY COALESCE(updated_is_marketing_agree_date, updated_date, created_date, TIMESTAMP "1970-01-01") DESC, id DESC
          ) AS rn
        FROM `{DEVICE_TABLE}`
        WHERE SAFE_CAST(user_id AS INT64) IS NOT NULL
      )
      WHERE rn = 1 AND is_marketing_agree IS TRUE
    )
    """


def query_new_eligible(client: bigquery.Client) -> list[dict]:
    """최근 N분 신규 적격자 추출 (order_v2 신청 완료 × 마수동 × ledger 미차단).

    트리거: 수거 "신청 완료" = order_v2 row INSERT (created_at).
    윈도우 사이 CANCELED 된 건은 제외 (status != 'CANCELED').
    user별 가장 빠른 자격 부여 주문 1건만 반환.

    ledger 차단 정책:
      - sent / flarelane_failed: 영구 차단
      - pending + PENDING_RETRY_AFTER_MINUTES 이내: 차단 (다른 cron 처리 중일 수 있음)
      - pending + 그 외: 차단 해제 → 재처리 허용 (영구 누락 자가 복구)
    """
    window = int(MATCH_WINDOW_MINUTES)
    ttl = int(PENDING_RETRY_AFTER_MINUTES)
    query = f"""
    WITH
    {_marketing_agreed_users_cte()},
    candidate_orders AS (
      SELECT
        o.user_id,
        o.id AS order_id,
        o.order_number,
        o.created_at AS order_submitted_at,
        ROW_NUMBER() OVER (PARTITION BY o.user_id ORDER BY o.created_at ASC) AS rn
      FROM `{ORDER_V2_TABLE}` o
      JOIN marketing_agreed_users m ON m.user_id = o.user_id
      WHERE o.status != 'CANCELED'
        AND o.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {window} MINUTE)
    ),
    new_eligible AS (
      SELECT user_id, order_id, order_number, order_submitted_at
      FROM candidate_orders
      WHERE rn = 1
    )
    SELECT n.user_id, n.order_id, n.order_number, n.order_submitted_at
    FROM new_eligible n
    LEFT JOIN `{LEDGER_TABLE}` l
      ON l.user_id = n.user_id
     AND l.experiment_key = '{EXPERIMENT_KEY}'
     AND l.signal_type = 'eligible'
     AND (
       l.status IN ('sent', 'flarelane_failed')
       OR (l.status = 'pending'
           AND l.matched_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {ttl} MINUTE))
     )
    WHERE l.user_id IS NULL
    ORDER BY n.order_submitted_at
    """  # noqa: S608 - identifiers come from trusted config constants
    result = client.query(query).result()
    rows = [
        {
            "user_id": r.user_id,
            "order_id": r.order_id,
            "order_number": r.order_number,
            "order_submitted_at": r.order_submitted_at,
        }
        for r in result
    ]
    _logger.info(f"신규 적격자 매칭(미처리): {len(rows)}건")
    return rows


def query_disqualified_users(client: bigquery.Client) -> list[dict]:
    """최근 N분 자격 해제자 추출 (ledger disqualified 미차단).

    자격 해제 사유 (둘 중 하나라도 발생하면 차단):
      1. coupon_used: 본 실험 진입 이후 발급된 정책 216 쿠폰 사용 (status=COMPLETED)
         — ledger eligible.matched_at 이후 발급된 user_coupon 만 대상.
         — 실험 외 채널로 사전 그랜트된 216 쿠폰은 제외.
      2. largewaste_submitted: PICKUP_LARGE_COVERING_BAG product 주문 신청 완료 (status != 'CANCELED')

    user별 가장 빠른 1건만 반환 (사유 무관).

    ledger 차단 정책: query_new_eligible 와 동일 (pending TTL 적용).
    """
    window = int(MATCH_WINDOW_MINUTES)
    ttl = int(PENDING_RETRY_AFTER_MINUTES)
    query = f"""
    WITH
    eligible_entries AS (
      SELECT user_id, MIN(matched_at) AS first_eligible_at
      FROM `{LEDGER_TABLE}`
      WHERE experiment_key = '{EXPERIMENT_KEY}'
        AND signal_type = 'eligible'
        AND status = 'sent'
      GROUP BY user_id
    ),
    coupon_uses AS (
      SELECT
        uc.user_id,
        'coupon_used' AS disqualified_reason,
        uc.id AS user_coupon_id,
        o.id AS disqualified_order_id,
        o.created_at AS disqualified_at
      FROM `{USER_COUPON_TABLE}` uc
      JOIN `{ORDER_V2_TABLE}` o
        ON o.user_coupon_id = uc.id
       AND o.status = 'COMPLETED'
      JOIN eligible_entries e
        ON e.user_id = uc.user_id
       AND uc.created_date >= e.first_eligible_at  -- 실험 진입 이후 발급된 쿠폰만
      WHERE uc.coupon_policy_id = {COUPON_POLICY_ID}
        AND o.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {window} MINUTE)
    ),
    largewaste_submits AS (
      SELECT
        o.user_id,
        'largewaste_submitted' AS disqualified_reason,
        CAST(NULL AS INT64) AS user_coupon_id,
        o.id AS disqualified_order_id,
        o.created_at AS disqualified_at
      FROM `{ORDER_V2_TABLE}` o
      JOIN `{ORDER_LINE_TABLE}` ol ON ol.order_id = o.id
      JOIN `{PRODUCT_TABLE}` p ON p.id = ol.product_id
      WHERE p.product_code = '{LARGEWASTE_PRODUCT_CODE}'
        AND o.status != 'CANCELED'
        AND o.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {window} MINUTE)
    ),
    all_disqualifications AS (
      SELECT * FROM coupon_uses
      UNION ALL
      SELECT * FROM largewaste_submits
    ),
    ranked AS (
      SELECT
        user_id, disqualified_reason, user_coupon_id, disqualified_order_id, disqualified_at,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY disqualified_at ASC) AS rn
      FROM all_disqualifications
    ),
    new_disqualifications AS (
      SELECT user_id, disqualified_reason, user_coupon_id, disqualified_order_id, disqualified_at
      FROM ranked
      WHERE rn = 1
    )
    SELECT
      n.user_id, n.disqualified_reason, n.user_coupon_id, n.disqualified_order_id, n.disqualified_at
    FROM new_disqualifications n
    LEFT JOIN `{LEDGER_TABLE}` l
      ON l.user_id = n.user_id
     AND l.experiment_key = '{EXPERIMENT_KEY}'
     AND l.signal_type = 'disqualified'
     AND (
       l.status IN ('sent', 'flarelane_failed')
       OR (l.status = 'pending'
           AND l.matched_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {ttl} MINUTE))
     )
    WHERE l.user_id IS NULL
    ORDER BY n.disqualified_at
    """  # noqa: S608 - identifiers come from trusted config constants
    result = client.query(query).result()
    rows = [
        {
            "user_id": r.user_id,
            "disqualified_reason": r.disqualified_reason,
            "user_coupon_id": r.user_coupon_id,
            "disqualified_order_id": r.disqualified_order_id,
            "disqualified_at": r.disqualified_at,
        }
        for r in result
    ]
    _logger.info(f"자격 해제자 매칭(미처리): {len(rows)}건")
    return rows
