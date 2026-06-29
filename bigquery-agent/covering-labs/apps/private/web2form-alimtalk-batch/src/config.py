"""환경변수 로드 및 앱 설정."""

import os
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[1]


def _load_env_file() -> None:
    for env_path in (Path(os.environ.get("ENV_FILE", "/shared/.env")), APP_ROOT / ".env"):
        try:
            lines = env_path.read_text(encoding="utf-8").splitlines()
        except (FileNotFoundError, OSError):
            continue
        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            key = key.strip()
            value = value.strip().strip("\"'")
            if key and key not in os.environ:
                os.environ[key] = value


_load_env_file()

# Google Sheets
SPREADSHEET_ID: str = os.environ.get(
    "WEB2FORM_SPREADSHEET_ID", "1_4Wp7JFv1HAv_rYhYiE6RBVSRDpJ9teB3w1CQwOIQJo"
)
SHEET_GID: int = int(os.environ.get("WEB2FORM_SHEET_GID", "1695689664"))
PHONE_COL: str = os.environ.get("WEB2FORM_PHONE_COL", "C")
NICKNAME_COL: str = os.environ.get("WEB2FORM_NICKNAME_COL", "B")
# 발송완료 마킹 열
SENT_COL: str = os.environ.get("WEB2FORM_SENT_COL", "G")

# FlareLane
FLARELANE_PROJECT_ID: str = os.environ.get("FLARELANE_PROJECT_ID", "")
FLARELANE_API_KEY: str = os.environ.get("FLARELANE_API_KEY", "")

# 알림톡 템플릿 정보
TEMPLATE_CODE: str = "e3f17128-c947-4dbf-8338-7a4eceef8179"
COUPON_CODE: str = "EMERGENCY50"
COUPON_NAME: str = "[긴급 지원금] 특별 지역 50% 할인"
