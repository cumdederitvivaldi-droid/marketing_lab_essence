"""Google Sheets 읽기/쓰기."""

import logging

import google.auth
import gspread

from config import SPREADSHEET_ID, SHEET_GID, MONITOR_SHEET_NAME, MONITOR_HEADERS

logger = logging.getLogger(__name__)

_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]


def _authorize() -> gspread.Client:
    creds, _ = google.auth.default(scopes=_SCOPES)
    return gspread.authorize(creds)


def open_sheet() -> tuple[gspread.Spreadsheet, gspread.Worksheet]:
    """운영 시트를 열고 (Spreadsheet, 배송 시트)를 반환한다."""
    gc = _authorize()
    ss = gc.open_by_key(SPREADSHEET_ID)
    sheet = None
    for ws in ss.worksheets():
        if ws.id == SHEET_GID:
            sheet = ws
            break
    if sheet is None:
        raise RuntimeError(f"시트를 찾을 수 없습니다 (gid: {SHEET_GID})")
    return ss, sheet


def read_data(sheet: gspread.Worksheet) -> tuple[list[list], list[list[str]]]:
    """A~K열 데이터(2행부터)와 H열 notes를 반환한다."""
    all_values = sheet.get_all_values()
    if len(all_values) <= 1:
        return [], []
    data = all_values[1:]  # 헤더 제외

    # H열 notes (1-indexed: row 2~, col 8)
    last_row = len(all_values)
    try:
        notes = sheet.get_notes(f"H2:H{last_row}")
    except Exception:
        logger.warning("H열 notes 조회 실패, 빈 값으로 대체")
        notes = [[""] for _ in data]

    # notes 길이 맞추기
    while len(notes) < len(data):
        notes.append([""])

    return data, notes


def flush_state(
    sheet: gspread.Worksheet,
    dirty_indexes: list[int],
    status_values: list[str],
    status_notes: list[str],
    book_id_values: list[str],
    product_values: list[str],
) -> None:
    """변경된 행의 H/I/J열과 H열 note를 시트에 반영한다.
    이미 H/I/J 중 하나라도 기입된 행은 건드리지 않는다."""
    if not dirty_indexes:
        return

    dirty_indexes = sorted(dirty_indexes)
    min_idx = dirty_indexes[0]
    max_idx = dirty_indexes[-1]
    min_row = min_idx + 2  # 0-based data index → 1-based sheet row (헤더 +1)
    height = max_idx - min_idx + 1

    # 현재 시트 값 읽기: H~I열 (col 8~9)
    hi_range = f"H{min_row}:I{min_row + height - 1}"
    current_hi = sheet.get(hi_range)
    while len(current_hi) < height:
        current_hi.append(["", ""])
    for row in current_hi:
        while len(row) < 2:
            row.append("")

    # J열 (col 10)
    j_range = f"J{min_row}:J{min_row + height - 1}"
    current_j = sheet.get(j_range)
    while len(current_j) < height:
        current_j.append([""])
    for row in current_j:
        while len(row) < 1:
            row.append("")

    # H열 notes
    note_range = f"H{min_row}:H{min_row + height - 1}"
    try:
        current_notes = sheet.get_notes(note_range)
    except Exception:
        current_notes = [[""] for _ in range(height)]
    while len(current_notes) < height:
        current_notes.append([""])

    dirty_set = set(dirty_indexes)
    hi_updates = []
    j_updates = []
    note_updates = []

    for i in range(min_idx, max_idx + 1):
        if i not in dirty_set:
            continue
        offset = i - min_idx

        # H 또는 I열에 값이 있으면 skip — 배송완료/bookId 기록은 재실행으로 덮어쓰지 않음
        # J열은 제외 사유 기록 용도이므로 skip 조건에서 제외:
        # J열만 있는 행(이전 중복/형식이상 사유)에 API 접수가 완료되면 H/I를 기록해야 함
        existing_h = str(current_hi[offset][0] or "").strip()
        existing_i = str(current_hi[offset][1] or "").strip()
        if existing_h or existing_i:
            continue

        row_num = i + 2
        hi_updates.append({
            "range": f"H{row_num}:I{row_num}",
            "values": [[status_values[i], book_id_values[i]]],
        })
        j_updates.append({
            "range": f"J{row_num}",
            "values": [[product_values[i]]],
        })
        note_updates.append({
            "range": f"H{row_num}",
            "values": [[status_notes[i] or ""]],
        })

    if hi_updates or j_updates:
        for attempt in range(2):
            try:
                sheet.batch_update(hi_updates + j_updates)
                break
            except BrokenPipeError:
                if attempt == 0:
                    logger.warning("Google Sheets BrokenPipe (batch_update) — 재연결 후 재시도")
                    import time
                    time.sleep(2)
                    _, sheet = open_sheet()
                else:
                    raise
    if note_updates:
        for attempt in range(2):
            try:
                sheet.update_notes(
                    {u["range"]: u["values"][0][0] for u in note_updates}
                )
                break
            except BrokenPipeError:
                if attempt == 0:
                    logger.warning("Google Sheets BrokenPipe (update_notes) — 재연결 후 재시도")
                    import time
                    time.sleep(2)
                    _, sheet = open_sheet()
                else:
                    raise


def ensure_monitor_sheet(ss: gspread.Spreadsheet) -> gspread.Worksheet:
    """모니터 시트를 확인/생성하고 반환한다."""
    try:
        ws = ss.worksheet(MONITOR_SHEET_NAME)
    except gspread.WorksheetNotFound:
        ws = ss.add_worksheet(title=MONITOR_SHEET_NAME, rows=1000, cols=len(MONITOR_HEADERS))
        ws.update("A1:M1", [MONITOR_HEADERS])
        logger.info(f"모니터 시트 '{MONITOR_SHEET_NAME}' 생성 완료")
    return ws
