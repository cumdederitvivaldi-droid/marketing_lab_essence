"""
보안 안전장치 모듈 - 백오피스 API 접근 제어

★ 핵심 원칙:
  - 백오피스 Access Token으로 조회/수정/삭제/생성이 모두 가능
  - 이 스크립트는 GET 요청만 허용, 다른 HTTP 메서드는 100% 차단
  - 허용된 엔드포인트 외 접근 100% 차단
  - 모든 API 호출을 로그 파일에 기록 (사후 감사)

사용법:
  from security import safe_backoffice_get
  data = safe_backoffice_get("/v2/order/12345", token)
"""
import re
import logging
from datetime import datetime, timedelta, timezone
import requests

import config

logger = logging.getLogger("security")

KST = timezone(timedelta(hours=9))


class SecurityError(Exception):
    """보안 정책 위반 시 발생하는 예외"""
    pass


# ============================================================
# 엔드포인트 화이트리스트
# 이 패턴에 매칭되는 경로만 접근 허용
# 새 엔드포인트가 필요하면 여기에 추가
# ============================================================
ALLOWED_ENDPOINT_PATTERNS = [
    # 주문 상세 조회 (배차 정보 확인 용도)
    r"^/v2/order/\d+$",
    r"^/v3/order/\d+$",
]



def _is_allowed_endpoint(path: str) -> bool:
    """엔드포인트가 화이트리스트에 있는지 확인"""
    clean_path = path.split("?")[0]  # 쿼리스트링 제거
    return any(re.match(pattern, clean_path) for pattern in ALLOWED_ENDPOINT_PATTERNS)


def _log_api_call(method: str, url: str, status_code: int = None, blocked: bool = False):
    """모든 API 호출을 로그에 기록 (사후 감사용)"""
    timestamp = datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S")
    status = "BLOCKED" if blocked else f"OK({status_code})"
    log_line = f"[{timestamp}] {method} {url} → {status}"

    logger.info(log_line)


def safe_backoffice_get(path: str, token: str, params: dict = None) -> dict:
    """
    백오피스 API에 안전하게 GET 요청을 보내는 유일한 함수

    ★ 이 함수만 사용할 것. requests 직접 호출 금지.
    ★ GET만 허용. POST/PUT/PATCH/DELETE 메서드 일절 없음.

    Args:
        path: API 경로 (예: "/v2/order/12345")
        token: Access Token
        params: 쿼리 파라미터 (선택)

    Returns:
        API 응답 JSON

    Raises:
        SecurityError: 허용되지 않은 엔드포인트 접근 시
    """
    # 1. 엔드포인트 화이트리스트 검증
    if not _is_allowed_endpoint(path):
        _log_api_call("GET", f"{config.BACKOFFICE_API_BASE}{path}", blocked=True)
        raise SecurityError(
            f"차단: {path} 접근 금지. "
            f"허용된 엔드포인트: {ALLOWED_ENDPOINT_PATTERNS}"
        )

    # 2. GET 요청 실행
    url = f"{config.BACKOFFICE_API_BASE}{path}"
    headers = {"Authorization": f"Bearer {token}"}

    resp = requests.get(url, headers=headers, params=params, timeout=10)

    # 3. 호출 로깅
    _log_api_call("GET", url, status_code=resp.status_code)

    resp.raise_for_status()
    return resp.json()
