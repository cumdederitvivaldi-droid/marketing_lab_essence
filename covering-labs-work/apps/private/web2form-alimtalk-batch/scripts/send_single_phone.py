"""단건 발송: 시트에서 특정 전화번호 또는 행 번호를 지정해 FlareLane 메시지 1건 발송.

실행 (VM에서)
-------------
    cd /shared/apps/web2form-alimtalk-batch
    # 전화번호 지정
    sudo -u <SA_USER_ID> python3 scripts/send_single_phone.py --phone <PHONE_NUMBER> --dry-run
    sudo -u <SA_USER_ID> python3 scripts/send_single_phone.py --phone <PHONE_NUMBER>

    # 행 번호 지정
    sudo -u <SA_USER_ID> python3 scripts/send_single_phone.py --row 74 --dry-run
    sudo -u <SA_USER_ID> python3 scripts/send_single_phone.py --row 74
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC))

from config import PHONE_COL, RESULT_COL, RESULT_SUCCESS, RESULT_FAILURE  # noqa: E402
from sheets import open_sheet, mark_result, mark_message_id, mark_sent  # noqa: E402
from flarelane import normalize_phone, _send_one  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def _col_to_index(letter: str) -> int:
    letter = letter.upper().strip()
    result = 0
    for ch in letter:
        result = result * 26 + (ord(ch) - ord("A") + 1)
    return result - 1


def _mask_phone(phone: str) -> str:
    digits = phone.replace("-", "").replace(" ", "")
    if len(digits) >= 7:
        return digits[:3] + "****" + digits[-4:]
    return "***"


def main(target_phone: str | None, target_row: int | None, dry_run: bool) -> None:
    phone_idx = _col_to_index(PHONE_COL)
    result_idx = _col_to_index(RESULT_COL)

    _, sheet = open_sheet()
    all_values = sheet.get_all_values()

    match_row: int | None = None
    raw_phone: str = ""

    if target_row is not None:
        # 행 번호로 직접 지정 (헤더=1행, 데이터 시작=2행)
        if target_row < 2 or target_row > len(all_values):
            logger.error("유효하지 않은 행 번호: %d (시트 총 %d행)", target_row, len(all_values))
            sys.exit(1)
        row_data = all_values[target_row - 1]
        raw_phone = row_data[phone_idx].strip() if phone_idx < len(row_data) else ""
        if not raw_phone:
            logger.error("%d행 전화번호 열(%s)이 비어 있습니다.", target_row, PHONE_COL)
            sys.exit(1)
        match_row = target_row

    else:
        # 전화번호로 검색
        assert target_phone is not None
        try:
            target_e164 = normalize_phone(target_phone)
        except ValueError:
            logger.error("유효하지 않은 전화번호: %s", _mask_phone(target_phone))
            sys.exit(1)

        for i, row in enumerate(all_values[1:], start=2):
            cell_phone = row[phone_idx].strip() if phone_idx < len(row) else ""
            if not cell_phone:
                continue
            try:
                if normalize_phone(cell_phone) == target_e164:
                    match_row = i
                    raw_phone = cell_phone
                    break
            except ValueError:
                continue

        if match_row is None:
            logger.error("시트에서 해당 번호를 찾을 수 없습니다.")
            sys.exit(1)

    try:
        phone_e164 = normalize_phone(raw_phone)
    except ValueError:
        logger.error("전화번호 정규화 실패: %s", _mask_phone(raw_phone))
        sys.exit(1)

    row_data = all_values[match_row - 1]
    current_result = row_data[result_idx].strip() if result_idx < len(row_data) else ""
    masked = _mask_phone(raw_phone)

    logger.info(
        "대상 행: %d행 | 전화번호: %s | 현재 H열: %r",
        match_row, masked, current_result or "(비어있음)",
    )

    if dry_run:
        logger.info("[DRY-RUN] 발송 스킵. 실제 실행 시 --dry-run 제거.")
        return

    ok, info = _send_one(phone_e164)
    summary = (
        f"status={info['status']} id={info['id']} "
        f"selected={info['selected']} sent={info['sent']} failed={info['failed']}"
    )

    if ok:
        mark_result(sheet, match_row, RESULT_SUCCESS)
        mark_message_id(sheet, match_row, info.get("id", ""))
        mark_sent(sheet, match_row)
        logger.info("큐잉 성공: phone=%s %s", masked, summary)
        logger.info("완료 :")
    else:
        mark_result(sheet, match_row, RESULT_FAILURE)
        logger.error("큐잉 실패: phone=%s %s err=%s", masked, summary, info.get("error"))
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="시트에서 특정 번호 또는 행 1건 FlareLane 발송")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--phone", help="발송 대상 전화번호 (예: 010-XXXX-XXXX)")
    group.add_argument("--row", type=int, help="발송 대상 행 번호 (헤더 제외, 예: 74)")
    parser.add_argument("--dry-run", action="store_true", help="실제 발송 없이 대상 행만 확인")
    args = parser.parse_args()
    main(args.phone, args.row, args.dry_run)
