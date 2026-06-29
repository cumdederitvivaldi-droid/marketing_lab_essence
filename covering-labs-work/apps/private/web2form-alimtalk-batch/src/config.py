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
SENT_COL: str = os.environ.get("WEB2FORM_SENT_COL", "G")
# FlareLane 캠페인 ID 저장 열 — 큐잉됨 마킹 시 함께 기록
# 콘솔에서 수동 확인하거나 향후 delivery polling 구현 시 lookup key로 사용
MESSAGE_ID_COL: str = os.environ.get("WEB2FORM_MESSAGE_ID_COL", "J")

# FlareLane 공식 Open API — 카카오 브랜드메시지 (친구톡 FT 타입)
# FlareLane 팀 공식 답변 (2026-05-19, 2026-05-22) + 자체 API 탐색 결과:
# - 알림톡: 개인화 변수 미지원 → 사용 불가
# - 친구톡 FT(텍스트형): 미등록 번호 + 정적 텍스트 + 버튼 지원 → 채택
#   FI(이미지형)은 이미지 필수 — 콘솔 템플릿이 텍스트형일 때 FI 요청은 "필수값 누락" 오류
# - 엔드포인트: POST /v1/projects/{id}/friendtalk
# https://flarelane-api-docs.readme.io/reference/send-kakao-friendtalk
FLARELANE_PROJECT_ID: str = os.environ.get("FLARELANE_PROJECT_ID", "").strip()
FLARELANE_API_KEY: str = os.environ.get("FLARELANE_API_KEY", "").strip()
API_BASE: str = os.environ.get("FLARELANE_API_BASE", "https://api.flarelane.com/v1")

# 메시지 구성 — 커버링 카카오톡 채널
SENDER_ID: str = os.environ.get(
    "WEB2FORM_SENDER_ID", "96aa6a29-449c-464c-a7de-a80cbfdda1af"
)

MESSAGE_TEXT: str = os.environ.get(
    "WEB2FORM_MESSAGE_TEXT",
    (
        "고객님께서 신청하신 50% 쿠폰이 도착했어요!\n\n"
        "안녕하세요, 커버링입니다.\n"
        "고객님이 신청하신 긴급 주민 지원금\n"
        "50% 할인 쿠폰 코드가 도착했어요!\n\n"
        "📢 쿠폰 정보 안내\n"
        "■ 쿠폰 코드: EMERGENCY50\n"
        "■ 쿠폰 이름: [긴급 지원금] 특별 지역 50% 할인\n"
        "■ 유효 기간: 쿠폰 등록 후 7일 간 사용\n\n"
        "📌 쿠폰 등록: 앱 > 내 정보 > 쿠폰 > 코드 입력 후 '받기'\n\n"
        "※ 만료일이 지나면 사용 여부와 관계 없이 자동 소멸됩니다.\n"
        "※ 이 메시지는 고객님이 참여한 이벤트 당첨으로 지급된 쿠폰 안내 메시지입니다."
    ),
)

BUTTON_NAME: str = os.environ.get("WEB2FORM_BUTTON_NAME", "쿠폰 등록하기")
BUTTON_URL: str = os.environ.get("WEB2FORM_BUTTON_URL", "https://abr.ge/ifizjr")

# Rate limit 보호 — 100 req/sec (FlareLane API 한도)
SEND_DELAY_SEC: float = float(os.environ.get("WEB2FORM_SEND_DELAY_SEC", "0.1"))

# 발송 결과(H열) — FlareLane 큐잉 여부 / 재시도 상태
# 주의: FlareLane 친구톡 API 는 비동기이고 메시지 ID 별 결과 조회 endpoint 가
# 공식 미제공(2026-05-20 docs 기준). 따라서 H='큐잉됨' 은 "FlareLane 큐잉 OK"
# 만 의미하고 카카오 실제 도달 보장은 아니다. 실 도달은 FlareLane 콘솔의
# "보낸 메시지 → 통계" 에서 확인해야 한다. (PR #315 의 false-positive 사후 보정)
RESULT_COL: str = os.environ.get("WEB2FORM_RESULT_COL", "H")
RESULT_SUCCESS: str = os.environ.get("WEB2FORM_RESULT_SUCCESS", "큐잉됨")
RESULT_FAILURE: str = os.environ.get("WEB2FORM_RESULT_FAILURE", "실패")
RESULT_RETRIED: str = os.environ.get("WEB2FORM_RESULT_RETRIED", "실패_재시도")

# 수신자 타겟팅 — 카카오 브랜드메시지 발송 그룹
# - "M": 선택한 유저 전체에게 발송 (친구 + 비친구) — 사전 승인 필요
# - "N": 채널친구를 제외하고 발송 (비친구만)         — 사전 승인 필요
# - "I": 채널친구에게만 발송                          — 즉시 발송 가능
#
# 폼 입력자는 대부분 카카오 채널 비친구이므로 "M" 또는 "N"으로 발송해야 도달.
# 파라미터를 누락하면 FlareLane 기본값으로 동작 (사실상 비친구 발송 차단).
# FlareLane 콘솔 → 보낸 메시지 → 실패 통계 "잘못된 값(...설정 오류)" 증상의 원인.
TARGETING: str = os.environ.get("WEB2FORM_FRIENDTALK_TARGETING", "M").strip().upper()
if TARGETING not in {"M", "N", "I"}:
    raise ValueError(
        "WEB2FORM_FRIENDTALK_TARGETING 환경변수는 M(전체)/N(비친구만)/I(친구만) 중 하나여야 합니다. "
        f"현재 값: {TARGETING!r}"
    )


# 필수 환경변수 검증 — import 시점에 fail-fast
_missing = [
    name
    for name, value in (
        ("FLARELANE_PROJECT_ID", FLARELANE_PROJECT_ID),
        ("FLARELANE_API_KEY", FLARELANE_API_KEY),
    )
    if not value
]
if _missing:
    raise ValueError(
        f"{', '.join(_missing)} 환경변수가 설정되지 않았습니다. "
        "/shared/.env 또는 앱 디렉토리 .env 파일에 추가하세요."
    )
