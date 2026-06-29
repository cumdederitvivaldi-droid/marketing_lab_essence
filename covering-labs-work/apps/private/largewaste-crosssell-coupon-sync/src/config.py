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
FLARELANE_PROJECT_ID = os.environ.get("FLARELANE_PROJECT_ID", "")
FLARELANE_API_KEY = os.environ.get("FLARELANE_API_KEY", "")

# 실험 식별 — 향후 v2 분리 시 컬럼 값으로 코호트 격리 가능
EXPERIMENT_KEY = "largewaste_crosssell_v1"

# 테이블
LEDGER_TABLE = f"{GCP_PROJECT}.product.largewaste_crosssell_coupon_ledger_v1"
ORDER_V2_TABLE = f"{GCP_PROJECT}.secure_dataset.order_v2"
ORDER_LINE_TABLE = f"{GCP_PROJECT}.secure_dataset.order_line"
PRODUCT_TABLE = f"{GCP_PROJECT}.secure_dataset.product"
USER_COUPON_TABLE = f"{GCP_PROJECT}.secure_dataset.user_coupon"
DEVICE_TABLE = f"{GCP_PROJECT}.secure_dataset.device"

# 대형폐기물 신청 product code — 신청 완료 시 disqualified 트리거
LARGEWASTE_PRODUCT_CODE = "PICKUP_LARGE_COVERING_BAG"

# 매칭 윈도우 — cron 5분 + secure_dataset sync lag(~5분) + 배치 6회 실패 백필 마진.
# 이미 처리된 user는 ledger LEFT JOIN으로 자동 제외되므로 윈도우 확대는 비용만 늘림.
MATCH_WINDOW_MINUTES = 30

# 쿠폰 정책 — 백오피스 (정액 3만원 / 7일 / 1회)
COUPON_POLICY_ID = 216

# FlareLane 발사 이벤트
ELIGIBLE_EVENT_NAME = "largewaste_eligible_signal"
DISQUALIFIED_EVENT_NAME = "largewaste_disqualified_signal"

# pending 자동 복구 TTL — pending 상태가 이 시간 이상 지속되면 다른 cron이 재처리 허용
# (선점 후 영구 누락된 경우 자가 복구. 정상 cron 최대 실행시간 + 마진)
PENDING_RETRY_AFTER_MINUTES = 15

# FlareLane API retry — 429/5xx 응답 시 exponential backoff (1s, 2s)
FLARELANE_MAX_RETRIES = 2
