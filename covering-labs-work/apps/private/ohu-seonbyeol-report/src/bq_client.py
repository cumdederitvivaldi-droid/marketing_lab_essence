import json
import shutil
import subprocess
from pathlib import Path

import config

_BQ = shutil.which("bq") or str(Path.home() / "google-cloud-sdk" / "bin" / "bq")
_SQL_PATH = Path(__file__).parent / "query.sql"


def _clean_json_output(raw: str) -> str:
    """bq CLI 출력에서 상태 텍스트를 제거하고 순수 JSON 문자열만 반환한다."""
    stripped = raw.strip()
    if stripped.startswith(("[", "{")):
        return stripped
    indices = [i for i in (stripped.find("["), stripped.find("{")) if i >= 0]
    if not indices:
        raise RuntimeError(f"BigQuery JSON 응답을 찾지 못했습니다.\n{raw}")
    return stripped[min(indices):]


def _run_query(sql: str) -> list[dict]:
    """bq CLI로 SQL을 실행하고 결과를 dict 리스트로 반환한다."""
    try:
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
    except FileNotFoundError as e:
        raise RuntimeError(f"bq CLI를 찾을 수 없습니다: {_BQ}") from e
    except subprocess.TimeoutExpired as e:
        raise RuntimeError("BigQuery 조회가 제한 시간(120초)을 초과했습니다.") from e
    if result.returncode != 0:
        raise RuntimeError(f"BigQuery 조회 실패: {result.stderr.strip()}")
    raw = result.stdout.strip()
    if not raw:
        return []
    return json.loads(_clean_json_output(raw))


def fetch_destination_stats() -> list[dict]:
    """활성화된 야간 기사의 도착지별 인원 수를 BigQuery에서 조회해 반환한다."""
    rows = _run_query(_SQL_PATH.read_text(encoding="utf-8"))
    return [
        {
            "destination": row.get("destination") or "미지정",
            "rider_count": int(row.get("rider_count") or 0),
        }
        for row in rows
    ]
