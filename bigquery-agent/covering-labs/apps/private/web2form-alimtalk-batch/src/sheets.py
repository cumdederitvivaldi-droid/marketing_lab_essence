"""Google Sheets 읽기/쓰기."""

from __future__ import annotations

import logging

import google.auth
import gspread

from config import (
    SPREADSHEET_ID,
    SHEET_GID,
    PHONE_COL,
    NICKNAME_COL,
    SENT_COL,
)

logger = logging.getLogger(__name__)

_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

def _col_to_index(letter: str) -> int:
    """열 알파벳 → 0-based 인덱스. A→0, B→1, C→2 ..."""
    letter = letter.upper().strip()
    result = 0
    for ch in letter:
        result = result * 26 + (ord(ch) - ord("A") + 1)
    return result - 1


PHONE_IDX = _col_to_index(PHONE_COL)
NICKNAME_IDX = _col_to_index(NICKNAME_COL)
SENT_IDX = _col_to_index(SENT_COL)
SENT_MARKER = "O"


def _authorize() -> gspread.Client:
    creds, _ = google.auth.default(scopes=_SCOPES)
    return gspread.Client(auth=creds)


def open_sheet() -> tuple[gspread.Spreadsheet, gspread.Worksheet]:
    gc = _authorize()
    ss = gc.open_by_key(SPREADSHEET_ID)
    for ws in ss.worksheets():
        if ws.id == SHEET_GID:
            return ss, ws
    raise RuntimeError(f"시트를 찾을 수 없습니다 (gid={SHEET_GID})")


def find_pending_rows(
    sheet: gspread.Worksheet,
) -> list[tuple[int, str, str]]:
    """전화번호는 있지만 발송완료 마킹이 없는 행을 반환한다.

    Returns:
        [(sheet_row_1based, phone, nickname), ...]
    """
    all_values = sheet.get_all_values()
    if len(all_values) <= 1:
        return []

    max_needed = max(PHONE_IDX, NICKNAME_IDX, SENT_IDX)
    pending: list[tuple[int, str, str]] = []

    for i, row in enumerate(all_values[1:], start=2):  # 헤더 제외, 2행부터
        while len(row) <= max_needed:
            row.append("")

        phone = row[PHONE_IDX].strip()
        nickname = row[NICKNAME_IDX].strip()
        sent_status = row[SENT_IDX].strip()

        if phone and sent_status != SENT_MARKER:
            pending.append((i, phone, nickname))

    return pending


def mark_sent(sheet: gspread.Worksheet, row_num: int) -> None:
    """지정 행의 발송완료 열에 O를 기록한다."""
    cell = f"{SENT_COL}{row_num}"
    sheet.update(cell, [[SENT_MARKER]])
    logger.debug("발송완료 기록: %s", cell)
