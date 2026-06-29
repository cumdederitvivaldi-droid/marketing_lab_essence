"""[ENG-3199] 대형폐기물 크로스셀 쿠폰 자격 신호 동기화 배치 — 5분마다 KST 실행.

신규 적격자 → FlareLane track 이벤트(largewaste_eligible_signal) 발사
쿠폰 216 사용자 → FlareLane track 이벤트(largewaste_disqualified_signal) 발사
양쪽 모두 BQ ledger에 기록하여 중복 발사 차단 + 분석 활용.
"""

import argparse
import hashlib
import logging
import os
import time
from datetime import datetime, timezone

import google.auth
from google.cloud import bigquery

LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "logs")
os.makedirs(LOG_DIR, exist_ok=True)


def _mask(user_id) -> str:
    return hashlib.md5(str(user_id).encode()).hexdigest()[:8]  # noqa: S324 - non-cryptographic logging mask


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(os.path.join(LOG_DIR, "batch.log"), encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)


def _process_eligible(bq, rows, dry_run, counts):
    from config import (
        EXPERIMENT_KEY,
        ELIGIBLE_EVENT_NAME,
        COUPON_POLICY_ID,
    )
    from flarelane import send_event
    from ledger import write_row

    for row in rows:
        user_id = row["user_id"]
        matched_at = datetime.now(timezone.utc).isoformat()

        base = {
            "user_id": user_id,
            "experiment_key": EXPERIMENT_KEY,
            "signal_type": "eligible",
            "order_id": row["order_id"],
            "order_number": row["order_number"],
            "order_submitted_at": row["order_submitted_at"].isoformat() if row["order_submitted_at"] else None,
            "is_marketing_agree": True,  # 매칭 쿼리에 마수동 필터 포함됨
            "flarelane_event_name": ELIGIBLE_EVENT_NAME,
            "matched_at": matched_at,
        }
        event_data = {
            "experiment_key": EXPERIMENT_KEY,
            "coupon_policy_id": COUPON_POLICY_ID,
            "order_id": row["order_id"],
            "order_number": row["order_number"],
        }

        if dry_run:
            counts["eligible_sent"] += 1
            logger.info(f"[dry-run] eligible 발사 예정: user_id={_mask(user_id)} order_id={row['order_id']}")
            continue

        # 1) pending 선점 — 실패 시 발사 자체 스킵 (다음 cron 재시도)
        if not write_row(bq, {**base, "status": "pending", "status_reason": "reserved_before_send"}):
            counts["ledger_failed"] += 1
            logger.error(f"eligible pending 선점 실패 — 발사 스킵: user_id={_mask(user_id)}")
            continue

        # 2) FlareLane 발사
        ok = send_event(user_id=user_id, event_name=ELIGIBLE_EVENT_NAME, data=event_data)

        # 3) 최종 상태 append
        final_status = "sent" if ok else "flarelane_failed"
        final_reason = None if ok else "flarelane_track_error"
        final_recorded = write_row(bq, {**base, "status": final_status, "status_reason": final_reason})

        if ok:
            counts["eligible_sent"] += 1
            if not final_recorded:
                counts["ledger_failed"] += 1
                logger.warning(f"eligible 발사 성공 + 최종 기록 실패(pending 남음, 재발사 차단): user_id={_mask(user_id)}")
            else:
                logger.info(f"eligible 발사 성공: user_id={_mask(user_id)}")
        else:
            counts["eligible_failed"] += 1
            if not final_recorded:
                counts["ledger_failed"] += 1
                logger.warning(f"eligible 발사 실패 + 최종 기록 실패(pending 남음): user_id={_mask(user_id)}")
            logger.error(f"eligible 발사 실패: user_id={_mask(user_id)}")


