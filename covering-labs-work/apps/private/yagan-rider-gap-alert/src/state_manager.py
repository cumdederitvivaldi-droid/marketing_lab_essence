import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

_STATE_FILE = Path(__file__).parent.parent / "state" / "alert_state.json"
_KST = timezone(timedelta(hours=9))


def _session_date() -> str:
    """야간 세션 기준 날짜 반환.
    22:00~23:59 → 당일 날짜, 00:00~07:59 → 전날 날짜 (같은 야간 세션).
    """
    now = datetime.now(_KST)
    if now.hour < 8:
        return (now - timedelta(days=1)).strftime("%Y-%m-%d")
    return now.strftime("%Y-%m-%d")


def load() -> dict:
    if not _STATE_FILE.exists():
        return {"session_date": _session_date(), "alerted": {}}
    try:
        data = json.loads(_STATE_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"session_date": _session_date(), "alerted": {}}
    # 새 야간 세션이면 초기화 (매일 22:00 리셋)
    if data.get("session_date") != _session_date():
        return {"session_date": _session_date(), "alerted": {}}
    alerted = data.get("alerted")
    if not isinstance(alerted, dict):
        alerted = {}
    return {"session_date": data.get("session_date", _session_date()), "alerted": alerted}


def save(state: dict) -> None:
    _STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    _STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def filter_new(riders: list[dict], state: dict) -> list[dict]:
    """이미 같은 last_completed_time으로 알림 발송한 기사 제외."""
    alerted = state.get("alerted", {})
    return [
        r for r in riders
        if alerted.get(str(r["rider_id"])) != r["last_completed_time"]
    ]


def mark_alerted(riders: list[dict], state: dict) -> dict:
    state.setdefault("alerted", {})
    for r in riders:
        state["alerted"][str(r["rider_id"])] = r["last_completed_time"]
    return state
