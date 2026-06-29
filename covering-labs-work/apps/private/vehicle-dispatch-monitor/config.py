"""
설정 파일 - 모든 외부 서비스 인증 정보 및 설정을 한 곳에서 관리
환경변수 필수, 소스코드에 시크릿 하드코딩 금지
"""
import json
import os
from pathlib import Path
from datetime import time as dtime


def _load_env_file() -> None:
    """crontab 실행 환경에서 /shared/.env를 자동 로드한다.
    이미 설정된 환경변수는 덮어쓰지 않는다(setdefault).
    """
    candidates = [
        Path(os.environ.get("ENV_FILE", "/shared/.env")),
        Path(__file__).resolve().with_name(".env"),
    ]
    for env_path in candidates:
        if not env_path.exists():
            continue
        try:
            raw_lines = env_path.read_text(encoding="utf-8").splitlines()
        except PermissionError:
            continue
        for raw_line in raw_lines:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
        return


_load_env_file()

# ============================================================
# 채널톡 Open API
# 용도: 상담 태그 감지 + 메시지 자동 발송
# 발급: 채널톡 관리자 > Settings > API Key management
# ============================================================
CHANNELTALK_ACCESS_KEY = os.environ.get("CHANNELTALK_ACCESS_KEY", "")
CHANNELTALK_ACCESS_SECRET = os.environ.get("CHANNELTALK_ACCESS_SECRET", "")
CHANNELTALK_API_BASE = "https://api.channel.io/open/v5"

# 감지할 태그명 (CX파트에서 설정하는 태그)
CHANNELTALK_TARGET_TAGS = ["차량등록", "차량등록2"]

# ============================================================
# 백오피스 API
# 용도: 주문 상세 조회 (배차 정보 = 차량번호)
# 보안: GET 요청만 허용, 엔드포인트 화이트리스트 적용
# ============================================================
BACKOFFICE_API_BASE = "https://admin-api.covering.app"
BACKOFFICE_ACCESS_TOKEN = os.environ.get("BACKOFFICE_ACCESS_TOKEN", "")

# 자동 로그인 (둘 다 설정되면 자동 토큰 갱신 활성화)
# 수동 토큰(BACKOFFICE_ACCESS_TOKEN)보다 자동 로그인 우선
BACKOFFICE_EMAIL = os.environ.get("BACKOFFICE_EMAIL", "")
BACKOFFICE_PASSWORD = os.environ.get("BACKOFFICE_PASSWORD", "")

# 주문 조회 API 버전 (v3 우선, v2 자동 폴백)
# 마이그레이션 후 v2가 삭제되면 v3만 시도. v2 고정이 필요하면 환경변수로 "v2" 지정
BACKOFFICE_ORDER_API_VERSION = os.environ.get("BACKOFFICE_ORDER_API_VERSION", "v3")

# ============================================================
# Google Sheets (감시 목록)
# 용도: 채널톡 태그 감지된 주문 적재 + 배차 상태 추적
# ============================================================
GOOGLE_SHEETS_KEY_FILE = os.environ.get(
    "GOOGLE_SHEETS_KEY_FILE",
    "",
)
GOOGLE_SERVICE_ACCOUNT_JSON = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "")
GOOGLE_APPLICATION_CREDENTIALS = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
GOOGLE_SHEETS_SPREADSHEET_ID = os.environ.get("GOOGLE_SHEETS_SPREADSHEET_ID", "")
GOOGLE_SHEETS_WORKSHEET_NAME = os.environ.get("GOOGLE_SHEETS_WORKSHEET_NAME", "시트1")

# ============================================================
# 슬랙 알림 (#제품팀_cs_notifications)
# 용도: 자동 발송 완료 로그 (커바니_방문수거 봇 토큰 사용)
# ============================================================
SLACK_BOT_TOKEN = os.environ.get("SLACK_BOT_TOKEN", "")
SLACK_CHANNEL = os.environ.get("SLACK_CHANNEL", "#제품팀_cs_notifications")

# CX파트 개인 멘션 (박소리, 신인섭, 문환희, 김진유)
SLACK_CX_MENTION = "<@U0A1QCMKD7C> <@U09NM9HCKMZ> <@U062W6ZGF63> <@U09CYHJTV3Q>"

# ============================================================
# 머신 보안 — 허용된 GCP VM 호스트명
# 설정 시 다른 머신에서 실행되면 자동 종료 (중복 실행 방지)
# ============================================================
ALLOWED_HOST = os.environ.get("ALLOWED_HOST", "")

# ============================================================
# 운영 설정
# ============================================================
POLLING_INTERVAL_MINUTES = 10
OPERATION_START = dtime(21, 0)   # 21:00 시작
OPERATION_END = dtime(23, 0)     # 23:00 종료

