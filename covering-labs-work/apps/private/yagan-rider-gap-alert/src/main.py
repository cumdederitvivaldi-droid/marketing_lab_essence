import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone

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

_KST = timezone(timedelta(hours=9))


def main() -> None:
    started_at = time.time()
    logger.info("시작")

    now_kst = datetime.now(_KST)
    if now_kst.hour == 22 and now_kst.minute < 30:
        logger.info("처리 완료: 신규 알림 0명 / 오류 0건")
        logger.info(f"완료 : {time.time() - started_at:.1f}초")
        return

    import config
    config._load_env_file()  # crontab 실행 환경에서 /shared/.env 로딩 보장
    import bq_client
    import slack_client
    import state_manager

    if not config.SLACK_BOT_TOKEN:
        raise RuntimeError("SLACK_BOT_TOKEN 환경변수가 설정되지 않았습니다.")

    state = state_manager.load()
    logger.info(f"세션: {state['session_date']} / 기발송: {len(state['alerted'])}명")

    candidates = bq_client.fetch_stalled_riders()
    logger.info(f"BigQuery 조회 완료: 조건 충족 {len(candidates)}명")

    new_riders = state_manager.filter_new(candidates, state)
    logger.info(f"신규 알림 대상: {len(new_riders)}명")

    if new_riders:
        slack_client.send_alert(new_riders)
        logger.info("Slack 전송 완료")
        state = state_manager.mark_alerted(new_riders, state)
        state_manager.save(state)

    elapsed = time.time() - started_at
    logger.info(f"처리 완료: 신규 알림 {len(new_riders)}명 / 오류 0건")
    logger.info(f"완료 : {elapsed:.1f}초")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        logger.error(f"실패: {exc}", exc_info=True)
        raise SystemExit(1) from None
