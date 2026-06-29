import os
from pathlib import Path


def _load_env_file() -> None:
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
# YAGAN_SUGEO_SLACK_CHANNEL: /shared/.env 에 채널 ID(C로 시작) 추가 필요
# 채널 이름(#운영_야간수거)은 bot token에서 동작하지 않음 — 반드시 ID 사용
SLACK_CHANNEL = os.environ.get("YAGAN_SUGEO_SLACK_CHANNEL", "C0ABHQGEDU1")  # #운영_야간수거
