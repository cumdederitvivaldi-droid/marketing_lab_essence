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
    RESULT_COL,
    MESSAGE_ID_COL,
    RESULT_SUCCESS,
    RESULT_FAILURE,
    RESULT_RETRIED,
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
RESULT_IDX = _col_to_index(RESULT_COL)
MESSAGE_ID_IDX = _col_to_index(MESSAGE_ID_COL)
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


def _row_field(row: list[str], idx: int) -> str:
    return row[idx].strip() if idx < len(row) else ""


def find_pending_rows(
    sheet: gspread.Worksheet,
) -> list[tuple[int, str, str]]:
    """전화번호는 있고 결과(H열)가 비어 있는 행 — 신규 발송 대기.

    Returns:
        [(sheet_row_1based, phone, nickname), ...]
    """
    all_values = sheet.get_all_values()
    if len(all_values) <= 1:
        return []

    pending: list[tuple[int, str, str]] = []
    for i, row in enumerate(all_values[1:], start=2):
        phone = _row_field(row, PHONE_IDX)
        nickname = _row_field(row, NICKNAME_IDX)
        result = _row_field(row, RESULT_IDX)

        if phone and not result:
            pending.append((i, phone, nickname))
    return pending


def find_retry_rows(
    sheet: gspread.Worksheet,
) -> list[tuple[int, str, str]]:
    """결과(H열)가 '실패'로 마킹된 행 — 1회 재발송 대상.

    `RESULT_RETRIED` ('실패_재시도') 는 이미 재시도 종결이라 제외.
    """
    all_values = sheet.get_all_values()
    if len(all_values) <= 1:
        return []

    retries: list[tuple[int, str, str]] = []
    for i, row in enumerate(all_values[1:], start=2):
        phone = _row_field(row, PHONE_IDX)
        nickname = _row_field(row, NICKNAME_IDX)
        result = _row_field(row, RESULT_IDX)

        if phone and result == RESULT_FAILURE:
            retries.append((i, phone, nickname))
    return retries


def mark_sent(sheet: gspread.Worksheet, row_num: int) -> None:
    """G열 = SENT_MARKER ('O') 마킹. API 호출 성공 시 사용."""
    cell = f"{SENT_COL}{row_num}"
    sheet.update(cell, [[SENT_MARKER]])
    logger.debug("API 호출 성공 마킹: %s", cell)


def mark_result(sheet: gspread.Worksheet, row_num: int, value: str) -> None:
    """H열 (발송 성공 여부) = '큐잉됨' | '실패' | '실패_재시도' 마킹."""
    cell = f"{RESULT_COL}{row_num}"
    sheet.update(cell, [[value]])
    logger.debug("결과 마킹: %s = %s", cell, value)


def mark_message_id(sheet: gspread.Worksheet, row_num: int, message_id: str) -> None:
    """J열 = FlareLane 캠페인 ID 마킹. 큐잉됨 마킹과 함께 호출.

    빈 문자열이면 마킹 스킵 — API 응답에 id 필드가 없는 예외 케이스 대비.
    저장된 ID는 FlareLane 콘솔에서 수동 확인하거나 향후 delivery polling 구현 시
    lookup key로 활용한다.
    """
    if not message_id:
        return
    cell = f"{MESSAGE_ID_COL}{row_num}"
    sheet.update(cell, [[message_id]])
    logger.debug("message_id 마킹: %s = %s", cell, message_id)


# 외부 import 편의용 export
__all__ = [
    "open_sheet",
    "find_pending_rows",
    "find_retry_rows",
    "mark_sent",
    "mark_result",
    "mark_message_id",
    "RESULT_SUCCESS",
    "RESULT_FAILURE",
    "RESULT_RETRIED",
]
