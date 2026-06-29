"""FlareLane 알림톡 발송."""

from __future__ import annotations

import logging
import re

import requests

from config import (
    FLARELANE_PROJECT_ID,
    FLARELANE_API_KEY,
    TEMPLATE_CODE,
    COUPON_CODE,
    COUPON_NAME,
)

logger = logging.getLogger(__name__)

_API_BASE = "https://api.flarelane.com/v1/projects"


def _normalize_phone(phone: str) -> str:
    """한국 전화번호를 E.164 형식으로 변환한다.

    010-1234-5678  → +821012345678
    01012345678    → +821012345678
    """
    digits = re.sub(r"\D", "", phone)
    if digits.startswith("0"):
        digits = "82" + digits[1:]
    if not digits.startswith("82"):
        digits = "82" + digits
    return "+" + digits


def send_alimtalk(phone: str, nickname: str) -> bool:
    """FlareLane 알림톡 발송. 성공 시 True, 실패 시 False 반환.

    API 스펙: POST /v1/projects/{projectId}/alimtalk
    ref: https://flarelane-api-docs.readme.io/reference/send-kakao-alimtalk
    """
    if not FLARELANE_PROJECT_ID or not FLARELANE_API_KEY:
        raise RuntimeError(
            "FLARELANE_PROJECT_ID 또는 FLARELANE_API_KEY가 설정되지 않았습니다"
        )

    phone_e164 = _normalize_phone(phone)
    url = f"{_API_BASE}/{FLARELANE_PROJECT_ID}/alimtalk"

    payload = {
        "targetType": "phoneNumber",
        "targetIds": [phone_e164],
        "templateId": TEMPLATE_CODE,
        "variables": {
            "nickname": nickname or "",
            "coupon_code": COUPON_CODE,
            "coupon_name": COUPON_NAME,
        },
    }

    try:
        resp = requests.post(
            url,
            json=payload,
            headers={
                "Authorization": f"Bearer {FLARELANE_API_KEY}",
                "Content-Type": "application/json",
            },
            timeout=15,
        )
    except requests.RequestException as exc:
        logger.error("FlareLane 네트워크 오류: phone=%s error=%s", phone_e164, exc)
        return False

    if not resp.ok:
        logger.error(
            "FlareLane 알림톡 실패: phone=%s status=%d body=%.200s",
            phone_e164,
            resp.status_code,
            resp.text,
        )
        return False

    logger.info(
        "FlareLane 알림톡 발송 성공: phone=%s response=%.100s",
        phone_e164,
        resp.text,
    )
    return True
