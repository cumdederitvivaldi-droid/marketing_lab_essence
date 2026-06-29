"""웹폼 전화번호 → FlareLane 알림톡 자동 발송 배치."""

from __future__ import annotations

import logging
import time
from pathlib import Path

LOG_DIR = Path(__file__).resolve().parents[1] / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_DIR / "batch.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)

from config import FLARELANE_PROJECT_ID, FLARELANE_API_KEY
from sheets import open_sheet, find_pending_rows, mark_sent
from flarelane import send_alimtalk


def main() -> None:
    started_at = time.time()
    logger.info("시작")

    if not FLARELANE_PROJECT_ID or not FLARELANE_API_KEY:
        logger.error("FLARELANE 환경변수 누락 — 배치 중단")
        elapsed = time.time() - started_at
        logger.info("완료 : %.1f초 (설정 오류로 중단)", elapsed)
        return

    _, sheet = open_sheet()
    pending = find_pending_rows(sheet)

    if not pending:
        elapsed = time.time() - started_at
        logger.info("발송 대기 건 없음")
        logger.info("완료 : %.1f초", elapsed)
        return

    logger.info("발송 대기: %d건", len(pending))

    sent = 0
    failed = 0

    for row_num, phone, nickname in pending:
        masked = phone[:3] + "****" + phone[-4:] if len(phone) >= 7 else phone
        try:
            success = send_alimtalk(phone, nickname)
            if success:
                mark_sent(sheet, row_num)
                sent += 1
                logger.info("발송 완료: row=%d phone=%s", row_num, masked)
            else:
                failed += 1
                logger.warning("발송 실패: row=%d phone=%s", row_num, masked)
        except Exception as exc:
            failed += 1
            logger.error("오류 발생: row=%d phone=%s error=%s", row_num, masked, exc)

    elapsed = time.time() - started_at
    logger.info("처리 완료: %d건 발송 / %d건 실패", sent, failed)
    logger.info("완료 : %.1f초", elapsed)


if __name__ == "__main__":
    main()
