import json
import shutil
import subprocess
from pathlib import Path

import config

_BQ = shutil.which("bq") or str(Path.home() / "google-cloud-sdk" / "bin" / "bq")
_SQL_PATH = Path(__file__).parent / "query.sql"


def _clean_json_output(raw: str) -> str:
    stripped = raw.strip()
    if stripped.startswith(("[", "{")):
        return stripped
    indices = [i for i in (stripped.find("["), stripped.find("{")) if i >= 0]
    if not indices:
        raise RuntimeError(f"BigQuery JSON 응답을 찾지 못했습니다.\n{raw}")
    return stripped[min(indices):]


def fetch_large_bag_summary() -> dict:
    result = subprocess.run(
        [
            _BQ, "query",
            "--use_legacy_sql=false",
            "--format=json",
            f"--project_id={config.GCP_PROJECT}",
        ],
        input=_SQL_PATH.read_text(encoding="utf-8"),
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(f"BigQuery 조회 실패: {result.stderr.strip()}")
    raw = result.stdout.strip()
    if not raw:
        return {"total_count": 0, "done_count": 0, "pending_count": 0}
    rows = json.loads(_clean_json_output(raw))
    if not rows:
        return {"total_count": 0, "done_count": 0, "pending_count": 0}
    row = rows[0]
    return {
        "total_count": int(row.get("total_count") or 0),
        "done_count": int(row.get("done_count") or 0),
        "pending_count": int(row.get("pending_count") or 0),
    }
