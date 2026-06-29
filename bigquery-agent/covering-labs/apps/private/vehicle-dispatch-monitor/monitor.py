"""
차량번호 배차 자동 알림 - 메인 스크립트

실행 플로우 (1회 배치):
  1. 채널톡에서 "차량등록" 태그된 상담 감지 (opened + snoozed)
  2. 봇 폼 데이터에서 주문코드 추출 (영숫자 8자리) → 시트 적재
  2.5. BigQuery로 주문코드 → 숫자 주문ID 매핑
  3. 시트의 미배차 주문 → 백오피스 API로 배차 확인
  4. 배차 완료 건 → 채널톡으로 고객에게 차량번호 자동 발송
  5. 슬랙 로그 (시작/완료 항상 발송)

사용법:
  # 1회 실행 (GitHub Actions 스케줄: KST 21:00 / 23:00)
  python3 monitor.py

  # 드라이런 (실제 발송 없이 감지만)
  python3 monitor.py --dry-run

보안:
  - 백오피스 API: GET만 허용, 엔드포인트 화이트리스트 (security.py)
  - 채널톡 메시지: 고정 템플릿만 사용 (config.MESSAGE_TEMPLATE)
  - 중복 발송 방지: 시트 "발송완료" 플래그 + 메모리 캐시
"""
from __future__ import annotations

import argparse
import fcntl
import logging
import os
import re
import socket
import sys
import time
from datetime import datetime, date, timezone, timedelta

import requests

import config
import channeltalk
import sheets
import backoffice
import backoffice_auth
import order_lookup
import slack_notify
import security
from channeltalk import SendResult

KST = timezone(timedelta(hours=9))

# 메모리 내 발송 완료 캐시 (시트 장애 시 이중 방어)
_sent_cache: set = set()

# import 시점에도 로그 디렉토리가 없어서 테스트가 깨지지 않게 선행 생성
os.makedirs(config.LOG_DIR, exist_ok=True)

# 로깅 설정 (stdout → crontab이 batch.log로 리다이렉트)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger("monitor")

PIDFILE = f"/tmp/vehicle-dispatch-monitor-{os.getuid()}.pid"
_lock_fp = None  # 파일 핸들 유지 (닫히면 락 해제)


def acquire_lock() -> bool:
    """PID 파일 락 — 중복 실행 방지. 프로세스 종료 시 자동 해제."""
    global _lock_fp
    _lock_fp = open(PIDFILE, "w")
    try:
        fcntl.flock(_lock_fp, fcntl.LOCK_EX | fcntl.LOCK_NB)
        _lock_fp.write(str(os.getpid()))
        _lock_fp.flush()
        return True
    except OSError:
        _lock_fp.close()
        _lock_fp = None
        return False


def get_current_host() -> str:
    """현재 머신명 반환 (GCP VM — socket.gethostname() 사용)."""
    return socket.gethostname().strip().removesuffix(".local")


def step1_detect_tagged_chats(existing_rows: list) -> list:
    """
    Step 1: 채널톡에서 "차량등록" 태그된 상담 감지
    이미 시트에 있는 상담은 스킵
    """
    logger.info("--- Step 1: 채널톡 태그 감지 ---")

    tagged_chats = channeltalk.get_tagged_chats()
    if not tagged_chats:
        logger.info("태그된 상담 없음")
        return []

    # 이미 시트에 있는 상담ID로 중복 체크 (COL_CHAT_ID=2)
    # "발송 필요 X" (취소/불필요) 행은 제외 → 취소 후 재접수 시 동일 채팅 재감지 허용
    existing_chat_ids = set()
    for row in existing_rows:
        if len(row) > sheets.COL_CHAT_ID:
            sent = row[sheets.COL_SENT] if len(row) > sheets.COL_SENT else ""
            if sent == "발송 필요 X":
                continue
            existing_chat_ids.add(row[sheets.COL_CHAT_ID])

    new_chats = [
        chat for chat in tagged_chats
        if chat.get("id") not in existing_chat_ids
    ]

    logger.info(f"새로 감지된 상담: {len(new_chats)}건 (기존 {len(existing_chat_ids)}건 스킵)")
    return new_chats


MAX_PHONE_RETRY = 12  # 12회 × 10분 ≈ 2시간 (BQ 싱크 대기)
MAX_BQ_RETRY = 8      # 8회 × 10분 ≈ 80분 (정상 주문코드 BQ 매핑 실패 escalation)
MAX_RETRY_PER_BATCH = 10  # 배치당 phone fallback 최대 건수 (BQ 5분 주기 단축으로 증량)


def _parse_retry_count(fail_reason: str) -> int:
    """fail_reason에서 [retry:X/12] 태그 파싱. 없으면 0 반환."""
    m = re.search(r'\[retry:(\d+)/\d+\]', fail_reason or "")
    return int(m.group(1)) if m else 0


def _bump_retry_fail_reason(fail_reason: str, new_count: int) -> str:
    """fail_reason의 [retry:X/12] 태그를 new_count로 갱신. 없으면 추가."""
    base = re.sub(r'\s*\[retry:\d+/\d+\]', '', fail_reason or "").strip()
    return f"{base} [retry:{new_count}/{MAX_PHONE_RETRY}]".strip()


