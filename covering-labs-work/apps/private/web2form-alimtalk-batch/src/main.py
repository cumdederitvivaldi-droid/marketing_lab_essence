"""웹폼 전화번호 → FlareLane 친구톡 FI 자동 발송 배치.

흐름:
1. find_pending_rows() — 시트에서 H(발송 성공 여부)가 빈 행 = 신규 발송 대기
2. find_retry_rows()   — H='실패' 행 = 1회 재발송 대상
3. 둘 다 같은 사이클에서 발송 시도
4. 결과를 G(API 호출 성공)와 H(카카오 도달 여부)에 마킹
   - status 201 → H='성공'
   - status != 201 또는 normalize 실패
       · 신규 → H='실패' (다음 cron 사이클에서 재시도 pickup)
       · 재시도 → H='실패_재시도' (종결 — 추가 시도 안 함)
"""

from __future__ import annotations

import argparse
import logging
import time
from pathlib import Path

LOG_DIR = Path(__file__).resolve().parents[1] / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

# FileHandler 단일 — cron 실행 시 crontab 이 stdout/stderr 을 `>> logs/batch.log`
# 로 리다이렉트하므로, StreamHandler 까지 함께 attach 하면 한 라인이 batch.log
# 에 두 번씩 기록되는 중복 사고가 발생한다 (PR #315 머지 후 실측 확인).
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler(LOG_DIR / "batch.log", encoding="utf-8")],
)
logger = logging.getLogger(__name__)

# config import 시점에 FLARELANE_PROJECT_ID, FLARELANE_API_KEY 검증 (config.py)
import config  # noqa: F401 — side-effect: env 검증
from sheets import (
    open_sheet,
    find_pending_rows,
    find_retry_rows,
    mark_sent,
    mark_result,
    mark_message_id,
    RESULT_SUCCESS,
    RESULT_FAILURE,
    RESULT_RETRIED,
)
from flarelane import _send_one, normalize_phone
from config import SEND_DELAY_SEC


def _mask(phone: str) -> str:
    return phone[:3] + "****" + phone[-4:] if len(phone) >= 7 else phone


def _send_row(row_num: int, phone: str, *, is_retry: bool) -> tuple[bool, dict]:
    """단일 행 발송 큐잉. (큐잉여부, info_dict) 반환.

    info_dict 는 flarelane._send_one 의 반환을 그대로 전달. 전화번호 정규화
    실패는 fail 처리 + 표준 info 구조에 error 만 채운다.

    참고: 여기서 '성공'은 FlareLane API 큐잉 성공 (HTTP 201 + selected≥1) 만
    의미한다. 실제 카카오 도달은 비동기라 응답 시점엔 알 수 없다.
    """
    masked = _mask(phone)
    try:
        phone_e164 = normalize_phone(phone)
    except ValueError as exc:
        logger.warning("전화번호 제외: row=%d %s", row_num, exc)
        return False, {
            "status": 0, "id": "", "selected": 0, "sent": 0, "failed": 0,
            "unsubscribed": 0, "error": f"invalid: {exc}",
        }

    ok, info = _send_one(phone_e164)
    label = "재발송" if is_retry else "신규"
    summary = (
        f"status={info['status']} id={info['id']} "
        f"selected={info['selected']} sent={info['sent']} failed={info['failed']}"
    )
    if ok:
        logger.info("[%s] 큐잉 성공: row=%d phone=%s %s", label, row_num, masked, summary)
    else:
        err = info.get("error") or ""
        logger.error(
            "[%s] 큐잉 실패: row=%d phone=%s %s err=%s",
            label, row_num, masked, summary, err,
        )
    return ok, info


