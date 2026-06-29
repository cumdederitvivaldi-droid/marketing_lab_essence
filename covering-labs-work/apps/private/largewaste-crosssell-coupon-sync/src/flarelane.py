"""FlareLane track API — 커넥션 풀 재사용 + 429/5xx exponential backoff retry."""

import hashlib
import logging
import time
import requests
from config import FLARELANE_PROJECT_ID, FLARELANE_API_KEY, FLARELANE_MAX_RETRIES

_logger = logging.getLogger(__name__)

FLARELANE_API_URL = f"https://api.flarelane.com/v1/projects/{FLARELANE_PROJECT_ID}/track"

_session: requests.Session | None = None


def _mask(user_id) -> str:
    """로그용 마스킹 — MD5 앞 8자리."""
    return hashlib.md5(str(user_id).encode()).hexdigest()[:8]  # noqa: S324 - non-cryptographic logging mask


def _get_session() -> requests.Session:
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers.update({
            "Authorization": f"Bearer {FLARELANE_API_KEY}",
            "Content-Type": "application/json",
        })
    return _session


def _is_retryable_status(status: int) -> bool:
    return status == 429 or 500 <= status < 600


def send_event(user_id: int, event_name: str, data: dict) -> bool:
    """FlareLane 이벤트 발송. 성공 True, 실패 False.

    429 / 5xx 응답 또는 네트워크 예외는 exponential backoff (1s, 2s ...) 로 최대
    FLARELANE_MAX_RETRIES 회 재시도. 4xx (429 제외) 및 JSON 파싱 실패는 재시도하지 않음.

    Idempotency 한계: FlareLane track API는 Idempotency-Key 공식 지원 X. 첫 요청이
    실제 처리됐는데 응답만 5xx/타임아웃인 경우 retry 로 중복 이벤트 위험 존재.
    완화 장치:
      - success_count > 0 응답 본문 검증으로 false success 차단
      - ledger pending 선점 + TTL 로 cron 간 중복 처리 방지
      - 라이브 후 중복 발사율 모니터링하고, 발생 시 FlareLane 측 idempotency 지원 요청.
    """
    if not FLARELANE_PROJECT_ID or not FLARELANE_API_KEY:
        _logger.error("FlareLane 설정 누락 (PROJECT_ID 또는 API_KEY)")
        return False

    payload = {
        "events": [
            {
                "subjectType": "user",
                "subjectId": str(user_id),
                "type": event_name,
                "data": data,
            }
        ]
    }

    masked = _mask(user_id)
    last_error_desc = "unknown"

    for attempt in range(FLARELANE_MAX_RETRIES + 1):  # 첫 시도 + 재시도 N회
        try:
            resp = _get_session().post(FLARELANE_API_URL, json=payload, timeout=10)
        except requests.RequestException as e:
            last_error_desc = f"network={e}"
            if attempt < FLARELANE_MAX_RETRIES:
                wait = 2 ** attempt
                _logger.warning(
                    f"FlareLane retry: user_id={masked} event={event_name} {last_error_desc} "
                    f"attempt={attempt + 1}/{FLARELANE_MAX_RETRIES + 1} wait={wait}s"
                )
                time.sleep(wait)
                continue
            _logger.error(f"FlareLane 발사 에러(retry 한도 초과): user_id={masked} event={event_name} {last_error_desc}")
            return False

        if _is_retryable_status(resp.status_code):
            last_error_desc = f"http={resp.status_code}"
            if attempt < FLARELANE_MAX_RETRIES:
                wait = 2 ** attempt
                _logger.warning(
                    f"FlareLane retry: user_id={masked} event={event_name} {last_error_desc} "
                    f"attempt={attempt + 1}/{FLARELANE_MAX_RETRIES + 1} wait={wait}s"
                )
                time.sleep(wait)
                continue
            _logger.error(
                f"FlareLane 발사 실패(retry 한도 초과): user_id={masked} event={event_name} "
                f"{resp.status_code} {resp.text[:200]}"
            )
            return False

        if resp.ok:
            try:
                body = resp.json()
            except ValueError:
                _logger.error(
                    f"FlareLane 응답 JSON 파싱 실패: user_id={masked} event={event_name} body={resp.text[:300]}"
                )
                return False
            success_count = body.get("events", {}).get("success", 0)
            if success_count > 0:
                return True
            _logger.error(
                f"FlareLane 발사 실패(success=0): user_id={masked} event={event_name} body={body}"
            )
            return False

        # retry 불가 4xx
        _logger.error(
            f"FlareLane 발사 실패: user_id={masked} event={event_name} {resp.status_code} {resp.text[:200]}"
        )
        return False

    return False
