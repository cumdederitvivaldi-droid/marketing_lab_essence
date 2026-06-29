"""
로컬 서버 모니터링 heartbeat

crontab (GCP)으로 18:00~23:30 KST 매 30분 실행.
- Slack 일별 스레드에 상태 reply 쌓기
- Google Sheets M1에 마지막 heartbeat 타임스탬프 기록
  (GitHub Actions watchdog이 읽어서 서버 다운 감지에 활용)

Slack thread 상태는 ~/.dispatch_monitor_state.json에 캐시.
"""
import json
import logging
import os
import socket
import sys
from datetime import datetime, timezone, timedelta
from typing import Optional

import requests

# vehicle-dispatch-monitor 패키지 경로
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config
import sheets

KST = timezone(timedelta(hours=9))

MONITOR_START = (20, 30)  # 20:30 KST
MONITOR_END   = (23, 0)   # 23:00 KST
STATE_FILE = os.path.expanduser("~/.dispatch_monitor_state.json")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s: %(message)s",
)
logger = logging.getLogger("server_monitor")


# ── 시간 유틸 ─────────────────────────────────────────────

def _now_kst() -> datetime:
    return datetime.now(KST)


def _get_current_host() -> str:
    """현재 머신명 반환 (GCP VM — socket.gethostname() 사용)."""
    return socket.gethostname().strip().removesuffix(".local")


def _is_active_time(now: datetime) -> bool:
    start_min = MONITOR_START[0] * 60 + MONITOR_START[1]
    end_min   = MONITOR_END[0]   * 60 + MONITOR_END[1]
    cur_min   = now.hour * 60 + now.minute
    return start_min <= cur_min <= end_min


# ── 상태 파일 ──────────────────────────────────────────────

def _load_state() -> dict:
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_state(state: dict):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


# ── Slack ─────────────────────────────────────────────────

def _slack_post(text: str, thread_ts: str = None) -> Optional[str]:
    """Slack 메시지 발송. 성공 시 ts 반환."""
    token = config.SLACK_BOT_TOKEN
    if not token:
        logger.warning("SLACK_BOT_TOKEN 미설정")
        return None

    payload = {"channel": config.SLACK_CHANNEL, "text": text}
    if thread_ts:
        payload["thread_ts"] = thread_ts

    try:
        resp = requests.post(
            "https://slack.com/api/chat.postMessage",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
            timeout=10,
        )
        data = resp.json()
        if data.get("ok"):
            return data["ts"]
        logger.error(f"Slack 발송 실패: {data.get('error')}")
        return None
    except Exception as e:
        logger.error(f"Slack 발송 에러: {e}")
        return None


# ── 메인 ─────────────────────────────────────────────────

def run():
    now = _now_kst()
    today = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H:%M")

    if not _is_active_time(now):
        logger.info(f"운영 시간 외 ({time_str} KST), 종료")
        return

    # ── 오늘 Slack 스레드 ts 확인 ──
    state = _load_state()
    thread_ts = state.get("thread_ts") if state.get("date") == today else None

    if not thread_ts:
        # 오늘 처음 실행 → parent 메시지 생성
        parent_text = f":desktop_computer: *로컬 서버 모니터링* — {today}"
        ts = _slack_post(parent_text)
        if ts:
            _save_state({"date": today, "thread_ts": ts})
            thread_ts = ts
            logger.info(f"새 Slack 스레드 생성: ts={ts}")

    # ── 상태 reply 발송 ──
    cur_total_min = now.hour * 60 + now.minute
    end_total_min = MONITOR_END[0] * 60 + MONITOR_END[1]
    is_last = cur_total_min >= (end_total_min - 15)  # 마지막 30분 이내

    if is_last:
        reply_text = f":white_check_mark: {time_str} 서버 정상 | 오늘 모니터링 종료"
    else:
        reply_text = f":white_check_mark: {time_str} 서버 정상"

    if thread_ts:
        _slack_post(reply_text, thread_ts=thread_ts)
        logger.info(f"Slack reply 발송: {reply_text}")

    # ── Sheets M1 heartbeat 기록 (watchdog 감시용) ──
    try:
        sheets.update_server_heartbeat()
    except Exception as e:
        logger.error(f"heartbeat Sheets 기록 실패 (무시): {e}")


if __name__ == "__main__":
    # 허용된 머신 검증 (ALLOWED_HOST 필수 — 미설정 또는 불일치 시 종료)
    if not config.ALLOWED_HOST:
        logger.warning("ALLOWED_HOST 미설정 — 종료")
        sys.exit(0)
    current_host = _get_current_host()
    if current_host != config.ALLOWED_HOST:
        logger.warning(f"허용되지 않은 머신 ({current_host}) — 종료 (ALLOWED_HOST={config.ALLOWED_HOST})")
        sys.exit(0)

    # config.init() 생략 — CHANNELTALK 불필요, Sheets+Slack만 사용
    os.makedirs(config.LOG_DIR, exist_ok=True)
    run()
