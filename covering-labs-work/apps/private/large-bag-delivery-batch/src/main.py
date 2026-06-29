"""150L 봉투 배송 배치 — 진입점."""

import argparse
import logging
import time
from datetime import datetime, timedelta, timezone
from io import BytesIO

from config import FLUSH_EVERY, TIMEGUARD_S, load_config
from dubalhero_api import send_deliveries
from delivery_monitor import RunResult, Snapshot, append_log, take_snapshot
from delivery_planner import build_plan
from google_sheets import open_sheet, read_data, flush_state
from slack_notifier import build_monitor_text, send_notifications, upload_file_to_channel
from schedule_watchdog import run as run_watchdog

KST = timezone(timedelta(hours=9))
logger = logging.getLogger("bag-delivery")


# ── 배송 접수 ──────────────────────────────────────

def _run_register(dry_run: bool = False) -> None:
    config = load_config()
    started_at = time.time()
    mode = "자동"

    ss, sheet = open_sheet()
    data, notes = read_data(sheet)

    if not data:
        logger.info("[배송 접수] 데이터가 없습니다.")
        result = RunResult(status="no_data")
        _finalize(ss, mode, result, started_at, None)
        return

    plan = build_plan(data, notes)

    candidates = plan.candidates
    duplicates = plan.duplicates
    invalid_phones = plan.invalid_phones
    invalid_addresses = plan.invalid_addresses
    dup_count = len(duplicates)
    invalid_phone_count = len(invalid_phones)
    invalid_address_count = len(invalid_addresses)
    total_candidate_count = len(candidates) + invalid_phone_count + invalid_address_count

    if total_candidate_count == 0:
        logger.info(
            f"[배송 접수] 대상 없음. 중복 제외 {dup_count}건, "
            f"전화번호 형식 이상 {invalid_phone_count}건, 주소 누락 {invalid_address_count}건"
        )
        result = RunResult(
            status="no_candidates", dup_count=dup_count, invalid_phone_count=invalid_phone_count
        )
        _finalize(ss, mode, result, started_at, None)
        return

    logger.info(
        f"[배송 접수] 시작: 대상 {total_candidate_count}건"
        f"(실접수 {len(candidates)}건, 전화번호 형식 이상 {invalid_phone_count}건, "
        f"주소 누락 {invalid_address_count}건), "
        f"중복 제외 {dup_count}건"
    )

    if dry_run:
        logger.info("[배송 접수] dry-run 모드 — API 호출 없이 종료")
        logger.warning("[배송 접수] dry-run 모드: 모니터 시트 기록 없음 — 자동 감시(watchdog) 오탐 주의")
        for c in candidates:
            logger.info(f"  후보: 행 {c.index + 2} / {c.name} / {c.phone} / {c.address[:30]}")
        for d in duplicates:
            logger.info(f"  중복: 행 {d.index + 2} / {d.reason}")
        for p in invalid_phones:
            logger.info(f"  형식이상: 행 {p.index + 2} / {p.name} / {p.phone}")
        for a in invalid_addresses:
            logger.info(f"  주소누락: 행 {a.index + 2} / {a.name} / {a.phone}")
        return

    # 상태 배열 초기화
    status_values = [str(row[7] or "").strip() if len(row) > 7 else "" for row in data]
    status_notes_flat = [n[0] if n else "" for n in notes]
    book_id_values = [str(row[8] or "").strip() if len(row) > 8 else "" for row in data]
    product_values = [str(row[9] or "").strip() if len(row) > 9 else "" for row in data]

    dirty: set[int] = set()
    fail_details: list[str] = []
    unsupported: list[list] = []
    sent_count = 0

    # 중복 건 J열 기재
    for dup in duplicates:
        product_values[dup.index] = dup.reason
        dirty.add(dup.index)

    # 전화번호 형식 이상 처리
    for inv in invalid_phones:
        row_number = inv.index + 2
        phone_str = inv.phone or inv.raw_phone
        fail_details.append(f"행 {row_number} / {inv.name} / {phone_str} — 전화번호 형식 이상")
        status_notes_flat[inv.index] = f"전화번호 형식 이상으로 접수 실패: {phone_str} (E열 수정 후 재실행)"
        product_values[inv.index] = "전화번호 형식 이상"
        dirty.add(inv.index)

    # 주소 누락 처리
    for inv in invalid_addresses:
        row_number = inv.index + 2
        phone_str = inv.phone or inv.raw_phone
        fail_details.append(f"행 {row_number} / {inv.name} / {phone_str} — 주소 누락")
        status_notes_flat[inv.index] = "주소가 없어 접수 실패: 주소 입력 후 재실행"
        product_values[inv.index] = "주소 누락"
        dirty.add(inv.index)

    # API 호출 — 타임가드는 send_deliveries 내부 배치 호출 전에 체크
    # (결과 처리 중 타임가드로 인해 이미 접수된 건이 시트에 반영 안 되는 문제 방지)
    api_results = send_deliveries(config, candidates, started_at=started_at, timeguard_s=TIMEGUARD_S)
    processed_count = 0

    for r in api_results:
        dirty.add(r.index)
        if r.status == "sent":
            status_values[r.index] = "배송완료"
            status_notes_flat[r.index] = ""
            book_id_values[r.index] = r.book_id
            sent_count += 1
        elif r.status == "unsupported":
            status_values[r.index] = "배송완료"
            status_notes_flat[r.index] = r.note
            product_values[r.index] = r.product
            if r.book_id:
                book_id_values[r.index] = r.book_id
            unsupported.append(r.unsupported_info)
        elif r.status == "duplicate_excluded":
            status_values[r.index] = ""
            product_values[r.index] = r.product
        elif r.status == "failed":
            if r.error_msg:
                fail_details.append(r.error_msg)

        # 20건마다 시트에 중간 반영 — 도중에 예외가 나도 여기까지는 시트에 남음
        processed_count += 1
        if processed_count % FLUSH_EVERY == 0 and dirty:
            flush_state(sheet, sorted(dirty), status_values, status_notes_flat, book_id_values, product_values)
            dirty.clear()

    # 최종 flush (중간 flush 이후 남은 건)
    if dirty:
        flush_state(
            sheet,
            sorted(dirty),
            status_values,
            status_notes_flat,
            book_id_values,
            product_values,
        )

    # 배송불가 파일 슬랙 업로드
    if unsupported and config.slack_bot_token and config.slack_channel_id:
        _upload_unsupported_xlsx(config, unsupported)

    # 결과
    result = RunResult(
        status="completed",
        candidate_count=total_candidate_count,
        sent_count=sent_count,
        unsupported=unsupported,
        fail_count=len(fail_details),
        fail_details=fail_details,
        dup_count=dup_count,
        invalid_phone_count=invalid_phone_count,
    )

    # 스냅샷 재계산
    data_after, notes_after = read_data(sheet)
    plan_after = build_plan(data_after, notes_after)
    snapshot_after = take_snapshot(data_after, notes_after, plan_after)

    _finalize(ss, mode, result, started_at, snapshot_after)


