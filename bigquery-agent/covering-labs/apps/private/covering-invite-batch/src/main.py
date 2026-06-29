"""친구초대 V1 매칭/지급 배치 — 매일 오전 9시 KST 실행."""

import logging
import os
import time
from datetime import date

from google.cloud import bigquery

LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "logs")
os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(os.path.join(LOG_DIR, "batch.log")),
    ],
)
logger = logging.getLogger(__name__)


def main():
    started_at = time.time()
    logger.info("시작")

    from config import (
        GCP_PROJECT,
        VARIANT,
        FLARELANE_EVENT_NAME_NEW,
        REWARD_AMOUNT_NEW,
        COUPON_POLICY_ID_NEW,
        FLARELANE_EVENT_NAME_EXISTING,
        REWARD_AMOUNT_EXISTING,
        COUPON_POLICY_ID_EXISTING,
    )
    from matcher import query_matched_installs
    from ledger import (
        ensure_table_exists,
        expire_old_failures,
        get_already_issued,
        get_lifetime_counts,
        write_row,
    )
    from flarelane import send_event
    from slack import send_result

    # BigQuery 클라이언트 1회 생성
    bq = bigquery.Client(project=GCP_PROJECT)

    # 1. 장부 테이블 확인
    ensure_table_exists(bq)

    # 2. 3일 초과 실패 건 영구 실패 처리
    expire_old_failures(bq)

    # 3. 이미 지급된 건 조회
    already_issued = get_already_issued(bq)

    # 4. BigQuery 매칭 — 이미 지급된 invitee는 silently 제외 (누적 통계에서만 카운트)
    matched_raw = query_matched_installs(bq)
    matched = [r for r in matched_raw if r["invitee_user_id"] not in already_issued]
    already_issued_in_match = len(matched_raw) - len(matched)
    if already_issued_in_match > 0:
        logger.info(f"이미 지급됨 silently 스킵: {already_issued_in_match}건")
    logger.info(f"오늘 처리 대상 매칭: {len(matched)}건 (원본 {len(matched_raw)}건)")

    # 5. 분류별 카운터
    match_breakdown = {"new_personal": 0, "new_public": 0, "existing_personal": 0, "existing_public": 0}
    issued_breakdown = {"new": 0, "existing": 0}
    failed = 0
    today = date.today().isoformat()

    for row in matched:
        invitee_id = row["invitee_user_id"]
        # matcher가 Airbridge_Device_ID로 partitioning되어 같은 invitee가
        # 여러 device로 반환될 수 있다. 매칭 진입 전 already_issued 필터링은
        # 배치 시작 시점 스냅샷이라 루프 내 add된 invitee를 거르지 못하므로
        # 여기서 dedup 가드를 추가한다.
        if invitee_id in already_issued:
            continue

        variant = row.get("variant") or VARIANT
        invite_code = row.get("invite_code")
        inviter_id = row.get("inviter_id")
        recipient_type = row.get("recipient_type", "new")
        is_public = variant == "friend_invite_v1_public"
        invite_mode = "public" if is_public else "personal"

        bucket_key = f"{recipient_type}_{'public' if is_public else 'personal'}"
        if bucket_key in match_breakdown:
            match_breakdown[bucket_key] += 1

        # 수신자 유형별 보상 정책 분기
        if recipient_type == "existing":
            flarelane_event_name = FLARELANE_EVENT_NAME_EXISTING
            reward_amount = REWARD_AMOUNT_EXISTING
            coupon_policy_id = COUPON_POLICY_ID_EXISTING
        else:
            flarelane_event_name = FLARELANE_EVENT_NAME_NEW
            reward_amount = REWARD_AMOUNT_NEW
            coupon_policy_id = COUPON_POLICY_ID_NEW

        base_row = {
            "run_date": today,
            "variant": variant,
            "invite_code": invite_code,
            "inviter_id": inviter_id,
            "invitee_user_id": invitee_id,
            "airbridge_device_id": row["airbridge_device_id"],
            "installed_at": row["installed_at"].isoformat() if row.get("installed_at") else None,
            "signed_up_at": row["signed_up_at"].isoformat() if row.get("signed_up_at") else None,
            "reward_target": "invitee",
            "flarelane_event_name": flarelane_event_name,
            "recipient_type": recipient_type,
            "reward_amount": reward_amount,
            "coupon_policy_id": coupon_policy_id,
        }

        # FlareLane 발송
        event_data = {
            "invite_mode": invite_mode,
            "variant": variant,
            "reward_type": "invitee_only",
            "reward_amount": reward_amount,
            "recipient_type": recipient_type,
            "coupon_policy_id": coupon_policy_id,
        }
        if invite_code:
            event_data["invite_code"] = invite_code
        if inviter_id is not None:
            event_data["inviter_id"] = inviter_id

        success = send_event(user_id=invitee_id, event_name=flarelane_event_name, data=event_data)

        if success:
            recorded = write_row(bq, {**base_row, "status": "issued", "status_reason": None})
            if recorded:
                issued_breakdown[recipient_type] = issued_breakdown.get(recipient_type, 0) + 1
                already_issued.add(invitee_id)
                logger.info(
                    f"지급 성공: invitee={invitee_id} type={recipient_type} amount={reward_amount} "
                    f"mode={invite_mode} inviter={inviter_id} code={invite_code}"
                )
            else:
                failed += 1
                logger.error(f"지급 성공했으나 장부 기록 실패 — 중복 발송 위험: invitee={invitee_id}")
        else:
            failed += 1
            if not write_row(bq, {**base_row, "status": "failed", "status_reason": "flarelane_error"}):
                logger.error(f"실패 장부 기록도 실패: invitee={invitee_id}")
            logger.error(f"지급 실패: invitee={invitee_id}")

    # 6. 누적 통계 조회 + Slack 리포트
    lifetime = get_lifetime_counts(bq)
    elapsed = time.time() - started_at

    total_issued = sum(issued_breakdown.values())
    logger.info(
        f"처리 완료: 매칭={len(matched)} / 지급={total_issued} / 실패={failed} "
        f"(신규={issued_breakdown.get('new', 0)} / 기존={issued_breakdown.get('existing', 0)})"
    )

    send_result(
        match_breakdown=match_breakdown,
        issued_breakdown=issued_breakdown,
        failed=failed,
        lifetime=lifetime,
        elapsed=elapsed,
    )
    logger.info(f"완료 : {elapsed:.1f}초")


if __name__ == "__main__":
    main()
