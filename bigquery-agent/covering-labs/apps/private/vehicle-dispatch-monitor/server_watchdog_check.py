"""
서버 watchdog 체크 — GitHub Actions에서 30분마다 실행

Google Sheets M1의 heartbeat 타임스탬프를 읽어,
40분 이상 오래됐으면 Slack에 @멘션 발송.

필요 환경변수:
  SLACK_BOT_TOKEN, SLACK_CHANNEL
  GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SHEETS_KEY_FILE
"""
import logging
import os
import sys
from datetime import datetime, timezone, timedelta

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config
import sheets

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s: %(message)s",
)
logger = logging.getLogger("server_watchdog")

KST = timezone(timedelta(hours=9))
MAX_STALE_MINUTES = 40   # 이 이상 오래된 heartbeat → 서버 다운 판정
MY_SLACK_USER_ID = "U09PTJ5PBDK"  # 서버 다운 시 멘션 대상 (형주님)


def _slack_send(text: str):
    token = config.SLACK_BOT_TOKEN
    if not token:
        logger.warning("SLACK_BOT_TOKEN 미설정")
        return
    resp = requests.post(
        "https://slack.com/api/chat.postMessage",
        headers={"Authorization": f"Bearer {token}"},
        json={"channel": config.SLACK_CHANNEL, "text": text, "link_names": True},
        timeout=10,
    )
    data = resp.json()
    if not data.get("ok"):
        logger.error(f"Slack 발송 실패: {data.get('error')}")
    else:
        logger.info("Slack 알림 발송 완료")


def run():
    heartbeat_str = sheets.get_server_heartbeat()

    if not heartbeat_str:
        logger.info("heartbeat 없음 — 아직 서버 모니터링 시작 전")
        return

    # naive datetime → KST로 간주
    heartbeat_dt = datetime.strptime(heartbeat_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=KST)
    now_kst = datetime.now(KST)
    diff_minutes = (now_kst - heartbeat_dt).total_seconds() / 60

    logger.info(f"마지막 heartbeat: {heartbeat_str} ({diff_minutes:.1f}분 전)")

    if diff_minutes > MAX_STALE_MINUTES:
        text = (
            f":red_circle: *로컬 서버 응답 없음!* <@{MY_SLACK_USER_ID}>\n"
            f"마지막 heartbeat: {heartbeat_str} ({int(diff_minutes)}분 전)\n"
            f"서버 꺼진 것 같아요. 배차 자동화 중단 위험! 확인 필요."
        )
        _slack_send(text)
    else:
        logger.info(f"서버 정상 ({diff_minutes:.1f}분 전 heartbeat)")


if __name__ == "__main__":
    os.makedirs(config.LOG_DIR, exist_ok=True)
    run()
