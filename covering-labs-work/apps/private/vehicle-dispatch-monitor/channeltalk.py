"""
채널톡 모듈 - 태그 감지 + 주문번호 추출 + 메시지 발송

기능:
  1. 열린 상담 중 "차량등록" 태그가 달린 상담 감지
  2. 상담 메시지에서 주문번호 추출
  3. 배차 완료 시 해당 상담에 차량번호 메시지 자동 발송

보안:
  - 메시지는 고정 템플릿만 사용 (동적 부분 = 차량번호 1개)
  - AI 흔적 없음, CS 매크로와 동일한 톤
"""
from __future__ import annotations

import re
import time
import logging
from enum import Enum

import requests

import config

logger = logging.getLogger("channeltalk")

# 페이지네이션 상한 (50건/페이지 × 20 = 최대 1,000건)
MAX_PAGES = 20

# 연속 API 호출 간 대기 (rate limit 방어, 초)
PAGE_DELAY = 0.3


class SendResult(Enum):
    """채널톡 메시지 발송 결과"""
    SUCCESS = "success"
    AUTH_ERROR = "auth_error"
    FAILED = "failed"


def _headers() -> dict:
    return {
        "x-access-key": config.CHANNELTALK_ACCESS_KEY,
        "x-access-secret": config.CHANNELTALK_ACCESS_SECRET,
        "Content-Type": "application/json",
    }


def _fetch_chats_by_state(state: str) -> list[dict]:
    """특정 상태의 상담 목록을 페이지네이션으로 전체 조회"""
    chats = []
    since = None

    for page in range(MAX_PAGES):
        params = {"state": state, "limit": 50, "sortOrder": "desc"}
        if since:
            params["since"] = since

        try:
            resp = requests.get(
                f"{config.CHANNELTALK_API_BASE}/user-chats",
                headers=_headers(),
                params=params,
                timeout=10,
            )
            if resp.status_code == 429:
                logger.warning("채널톡 API rate limit, 2초 대기")
                time.sleep(2)
                continue
            resp.raise_for_status()
        except requests.HTTPError as e:
            logger.error(f"채널톡 {state} 상담 조회 실패 (페이지 {page}): {e}")
            break

        data = resp.json()
        page_chats = data.get("userChats", [])
        if not page_chats:
            break

        chats.extend(page_chats)

        next_since = data.get("next")
        if not next_since or next_since == since:
            break
        since = next_since

        if page < MAX_PAGES - 1:
            time.sleep(PAGE_DELAY)

    return chats


def get_tagged_chats(tag_names=None) -> list[dict]:
    """
    열린/보류 상담 중 특정 태그가 달린 상담 목록 반환

    채널톡 API는 태그 파라미터 필터를 지원하지 않으므로,
    상담 전체를 조회한 뒤 클라이언트에서 태그 필터링.
    보류(snoozed) 상담도 포함 (CX팀이 보류 후 태그 거는 패턴).

    Args:
        tag_names: 필터링할 태그명 (str 또는 list[str], 기본: config.CHANNELTALK_TARGET_TAGS)

    Returns:
        태그가 매칭된 상담 목록 [{id, tags, userId, matched_tag, ...}, ...]
    """
    if tag_names is None:
        tag_names = config.CHANNELTALK_TARGET_TAGS
    elif isinstance(tag_names, str):
        tag_names = [tag_names]

    # opened + snoozed 상태 모두 조회 (보류 상담에도 태그 걸림)
    opened = _fetch_chats_by_state("opened")
    snoozed = _fetch_chats_by_state("snoozed")
    all_chats = opened + snoozed

    if len(opened) >= MAX_PAGES * 50 or len(snoozed) >= MAX_PAGES * 50:
        logger.warning(f"최대 페이지({MAX_PAGES}) 도달, 일부 상담 미조회 가능")

    # 태그 필터링 (리스트 순서 = 우선순위, 동일 상담에 여러 태그 시 첫 매칭 사용)
    tagged = []
    for chat in all_chats:
        chat_tags = chat.get("tags", [])
        for tag in tag_names:
            if tag in chat_tags:
                chat["matched_tag"] = tag
                tagged.append(chat)
                break

    logger.info(
        f"상담 {len(all_chats)}건 (opened {len(opened)} + snoozed {len(snoozed)}) "
        f"중 {tag_names} 태그: {len(tagged)}건"
    )
    return tagged


