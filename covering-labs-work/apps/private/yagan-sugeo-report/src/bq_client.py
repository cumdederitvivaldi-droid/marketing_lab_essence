import json
import shutil
import subprocess
from pathlib import Path

import config

_BQ = shutil.which("bq") or str(Path.home() / "google-cloud-sdk" / "bin" / "bq")
_SQL_PATH = Path(__file__).parent / "query.sql"

_TOTAL_COUNT_SQL = """
SELECT COUNT(DISTINCT o.id) AS total
FROM `covering-app-ccd23.secure_dataset.order_v2` AS o
JOIN `covering-app-ccd23.secure_dataset.fulfillment` AS f ON f.order_id = o.id
JOIN `covering-app-ccd23.secure_dataset.order_line` AS ol ON ol.order_id = o.id
JOIN `covering-app-ccd23.secure_dataset.product` AS p ON p.id = ol.product_id
WHERE
  DATE(f.scheduled_start_at, 'Asia/Seoul') = DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 1 DAY)
  AND o.company_id IS NULL
  AND o.status != 'CANCELED'
  AND o.deleted_at IS NULL
  AND p.product_type = 'SERVICE'
"""


def _clean_json_output(raw: str) -> str:
    """bq CLI는 JSON 앞에 'Waiting on bqjob_r...' 같은 상태 텍스트를 출력한다.
    첫 번째 '[' 또는 '{' 위치부터 슬라이스해 순수 JSON만 반환한다."""
    stripped = raw.strip()
    if stripped.startswith(("[", "{")):
        return stripped
    indices = [i for i in (stripped.find("["), stripped.find("{")) if i >= 0]
    if not indices:
        raise RuntimeError(f"BigQuery JSON 응답을 찾지 못했습니다.\n{raw}")
    return stripped[min(indices):]


def _run_query(sql: str) -> list[dict]:
    result = subprocess.run(
        [
            _BQ, "query",
            "--use_legacy_sql=false",
            "--format=json",
            f"--project_id={config.GCP_PROJECT}",
        ],
        input=sql,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(f"BigQuery 조회 실패: {result.stderr.strip()}")
    raw = result.stdout.strip()
    if not raw:
        return []
    return json.loads(_clean_json_output(raw))


def fetch_orders() -> list[dict]:
    return _run_query(_SQL_PATH.read_text(encoding="utf-8"))


def fetch_total_count() -> int:
    rows = _run_query(_TOTAL_COUNT_SQL)
    if not rows:
        return 0
    return int(rows[0].get("total", 0))
