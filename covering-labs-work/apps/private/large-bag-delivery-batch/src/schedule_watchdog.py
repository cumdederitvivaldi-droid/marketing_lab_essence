"""자동 실행 감시 — 해당 슬롯에 자동 접수가 실행되었는지 확인."""

import logging
import time
from datetime import datetime, timedelta, timezone

import gspread

from config import WATCHDOG_SPECS, load_config
from delivery_monitor import Snapshot, take_snapshot
from delivery_planner import _parse_submitted_at, build_plan
from google_sheets import open_sheet, read_data, ensure_monitor_sheet
from slack_notifier import build_watchdog_text, send_notifications

logger = logging.getLogger(__name__)

KST = timezone(timedelta(hours=9))


def _has_auto_run_for_slot(
    monitor_sheet: gspread.Worksheet,
    slot_spec: dict,
    now: datetime,
) -> bool:
    """오늘 해당 슬롯 시간대에 '자동' 실행 기록이 있는지 확인."""
    rows = monitor_sheet.get_all_values()
    if len(rows) <= 1:
        return False

    today_key = now.strftime("%Y-%m-%d")
    window_start = slot_spec["window_start"]
    window_end = slot_spec["window_end"]

    for row in reversed(rows[1:]):
        ran_at = _parse_submitted_at(row[0] if row else None)
        if not ran_at:
            continue
        mode = str(row[1] if len(row) > 1 else "").strip()
        if mode != "자동":
            continue
        if ran_at.tzinfo is None:
            ran_at = ran_at.replace(tzinfo=KST)
        if ran_at.strftime("%Y-%m-%d") != today_key:
            continue
        # cron ±15분 오차를 허용하기 위해 1시간 범위(예: 10:00~10:59)로 판정
        minutes_of_day = ran_at.hour * 60 + ran_at.minute
        if window_start <= minutes_of_day <= window_end:
            return True

    return False


def _append_watchdog_log(
    ss: gspread.Spreadsheet,
    status: str,
    detail: str,
    elapsed_s: float,
    snapshot: Snapshot | None,
) -> None:
    sheet = ensure_monitor_sheet(ss)
    now_text = datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S")
    row = [
        now_text,
        "자동감시",
        status,
        "",  # 접수후보
        "",  # 중복제외
        "",  # 접수완료
        "",  # 배송불가판정
        "",  # 실패
        snapshot.pending_count if snapshot else "",
        snapshot.orphan_completed_count if snapshot else "",
        snapshot.oldest_pending_text if snapshot else "",
        round(elapsed_s, 1),
        detail,
    ]
    sheet.append_row(row, value_input_option="USER_ENTERED")


def run(slot_key: str) -> dict:
    """감시 실행. 자동 접수 미실행 시 슬랙 경보."""
    slot_spec = WATCHDOG_SPECS.get(slot_key)
    if not slot_spec:
        raise ValueError(f"알 수 없는 감시 슬롯: {slot_key}")

    config = load_config()
    started_at = time.time()
    ss, sheet = open_sheet()

    # 스냅샷
    snapshot = None
    try:
        data, notes = read_data(sheet)
        plan = build_plan(data, notes)
        snapshot = take_snapshot(data, notes, plan)
    except Exception as e:
        logger.warning(f"[자동감시] 스냅샷 조회 실패: {e}")

    now = datetime.now(KST)
    monitor_sheet = ensure_monitor_sheet(ss)

    # 자동 실행 여부 확인
    if _has_auto_run_for_slot(monitor_sheet, slot_spec, now):
        logger.info(f"[자동감시] {slot_spec['label']} 슬롯 정상")
        return {"status": "ok", "slot": slot_key}

    status = "자동 미실행"
    ws = slot_spec["window_start"]
    we = slot_spec["window_end"]
    detail = (
        f"{slot_spec['label']} 슬롯 "
        f"{ws // 60:02d}:{ws % 60:02d} ~ {we // 60:02d}:{we % 60:02d} "
        f"사이에 `자동` 실행 기록이 없습니다."
    )

    elapsed_s = time.time() - started_at
    _append_watchdog_log(ss, status, detail, elapsed_s, snapshot)
    text = build_watchdog_text(slot_spec, status, detail, snapshot)
    send_notifications(config, text)
    logger.warning(f"[자동감시] {slot_spec['label']} 슬롯 경보: {status} / {detail}")

    return {"status": status, "slot": slot_key, "detail": detail}
