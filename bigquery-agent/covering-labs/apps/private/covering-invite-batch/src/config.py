"""환경변수 + 상수 관리."""

import logging
import os
from pathlib import Path

_logger = logging.getLogger(__name__)


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
FLARELANE_PROJECT_ID = os.environ.get("FLARELANE_PROJECT_ID", "")
FLARELANE_API_KEY = os.environ.get("FLARELANE_API_KEY", "")
SLACK_BOT_TOKEN = os.environ.get("SLACK_BOT_TOKEN", "")
SLACK_CHANNEL_ID = os.environ.get("INVITE_SLACK_CHANNEL_ID", "C0ARXKB2Y9L")

VARIANT = "friend_invite_v1"
LEDGER_TABLE = f"{GCP_PROJECT}.product.friend_invite_reward_issuance_v1"
MATCH_WINDOW_DAYS = 7
SIGNUP_WINDOW_HOURS = 48

# 신규 가입자: V1 정책 그대로 (30,000원)
FLARELANE_EVENT_NAME_NEW = "friend_invite_reward_v1_invitee"
REWARD_AMOUNT_NEW = 30000
COUPON_POLICY_ID_NEW = 205  # [집정리지원금] 30,000원 할인

# 기존 가입자: V2 신규 (3,000원)
FLARELANE_EVENT_NAME_EXISTING = "friend_invite_reward_v1_invitee_existing"
REWARD_AMOUNT_EXISTING = 3000
COUPON_POLICY_ID_EXISTING = 212  # [집정리지원금] 3,000원 할인

# 호환용 (deprecated) — 기존 코드 경로에서 참조
FLARELANE_EVENT_NAME = FLARELANE_EVENT_NAME_NEW
REWARD_AMOUNT = REWARD_AMOUNT_NEW
