import os
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[1]


def _load_env_file() -> None:
    """Load covering-labs shared env for cron executions without printing secrets."""
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

# 소스 채널
SOURCE_CHANNEL = "C02MXJVQR5L"  # #10_고객피드백

# 발송 채널 (없으면 PO DM 폴백)
TARGET_CHANNEL = os.getenv("VOC_TARGET_CHANNEL", "")
PO_USER_ID = "U09PTJ5PBDK"  # 함정훈

# DB
DB_DIR = APP_ROOT / "data"
DB_PATH = DB_DIR / "voc.db"
LOG_DIR = APP_ROOT / "logs"
LOG_PATH = LOG_DIR / "batch.log"

# 분류 카테고리
CATEGORIES = [
    "가격",
    "품목",
    "수거품질",
    "결제오류",
    "지역확장",
    "앱버그",
    "문의",
    "기타",
]

# 5렌즈
LENSES = [
    "단위경제학",
    "리텐션",
    "운영레버리지",
    "시장",
    "조직역량",
]

# 클러스터링
EMBEDDING_SIMILARITY_THRESHOLD = 0.82  # 이 이상이면 기존 테마에 병합
BATCH_SIZE = 50          # classifier 배치 크기
RATE_LIMIT_SLEEP = 1.5   # Slack API rate limit 방지 (초)

# RICE 파라미터
RICE_CONFIDENCE_HIGH = 1.0    # n >= 10
RICE_CONFIDENCE_MED = 0.8     # n >= 3
RICE_CONFIDENCE_LOW = 0.5     # n < 3

# 비용 가드
MAX_CLASSIFY_PER_RUN = 500  # 이 이상이면 슬랙 경고 후 계속

# 보고 창
DAILY_LOOKBACK_HOURS = 24
WEEKLY_LOOKBACK_DAYS = 7
RICE_LOOKBACK_DAYS = 30  # Reach 계산 기준
