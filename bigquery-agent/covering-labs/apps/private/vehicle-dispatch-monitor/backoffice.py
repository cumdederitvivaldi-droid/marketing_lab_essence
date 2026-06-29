"""
백오피스 배차 조회 모듈

★ 보안 최우선:
  - safe_backoffice_get만 사용 (security.py)
  - GET 요청만 허용, 다른 HTTP 메서드 100% 차단
  - 엔드포인트 화이트리스트 외 접근 100% 차단

기능:
  - GET /v3/order/{id} 우선, 404 시 /v2/order/{id} 폴백
  - 주문 상세에서 배차 정보(차량번호, 라이더) 추출

API 응답 구조 (2026-02-19 확인):
  data.rider = null → 미배차
  data.rider.vehicleNumber → "서울 85 바 9953"
  data.rider.username → "윤성원"
"""
from __future__ import annotations

import logging
import re

import requests

from security import safe_backoffice_get
import config
import backoffice_auth

logger = logging.getLogger("backoffice")


def _extract_status_code(raw) -> str:
    """status 응답이 문자열/객체 어느 형태든 코드 문자열로 정규화"""
    if isinstance(raw, dict):
        for key in ("code", "type", "status", "value", "name"):
            value = raw.get(key)
            code = _extract_status_code(value)
            if code:
                return code
        return ""
    if isinstance(raw, str):
        return raw.strip().upper()
    return ""


def _extract_order_status(data: dict) -> str:
    for key in ("orderStatus", "order_status", "status"):
        code = _extract_status_code(data.get(key))
        if code:
            return code
    order_data = data.get("order")
    if isinstance(order_data, dict):
        return _extract_status_code(order_data.get("status"))
    return ""


def _extract_fulfillment_status(data: dict) -> str:
    for key in ("fulfillmentStatus", "fulfillment_status", "visitStatus", "visit_status"):
        code = _extract_status_code(data.get(key))
        if code:
            return code

    for key in ("fulfillment", "visit"):
        value = data.get(key)
        if isinstance(value, dict):
            code = _extract_status_code(value.get("status"))
            if code:
                return code

    fulfillments = data.get("fulfillments")
    if isinstance(fulfillments, list):
        for item in fulfillments:
            if isinstance(item, dict):
                code = _extract_status_code(item.get("status"))
                if code:
                    return code
    return ""


