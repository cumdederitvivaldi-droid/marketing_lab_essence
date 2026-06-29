import os
from pathlib import Path


def _load_env_file() -> None:
    """crontab 실행 환경에서 /shared/.env를 자동 로드한다. 이미 설정된 환경변수는 덮어쓰지 않는다."""
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
SLACK_BOT_TOKEN = os.environ.get("SLACK_BOT_TOKEN", "")
SLACK_CHANNEL = os.environ.get("SEONBYEOL_SLACK_CHANNEL", "C05FMG8TF5F")