def get_chat_messages(user_chat_id: str, limit: int = 50) -> list[dict]:
    """
    특정 상담의 메시지 목록 조회

    Args:
        user_chat_id: 상담 ID
        limit: 조회할 메시지 수 (기본 50)

    Returns:
        메시지 목록 [{plainText, personType, ...}, ...]
    """
    if not re.match(r"^[a-zA-Z0-9\-_]+$", user_chat_id):
        logger.error(f"잘못된 chat_id 형식: {user_chat_id}")
        return []

    resp = requests.get(
        f"{config.CHANNELTALK_API_BASE}/user-chats/{user_chat_id}/messages",
        headers=_headers(),
        params={"limit": limit, "sortOrder": "desc"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json().get("messages", [])


def extract_order_code_from_messages(messages: list[dict]) -> str | None:
    """
    메시지 목록에서 주문코드를 추출

    추출 전략 (우선순위):
      1. 봇 폼 데이터 (워크플로우에서 제출된 주문번호 필드) - 신뢰도 최고
      2. "주문번호" 키워드 근처의 영숫자 (신뢰도 높음)
      3. 단독 영숫자 8자리 (신뢰도 낮음)

    채널톡 워크플로우 구조:
      봇 메시지에 form.inputs 배열 → label이 "주문번호"인 input의 value

    Args:
        messages: 채널톡 메시지 목록

    Returns:
        주문코드 문자열 (예: "FRTV6ECX") 또는 None
    """
    # 패턴 1: 봇 폼 데이터에서 추출 (가장 신뢰도 높음)
    for msg in messages:
        form = msg.get("form")
        if not form or not isinstance(form, dict):
            continue
        for inp in form.get("inputs", []):
            label = inp.get("label", "")
            value = inp.get("value", "")
            if "주문" in label and value:
                # 공백/하이픈/언더스코어 등 비영숫자 제거 후 검증
                cleaned = re.sub(r"[^A-Za-z0-9]", "", value.strip())
                if re.match(r"^[A-Za-z0-9]{6,10}$", cleaned):
                    if cleaned != value.strip():
                        logger.info(f"폼 데이터 주문코드 정규화: '{value.strip()}' → '{cleaned}'")
                    logger.info(f"폼 데이터에서 주문코드 추출: {cleaned}")
                    return cleaned

    # 패턴 2: 고객 메시지에서 주문번호 키워드 근처 영숫자
    user_messages = [m for m in messages if m.get("personType") == "user"]
    for msg in user_messages:
        text = msg.get("plainText", "") or ""
        match = re.search(r"주문\s*번호\s*[:\s]*([A-Za-z0-9]{6,10})", text)
        if match:
            return match.group(1)

    # 패턴 3: 단독 영숫자 8자리 (신뢰도 낮음)
    for msg in user_messages:
        text = (msg.get("plainText", "") or "").strip()
        if re.match(r"^[A-Za-z0-9]{8}$", text):
            logger.warning(f"패턴3(단독 코드) 매칭: '{text}' - 오탐 가능성 있음")
            return text

    return None


def extract_phone_from_messages(messages: list[dict]) -> str | None:
    """
    메시지 목록에서 전화번호를 추출 (봇 폼 데이터)

    채널톡 봇 폼 라벨: "휴대폰 번호", "전화번호", "Mobile Number"
    값 형식: "+821085419697" (E.164)

    Args:
        messages: 채널톡 메시지 목록

    Returns:
        한국 형식 전화번호 ("01085419697") 또는 None
    """
    for msg in messages:
        form = msg.get("form")
        if not form or not isinstance(form, dict):
            continue
        for inp in form.get("inputs", []):
            label = inp.get("label", "")
            value = inp.get("value", "")
            if not value:
                continue
            # "주문" 포함 라벨은 스킵 (주문번호 필드와 구분)
            if "주문" in label:
                continue
            label_lower = label.lower()
            if any(kw in label_lower for kw in ("휴대폰", "전화", "mobile", "phone")):
                phone = _normalize_phone(value.strip())
                if phone:
                    logger.info(f"폼 데이터에서 전화번호 추출: {phone[:3]}****{phone[-4:]}")
                    return phone
    return None


def _normalize_phone(raw: str) -> str | None:
    """
    다양한 형식의 전화번호를 한국 표준(01012345678)으로 변환

    지원: +821012345678, 010-1234-5678, 01012345678
    """
    # +, 숫자 외 제거
    cleaned = re.sub(r"[^\d+]", "", raw)

    # +82 접두사 → 0으로 변환
    if cleaned.startswith("+82"):
        cleaned = "0" + cleaned[3:]
    elif cleaned.startswith("82") and len(cleaned) >= 12:
        cleaned = "0" + cleaned[2:]

    # 숫자만 남기기
    digits = re.sub(r"[^\d]", "", cleaned)

    # 한국 휴대폰 번호 검증 (010/011/016/017/018/019 + 7~8자리)
    if re.match(r"^01[016789]\d{7,8}$", digits):
        return digits

    return None


def get_user_phone(user_id: str) -> str | None:
    """
    채널톡 유저 프로필에서 전화번호 직접 조회 (3차 폴백)

    봇 폼에 전화번호가 없는 경우 userId → GET /users/{userId} → mobileNumber 추출.
    userId는 상담 객체에 항상 포함되므로 폼 구조 변경에도 안정적.

    Args:
        user_id: 채널톡 유저 ID

    Returns:
        한국 형식 전화번호 ("01085419697") 또는 None
    """
    if not re.match(r"^[a-zA-Z0-9]+$", user_id):
        logger.error(f"잘못된 user_id 형식: {user_id}")
        return None

    try:
        resp = requests.get(
            f"{config.CHANNELTALK_API_BASE}/users/{user_id}",
            headers=_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        profile = resp.json().get("user", {}).get("profile", {})
        mobile = profile.get("mobileNumber", "")
        if mobile:
            phone = _normalize_phone(mobile)
            if phone:
                logger.info(f"유저 프로필 전화번호 조회 성공: {phone[:3]}****{phone[-4:]}")
                return phone
    except Exception as e:
        logger.error(f"유저 프로필 조회 실패: user_id={user_id}, {e}")

    return None


def is_vehicle_already_sent(user_chat_id: str, vehicle_number: str) -> bool:
    """
    채팅 메시지 조회 → 동일 차량번호가 이미 발송됐는지 확인
    상담사 수동 발송 or 봇 이전 발송 중복 방지용

    Args:
        user_chat_id: 상담 ID
        vehicle_number: 확인할 차량번호 (예: "경기 81 바 6402")

    Returns:
        True이면 이미 발송됨 (스킵 대상)
    """
    try:
        messages = get_chat_messages(user_chat_id, limit=30)
        for msg in messages:
            text = (msg.get("plainText", "") or "").strip()
            if vehicle_number in text:
                return True
    except Exception as e:
        logger.warning(f"중복 확인 실패 (발송 진행): 상담 {user_chat_id}, {e}")
    return False


def has_vehicle_number_message(user_chat_id: str) -> bool:
    """
    채팅 메시지 이력에 차량번호 패턴 메시지가 있는지 확인.
    상담사 수동 발송 감지용 (특정 차량번호 불문).

    Args:
        user_chat_id: 상담 ID

    Returns:
        True이면 차량번호 패턴 메시지 존재 (수동 발송됨)
    """
    try:
        messages = get_chat_messages(user_chat_id, limit=30)
        vehicle_pattern = re.compile(r'\d{2,3}\s*[가-힣]\s*\d{4}')
        for msg in messages:
            text = (msg.get("plainText", "") or "").strip()
            if vehicle_pattern.search(text):
                return True
    except Exception as e:
        logger.warning(f"수동 발송 확인 실패 (진행): 상담 {user_chat_id}, {e}")
    return False


_VISITOR_KEYWORDS = ["방문자", "기사님 이름", "기사님 전화", "기사님 연락"]


def needs_visitor_info(user_chat_id: str) -> bool:
    """고객이 방문자명/연락처를 요청했는지 채팅 메시지에서 감지"""
    try:
        messages = get_chat_messages(user_chat_id, limit=30)
        for msg in messages:
            text = (msg.get("plainText", "") or "").strip()
            if any(kw in text for kw in _VISITOR_KEYWORDS):
                return True
    except Exception as e:
        logger.warning(f"방문자 정보 요청 감지 실패: {user_chat_id}, {e}")
    return False


def send_vehicle_message(user_chat_id: str, vehicle_number: str, rider_name: str = "", rider_phone: str = "", tag: str = "차량등록") -> SendResult:
    """
    배차 완료 시 해당 상담에 차량번호 메시지 발송

    ★ 고정 템플릿만 사용. 동적 부분은 차량번호 1개.
    ★ 개인화/AI 생성 문구 일절 없음.

    Args:
        user_chat_id: 채널톡 상담 ID
        vehicle_number: 차량번호 (예: "서울 12가 3456")
        tag: 채널톡 태그 (차량등록/차량등록2) — 태그별 메시지 템플릿 선택

    Returns:
        SendResult (SUCCESS / AUTH_ERROR / FAILED)
    """
    if not re.match(r"^[a-zA-Z0-9\-_]+$", user_chat_id):
        logger.error(f"잘못된 chat_id 형식: {user_chat_id}")
        return SendResult.FAILED

    tag_cfg = config.TAG_CONFIG.get(tag, config.TAG_CONFIG["차량등록"])
    if rider_name and rider_phone:
        message_text = tag_cfg["message_template_with_visitor"].format(
            vehicle_number=vehicle_number,
            rider_name=rider_name,
            rider_phone=rider_phone,
        )
    else:
        message_text = tag_cfg["message_template"].format(vehicle_number=vehicle_number)

    body = {
        "blocks": [
            {"type": "text", "value": message_text}
        ]
    }

    try:
        resp = requests.post(
            f"{config.CHANNELTALK_API_BASE}/user-chats/{user_chat_id}/messages",
            headers=_headers(),
            json=body,
            timeout=10,
        )
        if resp.status_code in (401, 403):
            logger.error(f"채널톡 인증 오류 ({resp.status_code}): 키 재발급 필요")
            return SendResult.AUTH_ERROR
        resp.raise_for_status()
        logger.info(f"채널톡 발송 성공: 상담 {user_chat_id}")
        return SendResult.SUCCESS
    except Exception as e:
        logger.error(f"채널톡 발송 실패: 상담 {user_chat_id}, 에러: {e}")
        return SendResult.FAILED
