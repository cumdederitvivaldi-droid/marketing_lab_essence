"""VOC 모니터 파이프라인 — collect → classify → cluster → rank → notify."""
import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from slack_sdk import WebClient

from classifier import classify_unclassified
from clusterer import cluster_new_items
from collector import collect
from config import APP_ROOT, DB_PATH, LOG_PATH, _load_env_file
from notifier import send_daily_brief
from ranker import recalculate_rice
from weekly_cluster import run as run_weekly_cluster
from weekly_notifier import send_weekly_llm_report
from storage import init_db

_load_env_file()
KST = timezone(timedelta(hours=9))

LOCK_DIR = APP_ROOT / "run"
LOCK_FILE = LOCK_DIR / "voc_monitor.lock"
LOCK_STALE_SECONDS = 6 * 60 * 60


def _acquire_lock():
    LOCK_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(LOCK_DIR, 0o700)
    for _ in range(2):
        try:
            fd = os.open(LOCK_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as lock:
                lock.write(str(os.getpid()))
            return
        except FileExistsError:
            try:
                pid_text = LOCK_FILE.read_text(encoding="utf-8").strip()
                stat = LOCK_FILE.stat()
            except FileNotFoundError:
                continue

            try:
                pid = int(pid_text)
            except ValueError:
                pid = None

            lock_age = time.time() - stat.st_mtime
            stale = pid is None or not _pid_is_alive(pid) or lock_age > LOCK_STALE_SECONDS
            if stale:
                logging.warning(f"스테일 lock 제거 (lock={LOCK_FILE}, pid={pid_text or 'unknown'})")
                try:
                    LOCK_FILE.unlink()
                except FileNotFoundError:
                    pass
                continue

            logging.warning(f"이미 실행 중 (lock={LOCK_FILE}, pid={pid}). 종료.")
            sys.exit(0)
    logging.warning(f"lock 획득 실패 (lock={LOCK_FILE}). 종료.")
    sys.exit(0)


def _release_lock():
    try:
        if LOCK_FILE.read_text(encoding="utf-8").strip() == str(os.getpid()):
            LOCK_FILE.unlink(missing_ok=True)
    except FileNotFoundError:
        pass


def _pid_is_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def run_daily():
    """일일 파이프라인: 증분 수집 → 분류 → 클러스터링 → RICE → 발송."""
    _acquire_lock()
    try:
        logging.info("=== VOC 일일 파이프라인 시작 ===")
        init_db()

        n_collect = collect()
        logging.info(f"수집 {n_collect}건")

        n_classify = classify_unclassified()
        logging.info(f"분류 {n_classify}건")

        n_cluster = cluster_new_items()
        logging.info(f"클러스터링 {n_cluster}건")

        recalculate_rice()
        logging.info("RICE 재계산 완료")

        token = os.getenv("SLACK_BOT_TOKEN")
        if token:
            client = WebClient(token=token)
            ch = send_daily_brief(client)
            logging.info(f"일일 브리프 발송 channel={ch}")
        else:
            logging.warning("SLACK_BOT_TOKEN 없음 — 발송 스킵")

        logging.info("완료 : VOC 일일 파이프라인")
    finally:
        _release_lock()


def run_weekly():
    """주간 파이프라인: LLM 클러스터링 → 주간 랭킹 발송."""
    _acquire_lock()
    try:
        logging.info("=== VOC 주간 파이프라인 시작 ===")
        init_db()

        from config import WEEKLY_LOOKBACK_DAYS
        logging.info(f"LLM 클러스터링 시작 (최근 {WEEKLY_LOOKBACK_DAYS}일)")
        clusters = run_weekly_cluster(lookback_days=WEEKLY_LOOKBACK_DAYS)
        logging.info(f"클러스터링 완료: {sum(len(v) for v in clusters.values())}개 그룹")

        token = os.getenv("SLACK_BOT_TOKEN")
        if token:
            client = WebClient(token=token)
            ch = send_weekly_llm_report(client, clusters)
            logging.info(f"주간 랭킹 발송 channel={ch}")
        else:
            logging.warning("SLACK_BOT_TOKEN 없음 — 발송 스킵")

        logging.info("완료 : VOC 주간 파이프라인")
    finally:
        _release_lock()


def run_scheduled():
    """Daily report every run, weekly report only on Mondays."""
    run_daily()
    if datetime.now(KST).weekday() == 0:
        run_weekly()
    else:
        logging.info("월요일이 아니어서 주간 리포트는 스킵")


def run_check():
    """Offline deployment check without Slack/Gemini calls."""
    init_db()
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    logging.info(f"check 완료: db={DB_PATH} log={LOG_PATH}")


if __name__ == "__main__":
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(LOG_PATH, encoding="utf-8"),
        ],
    )
    mode = sys.argv[1] if len(sys.argv) > 1 else "daily"
    if mode == "check":
        run_check()
    elif mode == "weekly":
        run_weekly()
    elif mode == "scheduled":
        run_scheduled()
    else:
        run_daily()
