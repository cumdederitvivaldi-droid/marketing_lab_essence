"""FlareLane 공식 Open API — 카카오 브랜드메시지(친구톡 FT) 발송.

FlareLane 팀 공식 답변 (2026-05-19, 2026-05-22) + API 탐색 결과:
- 알림톡 API는 개인화 변수 미지원, 미등록 번호 발송도 제약 → 사용 불가
- 친구톡 FT(텍스트형)은 전화번호 기준 발송 가능 + 텍스트·버튼 지원 → 채택
  (FI=이미지형은 이미지 필수 — 콘솔 설정이 텍스트형일 경우 "필수값 누락" 오류 발생)
- 콘솔 UI에서 "카카오 친구톡이 브랜드메시지로 개편" 안내됨 (실질적으로 동일 endpoint)

엔드포인트: POST /v1/projects/{projectId}/friendtalk
인증: Authorization: Bearer <FLARELANE_API_KEY>
API Limit: 100 req / 1 sec
"""

from __future__ import annotations

import logging
import re
import time

import requests

from config import (
    FLARELANE_PROJECT_ID,
    FLARELANE_API_KEY,
    API_BASE,
    SENDER_ID,
    MESSAGE_TEXT,
    BUTTON_NAME,
    BUTTON_URL,
    SEND_DELAY_SEC,
    TARGETING,
)

logger = logging.getLogger(__name__)

_KR_E164_PATTERN = re.compile(r"^82\d{9,10}$")


def normalize_phone(phone: str) -> str:
    """한국 전화번호를 E.164 형식으로 변환한다.

    010-1234-5678  → +821012345678
    01012345678    → +821012345678

    유효하지 않은 번호(빈 문자열, 길이 부족 등)는 ValueError 발생.
    """
    if not phone or not phone.strip():
        raise ValueError(f"빈 전화번호: '{phone}'")
    digits = re.sub(r"\D", "", phone)
    if digits.startswith("0"):
        digits = "82" + digits[1:]
    if not digits.startswith("82"):
        digits = "82" + digits
    if not _KR_E164_PATTERN.match(digits):
        raise ValueError(f"유효하지 않은 한국 전화번호: '{phone}' → '{digits}'")
    return "+" + digits


