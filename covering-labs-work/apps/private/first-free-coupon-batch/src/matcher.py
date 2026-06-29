"""신규 가입자 매칭 — secure_dataset.user 기반, ledger 미존재 user만."""

import logging
from google.cloud import bigquery
from config import LEDGER_TABLE, USER_TABLE, MATCH_WINDOW_MINUTES, LIVE_CUTOFF_TIMESTAMP

_logger = logging.getLogger(__name__)


def query_new_signups(client: bigquery.Client) -> list[dict]:
    """최근 MATCH_WINDOW_MINUTES 내 가입자 중 ledger에 없는 user만 반환."""
    window_minutes = int(MATCH_WINDOW_MINUTES)
    query = f"""
    WITH new_signups AS (
      SELECT u.id AS user_id, u.created_date AS signed_up_at
      FROM `{USER_TABLE}` u
      WHERE u.created_date >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {window_minutes} MINUTE)
        AND u.created_date >= TIMESTAMP('{LIVE_CUTOFF_TIMESTAMP}')
        AND u.withdrawal_date IS NULL
    )
    SELECT s.user_id, s.signed_up_at
    FROM new_signups s
    LEFT JOIN `{LEDGER_TABLE}` l ON l.user_id = s.user_id
    WHERE l.user_id IS NULL
    ORDER BY s.signed_up_at
    """  # noqa: S608 - identifiers come from trusted config constants
    result = client.query(query).result()
    rows = [{"user_id": r.user_id, "signed_up_at": r.signed_up_at} for r in result]
    _logger.info(f"신규 가입자 매칭(미처리): {len(rows)}건")
    return rows
