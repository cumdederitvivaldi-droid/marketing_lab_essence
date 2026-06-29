"""1회용 마이그레이션: H열이 비어 있는 모든 row를 '실패'로 일괄 마킹.

배경
----
targeting=M 파라미터 누락으로 누적된 시트 row의 카카오 도달은 모두 실패. G='O'로
마킹되어 있어도 실제로는 전송되지 않은 상태. 새 코드 배포 직후 이 스크립트를
1회 실행하면 H='실패' 일괄 적용되고, 다음 cron tick에서 find_retry_rows()가
픽업해 targeting=M 적용된 새 코드로 자동 재발송한다.

실행 (VM 1회만)
----------------
    cd /shared/apps/web2form-alimtalk-batch
    sudo -u sa_109369409955768144646 python3 scripts/migrate_empty_h_to_failure.py --dry-run
    sudo -u sa_109369409955768144646 python3 scripts/migrate_empty_h_to_failure.py

야간(21:00~08:00)이라도 FlareLane이 자동 큐잉하므로 시점 무관.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

# src/ 디렉토리를 import path에 추가 (config, sheets 모듈 재사용)
SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC))

from sheets import open_sheet  # noqa: E402
from config import PHONE_COL, RESULT_COL, RESULT_FAILURE  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def _col_to_index(letter: str) -> int:
    letter = letter.upper().strip()
    result = 0
    for ch in letter:
        result = result * 26 + (ord(ch) - ord("A") + 1)
    return result - 1


def main(dry_run: bool) -> None:
    phone_idx = _col_to_index(PHONE_COL)
    result_idx = _col_to_index(RESULT_COL)

    _, sheet = open_sheet()
    all_values = sheet.get_all_values()
    if len(all_values) <= 1:
        logger.info("시트가 비어 있어 마이그레이션 대상 없음")
        return

    targets: list[int] = []
    for i, row in enumerate(all_values[1:], start=2):
        phone = row[phone_idx].strip() if phone_idx < len(row) else ""
        result = row[result_idx].strip() if result_idx < len(row) else ""
        if phone and not result:
            targets.append(i)

    if not targets:
        logger.info("H열 빈 row 없음 (마이그레이션 대상 없음)")
        return

    logger.info("마이그레이션 대상: %d행 (H열을 '%s'로 일괄 마킹)", len(targets), RESULT_FAILURE)

    if dry_run:
        sample = targets[:30] if len(targets) > 30 else targets
        logger.info("[DRY-RUN] 마킹 스킵. 대상 row 샘플(상위 30): %s", sample)
        return

    # batch_update로 한 번에 N개 cell 업데이트 (API 호출 단 1회)
    requests = [
        {"range": f"{RESULT_COL}{r}", "values": [[RESULT_FAILURE]]}
        for r in targets
    ]
    sheet.batch_update(requests)
    logger.info("완료: %d행 H='%s' 마킹", len(targets), RESULT_FAILURE)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="H열 빈 row → '실패' 일괄 마킹 (1회용)")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="실제 마킹 없이 대상 행만 표시",
    )
    args = parser.parse_args()
    main(args.dry_run)