def _resolve_order_by_phone(phone: str) -> tuple[dict | None, str]:
    """
    전화번호로 주문 매칭 (2-step)

    Step 1: BigQuery masked_phone → 후보 주문 조회 (충돌 15%)
    Step 2: 후보별 백오피스 GET /v2/order/{id} → full phone 대조 → 100% 정확

    Args:
        phone: 정규화된 전화번호 (01085419697)

    Returns:
        (매칭 결과 dict 또는 None, 실패 사유 문자열)
    """
    # Step 1: BigQuery 후보 조회
    candidates = order_lookup.lookup_orders_by_phone(phone)
    if not candidates:
        reason = "BQ 후보 0건 (sync 지연 예상 — 23:00 배치 재시도)"
        logger.info(f"전화번호 매칭: {reason}")
        return None, reason

    # freshness 필터: max order_id 기준 10,000 이상 차이나는 과거 주문 제거
    numeric_ids = [int(c["order_id"]) for c in candidates if c["order_id"].isdigit()]
    if numeric_ids:
        max_id = max(numeric_ids)
        before = len(candidates)
        candidates = [c for c in candidates
                      if not c["order_id"].isdigit() or max_id - int(c["order_id"]) < 10000]
        if len(candidates) < before:
            logger.info(f"freshness 필터: {before - len(candidates)}건 제거 (max_id={max_id})")
        if not candidates:
            reason = f"freshness 필터 후 후보 0건 (BQ 후보 {before}건 모두 오래된 주문)"
            logger.warning(f"전화번호 매칭: {reason}")
            return None, reason

    logger.info(f"전화번호 매칭: BigQuery 후보 {len(candidates)}건, 백오피스 대조 시작")

    # Step 2: 백오피스에서 full phone 대조
    # 토큰 1회 발급 후 모든 후보에 재사용 (불필요한 login API 호출 방지)
    token = backoffice_auth.get_valid_token()
    if not token:
        reason = "백오피스 토큰 발급 실패"
        logger.error(f"전화번호 매칭: {reason}")
        return None, reason

    for candidate in candidates:
        try:
            result = backoffice.verify_order_phone(candidate["order_id"], phone, token=token)
            if result:
                return result, ""
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code == 401:
                reason = "백오피스 토큰 만료 (전화번호 대조 중)"
                logger.error(f"전화번호 매칭: {reason}")
                return None, reason
            logger.error(f"백오피스 전화번호 대조 에러: 주문 {candidate['order_id']}, {e}")

    reason = f"BQ 후보 {len(candidates)}건 조회됐지만 백오피스 전화번호 불일치"
    logger.warning(f"전화번호 매칭: {reason}")
    return None, reason


def step2_extract_and_save(new_chats: list, dry_run: bool = False) -> tuple[int, list]:
    """
    Step 2: 새 상담의 봇 폼 데이터에서 주문코드 추출 → 시트 적재

    추출 전략:
      1차: 봇 폼의 주문번호 필드에서 직접 추출 (65%)
      2차: 봇 폼의 전화번호 → BigQuery 후보 → 백오피스 full phone 대조 (30%)
      3차: 채널톡 유저 프로필 mobileNumber → BigQuery 후보 → 백오피스 대조 (~100%)

    Returns:
        (saved_count, new_manual): 추출 성공 건수, 즉시 수동처리필요 건(전화번호 없는 경우만)
        전화번호 있는 실패 건은 추출실패 상태로 적재 후 step2_5에서 자동 재시도.
    """
    logger.info("--- Step 2: 주문코드 추출 + 시트 적재 ---")

    saved_count = 0
    new_manual = []
    buffer = sheets.SheetsWriteBuffer()

    for chat in new_chats:
        chat_id = chat.get("id")
        tag = chat.get("matched_tag", "차량등록")
        fail_reason = None

        # 메시지에서 주문코드 추출 (봇 폼 데이터 우선)
        messages = channeltalk.get_chat_messages(chat_id)
        order_code = channeltalk.extract_order_code_from_messages(messages)
        order_id = ""

        # 전화번호: 봇 폼 → 유저 프로필 순으로 항상 조회 (시트 적재 + 폴백용)
        phone = channeltalk.extract_phone_from_messages(messages)
        if not phone:
            user_id = chat.get("userId", "")
            if user_id:
                phone = channeltalk.get_user_phone(user_id)

        if order_code:
            logger.info(f"상담 {chat_id} → 주문코드 {order_code} 추출 성공")
        else:
            # 2·3차 폴백: 전화번호 → BigQuery 후보 → 백오피스 full phone 대조
            if phone:
                logger.info(f"상담 {chat_id} → 주문코드 없음, 전화번호 폴백 시도")
                matched, resolve_reason = _resolve_order_by_phone(phone)
                if matched:
                    order_code = matched["order_code"]
                    order_id = matched["order_id"]
                    logger.info(
                        f"상담 {chat_id} → 전화번호 매칭 성공: "
                        f"주문코드 {order_code}, ID {order_id}"
                    )
                else:
                    fail_reason = f"전화번호 있음 → {resolve_reason}"
                    logger.warning(f"상담 {chat_id}: 전화번호 매칭 실패 ({resolve_reason})")
            else:
                fail_reason = "주문코드·전화번호 모두 추출 실패 (봇 폼 데이터 없음)"
                logger.warning(f"상담 {chat_id}: 주문코드·전화번호 모두 추출 실패")

        if order_code:
            if not dry_run:
                sheets.add_order(order_code, chat_id, order_id, phone=phone or "", tag=tag, buffer=buffer)
                slack_notify.send_new_order_detected(order_code, phone or "")
            else:
                logger.info(f"[DRY-RUN] 시트 추가 스킵: 주문코드 {order_code}")
            saved_count += 1
        else:
            if not dry_run:
                if phone:
                    # 전화번호 있음 → BQ 지연 가능성, step2_5에서 자동 재시도
                    fail_reason_tagged = _bump_retry_fail_reason(fail_reason or "", 0)
                    sheets.add_order("추출실패", chat_id, phone=phone, status="추출실패",
                                     fail_reason=fail_reason_tagged, tag=tag, buffer=buffer)
                    logger.info(f"상담 {chat_id}: 추출실패 적재 (전화번호 재시도 예약)")
                else:
                    # 전화번호 없음 → 재시도 불가, 즉시 수동처리필요
                    sheets.add_order("추출실패", chat_id, phone="", status="수동처리필요",
                                     fail_reason=fail_reason or "", tag=tag, buffer=buffer)
                    new_manual.append({
                        "phone": "",
                        "order_code": "추출실패",
                        "fail_reason": fail_reason or "전화번호 없음",
                        "chat_id": chat_id,
                    })
                    logger.warning(f"상담 {chat_id}: 전화번호 없음 → 즉시 수동처리필요")
            else:
                logger.info(f"[DRY-RUN] 추출 실패 처리 스킵: 상담 {chat_id}")

    if not dry_run:
        buffer.flush()
    return saved_count, new_manual


