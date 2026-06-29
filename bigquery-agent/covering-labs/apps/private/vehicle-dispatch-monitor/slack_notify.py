"""
슬랙 로그 알림 모듈 - #제품팀_cs_notifications

자동 발송이 정상 동작하는지 CX파트가 모니터링할 수 있도록 슬랙에 로그 전송.
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
import json
import logging
import os
import requests
import config

logger = logging.getLogger("slack")

KST = timezone(timedelta(hours=9))

# 현재 배치의 부모 메시지 ts — 배치 내 모든 알림을 스레드로 묶는 데 사용
_current_batch_ts: str | None = None

_SLACK_STATE_FILE = os.path.expanduser("~/.vehicle_dispatch_slack.json")


def _load_slack_state() -> dict:
    try:
        with open(_SLACK_STATE_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_slack_state(state: dict):
    with open(_SLACK_STATE_FILE, "w") as f:
        json.dump(state, f)


def _today_str() -> str:
    return datetime.now(KST).strftime("%Y-%m-%d")


def _get_today_state() -> dict:
    today = _today_str()
    state = _load_slack_state()
    if state.get("date") != today:
        return {"date": today}
    return state


def _mark_notification_once(key: str) -> bool:
    """같은 날짜에 같은 알림 키는 1회만 발송."""
    state = _get_today_state()
    sent_keys = set(state.get("sent_keys", []))
    if key in sent_keys:
        return False
    sent_keys.add(key)
    state["sent_keys"] = sorted(sent_keys)
    _save_slack_state(state)
    return True


def _get_run_label() -> str:
    """현재 KST 시각으로 배치 레이블 반환"""
    return datetime.now(KST).strftime("%H:%M") + " 배치"


def send_evening_start():
    """
    저녁 배치 부모 메시지 생성 (run_loop 시작 시 1회 호출)
    이후 모든 알림이 이 스레드 아래에 쌓임 + PO 멘션
    """
    global _current_batch_ts
    now = datetime.now(KST)
    date_str = now.strftime("%m/%d")
    today = now.strftime("%Y-%m-%d")
    state = _get_today_state()
    saved_thread_ts = state.get("thread_ts") if state.get("date") == today else None

    if saved_thread_ts:
        _current_batch_ts = saved_thread_ts
        return

    _current_batch_ts = None
    text = (
        f":rocket: *차량번호 자동화 시작* — {date_str} 저녁 배치"
    )
    ts = _post_message(text, link_names=True)
    if ts:
        _current_batch_ts = ts
        _save_slack_state({"date": today, "thread_ts": ts})


def send_run_start():
    """
    배치 실행 시작 알림
    - _current_batch_ts가 이미 있으면 → 스레드 reply (loop 모드)
    - 없으면 → 부모 메시지 생성 (단독 실행)
    """
    global _current_batch_ts
    run_label = _get_run_label()
    if not _mark_notification_once(f"run_start:{run_label}"):
        return
    now_str = datetime.now(KST).strftime("%Y-%m-%d %H:%M")
    text = (
        f":rocket: *차량번호 자동화 시작* — {run_label}\n"
        f"실행 시각: {now_str} KST"
    )
    if _current_batch_ts:
        # loop 모드: 기존 스레드에 reply
        _post_message(text, thread_ts=_current_batch_ts)
    else:
        # 단독 실행: 새 부모 메시지
        _current_batch_ts = _post_message(text)


def send_new_order_detected(order_code: str, phone: str):
    """
    신규 차량등록 태그 감지 시 운영팀 알림
    배차가 필요한 주문이 있다는 것을 운영팀이 인지할 수 있도록 사전 알림
    """
    text = (
        f":bell: *차량등록 요청 감지*\n"
        f"고객 전화번호: {phone or '없음'} | 주문코드: `{order_code}`\n"
        f"배차 후 자동으로 차량번호가 발송됩니다."
    )
    _send(text)


def send_dispatch_log(order_id: str, vehicle_number: str, rider: str, phone: str):
    """
    배차 완료 + 채널톡 자동 발송 로그를 슬랙에 전송

    Args:
        order_id: 주문번호
        vehicle_number: 차량번호
        rider: 라이더 이름
        phone: 고객 전화번호
    """
    text = (
        f":white_check_mark: *차량번호 발송 완료* — {rider} 기사님\n"
        f"차량번호: {vehicle_number}\n"
        f"고객 전화번호: {phone or '없음'}"
    )
    _send(text)


def send_company_vehicle_alert(order_id: str, phone: str, rider: str):
    """
    회사차량 배차 시 슬랙 CX파트 멘션 알림
    차량번호 미확정 → CX파트 담당자 멘션 + 수동 발송 안내
    """
    sheet_id = config.GOOGLE_SHEETS_SPREADSHEET_ID
    sheet_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit" if sheet_id else ""
    text = (
        f":truck: *회사차량 배차* — {rider} 기사님\n"
        f"고객 전화번호: {phone or '없음'}\n"
        f"{config.SLACK_CX_MENTION} 회사차량이라 차량번호 확인 후 고객에게 안내 부탁드립니다!"
    )
    if sheet_url:
        text += f"\n시트: {sheet_url}"
    _send(text, link_names=True)


def send_manual_required_alert(orders: list):
    """
    수동처리 필요 건 상세 알림 (1회만 발송, 중복 없음)

    Args:
        orders: [{"phone", "order_code", "fail_reason", "row_index"(옵션), "chat_id"(옵션)}, ...]
    """
    if not orders:
        return

    filtered_orders = []
    for order in orders:
        key = "|".join(
            [
                "manual",
                order.get("chat_id", ""),
                order.get("order_code", ""),
                order.get("phone", ""),
                order.get("fail_reason", ""),
            ]
        )
        if _mark_notification_once(key):
            filtered_orders.append(order)

    if not filtered_orders:
        return
    orders = filtered_orders

    lines = []
    for o in orders:
        phone = o.get("phone") or "없음"
        code = o.get("order_code") or "주문번호 없음"
        reason = o.get("fail_reason") or "—"
        row_info = f"{o['row_index']}행" if o.get("row_index") else f"상담 {o.get('chat_id', '?')}"
        lines.append(f"• {phone} | {code} | {reason} | {row_info}")

    sheet_id = config.GOOGLE_SHEETS_SPREADSHEET_ID
    sheet_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit" if sheet_id else ""
    text = (
        f":rotating_light: *수동 처리 필요* ({len(orders)}건)\n"
        + "\n".join(lines)
        + f"\n확인 후 수동 발송해주세요."
    )
    if sheet_url:
        text += f"\n시트: {sheet_url}"
    _send(text, link_names=True)


def send_error_log(message: str):
    """에러 발생 시 슬랙에 알림 (민감 정보 포함 금지)"""
    sheet_id = config.GOOGLE_SHEETS_SPREADSHEET_ID
    sheet_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit" if sheet_id else ""
    text = (
        f":rotating_light: *오류 발생 — 수동 확인 필요*\n"
        f"{message}\n"
        f"확인 후 해당 고객 수동 발송해주세요."
    )
    if sheet_url:
        text += f"\n시트: {sheet_url}"
    _send(text, link_names=True)


def send_summary(
    total_detected: int,
    total_dispatched: int,
    total_sent: int,
    error_count: int = 0,
    extraction_failed: int = 0,
    today_summary: dict | None = None,  # CHANGED: 당일 누적 집계 파라미터 추가
    keep_thread: bool = False,
):
    """
    배치 실행 완료 요약 — 항상 발송 (시스템 정상 작동 여부 확인)

    Args:
        total_detected: 새로 감지된 상담 수 (추출 성공 건)
        total_dispatched: 배차 확인된 주문 수
        total_sent: 채널톡 발송 완료 수
        error_count: 처리 중 에러 발생 수
        extraction_failed: 주문코드 추출 실패 건수 (CX팀 수동처리 필요)
        today_summary: 당일 누적 집계 딕셔너리
    """
    run_label = _get_run_label()
    if not _mark_notification_once(f"summary:{run_label}"):
        return
    sheet_id = config.GOOGLE_SHEETS_SPREADSHEET_ID
    sheet_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit" if sheet_id else ""

    if error_count > 0:
        icon = ":rotating_light:"
        title = f"*{run_label} 완료 (시스템 오류)*"
    else:
        icon = ":bar_chart:"
        title = f"*{run_label} 완료*"

    lines = [f"{icon} {title}"]

    # CHANGED: 이번 배치 요약
    batch_summary_parts = [
        f"감지 {total_detected}",
        f"배차 {total_dispatched}",
        f"발송 {total_sent}",
        f"에러 {error_count}",
    ]
    lines.append(f"‣ *이번 배치*: " + " / ".join(batch_summary_parts))

    # CHANGED: 오늘 누적 요약
    if today_summary:
        summary_parts = [
            f"발송완료 {today_summary.get('completed', 0)}",
            f"배차대기 {today_summary.get('waiting_dispatch', 0)}",
            f"유저취소 {today_summary.get('cancelled', 0)}",
            f"수동처리 {today_summary.get('manual_required', 0)}",
            f"익일수거 {today_summary.get('tomorrow_pickup', 0)}",
        ]
        lines.append(f"‣ *오늘 누적*: " + " / ".join(summary_parts))


    if sheet_url:
        lines.append(f"시트: {sheet_url}")

    _send("\n".join(lines))

    # keep_thread=True면 스레드 유지 (loop 모드에서 다음 배치도 같은 스레드)
    global _current_batch_ts
    if not keep_thread:
        _current_batch_ts = None


def _post_message(text: str, thread_ts: str | None = None, link_names: bool = False) -> str | None:
    """
    슬랙 메시지 발송 (chat.postMessage API)
    thread_ts 있으면 스레드 reply, 없으면 standalone
    Returns: 발송된 메시지의 ts (스레드 부모용), 실패 시 None
    """
    if not config.SLACK_BOT_TOKEN:
        logger.warning("SLACK_BOT_TOKEN이 설정되지 않았습니다")
        return None

    payload = {"channel": config.SLACK_CHANNEL, "text": text}
    if link_names:
        payload["link_names"] = True
    if thread_ts:
        payload["thread_ts"] = thread_ts

    try:
        resp = requests.post(
            "https://slack.com/api/chat.postMessage",
            headers={"Authorization": f"Bearer {config.SLACK_BOT_TOKEN}"},
            json=payload,
            timeout=5,
        )
        data = resp.json()
        if not data.get("ok"):
            logger.error(f"슬랙 발송 실패: {data.get('error')}")
            return None
        return data.get("ts")
    except Exception as e:
        logger.error(f"슬랙 발송 에러: {e}")
        return None


def _send(text: str, link_names: bool = False):
    """현재 배치 스레드에 발송 (배치 외부에서는 standalone)"""
    _post_message(text, thread_ts=_current_batch_ts, link_names=link_names)
