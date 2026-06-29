"""FlareLane track API — 커넥션 풀 재사용 (친구초대 V1 동일 패턴)."""

import hashlib
import logging
import requests
from config import FLARELANE_PROJECT_ID, FLARELANE_API_KEY

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


def send_event(user_id: int, event_name: str, data: dict) -> bool:
    """FlareLane 이벤트 발송. 성공 시 True, 실패 시 False."""
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

    try:
        resp = _get_session().post(FLARELANE_API_URL, json=payload, timeout=10)
        if resp.ok:
            return True
        _logger.error(f"FlareLane 발송 실패: user_id={_mask(user_id)} {resp.status_code} {resp.text}")
        return False
    except requests.RequestException as e:
        _logger.error(f"FlareLane 발송 에러: user_id={_mask(user_id)} {e}")
        return False
