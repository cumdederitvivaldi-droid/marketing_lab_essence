from __future__ import annotations

import os
from pathlib import Path


SRC_DIR = Path(__file__).resolve().parent
APP_DIR = SRC_DIR.parent
OUTPUT_DIR = APP_DIR / "output"
REGION_MAP_PATH = SRC_DIR / "region_map.json"

DEFAULT_SOURCE_URL = "https://www.sugeo.onl/home"
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
)
DEFAULT_BUCKET = "covering-labs"
DEFAULT_PREFIX = "beige/today-sugeo-region-sync"
DEFAULT_GSUTIL_BIN = "gsutil"


def _load_env_file() -> None:
    """crontab 실행 환경에서 /shared/.env를 자동 로드한다."""
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


def env(name: str, default: str) -> str:
    return os.environ.get(name, default).strip() or default
