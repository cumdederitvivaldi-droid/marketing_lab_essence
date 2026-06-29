import logging
import os
import sys
import time

LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "logs")
os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(os.path.join(LOG_DIR, "batch.log")),
    ],
)
logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main() -> None:
    """도착지별 기사 수를 BigQuery에서 조회해 Slack으로 전송한다."""
    started_at = time.time()
    logger.info("시작")

    import config
    import bq_client
    import slack_client

    if not config.SLACK_BOT_TOKEN:
        raise RuntimeError("SLACK_BOT_TOKEN 환경변수가 설정되지 않았습니다.")
    if not config.SLACK_CHANNEL:
        raise RuntimeError("SEONBYEOL_SLACK_CHANNEL 환경변수가 설정되지 않았습니다.")

    rows = bq_client.fetch_destination_stats()
    total_riders = sum(r["rider_count"] for r in rows)
    logger.info(f"BigQuery 조회 완료: 도착지 {len(rows)}개 / 기사 {total_riders}명")

    slack_client.send_report(rows)
    logger.info("Slack 전송 완료")

    elapsed = time.time() - started_at
    logger.info(f"처리 완료: 기사 {total_riders}명")
    logger.info(f"완료 : {elapsed:.1f}초")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        logger.error(f"실패: {exc}", exc_info=True)
        raise SystemExit(1) from None
