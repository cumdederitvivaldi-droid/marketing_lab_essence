"""
주문코드 → 주문ID 매핑 모듈

채널톡 봇 워크플로우에서 수집한 주문번호(영숫자 10자리, 예: K3MQ7A9BX2)를
백오피스 API에서 사용하는 숫자 주문ID로 변환.

데이터 소스:
  - secure_dataset.order (레거시 주문, masked_phone)
  - secure_dataset.order_v2.order_number
  - secure_dataset.order_customer_snapshot.customer_phone
  - secure_dataset.fulfillment.scheduled_start_at
  - secure_dataset.order_line / product (신규 도메인 서비스 주문 필터)

제약:
  - BigQuery 동기화 지연 약 30분 (스트리밍/마이크로배치 확인, 2026-03-02)
  - gcloud ADC 인증 필요 (~/.config/gcloud/application_default_credentials.json)
"""
from __future__ import annotations

import logging
import re

import google.auth
import requests
import google.auth.transport.requests

import config

logger = logging.getLogger("order_lookup")

# 주문 상태 제외 목록 (BQ SQL NOT IN용)
# config.COMPLETED_ORDER_STATUSES + config.CANCELED_ORDER_STATUSES 합산
# → config.py 수정만으로 자동 반영 (마이그레이션 후 새 상태코드 추가 시 여기 수정 불필요)
_EXCLUDED_STATUSES_SQL = ", ".join(
    f"'{s}'" for s in sorted(
        config.COMPLETED_ORDER_STATUSES | config.CANCELED_ORDER_STATUSES
    )
)

# BigQuery REST API 엔드포인트
BQ_API_BASE = "https://bigquery.googleapis.com/bigquery/v2"
BQ_PROJECT = "covering-app-ccd23"

_SERVICE_ORDER_EXISTS_SQL = """
EXISTS (
  SELECT 1
  FROM `covering-app-ccd23.secure_dataset.order_line` ol
  JOIN `covering-app-ccd23.secure_dataset.product` p
    ON p.id = ol.product_id
  WHERE ol.order_id = o.id
    AND ol.deleted_at IS NULL
    AND UPPER(COALESCE(p.product_type, '')) = 'SERVICE'
)
"""


def _get_access_token() -> str | None:
    """BigQuery access token 획득

    우선순위:
      1. 서비스 계정 JSON / 키 파일
      2. gcloud ADC (로컬 실행 — beige@covering.app 계정)
    """
    service_account_creds = config.get_google_service_account_credentials(
        ["https://www.googleapis.com/auth/bigquery.readonly"]
    )
    if service_account_creds is not None:
        try:
            service_account_creds.refresh(google.auth.transport.requests.Request())
            return service_account_creds.token
        except Exception as e:
            logger.warning(f"서비스 계정 인증 실패, ADC 시도: {e}")

    # 2차: gcloud ADC (로컬 실행 시 자동으로 beige@covering.app 사용)
    try:
        creds, _ = google.auth.default(
            scopes=["https://www.googleapis.com/auth/bigquery.readonly"]
        )
        creds.refresh(google.auth.transport.requests.Request())
        return creds.token
    except Exception as e:
        logger.error(f"BigQuery 토큰 획득 실패: {e}")
    return None


def _mask_phone(phone: str) -> str:
    """
    전화번호를 BigQuery masked_phone 형식으로 변환

    01085419697 → 010****9697
    """
    if len(phone) < 7:
        return phone
    return phone[:3] + "****" + phone[-4:]


def _parse_bq_rows(rows: list) -> list[dict]:
    """BigQuery 쿼리 결과 rows → [{"order_id", "order_code"}] 변환"""
    candidates = []
    for row in rows:
        raw_id = row["f"][0]["v"]
        raw_code = row["f"][1]["v"]
        if not raw_id:
            continue
        order_id = str(int(float(raw_id)))
        order_code = raw_code or ""
        candidates.append({"order_id": order_id, "order_code": order_code})
    return candidates


def _run_bq_phone_query(token: str, masked: str, normalized: str, sql: str) -> list[dict]:
    """공통 BQ 전화번호 쿼리 실행"""
    query = {
        "query": sql,
        "useLegacySql": False,
        "parameterMode": "NAMED",
        "queryParameters": [
            {
                "name": "masked_phone",
                "parameterType": {"type": "STRING"},
                "parameterValue": {"value": masked},
            },
            {
                "name": "normalized_phone",
                "parameterType": {"type": "STRING"},
                "parameterValue": {"value": normalized},
            }
        ],
    }
    resp = requests.post(
        f"{BQ_API_BASE}/projects/{BQ_PROJECT}/queries",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=query,
        timeout=15,
    )
    resp.raise_for_status()
    return _parse_bq_rows(resp.json().get("rows", []))


