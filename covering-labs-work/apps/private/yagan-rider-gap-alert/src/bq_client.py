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


def fetch_stalled_riders() -> list[dict]:
    return _run_query(_SQL_PATH.read_text(encoding="utf-8"))
