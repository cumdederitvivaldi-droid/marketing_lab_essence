"""환경변수 관리 — crontab 실행 환경 대응."""

import os
from pathlib import Path


def _load_env_file() -> None:
    """crontab 실행 환경에서 /shared/.env를 자동 로드한다.
    이미 설정된 환경변수는 덮어쓰지 않는다(setdefault).
    """
    env_path = Path(os.environ.get("ENV_FILE", "/shared/.env"))
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env_file()


def _require(key: str) -> str:
    val = (os.environ.get(key) or "").replace("\\n", "").strip()
    if not val:
        raise RuntimeError(f"환경변수 {key}가 필요합니다.")
    return val


FLARELANE_PROJECT_ID: str = _require("FLARELANE_PROJECT_ID")
FLARELANE_API_KEY: str = _require("FLARELANE_API_KEY")