def lookup_orders_by_phone(phone: str) -> list[dict]:
    """
    전화번호 → 활성 주문 후보 조회 (BigQuery masked_phone)

    masked_phone 충돌(15%)이 있어 후보만 반환.
    실제 대조는 backoffice API의 full phone으로 수행.

    조회 전략:
      1차: 최근 7일 + 수거 상품 필터 + 완료 상태 제외 (정밀)
      2차 폴백: 최근 30일 + 수거 상품 필터 + 완료 상태 제외 (1차 결과 0건 시)

    Args:
        phone: 정규화된 전화번호 (01085419697)

    Returns:
        후보 주문 목록 [{"order_id": "1285425", "order_code": "WEBPNIIR"}, ...]
    """
    if not re.match(r"^01[016789]\d{7,8}$", phone):
        logger.warning(f"잘못된 전화번호 형식")
        return []

    masked = _mask_phone(phone)
    normalized = re.sub(r"[^\d]", "", phone)

    token = _get_access_token()
    if not token:
        logger.error("BigQuery 인증 토큰 없음 (서비스 계정 키 확인 필요)")
        return []

    # 1차: 최근 7일 + 수거 주문 필터 (정밀 쿼리)
    sql_primary = (
        "SELECT order_id, order_code "
        "FROM ("
        "  SELECT CAST(o.id AS STRING) AS order_id, o.code AS order_code, o.created_date AS created_at "
        "  FROM `covering-app-ccd23.secure_dataset.order` o "
        "  WHERE o.masked_phone = @masked_phone "
        "    AND o.request_type = 'DEFAULT_GARBAGE' "
        f"    AND o.status NOT IN ({_EXCLUDED_STATUSES_SQL}) "
        "    AND o.created_date >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY) "
        "  UNION ALL "
        "  SELECT CAST(o.id AS STRING) AS order_id, o.order_number AS order_code, o.created_at "
        "  FROM `covering-app-ccd23.secure_dataset.order_v2` o "
        "  JOIN `covering-app-ccd23.secure_dataset.order_customer_snapshot` cs "
        "    ON cs.order_id = o.id "
        "  WHERE ("
        "      cs.customer_phone = @masked_phone "
        "      OR REGEXP_REPLACE(COALESCE(cs.customer_phone, ''), r'[^0-9]', '') = @normalized_phone"
        "    ) "
        f"    AND o.status NOT IN ({_EXCLUDED_STATUSES_SQL}) "
        "    AND o.deleted_at IS NULL "
        f"    AND {_SERVICE_ORDER_EXISTS_SQL.strip()} "
        "    AND o.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY) "
        ") "
        "ORDER BY created_at DESC "
        "LIMIT 5"
    )

    try:
        candidates = _run_bq_phone_query(token, masked, normalized, sql_primary)
        if candidates:
            logger.info(f"전화번호 매칭 후보(1차): {len(candidates)}건 (masked: {masked})")
            return candidates

        # 2차 폴백: 최근 30일 + 수거 주문 필터 + 완료 상태 제외
        logger.info(f"1차 BQ 후보 0건, 30일 폴백 쿼리 실행 (masked: {masked})")
        sql_fallback = (
            "SELECT order_id, order_code "
            "FROM ("
            "  SELECT CAST(o.id AS STRING) AS order_id, o.code AS order_code, o.created_date AS created_at "
            "  FROM `covering-app-ccd23.secure_dataset.order` o "
            "  WHERE o.masked_phone = @masked_phone "
            "    AND o.request_type = 'DEFAULT_GARBAGE' "
            f"    AND o.status NOT IN ({_EXCLUDED_STATUSES_SQL}) "
            "    AND o.created_date >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY) "
            "  UNION ALL "
            "  SELECT CAST(o.id AS STRING) AS order_id, o.order_number AS order_code, o.created_at "
            "  FROM `covering-app-ccd23.secure_dataset.order_v2` o "
            "  JOIN `covering-app-ccd23.secure_dataset.order_customer_snapshot` cs "
            "    ON cs.order_id = o.id "
            "  WHERE ("
            "      cs.customer_phone = @masked_phone "
            "      OR REGEXP_REPLACE(COALESCE(cs.customer_phone, ''), r'[^0-9]', '') = @normalized_phone"
            "    ) "
            f"    AND o.status NOT IN ({_EXCLUDED_STATUSES_SQL}) "
            "    AND o.deleted_at IS NULL "
            f"    AND {_SERVICE_ORDER_EXISTS_SQL.strip()} "
            "    AND o.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY) "
            ") "
            "ORDER BY created_at DESC "
            "LIMIT 5"
        )
        candidates = _run_bq_phone_query(token, masked, normalized, sql_fallback)
        logger.info(f"전화번호 매칭 후보(30일 폴백): {len(candidates)}건")
        return candidates

    except Exception as e:
        logger.error(f"BigQuery 전화번호 조회 실패: {e}")
        return []


