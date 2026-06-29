"""환경변수 + 상수 관리."""

import logging
import os
from dataclasses import dataclass
from pathlib import Path

_logger = logging.getLogger(__name__)


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
    val = os.environ.get(key, "").strip()
    if not val:
        raise RuntimeError(f"환경변수 {key}가 설정되지 않았습니다")
    return val


def _optional(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()


# ── 상수 ──────────────────────────────────────────

SPREADSHEET_ID = _require("DHERO_SPREADSHEET_ID")
SHEET_GID = int(_require("DHERO_SHEET_GID"))
MONITOR_SHEET_NAME = "배송 접수 모니터"
MONITOR_ORPHAN_LOOKBACK_HOURS = 24

PRODUCT_BASE_NAME = "대형 봉투"

BATCH_SIZE = 20
FLUSH_EVERY = BATCH_SIZE
THROTTLE_S = 0.1
TIMEGUARD_S = 600  # 10분

PHONE_DUPLICATE_DAYS = 7

WATCHDOG_SPECS = {
    "morning": {
        "label": "오전",
        "delivery_hour": 9,
        "delivery_minute": 0,
        "watchdog_hour": 10,
        "watchdog_minute": 5,
        "window_start": 9 * 60,
        "window_end": 9 * 60 + 59,
    },
    "afternoon": {
        "label": "오후",
        "delivery_hour": 15,
        "delivery_minute": 0,
        "watchdog_hour": 16,
        "watchdog_minute": 5,
        "window_start": 15 * 60,
        "window_end": 15 * 60 + 59,
    },
}

# J열 제외 사유
EXCLUSION_REASONS = frozenset(
    [
        "중복 접수 제외",
        "응답 ID 중복",  # 신규 기재 안 하지만, 기존 시트에 남아있는 행 보호용
        "전화번호 중복 (7일 이내)",
        "전화번호 형식 이상",
        "주소 누락",
        "배송불가 지역",
    ]
)

MONITOR_HEADERS = [
    "실행시각",
    "실행방식",
    "상태",
    "접수후보",
    "중복제외",
    "접수완료",
    "배송불가판정",
    "실패",
    "남은미처리",
    "접수누락위험",
    "가장오래된미처리",
    "처리시간초",
    "실패상세",
]


# ── 런타임 설정 ──────────────────────────────────

@dataclass(frozen=True)
class Config:
    dhero_api_url: str
    dhero_token: str
    spot_code: str
    slack_bot_token: str
    slack_dm_user_ids: list[str]
    slack_channel_id: str
    unsupported_mention_user_id: str


def load_config() -> Config:
    dm_ids = [x.strip() for x in _optional("SLACK_DM_USER_IDS").split(",") if x.strip()]
    config = Config(
        dhero_api_url=os.environ.get("DHERO_API_URL") or _require("DHERO_BASE_URL"),
        dhero_token=_require("DHERO_TOKEN"),
        spot_code=_require("DHERO_SPOT_CODE"),
        slack_bot_token=_optional("SLACK_BOT_TOKEN"),
        slack_dm_user_ids=dm_ids,
        slack_channel_id=_optional("SLACK_CHANNEL_ID"),
        unsupported_mention_user_id=_optional("SLACK_UNSUPPORTED_MENTION_USER_ID"),
    )
    if not config.slack_bot_token:
        _logger.warning("SLACK_BOT_TOKEN 미설정 — 실행 결과 알림이 발송되지 않습니다")
    return config
