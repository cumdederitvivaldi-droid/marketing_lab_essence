"""지급 장부 — BigQuery 테이블 조회/기록."""

import logging
from datetime import datetime, timezone
from google.api_core.exceptions import NotFound
from google.cloud import bigquery
from config import GCP_PROJECT, LEDGER_TABLE

_logger = logging.getLogger(__name__)

SCHEMA = [
    bigquery.SchemaField("run_date", "DATE"),
    bigquery.SchemaField("variant", "STRING"),
    bigquery.SchemaField("invite_code", "STRING"),
    bigquery.SchemaField("inviter_id", "INT64"),
    bigquery.SchemaField("invitee_user_id", "INT64"),
    bigquery.SchemaField("airbridge_device_id", "STRING"),
    bigquery.SchemaField("installed_at", "TIMESTAMP"),
    bigquery.SchemaField("signed_up_at", "TIMESTAMP"),
    bigquery.SchemaField("reward_target", "STRING"),
    bigquery.SchemaField("status", "STRING"),
    bigquery.SchemaField("status_reason", "STRING"),
    bigquery.SchemaField("flarelane_event_name", "STRING"),
    bigquery.SchemaField("processed_at", "TIMESTAMP"),
    # V2 추가 — 신규(new) / 기존(existing) 가입자 분기 + 보상 정책 식별
    bigquery.SchemaField("recipient_type", "STRING"),
    bigquery.SchemaField("reward_amount", "INT64"),
    bigquery.SchemaField("coupon_policy_id", "INT64"),
]


def expire_old_failures(client: bigquery.Client) -> int:
    """3일 이내 재시도 기록이 없는 failed 건을 전체 초대 경로 기준으로 처리."""
    query = f"""
    UPDATE `{LEDGER_TABLE}` t
    SET status = 'permanently_failed', status_reason = 'retry_expired'
    WHERE t.reward_target = 'invitee'
      AND t.status = 'failed'
      AND NOT EXISTS (
        SELECT 1 FROM `{LEDGER_TABLE}` recent
        WHERE recent.invitee_user_id = t.invitee_user_id
          AND recent.reward_target = t.reward_target
          AND recent.status = 'failed'
          AND recent.processed_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 3 DAY)
      )
    """
    result = client.query(query).result()
    count = result.num_dml_affected_rows or 0
    _logger.info(f"영구 실패 처리: {count}건")
    return count


def get_already_issued(client: bigquery.Client) -> set[int]:
    """지급 완료 또는 영구 실패된 invitee_user_id를 전체 초대 경로에서 찾는다."""
    query = f"""
    SELECT DISTINCT invitee_user_id
    FROM `{LEDGER_TABLE}`
    WHERE reward_target = 'invitee'
      AND status IN ('issued', 'permanently_failed')
    """
    result = client.query(query).result()
    issued = {row.invitee_user_id for row in result}
    _logger.info(f"이미 처리 완료(발급+영구실패): {len(issued)}건")
    return issued


def write_row(client: bigquery.Client, row: dict) -> bool:
    """장부에 결과 1건을 즉시 기록. 성공 시 True, 실패 시 False."""
    row["processed_at"] = datetime.now(timezone.utc).isoformat()
    errors = client.insert_rows_json(LEDGER_TABLE, [row])
    if errors:
        _logger.error(f"장부 기록 실패: invitee={row.get('invitee_user_id')} {errors}")
        return False
    return True


def get_lifetime_counts(client: bigquery.Client) -> dict[str, int]:
    """장부 누적 통계 — status × recipient_type 분포.

    recipient_type이 NULL인 V2 이전 row는 'new'로 간주.
    """
    query = f"""
    SELECT
      status,
      COALESCE(recipient_type, 'new') AS recipient_type,
      COUNT(*) AS cnt
    FROM `{LEDGER_TABLE}`
    WHERE reward_target = 'invitee'
      AND status IN ('issued', 'permanently_failed')
    GROUP BY status, recipient_type
    """
    counts = {"issued_new": 0, "issued_existing": 0, "permanently_failed": 0}
    for row in client.query(query).result():
        if row.status == "issued":
            key = "issued_existing" if row.recipient_type == "existing" else "issued_new"
            counts[key] += row.cnt
        elif row.status == "permanently_failed":
            counts["permanently_failed"] += row.cnt
    return counts


def ensure_table_exists(client: bigquery.Client) -> None:
    """지급 장부 테이블이 없으면 생성."""
    table = bigquery.Table(LEDGER_TABLE, schema=SCHEMA)
    table.time_partitioning = bigquery.TimePartitioning(field="run_date")
    try:
        client.get_table(LEDGER_TABLE)
        _logger.info("장부 테이블 이미 존재")
    except NotFound:
        client.create_table(table)
        _logger.info(f"장부 테이블 생성: {LEDGER_TABLE}")
