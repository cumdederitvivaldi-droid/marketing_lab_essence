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

    import config
    config._load_env_file()
    import bq_client
    import slack_client

    if not config.SLACK_BOT_TOKEN:
        raise RuntimeError("SLACK_BOT_TOKEN 환경변수가 설정되지 않았습니다.")

    now_kst = datetime.now(_KST)
    # 08:00 기준 → 전날(야간 수거일) 날짜
    target_date = (now_kst - timedelta(days=1)).strftime("%Y-%m-%d")
    # WoW 비교: 7일 전 같은 날
    prev_date = (now_kst - timedelta(days=8)).strftime("%Y-%m-%d")

    logger.info(f"집계 대상: {target_date}  비교 기준: {prev_date}")

    today = bq_client.fetch_stats(target_date)
    prev = bq_client.fetch_stats(prev_date)
    logger.info(
        f"오늘({target_date}) 총 {today['total']}건 — "
        f"완료 {today['completed']} / 확인전체 {today['check_all']} / "
        f"확인일부 {today['check_partial']} / 취소 {today['user_canceled']} / "
        f"정책 {today['policy_fail']} / 미배출 {today['notfound_fail']} / 진입실패 {today['enter_fail']}"
    )

    item_reasons = bq_client.fetch_item_reasons(target_date)
    policy_reasons = bq_client.fetch_policy_reasons(target_date)
    logger.info(
        f"사유 조회 완료: 확인필요 {len(item_reasons)}종 / 정책미준수 {len(policy_reasons)}종"
    )

    slack_client.send_report(today, prev, item_reasons, policy_reasons)
    logger.info("Slack 전송 완료")

    elapsed = time.time() - started_at
    logger.info(f"처리 완료: 대형봉투 {today['total']}건")
    logger.info(f"완료 : {elapsed:.1f}초")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        logger.error(f"실패: {exc}", exc_info=True)
        raise SystemExit(1) from None
