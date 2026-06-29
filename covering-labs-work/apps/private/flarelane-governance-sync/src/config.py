"""Environment and authentication settings for the FlareLane governance batch."""

import os
from pathlib import Path


def _load_env_file() -> None:
    """Load /shared/.env for crontab runs without overriding process env."""
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

GCP_PROJECT = os.environ.get("GCP_PROJECT", "covering-app-ccd23")
BIGQUERY_SCOPES = [
    "https://www.googleapis.com/auth/bigquery",
    "https://www.googleapis.com/auth/cloud-platform",
]
