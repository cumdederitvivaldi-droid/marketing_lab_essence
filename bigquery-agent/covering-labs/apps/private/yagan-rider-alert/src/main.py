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
        logging.StreamHandler(),
        logging.FileHandler(os.path.join(LOG_DIR, "batch.log")),
    ],
)
logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main() -> None:
    started_at = time.time()
    logger.info("시작")

    import config
    import bq_client
    import slack_client

    if not config.SLACK_BOT_TOKEN:
        raise RuntimeError("SLACK_BOT_TOKEN 환경변수가 설정되지 않았습니다.")

    riders = bq_client.fetch_riders_without_completion()
    logger.info(f"BigQuery 조회 완료: 미완료 기사 {len(riders)}명")

    slack_client.send_alert(riders)
    logger.info("Slack 전송 완료")

    elapsed = time.time() - started_at
    logger.info(f"처리 완료: 미완료 기사 {len(riders)}명, 오류 0건")
    logger.info(f"완료 : {elapsed:.1f}초")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        logger.error(f"실패: {exc}", exc_info=True)
        logger.info("처리 실패: 미완료 기사 0명, 오류 1건")
        raise SystemExit(1) from None