def step2_5_resolve_order_ids(dry_run: bool = False, rows: list = None) -> tuple[int, list]:
    """
    Step 2.5: 주문코드 → 주문ID 매핑 (BigQuery)
    주문ID가 비어있는 행에 대해 BigQuery에서 주문코드 → 숫자 주문ID 변환

    BQ 조회 실패 + 전화번호 있는 경우: 전화번호 폴백으로 올바른 주문 탐색
    (유저가 주문코드를 오입력한 경우 커버)

    추출실패 행 + 전화번호 있는 경우: 매 배치마다 phone fallback 재시도
    MAX_PHONE_RETRY(12회) 초과 시 수동처리필요 escalate + 1회 슬랙 알림

    Returns:
        (resolved, new_escalated): 처리 건수, 이번 배치에서 새로 escalate된 건 목록
    """
    logger.info("--- Step 2.5: 주문코드 → 주문ID 매핑 ---")

    pending = sheets.get_pending_orders(rows)
    resolved = 0
    retry_count = 0  # 이번 배치 내 phone fallback 호출 횟수
    new_escalated = []
    buffer = sheets.SheetsWriteBuffer()

    for order in pending:
        order_code = order["order_code"]
        order_id = order["order_id"]

        # 이미 주문ID가 있으면 스킵
        if order_id:
            continue

        # 이미 수동 처리로 넘긴 건은 같은 알림을 반복하지 않음
        if order.get("dispatch_status") == "수동처리필요":
            continue

        # 추출실패 행: 전화번호 있으면 phone fallback 재시도
        if order_code == "추출실패":
            if retry_count >= MAX_RETRY_PER_BATCH:
                continue
            phone = order.get("phone", "")
            if not phone:
                continue

            current_retry = _parse_retry_count(order.get("fail_reason", ""))

            # 최대 재시도 초과 → 수동처리필요 escalate
            if current_retry >= MAX_PHONE_RETRY:
                logger.warning(
                    f"추출실패 재시도 초과 ({current_retry}회): 상담 {order.get('chat_id', '')}, 수동처리필요 escalate"
                )
                if not dry_run:
                    sheets.update_status(order["row_index"], "수동처리필요", buffer=buffer)
                new_escalated.append({
                    "phone": phone,
                    "order_code": "추출실패",
                    "fail_reason": f"BQ 후보 없음 (재시도 {current_retry}회 초과)",
                    "row_index": order["row_index"],
                    "chat_id": order.get("chat_id", ""),
                })
                retry_count += 1
                continue

            logger.info(
                f"추출실패 행 phone fallback 재시도 ({current_retry + 1}/{MAX_PHONE_RETRY}): "
                f"상담 {order.get('chat_id', '')}"
            )
            matched, fail_rsn = _resolve_order_by_phone(phone)
            retry_count += 1
            if not matched:
                new_fail_reason = _bump_retry_fail_reason(order.get("fail_reason", ""), current_retry + 1)
                if not dry_run:
                    sheets.update_fail_reason(order["row_index"], new_fail_reason, buffer=buffer)
                continue
            correct_code = matched["order_code"]
            correct_id = matched["order_id"]
            logger.info(f"추출실패 재시도 성공: 주문코드 {correct_code}, ID {correct_id}")
            if not dry_run:
                sheets.update_order_code(order["row_index"], correct_code, buffer=buffer)
                sheets.update_order_id(order["row_index"], correct_id, buffer=buffer)
                if matched.get("vehicle_number"):
                    sheets.update_dispatch(
                        order["row_index"],
                        matched["vehicle_number"],
                        matched.get("rider_name", ""),
                        buffer=buffer,
                        status="배차완료(폰폴백)",
                    )
            resolved += 1
            continue

        order_id = order_lookup.lookup_order_id(order_code)
        if order_id:
            if not dry_run:
                sheets.update_order_id(order["row_index"], order_id, buffer=buffer)
                # BQ 매핑 성공 시 이전 retry 태그 제거
                if "[bq_retry:" in (order.get("fail_reason") or ""):
                    sheets.update_fail_reason(order["row_index"], "", buffer=buffer)
            else:
                logger.info(f"[DRY-RUN] 주문ID 매핑 스킵: {order_code} → {order_id}")
            resolved += 1
            continue

        # BQ 조회 실패: retry count 확인 + escalation
        bq_retry = _parse_retry_count(order.get("fail_reason", "").replace("bq_retry", "retry"))
        # fail_reason에서 [bq_retry:X/8] 태그 파싱
        bq_retry_m = re.search(r'\[bq_retry:(\d+)/\d+\]', order.get("fail_reason") or "")
        bq_retry = int(bq_retry_m.group(1)) if bq_retry_m else 0

        if bq_retry >= MAX_BQ_RETRY:
            # 에스컬레이션 직전 phone fallback 최종 시도 (VPN 복구 후 자동 해결 가능성)
            phone = order.get("phone", "")
            if phone:
                logger.info(f"BQ 재시도 초과 ({bq_retry}회), phone 최종 폴백 시도: {order_code}")
                matched, _ = _resolve_order_by_phone(phone)
                if matched:
                    correct_code = matched["order_code"]
                    correct_id = matched["order_id"]
                    logger.warning(f"phone 최종 폴백 성공: '{order_code}' → '{correct_code}' (주문ID {correct_id})")
                    if not dry_run:
                        if correct_code != order_code:
                            sheets.update_order_code(order["row_index"], correct_code, buffer=buffer)
                        sheets.update_order_id(order["row_index"], correct_id, buffer=buffer)
                    if not dry_run and matched.get("vehicle_number"):
                        sheets.update_dispatch(
                            order["row_index"],
                            matched["vehicle_number"],
                            matched.get("rider_name", ""),
                            buffer=buffer,
                            status="배차완료(폰폴백)",
                        )
                    resolved += 1
                    continue

            logger.warning(
                f"BQ 매핑 재시도 초과 ({bq_retry}회): 주문코드 {order_code}, 수동처리필요 escalate"
            )
            if not dry_run:
                sheets.update_status(order["row_index"], "수동처리필요", buffer=buffer)
                fail_msg = f"BQ 매핑 실패 (재시도 {bq_retry}회 초과)"
                sheets.update_fail_reason(order["row_index"], fail_msg, buffer=buffer)
            new_escalated.append({
                "phone": order.get("phone", ""),
                "order_code": order_code,
                "fail_reason": f"BQ 매핑 실패 (재시도 {bq_retry}회 초과)",
                "row_index": order["row_index"],
                "chat_id": order.get("chat_id", ""),
            })
            continue

        # BQ 조회 실패 + 전화번호 있으면 전화번호 폴백 시도 (주문코드 오입력 대응)
        phone = order.get("phone", "")
        if not phone:
            # phone 없으면 BQ 재시도만 가능 → retry count 기록
            new_bq_retry = bq_retry + 1
            bq_fail_reason = re.sub(r'\s*\[bq_retry:\d+/\d+\]', '', order.get("fail_reason") or "").strip()
            bq_fail_reason = f"{bq_fail_reason} [bq_retry:{new_bq_retry}/{MAX_BQ_RETRY}]".strip()
            if not dry_run:
                sheets.update_fail_reason(order["row_index"], bq_fail_reason, buffer=buffer)
            logger.info(f"주문코드 BQ 미매핑 ({order_code}), phone 없음 → 다음 배치 재시도 ({new_bq_retry}/{MAX_BQ_RETRY})")
            continue

        logger.info(f"주문코드 BQ 미매핑 ({order_code}), 전화번호 폴백 시도")
        matched, _ = _resolve_order_by_phone(phone)
        if not matched:
            # phone fallback도 실패 → 주문코드+전화번호 모두 매칭 불가
            # retry를 2씩 증가시켜 에스컬레이션 가속화 (80분→40분)
            new_bq_retry = bq_retry + 2
            bq_fail_reason = re.sub(r'\s*\[bq_retry:\d+/\d+\]', '', order.get("fail_reason") or "").strip()
            bq_fail_reason = f"{bq_fail_reason} [bq_retry:{new_bq_retry}/{MAX_BQ_RETRY}]".strip()
            if not dry_run:
                sheets.update_fail_reason(order["row_index"], bq_fail_reason, buffer=buffer)
            logger.info(f"주문코드 BQ 미매핑 + phone fallback 실패 ({order_code}), 다음 배치 재시도 ({new_bq_retry}/{MAX_BQ_RETRY})")
            continue

        correct_code = matched["order_code"]
        correct_id = matched["order_id"]
        logger.warning(
            f"주문코드 오입력 감지: '{order_code}' → 정정 '{correct_code}' (주문ID {correct_id})"
        )

        if not dry_run:
            # 주문코드·주문ID 모두 시트에 정정
            if correct_code != order_code:
                sheets.update_order_code(order["row_index"], correct_code, buffer=buffer)
            sheets.update_order_id(order["row_index"], correct_id, buffer=buffer)
        else:
            logger.info(
                f"[DRY-RUN] 주문코드 정정 스킵: '{order_code}' → '{correct_code}', ID {correct_id}"
            )

        # 이미 배차 완료 → 차량번호도 바로 시트에 업데이트
        if not dry_run and matched.get("vehicle_number"):
            sheets.update_dispatch(
                order["row_index"],
                matched["vehicle_number"],
                matched.get("rider_name", ""),
                buffer=buffer,
                status="배차완료(폰폴백)",
            )
            logger.info(
                f"주문코드 오입력 건 배차 직접 업데이트: {correct_id}, 차량 {matched['vehicle_number']}"
            )

        resolved += 1

    if not dry_run:
        buffer.flush()
    logger.info(f"주문ID 매핑 완료: {resolved}건, 신규 escalate: {len(new_escalated)}건")
    return resolved, new_escalated