# ============================================================
# 완료된 주문 상태 코드 (phone fallback에서 제외)
# 이미 수거 완료된 주문이 활성 주문으로 오인되는 것을 방지
# 실제 status 값은 첫 배포 후 backoffice_api.log에서 확인하여 보정
# ============================================================
COMPLETED_ORDER_STATUSES = frozenset({
    "COMPLETED", "DONE", "DELIVERED", "PICKED_UP",
    "FINISHED", "CLOSED", "PICK_UP_COMPLETED",
})

CANCELED_ORDER_STATUSES = frozenset({
    "USER_CANCELED", "ADMIN_CANCELED", "CANCELED",
})

TERMINAL_FULFILLMENT_STATUSES = frozenset({
    "COMPLETED", "FAILED", "CANCELED",
})

# ============================================================
# 채널톡 발송 메시지 템플릿
# 동적 부분: {vehicle_number} 1개만
# AI 흔적 없음, CS 매크로와 동일한 톤
# ============================================================
MESSAGE_TEMPLATE = """안녕하세요, 커버링입니다 :)
수거 차량이 배정되었습니다.

차량번호: [{vehicle_number}]

아파트 차량 등록 후, 봉투를 문 앞에 놓아주시면 새벽에 수거해드리겠습니다.
감사합니다!"""

MESSAGE_TEMPLATE_WITH_VISITOR = """안녕하세요, 커버링입니다 :)
수거 차량이 배정되었습니다.

차량번호: [{vehicle_number}]
방문자명: {rider_name}
연락처: {rider_phone}

아파트 차량 등록 후, 봉투를 문 앞에 놓아주시면 새벽에 수거해드리겠습니다.
감사합니다!"""

# ============================================================
# 태그별 설정 (CX 확정 후 차량등록2 템플릿 변경)
# ============================================================
TAG_CONFIG = {
    "차량등록": {
        "message_template": MESSAGE_TEMPLATE,
        "message_template_with_visitor": MESSAGE_TEMPLATE_WITH_VISITOR,
    },
    "차량등록2": {
        "message_template": MESSAGE_TEMPLATE,
        "message_template_with_visitor": MESSAGE_TEMPLATE_WITH_VISITOR,
    },
}

# ============================================================
# 로깅
# ============================================================
LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")


def resolve_path(raw_path: str) -> Path:
    """$HOME, ~ 같은 경로 표현을 실제 파일 경로로 풀어준다."""
    expanded = os.path.expanduser(os.path.expandvars(raw_path.strip()))
    return Path(expanded)


def get_google_service_account_credentials(scopes: list[str]):
    """서비스 계정 인증 우선순위: JSON 값 → 키 파일 경로.

    둘 다 없으면 None 반환. 호출부에서 google.auth.default()로 폴백한다.
    """
    raw_json = GOOGLE_SERVICE_ACCOUNT_JSON.strip()
    if raw_json:
        try:
            from google.oauth2 import service_account
            info = json.loads(raw_json)
            return service_account.Credentials.from_service_account_info(info, scopes=scopes)
        except Exception as exc:
            import logging
            logging.getLogger("config").warning(f"GOOGLE_SERVICE_ACCOUNT_JSON 로드 실패: {exc}")

    candidate_paths = [
        GOOGLE_SHEETS_KEY_FILE.strip(),
        GOOGLE_APPLICATION_CREDENTIALS.strip(),
    ]
    for raw_path in candidate_paths:
        if not raw_path:
            continue
        path = resolve_path(raw_path)
        if path.exists():
            try:
                from google.oauth2 import service_account
                return service_account.Credentials.from_service_account_file(str(path), scopes=scopes)
            except Exception as exc:
                import logging
                logging.getLogger("config").warning(f"서비스 계정 파일 로드 실패: {path} ({exc})")

    return None


def init():
    """설정 초기화 - 디렉토리 생성 + 필수 환경변수 검증"""
    import logging
    _logger = logging.getLogger("config")

    os.makedirs(LOG_DIR, exist_ok=True)

    required = {
        "CHANNELTALK_ACCESS_KEY": CHANNELTALK_ACCESS_KEY,
        "CHANNELTALK_ACCESS_SECRET": CHANNELTALK_ACCESS_SECRET,
    }
    missing = [k for k, v in required.items() if not v]
    if missing:
        raise RuntimeError(f"필수 환경변수 누락: {', '.join(missing)}")

    # 백오피스 credentials 부분 설정 경고
    if bool(BACKOFFICE_EMAIL) != bool(BACKOFFICE_PASSWORD):
        _logger.warning("BACKOFFICE_EMAIL과 BACKOFFICE_PASSWORD 중 하나만 설정됨 (둘 다 필요)")
