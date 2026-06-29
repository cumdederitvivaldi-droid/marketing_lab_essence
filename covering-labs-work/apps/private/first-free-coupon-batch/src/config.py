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

EXPERIMENT_KEY = "first_free_v1"
LEDGER_TABLE = f"{GCP_PROJECT}.product.first_free_coupon_ledger_v1"
USER_TABLE = f"{GCP_PROJECT}.secure_dataset.user"

# 신규 가입자 매칭 윈도우 — cron 5분 + secure_dataset.user sync lag(~5분) + 배치 6회 실패 백필 마진.
# 30분이면 충분. 이미 처리한 user_id는 ledger LEFT JOIN으로 자동 제외되므로 윈도우 확대는 비용만 늘림.
MATCH_WINDOW_MINUTES = 30

# 실험 라이브 시작 시각 — 이 시각 이전 가입자는 매칭 제외 (실험 코호트 청정성 확보).
# 라이브 이전 paused 자동화 기간 동안 ledger에 누적된 데이터는 별도 TRUNCATE 후 라이브.
LIVE_CUTOFF_TIMESTAMP = "2026-05-22 16:00:00+09:00"

# 쿠폰 정책 (백오피스에서 환희님 발급 완료, 2026-05-20)
COUPON_POLICY_ID = 215

# FlareLane 발사 이벤트 — 콘솔 여정에서 이 이벤트명 listen → 기존 쿠폰 webhook(1faa88de…) 발사
FLARELANE_EVENT_NAME = "first_free_coupon_request"