def _recover_terminal_order_by_phone(order: dict, matched: dict, dry_run: bool, buffer) -> None:
    """종료된 주문번호가 들어온 경우 최신 활성 주문으로 시트/메모리 상태를 복구"""
    previous_code = order.get("order_code", "")
    previous_id = order.get("order_id", "")
    correct_code = matched.get("order_code") or previous_code
    correct_id = matched.get("order_id") or previous_id

    logger.warning(
        f"종료 주문 복구: '{previous_code}' ({previous_id}) → '{correct_code}' ({correct_id})"
    )

    order["order_code"] = correct_code
    order["order_id"] = correct_id
    order["vehicle_number"] = matched.get("vehicle_number", "")
    order["rider"] = matched.get("rider_name", "")
    order["rider_phone"] = matched.get("rider_phone", "")

    if dry_run:
        logger.info(
            f"[DRY-RUN] 종료 주문 복구 스킵: '{previous_code}' ({previous_id}) → "
            f"'{correct_code}' ({correct_id})"
        )
        return

    if correct_code != previous_code:
        sheets.update_order_code(order["row_index"], correct_code, buffer=buffer)
    if correct_id != previous_id:
        sheets.update_order_id(order["row_index"], correct_id, buffer=buffer)

    if matched.get("vehicle_number"):
        sheets.update_dispatch(
            order["row_index"],
            matched["vehicle_number"],
            matched.get("rider_name", ""),
            buffer=buffer,
            status="배차완료(폰폴백)",
        )
    else:
        sheets.update_status(order["row_index"], "미배차", buffer=buffer)