def _extract_phone(data: dict) -> str:
    for key in ("phone", "customerPhone", "customer_phone"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value

    for key in ("user", "customer", "orderCustomerSnapshot", "order_customer_snapshot"):
        nested = data.get(key)
        if isinstance(nested, dict):
            for phone_key in ("phone", "customerPhone", "customer_phone"):
                value = nested.get(phone_key)
                if isinstance(value, str) and value.strip():
                    return value
    return ""


def _extract_order_code(data: dict) -> str:
    for key in ("code", "orderNumber", "order_number", "orderNo"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return ""


def _extract_rider(data: dict) -> dict | None:
    for key in ("rider",):
        value = data.get(key)
        if isinstance(value, dict):
            return value

    for key in ("fulfillment", "visit"):
        nested = data.get(key)
        if isinstance(nested, dict):
            rider = nested.get("rider")
            if isinstance(rider, dict):
                return rider

    fulfillments = data.get("fulfillments")
    if isinstance(fulfillments, list):
        for item in fulfillments:
            if isinstance(item, dict):
                rider = item.get("rider")
                if isinstance(rider, dict):
                    return rider
    return None


def _extract_vehicle_number(rider: dict | None) -> str:
    if not isinstance(rider, dict):
        return ""

    for key in ("vehicleNumber", "vehicle_number"):
        value = rider.get(key)
        if isinstance(value, str) and value.strip():
            return value

    vehicle = rider.get("vehicle")
    if isinstance(vehicle, dict):
        for key in ("number", "vehicleNumber", "vehicle_number"):
            value = vehicle.get(key)
            if isinstance(value, str) and value.strip():
                return value

    return ""


def _extract_rider_name(rider: dict | None) -> str:
    if not isinstance(rider, dict):
        return ""
    return rider.get("username") or rider.get("name") or ""


def _extract_rider_phone(rider: dict | None) -> str:
    if not isinstance(rider, dict):
        return ""
    return rider.get("phone") or rider.get("phoneNumber") or rider.get("mobile") or ""


def _fetch_order(order_id: str, token: str) -> dict:
    """
    주문 조회 + v3→v2 자동 폴백 + 401 시 토큰 갱신 재시도

    config.BACKOFFICE_ORDER_API_VERSION = "v3" (기본):
      v3 시도 → 404면 v2 재시도 (마이그레이션 전환 자동 대응)
    config.BACKOFFICE_ORDER_API_VERSION = "v2":
      v2만 시도 (폴백 없음)

    Returns:
        API 응답 dict

    Raises:
        requests.HTTPError: 재시도 후에도 실패 시
    """
    primary = config.BACKOFFICE_ORDER_API_VERSION
    versions = [primary] if primary == "v2" else [primary, "v2"]

    for i, version in enumerate(versions):
        path = f"/{version}/order/{order_id}"
        try:
            return safe_backoffice_get(path, token)
        except requests.HTTPError as e:
            status = e.response.status_code if e.response is not None else None
            if status == 404 and i < len(versions) - 1:
                logger.info(f"/{version}/order 없음(404), v2 폴백")
                continue
            if status == 401:
                new_token = backoffice_auth.refresh_on_401()
                if new_token:
                    logger.info("토큰 재발급 성공, 재시도")
                    token = new_token
                    return safe_backoffice_get(path, new_token)
            raise  # 401 갱신 실패 또는 다른 HTTP 에러 → 그대로 전파


def verify_order_phone(order_id: str, expected_phone: str, token: str = None) -> dict | None:
    """
    주문의 전화번호가 예상 전화번호와 일치하는지 검증

    백오피스 주문 상세 → data.phone (full, unmasked)과 비교.
    일치 시 주문 정보(주문번호, 배차 정보) 함께 반환.

    Args:
        order_id: 주문 ID
        expected_phone: 정규화된 전화번호 (01085419697)
        token: 백오피스 Access Token

    Returns:
        일치 시: {"order_id", "order_code", "vehicle_number", "rider_name"}
        불일치 시: None

    Raises:
        requests.HTTPError: 401 등 HTTP 에러 (호출측에서 처리)
    """
    if token is None:
        token = backoffice_auth.get_valid_token()
    if not token:
        logger.warning("백오피스 Access Token이 설정되지 않았습니다")
        return None

    if not order_id.isdigit():
        logger.warning(f"잘못된 주문번호 형식: {order_id}")
        return None

    try:
        resp = _fetch_order(order_id, token)
    except requests.HTTPError:
        raise
    except Exception as e:
        logger.error(f"주문 {order_id} 전화번호 대조 실패: {e}")
        return None

    data = resp.get("data", {})

    api_phone = _extract_phone(data)

    # 숫자만 남겨서 비교
    api_clean = re.sub(r"[^\d]", "", api_phone)
    expected_clean = re.sub(r"[^\d]", "", expected_phone)

    if not api_clean or api_clean != expected_clean:
        logger.debug(f"주문 {order_id}: 전화번호 불일치")
        return None

    # 완료/실패/취소된 주문 스킵 (phone fallback 오매칭 방지)
    order_status = _extract_order_status(data)
    fulfillment_status = _extract_fulfillment_status(data)
    logger.info(
        f"주문 {order_id}: order_status={order_status}, fulfillment_status={fulfillment_status}"
    )
    if order_status and (
        order_status in config.COMPLETED_ORDER_STATUSES
        or order_status in config.CANCELED_ORDER_STATUSES
    ):
        logger.info(
            f"주문 {order_id}: 완료 상태({order_status}) → phone fallback 후보 제외"
        )
        return None
    if fulfillment_status and fulfillment_status in config.TERMINAL_FULFILLMENT_STATUSES:
        logger.info(
            f"주문 {order_id}: 방문 종료 상태({fulfillment_status}) → phone fallback 후보 제외"
        )
        return None

    logger.info(f"주문 {order_id}: 전화번호 일치 확인")

    order_code = _extract_order_code(data)
    rider = _extract_rider(data)
    vehicle_number = _extract_vehicle_number(rider)
    rider_name = _extract_rider_name(rider)
    rider_phone = _extract_rider_phone(rider)

    return {
        "order_id": order_id,
        "order_code": order_code,
        "vehicle_number": vehicle_number,
        "rider_name": rider_name,
        "rider_phone": rider_phone,
    }


def get_dispatch_info(order_id: str, token: str = None) -> dict | None:
    """
    주문의 배차 정보(차량번호, 라이더) 조회

    Args:
        order_id: 주문 번호
        token: 백오피스 Access Token (없으면 config에서 가져옴)

    Returns:
        {"vehicle_number": "서울 85 바 9953", "rider_name": "윤성원"} 또는 None

    ★ 이 함수는 security.safe_backoffice_get만 사용
    ★ requests 직접 호출 절대 금지
    """
    # 토큰 결정: 인자 > 자동 로그인 > 환경변수
    if token is None:
        token = backoffice_auth.get_valid_token()

    if not token:
        logger.warning("백오피스 Access Token이 설정되지 않았습니다")
        return None

    # 주문번호 형식 검증 (숫자만 허용 - 2차 방어)
    if not order_id.isdigit():
        logger.warning(f"잘못된 주문번호 형식: {order_id}")
        return None

    try:
        resp = _fetch_order(order_id, token)
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 401:
            logger.error("백오피스 Access Token 만료, 자동 갱신 실패")
        else:
            logger.error(f"주문 {order_id} 조회 실패: {e}")
        raise
    except Exception as e:
        logger.error(f"주문 {order_id} 조회 실패: {e}")
        return None

    # 필요한 필드만 즉시 추출 후 전체 응답 해제
    # (응답에는 고객 주소·presigned URL 등 불필요한 민감 데이터 포함)
    data = resp.get("data", {})
    order_status = _extract_order_status(data)
    fulfillment_status = _extract_fulfillment_status(data)
    rider = _extract_rider(data)
    has_rider = isinstance(rider, dict)
    if has_rider:
        logger.info(f"주문 {order_id}: rider keys={list(rider.keys())}")
    vehicle_number = _extract_vehicle_number(rider)
    rider_name = _extract_rider_name(rider)
    rider_phone = _extract_rider_phone(rider)
    del resp, data, rider  # 불필요 데이터 메모리에서 즉시 해제

    # 취소 상태 처리
    if (
        order_status and order_status in config.CANCELED_ORDER_STATUSES
    ) or fulfillment_status == "CANCELED":
        status = fulfillment_status or order_status
        logger.info(f"주문 {order_id}: 취소 상태({status})")
        return {"cancelled": True, "status": status}

    if (
        fulfillment_status and fulfillment_status in config.TERMINAL_FULFILLMENT_STATUSES
        and fulfillment_status != "CANCELED"
    ) or (order_status and order_status in config.COMPLETED_ORDER_STATUSES):
        status = fulfillment_status or order_status
        reason = "방문실패" if fulfillment_status == "FAILED" else "처리완료"
        logger.info(f"주문 {order_id}: 종료 상태({status})")
        return {"closed": True, "status": status, "reason": reason}

    if not vehicle_number:
        if not has_rider:
            logger.info(f"주문 {order_id}: 라이더 미배정 (rider=null)")
        else:
            logger.info(f"주문 {order_id}: 라이더 배정 ({rider_name}) 차량번호 미등록")
        return None

    logger.info(f"주문 {order_id}: 배차 완료")
    return {"vehicle_number": vehicle_number, "rider_name": rider_name, "rider_phone": rider_phone}