def lookup_order_id(order_code: str) -> str | None:
    """
    주문코드(FRTV6ECX) → 숫자 주문ID(1283492) 변환

    BigQuery 레거시 order.code + 신규 order_v2.order_number 둘 다 조회.

    Args:
        order_code: 영숫자 주문번호 (6~10자리)

    Returns:
        숫자 주문ID 문자열 또는 None
    """
    # 입력 검증 (SQL injection 방어)
    if not re.match(r"^[A-Za-z0-9]{6,10}$", order_code):
        logger.warning(f"잘못된 주문코드 형식: {order_code}")
        return None

    token = _get_access_token()
    if not token:
        logger.error("BigQuery 인증 토큰 없음")
        return None

    # 파라미터화된 쿼리 (SQL injection 완전 차단)
    query = {
        "query": (
            "SELECT order_id "
            "FROM ("
            "  SELECT CAST(o.id AS STRING) AS order_id, o.created_date AS created_at "
            "  FROM `covering-app-ccd23.secure_dataset.order` o "
            "  WHERE o.code = @code "
            "    AND o.request_type = 'DEFAULT_GARBAGE' "
            "  UNION ALL "
            "  SELECT CAST(o.id AS STRING) AS order_id, o.created_at "
            "  FROM `covering-app-ccd23.secure_dataset.order_v2` o "
            "  WHERE o.order_number = @code "
            "    AND o.deleted_at IS NULL "
            f"    AND {_SERVICE_ORDER_EXISTS_SQL.strip()} "
            ") "
            "ORDER BY created_at DESC "
            "LIMIT 1"
        ),
        "useLegacySql": False,
        "parameterMode": "NAMED",
        "queryParameters": [
            {
                "name": "code",
                "parameterType": {"type": "STRING"},
                "parameterValue": {"value": order_code},
            }
        ],
    }

    try:
        resp = requests.post(
            f"{BQ_API_BASE}/projects/{BQ_PROJECT}/queries",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=query,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()

        rows = data.get("rows", [])
        if rows:
            order_id = rows[0]["f"][0]["v"]
            logger.info(f"주문코드 {order_code} → 주문ID {order_id}")
            return str(int(float(order_id)))  # BigQuery가 숫자를 float으로 반환할 수 있음

        logger.warning(f"주문코드 {order_code}: BigQuery에서 못 찾음 (동기화 지연 가능)")
        return None

    except Exception as e:
        logger.error(f"BigQuery 조회 실패: {e}")
        return None


def get_pickup_dates_batch(order_ids: list) -> dict:
    """
    여러 주문 ID의 수거 예정일(KST 날짜 문자열)을 BQ에서 배치 조회.

    Args:
        order_ids: 숫자 주문ID 문자열 목록 (예: ["1344588", "1345081"])

    Returns:
        {order_id: "2026-03-03", ...} — BQ에 없거나 scheduled_start_at 없으면 제외
    """
    if not order_ids:
        return {}

    # 숫자만 허용 (SQL injection 방어)
    valid_ids = [oid for oid in order_ids if str(oid).isdigit()]
    if not valid_ids:
        return {}

    token = _get_access_token()
    if not token:
        logger.error("BigQuery 인증 토큰 없음 (get_pickup_dates_batch)")
        return {}

    # UNNEST + INT64 배열 파라미터
    id_list = ",".join(valid_ids)
    query = {
        "query": f"""
            WITH pickup_candidates AS (
              SELECT
                CAST(id AS STRING) AS order_id,
                pickup_start_time AS scheduled_at
              FROM `covering-app-ccd23.secure_dataset.order`
              WHERE id IN ({id_list})
                AND pickup_start_time IS NOT NULL
                AND status NOT IN ('USER_CANCELED', 'ADMIN_CANCELED')

              UNION ALL

              SELECT
                CAST(order_id AS STRING) AS order_id,
                scheduled_start_at AS scheduled_at
              FROM `covering-app-ccd23.secure_dataset.fulfillment`
              WHERE order_id IN ({id_list})
                AND scheduled_start_at IS NOT NULL
                AND status != 'CANCELED'
            )
            SELECT
              order_id,
              FORMAT_DATE(
                '%Y-%m-%d',
                DATE(MAX(scheduled_at), 'Asia/Seoul')
              ) AS pickup_date
            FROM pickup_candidates
            GROUP BY order_id
        """,
        "useLegacySql": False,
    }

    try:
        resp = requests.post(
            f"{BQ_API_BASE}/projects/{BQ_PROJECT}/queries",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=query,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()

        result = {}
        for row in data.get("rows", []):
            oid = row["f"][0]["v"]
            pickup_date = row["f"][1]["v"]
            if oid and pickup_date:
                result[str(oid)] = pickup_date
        logger.info(f"pickup_dates_batch: {len(result)}건 조회 완료")
        return result

    except Exception as e:
        logger.error(f"get_pickup_dates_batch 실패: {e}")
        return {}