def step3_check_dispatch(dry_run: bool = False, rows: list = None) -> tuple:
    """
    Step 3: 시트의 미배차 주문 → 백오피스 API로 배차 확인
    """
    logger.info("--- Step 3: 배차 확인 ---")

    pending = sheets.get_pending_orders(rows)
    logger.info(f"미처리 주문: {len(pending)}건")

    dispatched = []
    api_call_count = 0
    error_count = 0
    today = datetime.now(KST).date()
    buffer = sheets.SheetsWriteBuffer()

    # BQ에서 픽업 날짜 배치 조회 (익일 수거건 감지용)
    order_ids_with_id = [o["order_id"] for o in pending if o.get("order_id") and str(o["order_id"]).isdigit()]
    pickup_dates_map = order_lookup.get_pickup_dates_batch(order_ids_with_id) if order_ids_with_id else {}
    logger.info(f"pickup_dates_map 조회: {len(pickup_dates_map)}건")

    try:
        for order in pending:
            order_id = order["order_id"]
            order_code = order["order_code"]
            chat_id = order.get("chat_id", "")

            # 익일수거 건은 수거일이 오늘이 되면 다시 배차 확인 대상으로 복귀
            if order["dispatch_status"] == "익일수거":
                pickup_date_str = pickup_dates_map.get(str(order_id)) if order_id else None
                if pickup_date_str:
                    try:
                        pickup_date_obj = date.fromisoformat(pickup_date_str)
                        if pickup_date_obj > today:
                            continue
                        logger.info(
                            f"익일수거 재확인 대상 복귀: 주문 {order_id}, 수거일 {pickup_date_str}"
                        )
                    except (ValueError, TypeError):
                        logger.warning(
                            f"익일수거 행 수거일 재확인 실패: 주문 {order_id}, '{pickup_date_str}'"
                        )

            # 감지 후 10일 초과 케이스 스킵 (수거 이미 완료된 건)
            detected_at_str = order.get("detected_at", "")
            if detected_at_str:
                try:
                    detected_date = datetime.strptime(detected_at_str[:10], "%Y-%m-%d").date()
                    age_days = (today - detected_date).days
                    if age_days > 10:
                        logger.warning(
                            f"오래된 케이스 스킵: 주문 {order_code}, 감지 {detected_at_str[:10]} ({age_days}일 전) → 만료 처리"
                        )
                        if not dry_run:
                            sheets.update_status(order["row_index"], "만료", buffer=buffer)
                            sheets.mark_sent(order["row_index"], buffer=buffer)
                        continue
                except (ValueError, TypeError):
                    pass

            # 주문코드 추출 실패 or 주문ID 미매핑 → 배차 조회 불가
            # 단, 수동발송 여부는 반드시 확인 (상담사가 먼저 발송한 경우 Y처리)
            if order_code == "추출실패" or not order_id:
                if chat_id and channeltalk.has_vehicle_number_message(chat_id):
                    logger.info(f"order_id 없는 건 수동발송 감지: 상담 {chat_id} → 수동발송완료")
                    if not dry_run:
                        sheets.update_status(order["row_index"], "수동발송완료", buffer=buffer)
                        sheets.mark_sent(order["row_index"], buffer=buffer)
                continue

            # 이미 차량번호가 있으면 (배차 확인 완료, 발송만 안 된 건)
            if order["vehicle_number"]:
                # phone fallback 출처면 backoffice API로 재검증 (오매칭 방지)
                if "폰폴백" in (order.get("dispatch_status") or ""):
                    dispatch = backoffice.get_dispatch_info(order_id)
                    if not dispatch or dispatch.get("cancelled") or dispatch.get("closed"):
                        logger.warning(f"phone fallback 오매칭 감지: 주문 {order_id} → 배차 정보 초기화")
                        if not dry_run:
                            sheets.clear_dispatch(order["row_index"])
                        continue
                    order["vehicle_number"] = dispatch["vehicle_number"]
                    order["rider"] = dispatch.get("rider_name", order.get("rider", ""))
                    order["rider_phone"] = dispatch.get("rider_phone", "")
                dispatched.append(order)
                continue

            # 익일 수거건 감지: BQ pickup_start_time 기준 (dispatch 조회 전 스킵)
            if order_id:
                pickup_date_str = pickup_dates_map.get(str(order_id))
                if pickup_date_str:
                    try:
                        pickup_date_obj = date.fromisoformat(pickup_date_str)
                        if pickup_date_obj > today:
                            logger.info(f"익일 수거건 감지: 주문 {order_id}, 수거일 {pickup_date_str}. '익일수거'로 상태 변경.")
                            if not dry_run:
                                sheets.update_status(order["row_index"], "익일수거", buffer=buffer)
                            continue
                    except (ValueError, TypeError):
                        logger.warning(f"잘못된 수거일 형식: 주문 {order_id}, '{pickup_date_str}'")

            # 수동 발송 감지: 백오피스 조회 전 채널톡 메시지 이력 확인
            if channeltalk.has_vehicle_number_message(chat_id):
                logger.info(f"수동 발송 감지: 상담 {chat_id}, 자동 Y처리 및 발송 스킵")
                if not dry_run:
                    sheets.update_status(order["row_index"], "수동발송완료", buffer=buffer)
                    sheets.mark_sent(order["row_index"], buffer=buffer)
                continue

            # rate limiting: 50건마다 1분 대기 (API 부하 분산)
            if api_call_count > 0 and api_call_count % 50 == 0:
                logger.info(f"API 부하 분산 대기 (50건 배치 완료, {api_call_count}건 처리)")
                time.sleep(60)

            # 백오피스에서 배차 정보 조회
            try:
                dispatch = backoffice.get_dispatch_info(order_id)
                api_call_count += 1
            except requests.HTTPError as e:
                api_call_count += 1
                # 401 토큰 만료 → 자동 갱신도 실패한 경우 사이클 중단
                if e.response is not None and e.response.status_code == 401:
                    logger.error("백오피스 토큰 만료 (자동 갱신도 실패)")
                    slack_notify.send_error_log(
                        "백오피스 Access Token 만료. 자동 갱신 실패. credentials 확인 필요."
                    )
                    error_count += 1
                    break
                logger.error(f"백오피스 HTTP 에러: 주문 {order_id}, {e}")
                error_count += 1
                dispatch = None
            except Exception as e:
                api_call_count += 1
                logger.error(f"백오피스 조회 에러: 주문 {order_id}, {e}")
                error_count += 1
                dispatch = None

            # 취소 상태 처리
            if isinstance(dispatch, dict) and dispatch.get("cancelled"):
                phone = order.get("phone", "")
                if phone:
                    matched, _ = _resolve_order_by_phone(phone)
                    if matched and matched.get("order_id") != str(order_id):
                        _recover_terminal_order_by_phone(order, matched, dry_run, buffer)
                        if matched.get("vehicle_number"):
                            dispatched.append(order)
                        continue
                logger.info(f"주문 {order_id}: 취소 확인 → 발송 필요 X")
                if not dry_run:
                    sheets.mark_no_send_needed(order["row_index"], "유저취소", buffer=buffer)
                else:
                    logger.info(f"[DRY-RUN] 발송필요X 스킵: 주문 {order_id}")
                continue

            if isinstance(dispatch, dict) and dispatch.get("closed"):
                phone = order.get("phone", "")
                if phone:
                    matched, _ = _resolve_order_by_phone(phone)
                    if matched and matched.get("order_id") != str(order_id):
                        _recover_terminal_order_by_phone(order, matched, dry_run, buffer)
                        if matched.get("vehicle_number"):
                            dispatched.append(order)
                        continue
                reason = dispatch.get("reason") or "처리완료"
                logger.info(f"주문 {order_id}: 종료 상태 확인 → 발송 필요 X ({reason})")
                if not dry_run:
                    sheets.mark_no_send_needed(order["row_index"], reason, buffer=buffer)
                else:
                    logger.info(f"[DRY-RUN] 발송필요X 스킵: 주문 {order_id} ({reason})")
                continue

            if dispatch:
                if not dry_run:
                    sheets.update_dispatch(
                        order["row_index"],
                        dispatch["vehicle_number"],
                        dispatch["rider_name"],
                        buffer=buffer,
                    )
                else:
                    logger.info(f"[DRY-RUN] 시트 업데이트 스킵: 주문 {order_id}")

                order["vehicle_number"] = dispatch["vehicle_number"]
                order["rider"] = dispatch["rider_name"]
                order["rider_phone"] = dispatch.get("rider_phone", "")
                dispatched.append(order)

    finally:
        if not dry_run:
            buffer.flush()

    logger.info(f"배차 완료: {len(dispatched)}건")
    return len(dispatched), dispatched, error_count


