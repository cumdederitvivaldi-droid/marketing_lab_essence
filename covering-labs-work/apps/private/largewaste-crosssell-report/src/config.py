"""환경변수 + 상수 관리."""

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

GCP_PROJECT = os.environ.get("GCP_PROJECT") or os.environ.get("BIGQUERY_PROJECT_ID") or "covering-app-ccd23"
SLACK_BOT_TOKEN = os.environ.get("SLACK_BOT_TOKEN", "")

# 실험 식별 — coupon-sync 와 동일 값 (ledger 컬럼 매칭)
EXPERIMENT_KEY = "largewaste_crosssell_v1"

# 데이터 소스 — coupon-sync 가 적재하는 ledger 단일 테이블
LEDGER_TABLE = f"{GCP_PROJECT}.product.largewaste_crosssell_coupon_ledger_v1"

# Slack 발송 채널 — #제품팀_실험실_notification
SLACK_REPORT_CHANNEL = os.environ.get(
    "LARGEWASTE_CROSSSELL_REPORT_CHANNEL", "C0ARXKB2Y9L"
)

# 회차별 전환율 윈도우 (시간 단위, 진입 시점 기준 경과 시간)
#   D+0: 진입 ~ 24h
#   D+1~D+6: 24h ~ 144h (1d ~ 6d)
#   D+6 ~ 만료(D+7): 144h ~ 168h
CONVERSION_WINDOWS_HOURS = [
    ("D+0", 0, 24),
    ("D+1~D+6", 24, 144),
    ("D+6~만료", 144, 168),
]
