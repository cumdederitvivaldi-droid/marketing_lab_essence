"""두발히어로 API 호출 + 응답 처리."""

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field

import requests

from config import PRODUCT_BASE_NAME, BATCH_SIZE, THROTTLE_S
from delivery_planner import Candidate

logger = logging.getLogger(__name__)


@dataclass
class ApiResult:
    index: int
    status: str  # sent, unsupported, duplicate_excluded, failed
    book_id: str = ""
    note: str = ""
    product: str = ""
    error_msg: str = ""
    unsupported_info: list = field(default_factory=list)  # [name, phone, clean_addr]


def _build_payload(config, candidate: Candidate) -> dict:
    return {
        "spotCode": config.spot_code,
        "receiverName": candidate.name or candidate.phone[-4:],
        "receiverMobile": candidate.phone,
        "receiverAddress": candidate.address,
        "productName": PRODUCT_BASE_NAME,
        "productCount": "1",
        "memoFromCustomer": candidate.memo,
        "frontdoorPassword": candidate.frontdoor_password,
    }


def _send_one(config, candidate: Candidate) -> ApiResult:
    """단건 API 호출 + 응답 처리. 스레드마다 독립 호출."""
    url = f"{config.dhero_api_url}/deliveries"
    headers = {"Authorization": f"Bearer {config.dhero_token}"}
    payload = _build_payload(config, candidate)
    row_number = candidate.index + 2

    resp = None
    for attempt in range(3):
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=30)
            if resp.status_code in (429, 503) and attempt < 2:
                wait = 2 ** attempt
                logger.warning(f"[배송접수] HTTP {resp.status_code} — {wait}초 후 재시도 ({attempt + 1}/3)")
                time.sleep(wait)
                continue
            break
        except Exception as e:
            if attempt < 2:
                time.sleep(2 ** attempt)
                continue
            msg = str(e)[:50]
            # 개별 건 실패는 warning 으로 기록 (배치 전체 실패가 아님)
            logger.warning(f"[배송접수] 단건 예외: {candidate.phone} - {e}")
            return ApiResult(
                index=candidate.index,
                status="failed",
                error_msg=f"행 {row_number} / {candidate.name} / {candidate.phone} — {msg}",
            )
    if resp is None:
        return ApiResult(index=candidate.index, status="failed", error_msg=f"행 {row_number} — 요청 실패")

    text = resp.text.strip()

    # HTML 응답 → 서버 오류
    if text.startswith("<"):
        return ApiResult(
            index=candidate.index,
            status="failed",
            error_msg=f"행 {row_number} / {candidate.name} / {candidate.phone} — 서버 오류",
        )

    # JSON 파싱
    try:
        body = resp.json()
    except Exception:
        # 개별 건 JSON 파싱 실패는 warning (batch 자체는 정상 진행)
        logger.warning(f"[배송접수] 단건 응답 파싱 실패: {text[:200]}")
        return ApiResult(
            index=candidate.index,
            status="failed",
            error_msg=f"행 {row_number} / {candidate.name} / {candidate.phone} — 응답 파싱 실패",
        )

    if resp.status_code in (200, 201):
        book_id = str(body.get("bookId") or "").strip()

        # 배송불가 지역
        if body.get("addressNotSupported"):
            return ApiResult(
                index=candidate.index,
                status="unsupported",
                book_id=book_id,
                note="두발히어로 배송불가 지역으로 판정됨",
                product="배송불가 지역",
                unsupported_info=[candidate.name, candidate.phone, candidate.clean_addr],
            )

        # API 200/201인데 bookId 없음 → 우리 측 중복 접수
        # 두발히어로에서 이미 접수된 건이라 bookId를 안 내려줌. 재시도해도 동일 결과.
        if not book_id:
            logger.info(f"[배송접수] 중복 접수 제외: {candidate.phone} (bookId 없음)")
            return ApiResult(
                index=candidate.index,
                status="duplicate_excluded",
                product="중복 접수 제외",
            )

        # 정상 성공
        return ApiResult(
            index=candidate.index,
            status="sent",
            book_id=book_id,
        )

    # HTTP 오류
    err_msg = body.get("message") or f"HTTP {resp.status_code}"
    # 개별 건 HTTP 오류는 warning (실패 상세는 ApiResult.error_msg + 모니터 요약에 반영)
    logger.warning(f"[배송접수] 단건 API 오류 {resp.status_code}: {text[:200]}")
    return ApiResult(
        index=candidate.index,
        status="failed",
        error_msg=f"행 {row_number} / {candidate.name} / {candidate.phone} — {err_msg}",
    )


def send_deliveries(
    config,
    candidates: list[Candidate],
    started_at: float = 0.0,
    timeguard_s: float = 0.0,
) -> list[ApiResult]:
    """후보를 배치로 API 호출하고 결과를 반환한다.

    타임가드는 API 호출 전에 체크해 이미 완료된 건만 반환한다.
    결과 처리 도중이 아니라 API 호출 단계에서 중단해야 미반영 건이 생기지 않는다.
    """
    results: list[ApiResult] = []

    for batch_start in range(0, len(candidates), BATCH_SIZE):
        # 타임가드 — 배치 호출 전 체크해서 API를 아직 안 보낸 건만 이월
        if timeguard_s and started_at and time.time() - started_at > timeguard_s:
            remaining = len(candidates) - batch_start
            logger.warning(f"[배송접수] 타임가드 {timeguard_s:.0f}초 초과 — 남은 {remaining}건 다음 실행으로 이월")
            break

        batch = candidates[batch_start : batch_start + BATCH_SIZE]

        # 완료된 건 추적 — 예외 발생 시 이미 성공한 건을 재호출하지 않기 위함
        completed_indexes: set[int] = set()
        try:
            with ThreadPoolExecutor(max_workers=min(len(batch), 5)) as executor:
                futures = {
                    executor.submit(_send_one, config, c): c for c in batch
                }
                for future in as_completed(futures):
                    result = future.result()
                    results.append(result)
                    completed_indexes.add(futures[future].index)
        except Exception as e:
            # 병렬 실패 시 미완료 건만 순차 재시도 (완료된 건 중복 호출 방지)
            remaining = [c for c in batch if c.index not in completed_indexes]
            logger.warning(f"[배송접수] 병렬 호출 실패, {len(remaining)}건 순차 재시도: {e}")
            for c in remaining:
                results.append(_send_one(config, c))

        # 배치 간 스로틀
        if batch_start + BATCH_SIZE < len(candidates):
            time.sleep(THROTTLE_S)

    return results