def step4_send_messages(dispatched: list, dry_run: bool = False, sent_chat_ids: set = None) -> int:
    """
    Step 4: 배차 완료 건 → 채널톡으로 차량번호 자동 발송
    중복 발송 방지: chat_id 기준 (같은 채팅에만 1회 발송, 다른 채팅은 각자 발송)
    """
    logger.info("--- Step 4: 채널톡 자동 발송 ---")

    sent_count = 0
    error_count = 0
    auth_error = False

    # 이번 배치에서 이미 발송한 chat_id (동일 배치 내 중복 방지)
    sent_this_batch_chats: set = set()
    if sent_chat_ids is None:
        sent_chat_ids = set()

    for order in dispatched:
        chat_id = order["chat_id"]
        vehicle_number = order["vehicle_number"]
        order_id = order["order_id"]
        order_code = order.get("order_code", "")
        rider = order.get("rider", "")

        if not vehicle_number:
            continue

        # 회사차량 케이스: 번호판 미확정 → 발송 스킵 + 슬랙 수동 처리 알림 + Y처리
        if "회사차량" in vehicle_number:
            logger.warning(f"회사차량 배차 스킵: 주문 {order_id}, 값={vehicle_number}")
            if not dry_run:
                slack_notify.send_company_vehicle_alert(order_id, order.get("phone", ""), rider)
                sheets.update_status(order["row_index"], "수동처리필요")
                sheets.mark_sent(order["row_index"])
            continue

        # chat_id 기준 중복 방지: 같은 채팅에 이미 발송됐으면 스킵 (다른 채팅은 각자 발송 허용)
        if chat_id in sent_chat_ids or chat_id in sent_this_batch_chats:
            logger.warning(
                f"중복 발송 차단: 상담 {chat_id} 이미 발송완료. 스킵"
            )
            if not dry_run:
                sheets.mark_sent(order["row_index"])
            continue

        # 메모리 캐시로 중복 발송 방지 (시트 장애 시 방어)
        cache_key = f"{chat_id}:{order_id}"
        if cache_key in _sent_cache:
            logger.info(f"캐시에서 이미 발송 확인, 스킵: 주문 {order_id}")
            continue

        # 채팅 메시지 사전 확인: 상담사 수동 발송 여부 체크 (중복 발송 방지)
        # dry-run에서도 체크해서 감지 여부 로그로 확인 가능
        if channeltalk.is_vehicle_already_sent(chat_id, vehicle_number):
            logger.info(f"이미 발송된 차량번호 감지 (수동 발송 추정), 스킵: 주문 {order_id}, 상담 {chat_id}")
            if not dry_run:
                sheets.mark_sent(order["row_index"])
            continue

        if dry_run:
            logger.info(f"[DRY-RUN] 발송 스킵: 주문 {order_id}, 차량 {vehicle_number}")
            continue

        # 인증 오류가 발생했으면 이후 발송 중단
        if auth_error:
            logger.warning(f"인증 오류로 발송 중단: 주문 {order_id}")
            continue

        # 방문자 정보 요청 감지 (키워드: "방문자", "기사님 이름" 등)
        wants_visitor = channeltalk.needs_visitor_info(chat_id)
        if wants_visitor:
            logger.info(f"방문자 정보 요청 감지: 상담 {chat_id}")

        # 채널톡 메시지 발송 (재문의인 경우 안내 문구 포함)
        result = channeltalk.send_vehicle_message(
            chat_id, vehicle_number,
            rider_name=rider if wants_visitor else "",
            rider_phone=order.get("rider_phone", "") if wants_visitor else "",
            tag=order.get("tag", "차량등록"),
        )

        if result == SendResult.SUCCESS:
            # 메모리 캐시에 즉시 기록
            _sent_cache.add(cache_key)
            sent_this_batch_chats.add(chat_id)

            # 시트에 발송 완료 표시 (실패 시 재시도 + 경고)
            try:
                sheets.mark_sent(order["row_index"])
            except Exception as e:
                logger.error(f"mark_sent 실패 (중복 발송 위험): 주문 {order_id}, {e}")
                slack_notify.send_error_log(
                    f"mark_sent 실패 - 중복 발송 위험! 주문 #{order_id}, 행 {order['row_index']}. 수동 확인 필요."
                )

            # 슬랙 로그
            slack_notify.send_dispatch_log(order_id, vehicle_number, rider, order.get("phone", ""))

            sent_count += 1

        elif result == SendResult.AUTH_ERROR:
            auth_error = True
            error_count += 1
            slack_notify.send_error_log("채널톡 인증 만료. 키 재발급 필요.")

        else:
            error_count += 1
            slack_notify.send_error_log(
                f"채널톡 발송 실패: 주문 #{order_id}"
            )

    logger.info(f"발송 완료: {sent_count}건")
    return sent_count, error_count