def _send_one(phone_e164: str) -> tuple[bool, dict]:
    """단일 전화번호로 친구톡 FT(텍스트형) 브랜드메시지 발송 큐잉 요청.

    Returns:
        (queued, info)
          queued: HTTP 201 + ``selected >= 1`` 이면 True (큐잉 성공)
                  HTTP != 201 이거나 selected == 0 이면 False (큐잉 실패)
          info: 결과 핵심 필드만 담은 dict — 로그/시트 마킹에 사용.
            {
              "status": int,         # HTTP status code
              "id": str,             # FlareLane campaign UUID (data.id) — 없으면 ""
              "selected": int,       # 큐잉된 대상 수 (1: 정상, 0: 큐잉 실패)
              "sent": int,           # 실제 전송 (응답 시점은 항상 0, 비동기)
              "failed": int,         # 응답 시점 즉시 실패 (보통 0, 비동기)
              "unsubscribed": int,
              "error": str | None,   # 오류 사유 (network/parse/4xx/5xx 등)
            }

    중요: FlareLane 친구톡 API는 비동기 — HTTP 201 = 큐잉됨이고 카카오 도달
    보장이 아니다. 응답 body 의 ``sent``/``failed`` 도 응답 시점엔 항상 0.
    실제 도달 여부는 FlareLane 콘솔 통계로 확인해야 한다 (campaign UUID 기준
    조회 API 는 2026-05-20 기준 공식 제공 안 됨).
    """
    url = f"{API_BASE}/projects/{FLARELANE_PROJECT_ID}/friendtalk"
    payload = {
        "targetType": "phoneNumber",
        "targetIds": [phone_e164],
        "targeting": TARGETING,
        "senderId": SENDER_ID,
        "messageType": "FT",
        "text": MESSAGE_TEXT,
        "buttons": [
            {
                "name": BUTTON_NAME,
                "type": "WL",
                "urlMobile": BUTTON_URL,
                "urlPc": BUTTON_URL,
            }
        ],
        "isAdvertisement": True,
        "isAdultContent": False,
        "shouldSendPushAlarm": True,
    }
    headers = {
        "Authorization": f"Bearer {FLARELANE_API_KEY}",
        "Content-Type": "application/json",
    }

    info: dict = {
        "status": 0,
        "id": "",
        "selected": 0,
        "sent": 0,
        "failed": 0,
        "unsubscribed": 0,
        "error": None,
    }

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=15)
    except requests.RequestException as exc:
        info["error"] = f"network: {exc}"
        return False, info

    info["status"] = resp.status_code

    # 큐잉 성공은 정확히 HTTP 201 만 인정. 200/202 같은 다른 2xx 는 FlareLane
    # 친구톡 API 의 큐잉 OK 계약이 아니므로 실패로 분류해 재시도 대상에 올린다.
    if resp.status_code != 201:
        # 4xx/5xx (또는 비-201 2xx) 응답 본문에도 우리가 보낸 phone(targetIds)이
        # echo 될 수 있어 raw body 를 그대로 저장하지 않는다. status code 만 기본
        # 으로 남기고, JSON 응답이면 'error'/'message' 필드만 가려 뽑아 단서로 사용.
        info["error"] = f"http_{resp.status_code}"
        try:
            err_payload = resp.json()
            if isinstance(err_payload, dict):
                msg = err_payload.get("error") or err_payload.get("message") or ""
                if isinstance(msg, str) and msg:
                    # FlareLane 이 오류 응답에 targetIds(전화번호) 를 echo 할 수 있으므로
                    # 저장 전 전화번호 패턴을 마스킹한다 (defense-in-depth).
                    safe_msg = re.sub(r"(\+?82\d{9,10}|01\d{8,9})", "[REDACTED]", msg)
                    info["error"] = f"http_{resp.status_code}: {safe_msg[:200]}"
        except ValueError:
            # requests 의 resp.json() 은 본문이 JSON 이 아닐 때
            # requests.exceptions.JSONDecodeError (ValueError 서브클래스) 를 발생.
            # json.JSONDecodeError 만 잡으면 일부 환경에서 누락되므로 ValueError 로
            # 통일.
            pass
        return False, info

    # status 201 응답 파싱 — 핵심 필드만 추출. raw body 는 PII(targetIds 의 전화번호)
    # 가 평문 포함되므로 절대 그대로 로그/저장 안 한다.
    # 응답 형태 가드: top-level / data 가 dict 가 아니면 AttributeError 가 나지 않게
    # 명시적으로 차단 (FlareLane 측에서 운영 중 응답 형태가 변종으로 들어올 가능성 대비).
    try:
        body = resp.json()
    except ValueError as exc:
        info["error"] = f"parse: {exc}"
        return False, info
    if not isinstance(body, dict):
        info["error"] = "parse: invalid_top_level_json_shape"
        return False, info
    data = body.get("data", {}) or {}
    if not isinstance(data, dict):
        info["error"] = "parse: invalid_data_json_shape"
        return False, info

    info["id"] = str(data.get("id", "") or "")
    info["selected"] = int(data.get("selected", 0) or 0)
    info["sent"] = int(data.get("sent", 0) or 0)
    info["failed"] = int(data.get("failed", 0) or 0)
    info["unsubscribed"] = int(data.get("unsubscribed", 0) or 0)

    # 큐잉 성공 판정: HTTP 201 + selected >= 1
    # selected == 0 은 FlareLane 이 즉시 큐잉 거부한 케이스 (예: 채널친구 제한 정책,
    # 잘못된 발송 설정 등). 이때는 큐잉 실패로 보고 재시도 대상에 올린다.
    if info["selected"] < 1:
        info["error"] = f"queued_selected=0 (id={info['id']})"
        return False, info

    return True, info


def send_to_phones(phones: list[str]) -> tuple[list[str], list[tuple[str, str]]]:
    """전화번호 리스트로 브랜드메시지 개별 발송.

    유효하지 않은 번호는 자동 제외. API rate limit 보호로 호출 사이 SEND_DELAY_SEC 대기.
    반환: (성공한 phone 원본 리스트, [(phone, error)...])
    """
    if not phones:
        return [], []
    sent: list[str] = []
    failed: list[tuple[str, str]] = []
    for i, phone in enumerate(phones):
        try:
            phone_e164 = normalize_phone(phone)
        except ValueError as exc:
            logger.warning("전화번호 제외: %s", exc)
            failed.append((phone, f"invalid: {exc}"))
            continue

        if i > 0 and SEND_DELAY_SEC > 0:
            time.sleep(SEND_DELAY_SEC)

        ok, info = _send_one(phone_e164)
        masked = phone[:3] + "****" + phone[-4:] if len(phone) >= 7 else phone
        summary = (
            f"status={info['status']} id={info['id']} "
            f"selected={info['selected']} sent={info['sent']} failed={info['failed']}"
        )
        if ok:
            sent.append(phone)
            logger.info("큐잉 성공: phone=%s %s", masked, summary)
        else:
            err = info.get("error") or ""
            failed.append((phone, f"{summary} err={err}"))
            logger.error("큐잉 실패: phone=%s %s err=%s", masked, summary, err)

    return sent, failed
