"""모니터 시트 기록 + 스냅샷."""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import gspread

from config import MONITOR_ORPHAN_LOOKBACK_HOURS
from delivery_planner import Plan, _parse_submitted_at, _cell
from google_sheets import ensure_monitor_sheet

logger = logging.getLogger(__name__)

KST = timezone(timedelta(hours=9))


@dataclass
class Snapshot:
    pending_count: int = 0
    duplicate_count: int = 0
    invalid_phone_count: int = 0
    orphan_completed_count: int = 0
    oldest_pending_at: datetime | None = None
    oldest_pending_text: str = "-"


@dataclass
class RunResult:
    status: str = ""  # completed, no_candidates, no_data, sheet_not_found
    candidate_count: int = 0
    sent_count: int = 0
    unsupported: list = None
    fail_count: int = 0
    fail_details: list = None
    dup_count: int = 0
    invalid_phone_count: int = 0

    def __post_init__(self):
        if self.unsupported is None:
            self.unsupported = []
        if self.fail_details is None:
            self.fail_details = []


def take_snapshot(data: list[list], notes: list[list[str]], plan: Plan) -> Snapshot:
    """현재 미처리 건수, 접수누락위험 등을 계산한다."""
    snap = Snapshot()
    snap.pending_count = len(plan.candidates) + len(plan.invalid_phones) + len(plan.invalid_addresses)
    snap.duplicate_count = len(plan.duplicates)
    snap.invalid_phone_count = len(plan.invalid_phones)

    # 가장 오래된 미처리
    pending_entries = (
        [c.index for c in plan.candidates]
        + [p.index for p in plan.invalid_phones]
        + [a.index for a in plan.invalid_addresses]
    )
    for idx in pending_entries:
        submitted_at = _parse_submitted_at(data[idx][0] if idx < len(data) else None)
        if not submitted_at:
            continue
        if snap.oldest_pending_at is None or submitted_at < snap.oldest_pending_at:
            snap.oldest_pending_at = submitted_at

    if snap.oldest_pending_at:
        snap.oldest_pending_text = snap.oldest_pending_at.strftime("%m/%d %H:%M")

    # 접수누락위험: H=배송완료인데 bookId가 없고 배송불가도 아닌 행
    # → 실제 두발히어로 접수가 안 됐을 수 있는 이상 상태. 자동 복구는 안 하고 경보만.
    cutoff = datetime.now(KST) - timedelta(hours=MONITOR_ORPHAN_LOOKBACK_HOURS)
    for j, row in enumerate(data):
        status = _cell(row, 7)
        book_id = _cell(row, 8)
        note = notes[j][0] if j < len(notes) and notes[j] else ""
        submitted_at = _parse_submitted_at(row[0] if row else None)
        if not submitted_at:
            continue
        if submitted_at.tzinfo is None:
            submitted_at = submitted_at.replace(tzinfo=KST)
        if (
            submitted_at >= cutoff
            and status == "배송완료"
            and not book_id
            and "배송불가" not in note
        ):
            snap.orphan_completed_count += 1

    return snap


def summarize_failures(fail_details: list[str], max_items: int = 5, max_len: int = 500) -> str:
    """실패 상세를 요약한다."""
    if not fail_details:
        return ""
    summary = " | ".join(fail_details[:max_items])
    if len(fail_details) > max_items:
        summary += f" 외 {len(fail_details) - max_items}건"
    if len(summary) > max_len:
        summary = summary[: max_len - 3] + "..."
    return summary


def classify_status(result: RunResult, snapshot: Snapshot | None) -> str:
    """모니터 상태 문구를 분류한다."""
    if not result or not result.status:
        return "결과없음"
    if snapshot and snapshot.orphan_completed_count > 0:
        return "접수누락위험 있음"
    if result.status == "completed":
        if result.fail_count > 0:
            return "실패 포함"
        if snapshot and snapshot.pending_count > 0:
            return "잔여 미처리 있음"
        if result.unsupported:
            return "배송불가 포함 완료"
        return "정상 완료"
    if result.status == "no_candidates":
        return "대상 없음"
    if result.status == "no_data":
        return "데이터 없음"
    if result.status == "sheet_not_found":
        return "시트 없음"
    return result.status


def append_log(
    ss: gspread.Spreadsheet,
    mode: str,
    result: RunResult,
    elapsed_s: float,
    snapshot: Snapshot | None,
) -> None:
    """모니터 시트에 실행 결과 행을 추가한다."""
    sheet = ensure_monitor_sheet(ss)
    completed_count = result.sent_count + len(result.unsupported)
    now_text = datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S")

    row = [
        now_text,
        mode,
        classify_status(result, snapshot),
        result.candidate_count,
        result.dup_count,
        completed_count,
        len(result.unsupported),
        result.fail_count,
        snapshot.pending_count if snapshot else "",
        snapshot.orphan_completed_count if snapshot else "",
        snapshot.oldest_pending_text if snapshot else "",
        round(elapsed_s, 1),
        summarize_failures(result.fail_details),
    ]
    sheet.append_row(row, value_input_option="USER_ENTERED")
