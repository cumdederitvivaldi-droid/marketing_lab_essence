"""슬랙 봇 토큰 기반 채널 메시지 + DM + 파일 업로드."""

import logging
from datetime import datetime, timedelta, timezone

import requests

from config import SPREADSHEET_ID, SHEET_GID
from delivery_monitor import RunResult, Snapshot, classify_status, summarize_failures

logger = logging.getLogger(__name__)

KST = timezone(timedelta(hours=9))


def post_channel_message(bot_token: str, channel_id: str, text: str) -> None:
    """슬랙 봇으로 채널 메시지를 전송한다."""
    if not bot_token or not channel_id:
        return
    try:
        resp = requests.post(
            "https://slack.com/api/chat.postMessage",
            headers={"Authorization": f"Bearer {bot_token}"},
            json={"channel": channel_id, "text": text},
            timeout=10,
        )
        body = resp.json()
        if not body.get("ok"):
            logger.warning(f"[슬랙] 채널 메시지 실패: {body.get('error', 'unknown')}")
    except Exception as e:
        logger.warning(f"[슬랙] 채널 메시지 예외: {e}")


def post_dm(bot_token: str, user_id: str, text: str) -> None:
    """슬랙 봇으로 DM을 전송한다."""
    if not bot_token or not user_id:
        return
    try:
        resp = requests.post(
            "https://slack.com/api/chat.postMessage",
            headers={"Authorization": f"Bearer {bot_token}"},
            json={"channel": user_id, "text": text},
            timeout=10,
        )
        body = resp.json()
        if not body.get("ok"):
            logger.warning(f"[슬랙] DM 실패: {body.get('error', 'unknown')}")
    except Exception as e:
        logger.warning(f"[슬랙] DM 예외: {e}")


def upload_file_to_channel(
    bot_token: str,
    channel_id: str,
    content: bytes,
    filename: str,
    message: str,
    title: str = "",
) -> None:
    """슬랙 채널에 파일을 업로드한다.

    files.upload API는 2025-11 폐기됨.
    files.getUploadURLExternal → PUT 업로드 → files.completeUploadExternal 3단계로 처리.

    Args:
        filename: URL/permalink 에 사용되는 이름. ASCII 권장 (Slack 이 한글/기호를 sanitize 함).
        title:    Slack 채널에 표시되는 제목. 한글 가능. 기본값=filename.
    """
    if not bot_token or not channel_id:
        return
    headers = {"Authorization": f"Bearer {bot_token}"}
    try:
        # 1단계: 업로드 URL + file_id 발급
        resp = requests.post(
            "https://slack.com/api/files.getUploadURLExternal",
            headers=headers,
            data={"filename": filename, "length": len(content)},
            timeout=10,
        )
        body = resp.json()
        if not body.get("ok"):
            logger.warning(f"[슬랙] 업로드 URL 요청 실패: {body.get('error', 'unknown')}")
            return
        upload_url = body["upload_url"]
        file_id = body["file_id"]

        # 2단계: 파일 데이터 POST 업로드 (multipart/form-data)
        put_resp = requests.post(
            upload_url,
            files={"file": (filename, content)},
            timeout=60,
        )
        if put_resp.status_code >= 300:
            logger.warning(f"[슬랙] 파일 PUT 실패: HTTP {put_resp.status_code}")
            return

        # 3단계: 업로드 완료 + 채널 공유
        complete_resp = requests.post(
            "https://slack.com/api/files.completeUploadExternal",
            headers=headers,
            json={
                "files": [{"id": file_id, "title": title or filename}],
                "channel_id": channel_id,
                "initial_comment": message,
            },
            timeout=10,
        )
        complete_body = complete_resp.json()
        if not complete_body.get("ok"):
            logger.warning(f"[슬랙] 파일 업로드 완료 실패: {complete_body.get('error', 'unknown')}")
            return

        # completeUploadExternal ok 시 initial_comment 가 이미 게시되므로 추가 발송 불필요
        shared = complete_body.get("files", [{}])[0].get("channels", [])
        if not shared:
            logger.info("[슬랙] completeUploadExternal 응답에 channels 비어있음 (initial_comment 는 정상 게시됨)")
    except Exception as e:
        logger.warning(f"[슬랙] 파일 업로드 예외: {e}")


