"""쿠폰 자격 신호 장부 — BigQuery."""

import hashlib
import logging
from datetime import datetime, timezone
from google.api_core.exceptions import GoogleAPIError, NotFound
from google.cloud import bigquery
from config import LEDGER_TABLE

_logger = logging.getLogger(__name__)


def _mask(user_id) -> str:
    return hashlib.md5(str(user_id).encode()).hexdigest()[:8]  # noqa: S324 - non-cryptographic logging mask


SCHEMA = [
    # 식별
    bigquery.SchemaField("user_id", "INT64", mode="REQUIRED"),
    bigquery.SchemaField("experiment_key", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("signal_type", "STRING", mode="REQUIRED"),  # "eligible" | "disqualified"

    # 자격 트리거 정보 (eligible 시) — order_v2 신청 완료 (created_at)
    bigquery.SchemaField("order_id", "INT64"),
    bigquery.SchemaField("order_number", "STRING"),
    bigquery.SchemaField("order_submitted_at", "TIMESTAMP"),
    bigquery.SchemaField("is_marketing_agree", "BOOL"),

    # 자격 해제 정보 (disqualified 시) — 쿠폰 사용 또는 대형폐기물 신청
    bigquery.SchemaField("disqualified_reason", "STRING"),  # "coupon_used" | "largewaste_submitted"
    bigquery.SchemaField("coupon_policy_id", "INT64"),
    bigquery.SchemaField("user_coupon_id", "INT64"),  # coupon_used 시에만
    bigquery.SchemaField("disqualified_order_id", "INT64"),  # 사용/신청 완료된 order_v2.id
    bigquery.SchemaField("disqualified_at", "TIMESTAMP"),

    # 처리 메타
    bigquery.SchemaField("flarelane_event_name", "STRING"),
    bigquery.SchemaField("status", "STRING"),  # "pending" | "sent" | "flarelane_failed"
    bigquery.SchemaField("status_reason", "STRING"),
    bigquery.SchemaField("matched_at", "TIMESTAMP", mode="REQUIRED"),
    bigquery.SchemaField("processed_at", "TIMESTAMP", mode="REQUIRED"),
]


def ensure_table_exists(client: bigquery.Client) -> None:
    """장부 테이블 없으면 생성."""
    try:
        client.get_table(LEDGER_TABLE)
        _logger.info("장부 테이블 이미 존재")
    except NotFound:
        table = bigquery.Table(LEDGER_TABLE, schema=SCHEMA)
        table.time_partitioning = bigquery.TimePartitioning(field="matched_at")
        table.clustering_fields = ["experiment_key", "signal_type", "user_id"]
        client.create_table(table)
        _logger.info(f"장부 테이블 생성: {LEDGER_TABLE}")


def write_row(client: bigquery.Client, row: dict) -> bool:
    """장부에 1건 기록. 성공 True, 실패 False."""
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
