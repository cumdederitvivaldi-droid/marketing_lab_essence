"""BQ 및 공통 유틸리티 — 두 배치 스크립트에서 공유."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

TRACK_API_BASE = "https://api.flarelane.com/v1/projects"
BQ_BIN = shutil.which("bq") or str(Path.home() / "google-cloud-sdk" / "bin" / "bq")
BQ_STATUSES = ("PAYMENT_COMPLETED", "COMPLETED", "CHECK_COMPLETED")
ASSIGNMENT_TABLE = "`covering-app-ccd23.product.experiment_user_assignments`"
EVENT_HISTORY_TABLE = "`covering-app-ccd23.product.eng_1559_event_history`"
DEVICE_TABLE = "`covering-app-ccd23.secure_dataset.device`"
_SQL_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


_KST = timezone(timedelta(hours=9))


def kst_today_string() -> str:
    return datetime.now(_KST).date().isoformat()


def build_marketing_agreed_users_cte_sql(
    cte_name: str = "marketing_agreed_users",
) -> str:
    safe_cte_name = (
        cte_name
        if isinstance(cte_name, str) and _SQL_IDENTIFIER_RE.fullmatch(cte_name)
        else "marketing_agreed_users"
    )
    return f"""
{safe_cte_name} AS (
  SELECT user_id
  FROM (
    SELECT
      user_id,
      is_marketing_agree,
      ROW_NUMBER() OVER (
        PARTITION BY user_id
        ORDER BY
          COALESCE(
            updated_is_marketing_agree_date,
            updated_date,
            created_date,
            TIMESTAMP '1970-01-01'
          ) DESC,
          id DESC
      ) AS row_number
    FROM (
      SELECT
        SAFE_CAST(user_id AS INT64) AS user_id,
        is_marketing_agree,
        updated_is_marketing_agree_date,
        updated_date,
        created_date,
        id
      FROM {DEVICE_TABLE}
      WHERE SAFE_CAST(user_id AS INT64) IS NOT NULL
    )
  )
  WHERE row_number = 1
    AND is_marketing_agree IS TRUE
)
""".strip()


def run_bq_query(data_dir: Path, log_prefix: str, sql: str) -> list[dict[str, Any]]:
    data_dir.mkdir(parents=True, exist_ok=True)
    stderr_path = data_dir / f"{log_prefix}_bq.stderr.log"
    with tempfile.NamedTemporaryFile(
        prefix=f"{log_prefix}_", suffix=".json", delete=False
    ) as tmp:
        stdout_path = Path(tmp.name)

    cmd = [
        BQ_BIN,
        "query",
        "--nouse_legacy_sql",
        "--quiet",
        "--format=json",
        "--max_rows=1000000",
    ]
    with (
        stdout_path.open("w", encoding="utf-8") as stdout_handle,
        stderr_path.open("w", encoding="utf-8") as stderr_handle,
    ):
        try:
            result = subprocess.run(
                cmd,
                input=sql,
                stdout=stdout_handle,
                stderr=stderr_handle,
                text=True,
                timeout=300,
            )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"bq query 타임아웃 (300s 초과): {exc}") from exc

    stderr_text = stderr_path.read_text(encoding="utf-8").strip()
    if result.returncode != 0:
        raise RuntimeError(f"bq query 실패:\n{stderr_text}")

    stdout = stdout_path.read_text(encoding="utf-8").strip()
    stdout_path.unlink(missing_ok=True)
    if not stdout:
        return []
    if not stdout.startswith(("[", "{")):
        first_json_index = min(
            (idx for idx in (stdout.find("["), stdout.find("{")) if idx >= 0),
            default=-1,
        )
        if first_json_index >= 0:
            stdout = stdout[first_json_index:]
    return json.loads(stdout)


def run_bq_command(data_dir: Path, log_prefix: str, sql: str) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    stderr_path = data_dir / f"{log_prefix}_bq.stderr.log"
    stdout_path = data_dir / f"{log_prefix}_bq.stdout.log"
    cmd = [
        BQ_BIN,
        "query",
        "--nouse_legacy_sql",
        "--quiet",
    ]
    try:
        result = subprocess.run(cmd, input=sql, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"bq command 타임아웃 (300s 초과): {exc}") from exc
    stderr_path.write_text(result.stderr or "", encoding="utf-8")
    stdout_path.write_text(result.stdout or "", encoding="utf-8")

    stderr_text = stderr_path.read_text(encoding="utf-8").strip()
    stdout_text = stdout_path.read_text(encoding="utf-8").strip()
    if result.returncode != 0:
        raise RuntimeError(
            f"bq command 실패:\nstderr:\n{stderr_text}\n\nstdout:\n{stdout_text}"
        )


def parse_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() == "true"
    if value is None:
        return False
    return bool(value)


def normalize_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for row in rows:
        copied = dict(row)
        copied["already_emitted"] = parse_bool(copied.get("already_emitted"))
        normalized.append(copied)
    return normalized