def run_once(dry_run: bool = False, skip_send: bool = False, loop_mode: bool = False):
    """1회 실행 (loop_mode=True: 스레드 reply + 스레드 유지)"""
    logger.info("=" * 60)
    logger.info(f"실행 시작: {datetime.now(KST).strftime('%Y-%m-%d %H:%M:%S')}")
    mode = "DRY-RUN" if dry_run else ("SKIP-SEND" if skip_send else "LIVE")
    logger.info(f"모드: {mode}")
    logger.info("=" * 60)

    if not dry_run and not loop_mode:
        slack_notify.send_run_start()

    detected = 0
    extraction_failed = 0
    dispatched_count = 0
    sent = 0
    error_count = 0
    all_rows = []
    new_manual = []
    new_escalated = []
    today_summary = None
    new_chats = []
    dispatched = []
    sent_chat_ids: set = set()
    step1_blocked = False

    # Step 1: 채널톡 태그 감지 (시트 초기화 포함)
    try:
        sheets.ensure_headers()
        all_rows = sheets.get_all_rows()
        new_chats = step1_detect_tagged_chats(all_rows)
    except Exception as e:
        step1_blocked = True
        error_count += 1
        logger.exception(f"Step 1 에러: {e}")
        if not dry_run:
            slack_notify.send_error_log(f"Step 1 (채널톡 감지) 에러: {e}")

    if step1_blocked:
        logger.error("Step 1 실패로 이후 단계 중단")
        logger.info(f"실패: 감지 {detected} / 배차 {dispatched_count} / 발송 {sent} / 에러 {error_count} / 추출실패 {extraction_failed}")
        return False

    # Step 2: 주문번호 추출 + 시트 적재
    try:
        detected, new_manual = step2_extract_and_save(new_chats, dry_run)
        extraction_failed = len(new_manual)
        if detected > 0 or new_manual:
            all_rows = sheets.get_all_rows()
    except Exception as e:
        logger.exception(f"Step 2 에러: {e}")
        if not dry_run:
            slack_notify.send_error_log(f"Step 2 (추출+적재) 에러: {e}")

    # Step 2.5: 주문코드 → 주문ID 매핑 (BigQuery)
    try:
        resolved, new_escalated = step2_5_resolve_order_ids(dry_run, all_rows)
        if resolved > 0 or new_escalated:
            all_rows = sheets.get_all_rows()
        all_manual = new_manual + new_escalated
        if all_manual and not dry_run:
            slack_notify.send_manual_required_alert(all_manual)
            extraction_failed = len(all_manual)
    except Exception as e:
        logger.exception(f"Step 2.5 에러: {e}")
        if not dry_run:
            slack_notify.send_error_log(f"Step 2.5 (ID매핑) 에러: {e}")

    # Step 3: 배차 확인 (step2 실패해도 기존 pending 주문 배차 확인 가능)
    try:
        dispatched_count, dispatched, step3_errors = step3_check_dispatch(dry_run, all_rows)
        error_count += step3_errors
        if dispatched_count > 0 or step3_errors > 0:
            all_rows = sheets.get_all_rows()
        sent_chat_ids = {
            row[sheets.COL_CHAT_ID]
            for row in all_rows
            if len(row) > sheets.COL_SENT and row[sheets.COL_SENT] == "Y"
        }
    except Exception as e:
        logger.exception(f"Step 3 에러: {e}")
        if not dry_run:
            slack_notify.send_error_log(f"Step 3 (배차확인) 에러: {e}")

    # Step 4: 채널톡 발송
    try:
        sent, step4_errors = step4_send_messages(dispatched, dry_run or skip_send, sent_chat_ids)
        error_count += step4_errors
    except Exception as e:
        logger.exception(f"Step 4 에러: {e}")
        if not dry_run:
            slack_notify.send_error_log(f"Step 4 (발송) 에러: {e}")
        error_count += 1

    # 당일 누적 집계
    try:
        today_summary = sheets.get_today_summary()
    except Exception:
        pass

    if not dry_run:
        slack_notify.send_summary(detected, dispatched_count, sent, error_count, extraction_failed, today_summary=today_summary, keep_thread=loop_mode)
    logger.info(f"완료: 감지 {detected} / 배차 {dispatched_count} / 발송 {sent} / 에러 {error_count} / 추출실패 {extraction_failed}")
    return True



