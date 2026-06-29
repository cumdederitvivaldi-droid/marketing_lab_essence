"""
백오피스 토큰 자동 관리 모듈

★ security.py와 완전 분리된 인증 전용 모듈
★ 데이터 엔드포인트 GET-only 정책과 무관 (인증은 POST 필수)

동작:
  - BACKOFFICE_EMAIL + BACKOFFICE_PASSWORD 환경변수가 있으면 자동 로그인
  - 없으면 BACKOFFICE_ACCESS_TOKEN 환경변수 사용 (기존 수동 방식)
  - 토큰 50분 경과 시 자동 재로그인 (만료 1시간 전 여유)
  - 401 감지 시 즉시 재로그인 후 재시도

보안:
  - refreshToken은 절대 저장/사용 안 함 (CLAUDE.md 정책)
  - accessToken만 메모리에 보관 (파일/DB 저장 안 함)
  - 로그인 실패 시 비밀번호 로깅 안 함

제약:
  - 단일 스레드 전용 (전역 변수로 토큰 캐싱, 멀티스레드 시 Lock 필요)
"""
from __future__ import annotations

import logging
import time

import requests

import config

logger = logging.getLogger("backoffice_auth")

# 토큰 메모리 캐시
_current_token: str | None = None
_token_created_at: float = 0

# 토큰 유효 시간 (초) - 만료 10분 전에 갱신
TOKEN_MAX_AGE_SECONDS = 50 * 60  # 50분


def _login(email: str, password: str) -> str | None:
    """
    백오피스 로그인 → accessToken 반환

    ★ refreshToken은 응답에 포함되지만 절대 저장/사용 안 함
    ★ 이 POST는 인증 전용 (데이터 수정 아님)
    """
    try:
        resp = requests.post(
            f"{config.BACKOFFICE_API_BASE}/auth/login",
            json={"email": email, "password": password},
            headers={"Content-Type": "application/json"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()

        # accessToken만 추출 (refreshToken 무시)
        access_token = data.get("data", {}).get("accessToken") or data.get("accessToken")

        if access_token:
            logger.info("백오피스 로그인 성공 (accessToken 발급)")
            return access_token

        logger.error("로그인 응답에 accessToken 없음")
        return None

    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else "unknown"
        logger.error(f"백오피스 로그인 실패 (HTTP {status})")
        return None
    except Exception as e:
        logger.error(f"백오피스 로그인 에러: {e}")
        return None


def get_valid_token() -> str | None:
    """
    유효한 accessToken 반환

    우선순위:
      1. 메모리 캐시 토큰 (50분 이내)
      2. 자동 로그인 (credentials 있을 때)
      3. 환경변수 토큰 (수동 설정)
    """
    global _current_token, _token_created_at

    # 캐시 토큰이 아직 유효하면 그대로 사용
    if _current_token and (time.time() - _token_created_at) < TOKEN_MAX_AGE_SECONDS:
        return _current_token

    # 자동 로그인 시도
    token = _try_auto_login()
    if token:
        return token

    # 환경변수 폴백 (수동 설정)
    if config.BACKOFFICE_ACCESS_TOKEN:
        logger.info("환경변수 토큰 사용 (자동 갱신 불가)")
        return config.BACKOFFICE_ACCESS_TOKEN

    logger.warning("사용 가능한 백오피스 토큰 없음")
    return None


def _try_auto_login() -> str | None:
    """credentials가 있으면 로그인 시도"""
    global _current_token, _token_created_at

    email = config.BACKOFFICE_EMAIL
    password = config.BACKOFFICE_PASSWORD

    if not email or not password:
        return None

    token = _login(email, password)
    if token:
        _current_token = token
        _token_created_at = time.time()
        return token

    return None


def refresh_on_401() -> str | None:
    """
    401 발생 시 호출 — 토큰 재발급 시도

    Returns:
        새 토큰 또는 None (재로그인 실패)
    """
    global _current_token, _token_created_at

    logger.info("401 감지 → 토큰 재발급 시도")

    # 캐시 초기화
    _current_token = None
    _token_created_at = 0

    return _try_auto_login()


def is_auto_login_available() -> bool:
    """자동 로그인 가능 여부 (credentials 설정됨)"""
    return bool(config.BACKOFFICE_EMAIL and config.BACKOFFICE_PASSWORD)