def _upload_unsupported_xlsx(config, unsupported: list[list]) -> None:
    """배송불가 건을 xlsx로 만들어 슬랙 채널에 업로드한다."""
    try:
        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.title = "배송불가"
        ws.append(["이름", "전화번호", "주소"])
        for row in unsupported:
            ws.append(row)

        buf = BytesIO()
        wb.save(buf)
        content = buf.getvalue()

        now = datetime.now(KST)
        display_date = now.strftime("%m/%d %H시")           # 본문 표시용 (슬래시 포함)
        title_date = now.strftime("%m-%d_%H시")             # 제목용 (파일명 혼동 피해 하이픈)
        ascii_date = now.strftime("%m%d-%H%M")              # URL/permalink 용 ASCII (분까지 포함해 같은 시간대 내 충돌 방지)
        filename = f"unsupported_{ascii_date}.xlsx"         # Slack 이 한글/기호 sanitize → ASCII 로 고정
        title = f"배송불가_{title_date}.xlsx"                # Slack 채널 표시 제목 (한글 유지)

        mention = f" <@{config.unsupported_mention_user_id}>" if config.unsupported_mention_user_id else ""
        message = (
            f"*📮 배송불가 {len(unsupported)}건*  _({display_date})_\n"
            f"우편 배송 처리 필요합니다.{mention}"
        )

        upload_file_to_channel(
            config.slack_bot_token,
            config.slack_channel_id,
            content,
            filename=filename,
            message=message,
            title=title,
        )
    except Exception as e:
        logger.warning(f"[배송불가] xlsx 업로드 실패: {e}")


def _finalize(
    ss, mode: str, result: RunResult, started_at: float, snapshot: Snapshot | None
) -> None:
    """모니터 기록 + 슬랙 발송."""
    elapsed_s = time.time() - started_at
    config = load_config()

    try:
        append_log(ss, mode, result, elapsed_s, snapshot)
    except Exception as e:
        logger.warning(f"[모니터] 로그 기록 실패: {e}")

    try:
        text = build_monitor_text(mode, result, elapsed_s, snapshot)
        send_notifications(config, text)
    except Exception as e:
        logger.warning(f"[슬랙] 발송 실패: {e}")

    logger.info(
        f"[배송 접수] 완료: {result.status} / 접수 {result.sent_count}건 / "
        f"배송불가 {len(result.unsupported)}건 / 실패 {result.fail_count}건 / "
        f"{elapsed_s:.1f}초"
    )


# ── 모니터 점검 (status) ──────────────────────────

def _run_status() -> None:
    ss, sheet = open_sheet()
    data, notes = read_data(sheet)
    if not data:
        print("데이터가 없습니다.")
        return

    plan = build_plan(data, notes)
    snapshot = take_snapshot(data, notes, plan)

    print(f"현재 미처리: {snapshot.pending_count}건")
    print(f"중복 제외 예상: {snapshot.duplicate_count}건")
    print(f"전화번호 형식 이상: {snapshot.invalid_phone_count}건")
    print(f"접수누락위험: {snapshot.orphan_completed_count}건")
    print(f"가장 오래된 미처리: {snapshot.oldest_pending_text}")


# ── CLI ──────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="150L 봉투 배송 배치")
    parser.add_argument(
        "--mode",
        choices=["register", "watchdog", "status"],
        default="register",
        help="실행 모드",
    )
    parser.add_argument("--slot", choices=["morning", "afternoon"], help="감시 슬롯 (watchdog 모드)")
    parser.add_argument("--dry-run", action="store_true", help="API 호출 없이 후보만 확인")

    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    if args.mode == "register":
        _run_register(dry_run=args.dry_run)
    elif args.mode == "watchdog":
        if not args.slot:
            parser.error("watchdog 모드에서는 --slot 필수")
        run_watchdog(args.slot)
    elif args.mode == "status":
        _run_status()


if __name__ == "__main__":
    main()
