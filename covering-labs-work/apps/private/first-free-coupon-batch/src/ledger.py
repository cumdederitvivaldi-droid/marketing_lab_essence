"""지급 장부 — BigQuery 테이블 조회/기록."""

import hashlib
import logging
from datetime import datetime, timezone
from google.api_core.exceptions import GoogleAPIError, NotFound
from google.cloud import bigquery
from config import LEDGER_TABLE

_logger = logging.getLogger(__name__)


def _mask(user_id) -> str:
    """로그용 마스킹 — MD5 앞 8자리."""
    return hashlib.md5(str(user_id).encode()).hexdigest()[:8]  # noqa: S324 - non-cryptographic logging mask

SCHEMA = [
    bigquery.SchemaField("user_id", "INT64", mode="REQUIRED"),
    bigquery.SchemaField("signed_up_at", "TIMESTAMP", mode="REQUIRED"),
    bigquery.SchemaField("assigned_at", "TIMESTAMP", mode="REQUIRED"),
    bigquery.SchemaField("variant", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("coupon_policy_id", "INT64"),
    bigquery.SchemaField("flarelane_event_name", "STRING"),
    bigquery.SchemaField("status", "STRING"),
    bigquery.SchemaField("status_reason", "STRING"),
    bigquery.SchemaField("processed_at", "TIMESTAMP", mode="REQUIRED"),
]


def ensure_table_exists(client: bigquery.Client) -> None:
    """장부 테이블 없으면 생성."""
    try:
        client.get_table(LEDGER_TABLE)
        _logger.info("장부 테이블 이미 존재")
    except NotFound:
        table = bigquery.Table(LEDGER_TABLE, schema=SCHEMA)
        table.time_partitioning = bigquery.TimePartitioning(field="signed_up_at")
        table.clustering_fields = ["user_id"]
        client.create_table(table)
        _logger.info(f"장부 테이블 생성: {LEDGER_TABLE}")


def write_row(client: bigquery.Client, row: dict) -> bool:
    """장부에 1건 기록. 성공 True, 실패 False.

    transport/auth/API 예외도 잡아 False로 처리해 호출부에서 일관되게 분기 가능하게 함.
    row-level errors (insert_rows_json 반환값)와 클라이언트 예외 양쪽 모두 커버.
    """
    row["processed_at"] = datetime.now(timezone.utc).isoformat()
    masked = _mask(row.get("user_id"))
    try:
        errors = client.insert_rows_json(LEDGER_TABLE, [row])
    except GoogleAPIError as e:
        _logger.error(f"장부 기록 실패(API 예외): user_id={masked} {e}")
        return False
    if errors:
        _logger.error(f"장부 기록 실패: user_id={masked} {errors}")
        return False
    return True