def main(dry_run: bool = False) -> None:
    started_at = time.time()
    mode = "DRY-RUN" if dry_run else "LIVE"
    logger.info("시작 (mode=%s)", mode)

    _, sheet = open_sheet()
    pending = find_pending_rows(sheet)
    retries = find_retry_rows(sheet)

    if not pending and not retries:
        logger.info("발송 대기/재발송 대상 없음")
        logger.info("완료 : %.1f초", time.time() - started_at)
        return

    logger.info("발송 대기 신규=%d건 · 재발송=%d건", len(pending), len(retries))

    if dry_run:
        for row_num, phone, _ in pending + retries:
            try:
                normalize_phone(phone)
                logger.info("[DRY-RUN] valid row=%d phone=%s", row_num, _mask(phone))
            except ValueError as exc:
                logger.warning("[DRY-RUN] invalid %s", exc)
        logger.info("완료 : %.1f초 (dry-run)", time.time() - started_at)
        return

    # send 결과 카운트는 _send_row() 반환 직후 increment.
    # 시트 마킹 카운트(mark_fail) 와 분리해서, 마킹 예외가 나도 send 카운트가
    # 정확히 집계되도록 한다 (false 'success' 로그 방지).
    new_ok = new_fail = retry_ok = retry_fail = mark_fail = 0

    # 신규 발송
    # 마킹 순서: H(결과)를 먼저, G(API 성공)를 나중. H='성공'이 먼저 박혀야
    # 부분 실패(G 마킹 OK, H 마킹 NG) 시 다음 cron tick의 find_pending_rows에서
    # 같은 행을 다시 픽업해 이중 발송하는 사고를 막는다.
    for i, (row_num, phone, _nickname) in enumerate(pending):
        if i > 0 and SEND_DELAY_SEC > 0:
            time.sleep(SEND_DELAY_SEC)
        ok, info = _send_row(row_num, phone, is_retry=False)
        if ok:
            new_ok += 1
        else:
            new_fail += 1
        try:
            if ok:
                mark_result(sheet, row_num, RESULT_SUCCESS)
                mark_message_id(sheet, row_num, info.get("id", ""))
                mark_sent(sheet, row_num)
            else:
                mark_result(sheet, row_num, RESULT_FAILURE)
        except Exception as exc:
            mark_fail += 1
            logger.error("시트 마킹 실패: row=%d ok=%s error=%s", row_num, ok, exc)

    # 재발송 (1회 한정)
    for i, (row_num, phone, _nickname) in enumerate(retries):
        if (i > 0 or pending) and SEND_DELAY_SEC > 0:
            time.sleep(SEND_DELAY_SEC)
        ok, info = _send_row(row_num, phone, is_retry=True)
        if ok:
            retry_ok += 1
        else:
            retry_fail += 1
        try:
            if ok:
                mark_result(sheet, row_num, RESULT_SUCCESS)
                mark_message_id(sheet, row_num, info.get("id", ""))
                mark_sent(sheet, row_num)
            else:
                # 재시도도 실패 — 종결 마커로 변경해 다음 사이클에서 다시 picking 안 되게
                mark_result(sheet, row_num, RESULT_RETRIED)
        except Exception as exc:
            mark_fail += 1
            logger.error("시트 마킹 실패: row=%d ok=%s error=%s", row_num, ok, exc)

    elapsed = time.time() - started_at
    logger.info(
        "처리 완료: 신규 성공/실패 %d/%d · 재발송 성공/실패 %d/%d · 시트 마킹 실패 %d",
        new_ok, new_fail, retry_ok, retry_fail, mark_fail,
    )
    if new_fail or retry_fail or mark_fail:
        logger.error(
            "실패 : %.1f초 (send_fail=%d, retry_fail=%d, mark_fail=%d)",
            elapsed, new_fail, retry_fail, mark_fail,
        )
    else:
        logger.info("완료 : %.1f초", elapsed)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="web2form 친구톡 FI 배치 발송")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="전화번호 정규화 검증만 수행하고 발송과 시트 마킹은 스킵",
    )
    args = parser.parse_args()
    main(dry_run=args.dry_run)
