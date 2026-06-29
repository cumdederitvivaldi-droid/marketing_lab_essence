"""첫 결제 0원 실험 쿠폰 자동발급 배치 — 5분마다 KST 실행."""

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


def _mask(user_id: int) -> str:
    """로그용 마스킹 — MD5 앞 8자리. 원본 user_id를 batch.log에 영속화하지 않기 위함."""
    return hashlib.md5(str(user_id).encode()).hexdigest()[:8]  # noqa: S324 - non-cryptographic logging mask

# FileHandler 단일 — cron 실행 시 crontab 이 stdout/stderr 을 `>> logs/batch.log`
# 로 리다이렉트하므로, StreamHandler 까지 함께 attach 하면 한 라인이 batch.log
# 에 두 번씩 기록되는 중복 사고가 발생한다 (PR #317 web2form-alimtalk-batch 동일 fix 참고).
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler(os.path.join(LOG_DIR, "batch.log"), encoding="utf-8")],
)
logger = logging.getLogger(__name__)


def main(dry_run: bool = False):
    started_at = time.time()
    logger.info(f"시작{' (dry-run)' if dry_run else ''}")

    from config import (
        GCP_PROJECT,
        COUPON_POLICY_ID,
        FLARELANE_EVENT_NAME,
    )
    from matcher import query_new_signups
    from ledger import ensure_table_exists, write_row
    from flarelane import send_event
    from ab import assign_variant

    credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    bq = bigquery.Client(project=GCP_PROJECT, credentials=credentials)
    if not dry_run:
        ensure_table_exists(bq)

    signups = query_new_signups(bq)

    counts = {"treatment_sent": 0, "treatment_failed": 0, "control": 0, "ledger_failed": 0}

    for row in signups:
        user_id = row["user_id"]
        signed_up_at = row["signed_up_at"]
        variant = assign_variant(user_id)
        assigned_at = datetime.now(timezone.utc)

        base_row = {
            "user_id": user_id,
            "signed_up_at": signed_up_at.isoformat() if signed_up_at else None,
            "assigned_at": assigned_at.isoformat(),
            "variant": variant,
        }

        if variant == "control":
            if dry_run:
                counts["control"] += 1
                logger.info(f"[dry-run] control: user_id={_mask(user_id)}")
                continue
            recorded = write_row(bq, {
                **base_row,
                "status": "skipped_control",
                "status_reason": "ab_assignment",
            })
            if recorded:
                counts["control"] += 1
            else:
                counts["ledger_failed"] += 1
            continue

        # treatment 처리 패턴 (중복 발급 방지):
        #   1) ledger 선점(status='pending') — 다음 cron의 LEFT JOIN 매칭에서 차단 → 재발사 차단
        #   2) FlareLane 발사
        #   3) 최종 상태 append(status='sent'/'flarelane_failed') — 분석 시 user별 최신 row 사용
        # 분석 쿼리: ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY processed_at DESC) = 1
        event_data = {
            "variant": variant,
            "coupon_policy_id": COUPON_POLICY_ID,
            "signed_up_at": signed_up_at.isoformat() if signed_up_at else None,
        }
        if dry_run:
            counts["treatment_sent"] += 1
            logger.info(f"[dry-run] treatment 발송 예정: user_id={_mask(user_id)} event={FLARELANE_EVENT_NAME}")
            continue

        # 1) pending 선점 — 실패 시 FlareLane 발사 자체를 스킵 (다음 cron이 다시 시도)
        pending_row = {
            **base_row,
            "coupon_policy_id": COUPON_POLICY_ID,
            "flarelane_event_name": FLARELANE_EVENT_NAME,
            "status": "pending",
            "status_reason": "reserved_before_send",
        }
        if not write_row(bq, pending_row):
            counts["ledger_failed"] += 1
            logger.error(f"pending 선점 실패 — FlareLane 발송 스킵: user_id={_mask(user_id)}")
            continue

        # 2) FlareLane 발사
        ok = send_event(user_id=user_id, event_name=FLARELANE_EVENT_NAME, data=event_data)

        # 3) 최종 상태 append — 실패해도 pending row가 남아 재매칭/재발사 차단됨
        final_row = {
            **base_row,
            "coupon_policy_id": COUPON_POLICY_ID,
            "flarelane_event_name": FLARELANE_EVENT_NAME,
            "status": "sent" if ok else "flarelane_failed",
            "status_reason": None if ok else "flarelane_track_error",
        }
        final_recorded = write_row(bq, final_row)

        if ok:
            counts["treatment_sent"] += 1
            if final_recorded:
                logger.info(f"발송 성공: user_id={_mask(user_id)} variant=treatment")
            else:
                logger.warning(
                    f"발송 성공 + 최종 상태 기록 실패 — pending row 남음(재발사는 차단됨): user_id={_mask(user_id)}"
                )
        else:
            counts["treatment_failed"] += 1
            if final_recorded:
                logger.error(f"발송 실패: user_id={_mask(user_id)}")
            else:
                logger.error(f"발송 실패 + 최종 상태 기록 실패: user_id={_mask(user_id)}")

    elapsed = time.time() - started_at
    logger.info(
        f"처리 완료{' (dry-run)' if dry_run else ''}: 대상={len(signups)} / "
        f"treatment_sent={counts['treatment_sent']} / treatment_failed={counts['treatment_failed']} / "
        f"control={counts['control']} / ledger_failed={counts['ledger_failed']}"
    )
    logger.info(f"완료 : {elapsed:.1f}초")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="첫 결제 0원 실험 쿠폰 자동발급 배치")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="FlareLane 발송 + BQ ledger INSERT 모두 스킵. 매칭/배정 결과만 로그 출력.",
    )
    args = parser.parse_args()
    main(dry_run=args.dry_run)
