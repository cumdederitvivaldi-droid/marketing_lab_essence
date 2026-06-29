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
    config._load_env_file()  # crontab 실행 환경에서 /shared/.env 로딩 보장
    import bq_client
    import slack_client

    if not config.SLACK_BOT_TOKEN:
        raise RuntimeError("SLACK_BOT_TOKEN 환경변수가 설정되지 않았습니다.")

    summary = bq_client.fetch_large_bag_summary()
    logger.info(f"조회 완료: 전체 {summary['total_count']}건 / 완료 {summary['done_count']}건 / 미완료 {summary['pending_count']}건")

    slack_client.send_report(summary)
    logger.info("Slack 전송 완료")

    elapsed = time.time() - started_at
    logger.info(f"처리 완료: 대형봉투수거 {summary['total_count']}건")
    logger.info(f"완료 : {elapsed:.1f}초")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        logger.error(f"실패: {exc}", exc_info=True)
        raise SystemExit(1) from None