def send_notifications(config, text: str) -> None:
    """채널 메시지 + DM 일괄 전송."""
    if not text:
        return
    post_channel_message(config.slack_bot_token, config.slack_channel_id, text)
    if config.slack_bot_token and config.slack_dm_user_ids:
        sent: set[str] = set()
        for uid in config.slack_dm_user_ids:
            if uid in sent:
                continue
            sent.add(uid)
            post_dm(config.slack_bot_token, uid, text)


def _status_icon(status_text: str) -> str:
    """모니터 상태 문구를 색상 이모지로 매핑."""
    # 데이터 자체가 없는 정상 종료 케이스
    if status_text == "대상 없음":
        return "🟢"
    # 정상 완료
    if "정상" in status_text and "위험" not in status_text:
        return "🟢"
    # 즉시 조치 필요: 접수누락위험, 시트/데이터 부재, 결과 없음
    if "위험" in status_text or "없음" in status_text:
        return "🔴"
    # 부분 실패, 잔여 미처리, 배송불가 포함 완료 등
    return "🟡"


def build_monitor_text(
    mode: str,
    result: RunResult,
    elapsed_s: float,
    snapshot: Snapshot | None,
) -> str:
    """배송 접수 결과 슬랙 메시지를 Slack mrkdwn 으로 구성한다."""
    if not result:
        return ""
    now_text = datetime.now(KST).strftime("%Y/%m/%d %H:%M")
    sent_count = result.sent_count
    unsupported_count = len(result.unsupported)
    completed_count = sent_count + unsupported_count
    sheet_url = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit?gid={SHEET_GID}"
    status_text = classify_status(result, snapshot)

    sections: list[str] = []
    sections.append(f"*📦 [150L 봉투] 배송 접수 모니터*\n_{now_text} · {mode} 실행_")

    result_lines = [
        "*결과*",
        f"• ✅ 접수완료 *{completed_count}건*  _(정상 {sent_count} + 배송불가 {unsupported_count})_",
    ]
    if result.fail_count:
        result_lines.append(f"• ❌ 실패 *{result.fail_count}건*")
    else:
        result_lines.append(f"• ❌ 실패 0건")
    result_lines.append(f"• ⏭️ 중복 제외 *{result.dup_count}건*  _(후보 {result.candidate_count}건)_")
    sections.append("\n".join(result_lines))

    status_lines = [
        "*상태*",
        f"• {_status_icon(status_text)} {status_text}",
    ]
    if snapshot:
        pending = f"• 📝 남은 미처리 *{snapshot.pending_count}건*"
        if snapshot.oldest_pending_text and snapshot.oldest_pending_text != "-":
            pending += f"  _(가장 오래됨 {snapshot.oldest_pending_text})_"
        status_lines.append(pending)
        if snapshot.orphan_completed_count:
            status_lines.append(f"• ⚠️ 접수누락위험 *{snapshot.orphan_completed_count}건*")
    status_lines.append(f"• ⏱️ 처리시간 {elapsed_s:.1f}초")
    sections.append("\n".join(status_lines))

    fail_summary = summarize_failures(result.fail_details)
    if fail_summary:
        sections.append(f"*실패 상세*\n> {fail_summary}")

    sections.append(f"<{sheet_url}|📄 감시 시트 열기>")

    return "\n\n".join(sections)


def build_watchdog_text(
    slot_spec: dict,
    status: str,
    detail: str,
    snapshot: Snapshot | None,
) -> str:
    """감시 경보 슬랙 메시지를 Slack mrkdwn 으로 구성한다."""
    now_text = datetime.now(KST).strftime("%Y/%m/%d %H:%M")
    sheet_url = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit?gid={SHEET_GID}"
    slot_label = f"{slot_spec['label']} {slot_spec['delivery_hour']:02d}:{slot_spec['delivery_minute']:02d}"

    sections: list[str] = []
    sections.append(f"*🔎 [150L 봉투] 자동 접수 감시*\n_{now_text}_")
    sections.append(f"⚠️ *{slot_label} 슬롯* — {status}\n> {detail}")

    if snapshot:
        state_lines = ["*현재 상태*"]
        state_lines.append(f"• 📝 미처리 *{snapshot.pending_count}건*")
        if snapshot.orphan_completed_count:
            state_lines.append(f"• ⚠️ 접수누락위험 *{snapshot.orphan_completed_count}건*")
        if snapshot.oldest_pending_text and snapshot.oldest_pending_text != "-":
            state_lines.append(f"• 🕐 가장 오래됨 {snapshot.oldest_pending_text}")
        sections.append("\n".join(state_lines))

    sections.append(f"<{sheet_url}|📄 감시 시트 열기>")

    return "\n\n".join(sections)