def run_loop(dry_run: bool = False):
    """
    연속 폴링 모드 (21:00~23:00, 10분 간격)
    저녁 전체 알림을 1개 스레드로 묶어 발송
    """
    logger.info("연속 폴링 모드 시작")

    last_collapse_date = None  # 과거 행 접기는 하루 1회만
    evening_started = False  # 저녁 부모 메시지 발송 여부

    while True:
        now = datetime.now(KST)
        today = now.strftime("%Y-%m-%d")

        # 운영 시간 체크 (datetime.time 비교로 경계값 버그 방지)
        if config.OPERATION_START <= now.time() <= config.OPERATION_END:
            # 저녁 부모 메시지 1회 발송 (이후 모든 알림이 이 스레드에 쌓임)
            if not evening_started and not dry_run:
                slack_notify.send_evening_start()
                evening_started = True

            succeeded = run_once(dry_run, loop_mode=True)
            if not succeeded:
                logger.error("치명 오류로 저녁 루프 종료")
                return False

            # 23:00 배치 직후에는 추가 대기 없이 즉시 종료
            if now.time() >= config.OPERATION_END:
                logger.info("마지막 운영 배치 완료, 프로그램 종료")
                slack_notify._current_batch_ts = None
                break

            # 하루 첫 배치 실행 후 1회만 과거 날짜 행 접기
            if today != last_collapse_date:
                try:
                    sheets.collapse_past_date_rows(sheets.get_all_rows())
                    last_collapse_date = today
                except Exception as e:
                    logger.warning(f"행 그룹화 실패 (무시): {e}")

        elif now.time() > config.OPERATION_END:
            logger.info("운영 시간 종료, 프로그램 종료")
            slack_notify._current_batch_ts = None
            break
        else:
            logger.debug(f"운영 시간 외: {now.time().strftime('%H:%M')}")

        # 다음 폴링까지 대기
        sleep_seconds = config.POLLING_INTERVAL_MINUTES * 60
        logger.info(f"다음 실행까지 {config.POLLING_INTERVAL_MINUTES}분 대기")
        time.sleep(sleep_seconds)
    return True


def main():
    parser = argparse.ArgumentParser(description="차량번호 배차 자동 알림 시스템")
    parser.add_argument("--loop", action="store_true", help="연속 폴링 모드 (21:00~23:00)")
    parser.add_argument("--dry-run", action="store_true", help="드라이런 (실제 발송 없이 감지만)")
    parser.add_argument("--skip-send", action="store_true", help="채널톡 발송만 스킵 (시트/BQ/배차확인은 실제 실행)")
    args = parser.parse_args()

    # 설정 초기화 (디렉토리 생성 + 환경변수 검증)
    config.init()

    # 허용된 머신 검증 (ALLOWED_HOST 필수 — 미설정 또는 불일치 시 종료)
    if not config.ALLOWED_HOST:
        logger.warning("ALLOWED_HOST 미설정 — 종료")
        sys.exit(0)
    current_host = get_current_host()
    if current_host != config.ALLOWED_HOST:
        logger.warning(f"허용되지 않은 머신 ({current_host}) — 종료 (ALLOWED_HOST={config.ALLOWED_HOST})")
        sys.exit(0)

    # 중복 실행 방지
    if not acquire_lock():
        logger.info("이미 실행 중인 프로세스가 있습니다 — 종료")
        sys.exit(0)

    # 백오피스 토큰 모드 로깅
    if backoffice_auth.is_auto_login_available():
        logger.info("백오피스: 자동 로그인 모드 (50분마다 자동 갱신)")
        # 시작 시 토큰 미리 발급
        token = backoffice_auth.get_valid_token()
        if token:
            logger.info("백오피스: 초기 토큰 발급 성공")
        else:
            logger.warning("백오피스: 초기 토큰 발급 실패 (credentials 확인 필요)")
    else:
        logger.info("백오피스: 수동 토큰 모드 (환경변수 BACKOFFICE_ACCESS_TOKEN)")

    if args.loop:
        if not run_loop(args.dry_run):
            sys.exit(1)
    else:
        if not run_once(args.dry_run, skip_send=args.skip_send):
            sys.exit(1)


if __name__ == "__main__":
    main()