def _process_disqualified(bq, rows, dry_run, counts):
    from config import (
        EXPERIMENT_KEY,
        DISQUALIFIED_EVENT_NAME,
        COUPON_POLICY_ID,
    )
    from flarelane import send_event
    from ledger import write_row

    for row in rows:
        user_id = row["user_id"]
        reason = row["disqualified_reason"]
        matched_at = datetime.now(timezone.utc).isoformat()

        base = {
            "user_id": user_id,
            "experiment_key": EXPERIMENT_KEY,
            "signal_type": "disqualified",
            "disqualified_reason": reason,
            "coupon_policy_id": COUPON_POLICY_ID,
            "user_coupon_id": row["user_coupon_id"],
            "disqualified_order_id": row["disqualified_order_id"],
            "disqualified_at": row["disqualified_at"].isoformat() if row["disqualified_at"] else None,
            "flarelane_event_name": DISQUALIFIED_EVENT_NAME,
            "matched_at": matched_at,
        }
        event_data = {
            "experiment_key": EXPERIMENT_KEY,
            "coupon_policy_id": COUPON_POLICY_ID,
            "disqualified_reason": reason,
            "user_coupon_id": row["user_coupon_id"],
            "disqualified_order_id": row["disqualified_order_id"],
        }

        if dry_run:
            counts["disqualified_sent"] += 1
            logger.info(f"[dry-run] disqualified 발사 예정: user_id={_mask(user_id)} reason={reason} order={row['disqualified_order_id']}")
            continue

        if not write_row(bq, {**base, "status": "pending", "status_reason": "reserved_before_send"}):
            counts["ledger_failed"] += 1
            logger.error(f"disqualified pending 선점 실패 — 발사 스킵: user_id={_mask(user_id)}")
            continue

        ok = send_event(user_id=user_id, event_name=DISQUALIFIED_EVENT_NAME, data=event_data)
        final_status = "sent" if ok else "flarelane_failed"
        final_reason = None if ok else "flarelane_track_error"
        final_recorded = write_row(bq, {**base, "status": final_status, "status_reason": final_reason})

        if ok:
            counts["disqualified_sent"] += 1
            if not final_recorded:
                counts["ledger_failed"] += 1
                logger.warning(f"disqualified 발사 성공 + 최종 기록 실패(pending 남음, 재발사 차단): user_id={_mask(user_id)}")
            else:
                logger.info(f"disqualified 발사 성공: user_id={_mask(user_id)}")
        else:
            counts["disqualified_failed"] += 1
            if not final_recorded:
                counts["ledger_failed"] += 1
                logger.warning(f"disqualified 발사 실패 + 최종 기록 실패(pending 남음): user_id={_mask(user_id)}")
            logger.error(f"disqualified 발사 실패: user_id={_mask(user_id)}")


def main(dry_run: bool = False):
    started_at = time.time()
    logger.info(f"시작{' (dry-run)' if dry_run else ''}")

    from config import GCP_PROJECT
    from ledger import ensure_table_exists
    from matcher import query_new_eligible, query_disqualified_users

    credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    bq = bigquery.Client(project=GCP_PROJECT, credentials=credentials)
    # 멱등 DDL — 빈 테이블 생성은 부작용 없음, matcher의 ledger LEFT JOIN을 위해 dry-run에서도 필요
    ensure_table_exists(bq)

    eligible_rows = query_new_eligible(bq)
    disqualified_rows = query_disqualified_users(bq)

    counts = {
        "eligible_sent": 0,
        "eligible_failed": 0,
        "disqualified_sent": 0,
        "disqualified_failed": 0,
        "ledger_failed": 0,
    }

    _process_eligible(bq, eligible_rows, dry_run, counts)
    _process_disqualified(bq, disqualified_rows, dry_run, counts)

    elapsed = time.time() - started_at
    logger.info(
        f"처리 완료{' (dry-run)' if dry_run else ''}: "
        f"eligible(대상={len(eligible_rows)}, sent={counts['eligible_sent']}, failed={counts['eligible_failed']}) / "
        f"disqualified(대상={len(disqualified_rows)}, sent={counts['disqualified_sent']}, failed={counts['disqualified_failed']}) / "
        f"ledger_failed={counts['ledger_failed']}"
    )

    logger.info(f"완료 : {elapsed:.1f}초")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="[ENG-3199] 대형폐기물 크로스셀 쿠폰 자격 신호 동기화 배치")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="FlareLane 발사 + BQ ledger 쓰기 모두 스킵. 매칭 결과만 로그.",
    )
    args = parser.parse_args()
    main(dry_run=args.dry_run)
