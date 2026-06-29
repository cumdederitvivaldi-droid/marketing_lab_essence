#!/usr/bin/env python3
"""Daily Slack monitor for active FlareLane experiments."""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests
from google.cloud import bigquery

from config import _load_env_file


_load_env_file()

PROJECT = "covering-app-ccd23"
KST = timezone(timedelta(hours=9))
SERVICE_API_BASE = "https://service-api.flarelane.com/v1"
DEFAULT_SLACK_CHANNEL = "#실험실_notifications"
FOCUS_EXPERIMENT_KEYS = (
    "friend_invite_experiment_v1",
    "d3_crm_ab_test_v3",
    "d8_crm_ab_test_v3",
)
FRIEND_INVITE_KEY = "friend_invite_experiment_v1"
BAG_NUDGE_KEYS = ("d3_crm_ab_test_v3", "d8_crm_ab_test_v3")
BAG_NUDGE_START_DATE = "2026-04-20"
EXPERIMENT_CONTENT_OVERRIDES: dict[str, dict[str, str]] = {}

LOG_DIR = Path(__file__).resolve().parents[1] / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_DIR / "batch.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LiveAutomation:
    name: str
    sent: int = 0
    clicked: int = 0
    failed: int = 0
    waiting: int = 0


@dataclass(frozen=True)
class LiveResult:
    status: str
    detail: str
    active_count: int = 0
    friendtalk_sent: int = 0
    friendtalk_clicked: int = 0
    friendtalk_failed: int = 0
    active_automations: tuple[LiveAutomation, ...] = ()


def query_rows(client: bigquery.Client, sql: str) -> list[dict[str, Any]]:
    return [dict(row.items()) for row in client.query(sql).result()]


def fetch_inventory(client: bigquery.Client) -> list[dict[str, Any]]:
    focus_keys = ", ".join(f"'{key}'" for key in FOCUS_EXPERIMENT_KEYS)
    sql = f"""
    SELECT
      experiment_key,
      experiment_name,
      slot_key,
      product_labs_status,
      owner,
      hypothesis,
      experiment_arms,
      send_channel,
      required_event_names,
      latest_activity_date,
      days_since_latest,
      observed_units,
      arms,
      inventory_status,
      recommended_action
    FROM `covering-app-ccd23.product.v_flarelane_live_experiment_inventory`
    WHERE experiment_key IN ({focus_keys})
    ORDER BY
      CASE inventory_status
        WHEN 'registered_recent_signal' THEN 1
        WHEN 'needs_triage_recent_signal' THEN 2
        WHEN 'registered_without_bigquery_signal' THEN 3
        ELSE 4
      END,
      experiment_key
    """
    return query_rows(client, sql)


def fetch_friend_invite_summary(client: bigquery.Client) -> list[dict[str, Any]]:
    sql = """
    WITH latest AS (
      SELECT MAX(run_date) AS latest_run_date
      FROM `covering-app-ccd23.product.friend_invite_experiment_v1`
    ),
    cohort AS (
      SELECT
        e.invite_code,
        e.variant,
        e.experiment_group,
        e.share_url
      FROM `covering-app-ccd23.product.friend_invite_experiment_v1` e
      CROSS JOIN latest
      WHERE e.run_date = latest.latest_run_date
    ),
    mp_code_events AS (
      SELECT
        event_name,
        COALESCE(
          JSON_VALUE(properties, "$.invite_code"),
          REGEXP_EXTRACT(TO_JSON_STRING(properties), r'invite_code[=%:]+([^&",}]+)')
        ) AS invite_code,
        JSON_VALUE(properties, "$.variant") AS variant,
        time
      FROM `covering-app-ccd23.mixpanel.mp_master_event`
      CROSS JOIN latest
      WHERE _PARTITIONDATE >= DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 7 DAY)
        AND DATE(time, 'Asia/Seoul') >= latest.latest_run_date
        AND event_name IN (
          '[ROUTE] ReferralInviterScreen',
          '[CLICK] ReferralInviterScreen_shareButton',
          '[CLICK] ReferralInviterScreen_copyFallback',
          '[ROUTE] ReferralInviteeScreen',
          '[CLICK] ReferralInviteeScreen_signupButton',
          '[EVENT] ReferralLinkResolved'
        )
    ),
    code_flags AS (
      SELECT
        c.experiment_group,
        c.invite_code,
        MAX(IF(m.event_name = '[ROUTE] ReferralInviterScreen', 1, 0)) AS inviter_view,
        MAX(IF(m.event_name IN ('[CLICK] ReferralInviterScreen_shareButton', '[CLICK] ReferralInviterScreen_copyFallback'), 1, 0)) AS share_action,
        MAX(IF(m.event_name = '[ROUTE] ReferralInviteeScreen', 1, 0)) AS invitee_view,
        MAX(IF(m.event_name = '[CLICK] ReferralInviteeScreen_signupButton', 1, 0)) AS signup_click,
        MAX(IF(m.event_name = '[EVENT] ReferralLinkResolved', 1, 0)) AS link_resolved
      FROM cohort c
      LEFT JOIN mp_code_events m
        ON m.invite_code = c.invite_code
       AND m.variant = c.variant
       AND NULLIF(c.share_url, '') IS NOT NULL
      GROUP BY 1, 2
    ),
    airbridge_summary AS (
      SELECT
        'treatment' AS experiment_group,
        COUNT(DISTINCT IF(event_name = '[Airbridge] App Install', COALESCE(user_id, distinct_id, device_id), NULL)) AS airbridge_install_users,
        COUNT(DISTINCT IF(event_name = '[Airbridge] Sign-up', COALESCE(user_id, distinct_id, device_id), NULL)) AS airbridge_signup_users
      FROM `covering-app-ccd23.mixpanel.mp_master_event`
      CROSS JOIN latest
      WHERE _PARTITIONDATE >= DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 7 DAY)
        AND DATE(time, 'Asia/Seoul') >= latest.latest_run_date
        AND event_name IN ('[Airbridge] App Install', '[Airbridge] Sign-up')
        AND JSON_VALUE(properties, '$."[Airbridge] ad_group"') = 'friend_invite_v1'
      GROUP BY 1
    ),
    reward_summary AS (
      SELECT
        COUNT(DISTINCT IF(status = 'issued' AND reward_target = 'invitee', invitee_user_id, NULL)) AS invitee_rewards_issued,
        COUNT(DISTINCT IF(status = 'permanently_failed' AND reward_target = 'invitee', invitee_user_id, NULL)) AS invitee_rewards_failed
      FROM `covering-app-ccd23.product.friend_invite_reward_issuance_v1`
      WHERE run_date >= DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 7 DAY)
        AND variant IN ('friend_invite_v1', 'friend_invite_v1_public')
    ),
    summary AS (
      SELECT
        cf.experiment_group,
        COUNT(DISTINCT cf.invite_code) AS assigned_codes,
        SUM(inviter_view) AS inviter_view_codes,
        SUM(share_action) AS share_action_codes,
        SUM(invitee_view) AS invitee_view_codes,
        SUM(signup_click) AS signup_click_codes,
        SUM(link_resolved) AS link_resolved_codes
      FROM code_flags cf
      GROUP BY 1
    )
    SELECT
      latest.latest_run_date,
      s.*,
      COALESCE(a.airbridge_install_users, 0) AS airbridge_install_users,
      COALESCE(a.airbridge_signup_users, 0) AS airbridge_signup_users,
      rs.invitee_rewards_issued,
      rs.invitee_rewards_failed
    FROM summary s
    CROSS JOIN latest
    CROSS JOIN reward_summary rs
    LEFT JOIN airbridge_summary a USING (experiment_group)
    ORDER BY experiment_group
    """
    return query_rows(client, sql)


def fetch_bag_nudge_d3_summary(client: bigquery.Client) -> list[dict[str, Any]]:
    sql = f"""
    WITH paid_orders AS (
      SELECT DISTINCT o.id AS order_id, o.user_id, o.created_at
      FROM `covering-app-ccd23.secure_dataset.order_v2` o
      JOIN `covering-app-ccd23.secure_dataset.order_invoice` oi ON oi.order_id = o.id
      JOIN `covering-app-ccd23.secure_dataset.receipt` r ON r.invoice_id = oi.invoice_id
      WHERE o.deleted_at IS NULL
        AND o.status != 'CANCELED'
        AND r.status = 'PAID'
        AND r.deleted_at IS NULL
        AND o.user_id IS NOT NULL
    ),
    first_bag AS (
      SELECT po.user_id, MIN(po.created_at) AS first_bag_ts
      FROM paid_orders po
      JOIN `covering-app-ccd23.secure_dataset.order_line` ol
        ON ol.order_id = po.order_id
       AND ol.deleted_at IS NULL
      JOIN `covering-app-ccd23.secure_dataset.product` p
        ON p.id = ol.product_id
      WHERE p.product_code IN ('COVERING_BAG', 'LARGE_COVERING_BAG')
      GROUP BY po.user_id
    ),
    pickup_orders AS (
      SELECT po.user_id, po.created_at AS pickup_ts
      FROM paid_orders po
      JOIN `covering-app-ccd23.secure_dataset.order_line` ol
        ON ol.order_id = po.order_id
       AND ol.deleted_at IS NULL
      JOIN `covering-app-ccd23.secure_dataset.product` p
        ON p.id = ol.product_id
      WHERE p.product_type = 'SERVICE'
    ),
    cohort AS (
      SELECT
        fb.user_id,
        fb.first_bag_ts,
        MIN(po.pickup_ts) AS first_pickup_after_bag_ts
      FROM first_bag fb
      LEFT JOIN pickup_orders po
        ON po.user_id = fb.user_id
       AND po.pickup_ts > fb.first_bag_ts
      WHERE DATE(fb.first_bag_ts, 'Asia/Seoul') >= DATE '{BAG_NUDGE_START_DATE}'
        AND DATE(fb.first_bag_ts, 'Asia/Seoul') <= DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 7 DAY)
        AND NOT EXISTS (
          SELECT 1
          FROM pickup_orders prev
          WHERE prev.user_id = fb.user_id
            AND prev.pickup_ts <= TIMESTAMP_ADD(fb.first_bag_ts, INTERVAL 3 DAY)
        )
      GROUP BY fb.user_id, fb.first_bag_ts
    ),
    treatment AS (
      SELECT DISTINCT user_id
      FROM `covering-app-ccd23.product.d7crm_d3_treatment`
    )
    SELECT
      IF(t.user_id IS NULL, 'CONTROL', 'TREATMENT') AS arm,
      COUNT(DISTINCT c.user_id) AS users,
      COUNT(DISTINCT IF(
        c.first_pickup_after_bag_ts > TIMESTAMP_ADD(c.first_bag_ts, INTERVAL 3 DAY)
        AND c.first_pickup_after_bag_ts <= TIMESTAMP_ADD(c.first_bag_ts, INTERVAL 7 DAY),
        c.user_id,
        NULL
      )) AS d7_converted,
      ROUND(100 * SAFE_DIVIDE(COUNT(DISTINCT IF(
        c.first_pickup_after_bag_ts > TIMESTAMP_ADD(c.first_bag_ts, INTERVAL 3 DAY)
        AND c.first_pickup_after_bag_ts <= TIMESTAMP_ADD(c.first_bag_ts, INTERVAL 7 DAY),
        c.user_id,
        NULL
      )), COUNT(DISTINCT c.user_id)), 2) AS d7_conversion_pct
    FROM cohort c
    LEFT JOIN treatment t ON c.user_id = t.user_id
    GROUP BY arm
    ORDER BY arm
    """
    return query_rows(client, sql)


def ratio(numerator: int, denominator: int) -> float:
    return numerator / denominator if denominator else 0.0


def percent(value: float) -> str:
    return f"{value * 100:.1f}%"


def bar(value: float, max_value: float, width: int = 12) -> str:
    if max_value <= 0:
        return "░" * width
    filled = round(width * value / max_value)
    filled = max(0, min(width, filled))
    return "█" * filled + "░" * (width - filled)


def fetch_flarelane_live() -> LiveResult:
    project_id = os.environ.get("FLARELANE_PROJECT_ID", "").strip()
    bearer = (
        os.environ.get("FLARELANE_LIVE_BEARER", "").strip()
        or os.environ.get("FLARELANE_CONSOLE_BEARER", "").strip()
        or os.environ.get("FLARELANE_BEARER", "").strip()
    )
    if not project_id or not bearer:
        return LiveResult("failed", "server monitor env에 live bearer 미설정")

    try:
        automations = service_api_get(project_id, "/automations", bearer).get("data", [])
        active = [item for item in automations if item.get("active")]
        sent = clicked = failed = 0
        active_automations: list[LiveAutomation] = []
        for item in active:
            automation_id = item.get("id")
            if not automation_id:
                continue
            detail = service_api_get(project_id, f"/automations/{automation_id}", bearer).get("data", {})
            stats = extract_friendtalk_stats(detail.get("startActions") or [])
            sent += stats["sent"]
            clicked += stats["clicked"]
            failed += stats["failed"]
            active_automations.append(
                LiveAutomation(
                    name=str(detail.get("name") or item.get("name") or automation_id),
                    sent=stats["sent"],
                    clicked=stats["clicked"],
                    failed=stats["failed"],
                    waiting=stats["waiting"],
                )
            )
        return LiveResult("ok", "조회 성공", len(active_automations), sent, clicked, failed, tuple(active_automations))
    except Exception as exc:
        return LiveResult("failed", str(exc)[:180])


def service_api_get(project_id: str, path: str, bearer: str) -> dict[str, Any]:
    response = requests.get(
        f"{SERVICE_API_BASE}/projects/{project_id}{path}",
        headers={"Authorization": f"Bearer {bearer}", "Content-Type": "application/json"},
        timeout=20,
    )
    if not response.ok:
        raise RuntimeError(f"FlareLane live 조회 실패: {response.status_code}")
    return response.json()


def iter_actions(actions: list[dict[str, Any]]) -> Any:
    for action in actions or []:
        yield action
        yield from iter_actions(action.get("nextActions") or [])


def extract_friendtalk_stats(actions: list[dict[str, Any]]) -> dict[str, int]:
    stats = {"sent": 0, "clicked": 0, "failed": 0, "waiting": 0}
    for action in iter_actions(actions):
        if action.get("type") != "SEND_FRIENDTALK":
            continue
        stats["sent"] += int(action.get("sent") or 0)
        stats["clicked"] += int(action.get("clicked") or 0)
        stats["failed"] += int(action.get("failed") or 0)
        stats["waiting"] += int(action.get("waiting") or 0)
    return stats


def build_message(
    inventory: list[dict[str, Any]],
    friend_invite: list[dict[str, Any]],
    bag_nudge_d3: list[dict[str, Any]],
    live: LiveResult,
) -> str:
    now = datetime.now(KST).strftime("%m/%d %H:%M")
    inventory_by_key = {str(row.get("experiment_key")): row for row in inventory}
    friend_row = inventory_by_key.get(FRIEND_INVITE_KEY)
    bag_rows = [inventory_by_key.get(key) for key in BAG_NUDGE_KEYS if inventory_by_key.get(key)]
    governance_risk = [row for row in bag_rows if row and row["inventory_status"] == "registered_without_bigquery_signal"]
    badges: list[str] = []
    if live.status != "ok":
        badges.append("[주의] FlareLane live 미조회")
    if governance_risk:
        badges.append("[주의] D3/D8 장부 보강 필요")
    if not badges:
        badges.append("[정상]")

    lines = [
        f"*FlareLane 핵심 실험 모니터* {' '.join(badges)}",
        f"확인 시각: {now} KST",
        "",
        "대상: 친구초대 실험, 첫 봉투 구매 후 미수거신청 D+3/D+8 여정",
    ]

    if live.status == "ok":
        lines.append(
            f"FlareLane live 조회: 성공 (활성 여정 {live.active_count}개, 친구톡 발송 {live.friendtalk_sent}, 클릭 {live.friendtalk_clicked}, 실패 {live.friendtalk_failed})"
        )
    else:
        lines.append(f"FlareLane live 조회: 실패 ({live.detail})")
        lines.append("친구톡 sent/click 실시간 지표는 제외하고, BigQuery 기준 퍼널만 보고합니다.")

    lines += ["", *format_friend_invite_section(friend_row, friend_invite, live)]
    lines += ["", *format_bag_nudge_section(bag_rows, bag_nudge_d3, live)]
    return "\n".join(lines)


def format_friend_invite_section(
    inventory_row: dict[str, Any] | None,
    rows: list[dict[str, Any]],
    live: LiveResult,
) -> list[str]:
    treatment = next((row for row in rows if row.get("experiment_group") == "treatment"), {})
    control = next((row for row in rows if row.get("experiment_group") == "control"), {})
    latest = clean_value(treatment.get("latest_run_date") or control.get("latest_run_date")) or "run_date 없음"
    assigned = int(treatment.get("assigned_codes") or 0)
    inviter_view = int(treatment.get("inviter_view_codes") or 0)
    share_action = int(treatment.get("share_action_codes") or 0)
    invitee_view = int(treatment.get("invitee_view_codes") or 0)
    signup_click = int(treatment.get("signup_click_codes") or 0)
    signups = int(treatment.get("airbridge_signup_users") or 0)
    rewards = int(treatment.get("invitee_rewards_issued") or 0)
    max_value = max(inviter_view, share_action, invitee_view, signup_click, signups, rewards, 1)

    lines = ["친구초대 실험:"]
    if inventory_row:
        lines.extend(format_experiment_content(inventory_row))
    lines.append(f"  최신 코호트: {latest}, treatment 배정 코드 {assigned:,}개")
    lines.append(f"  초대자 화면 {bar_count(inviter_view, max_value)} {inviter_view:,}개 · 공유/복사 {share_action:,}개 ({percent(ratio(share_action, inviter_view))})")
    lines.append(f"  피초대 화면 {bar_count(invitee_view, max_value)} {invitee_view:,}개 · 가입 CTA {signup_click:,}개 ({percent(ratio(signup_click, invitee_view))})")
    lines.append(f"  Airbridge 가입 {signups:,}명 · 피초대자 쿠폰 발급 {rewards:,}건")
    live_lines = format_matching_live(live, ("friend", "invite", "친구", "eng2314"))
    if live_lines:
        lines += ["  FlareLane active: " + " / ".join(live_lines[:3])]
    return lines


def format_bag_nudge_section(
    inventory_rows: list[dict[str, Any] | None],
    d3_rows: list[dict[str, Any]],
    live: LiveResult,
) -> list[str]:
    rows = [row for row in inventory_rows if row]
    lines = ["첫 봉투 미수거신청 D+3/D+8 여정:"]
    for row in rows:
        lines.extend(format_experiment_content(row))

    by_arm = {str(row["arm"]): row for row in d3_rows}
    control = by_arm.get("CONTROL", {})
    treatment = by_arm.get("TREATMENT", {})
    control_rate = float(control.get("d7_conversion_pct") or 0.0) / 100
    treatment_rate = float(treatment.get("d7_conversion_pct") or 0.0) / 100
    diff_pp = (treatment_rate - control_rate) * 100
    max_rate = max(control_rate, treatment_rate, 0.01)
    if control or treatment:
        lines.append(
            f"  D+3 BQ proxy: 비교군 {bar(control_rate, max_rate)} {int(control.get('d7_converted') or 0):,}/{int(control.get('users') or 0):,} {percent(control_rate)}"
        )
        lines.append(
            f"  D+3 BQ proxy: 발송군 {bar(treatment_rate, max_rate)} {int(treatment.get('d7_converted') or 0):,}/{int(treatment.get('users') or 0):,} {percent(treatment_rate)} ({diff_pp:+.1f}%p)"
        )
    lines.append("  판정 기준: 05/12 readout에서 +2%p 이상 유지되고 p<0.05면 유지/확대, 그 전에는 긍정 신호로만 봅니다.")
    live_lines = format_matching_live(live, ("d3crm", "d8crm", "d+3", "d+8"))
    if live_lines:
        lines += ["  FlareLane active: " + " / ".join(live_lines[:3])]
    return lines


def bar_count(value: int, max_value: int, width: int = 12) -> str:
    return bar(ratio(value, max_value), 1.0, width)


def format_matching_live(live: LiveResult, patterns: tuple[str, ...]) -> list[str]:
    if live.status != "ok":
        return []
    matched: list[str] = []
    for automation in live.active_automations:
        name_lower = automation.name.lower()
        if not any(pattern.lower() in name_lower for pattern in patterns):
            continue
        matched.append(
            f"{automation.name} sent {automation.sent}, waiting {automation.waiting}, failed {automation.failed}"
        )
    return matched


def status_korean(status: str) -> str:
    return {
        "registered_recent_signal": "진행중",
        "needs_triage_recent_signal": "확인필요",
        "registered_without_bigquery_signal": "장부필요",
        "recent_30d_reference": "참고",
    }.get(status, status)


def format_experiment_content(row: dict[str, Any]) -> list[str]:
    experiment_key = str(row.get("experiment_key") or "")
    override = EXPERIMENT_CONTENT_OVERRIDES.get(experiment_key, {})
    status_label = status_korean(str(row["inventory_status"]))
    owner = clean_value(row.get("owner")) or "owner 미지정"
    slot = clean_value(row.get("slot_key")) or "slot 미기록"
    latest = clean_value(row.get("latest_activity_date")) or "BQ 신호 없음"
    observed = clean_value(row.get("observed_units")) or "없음"
    product_status = clean_value(row.get("product_labs_status")) or "product-labs 상태 미기록"
    purpose = first_text(row.get("hypothesis"), override.get("purpose"), row.get("recommended_action"), fallback="목적 미기록")
    arms = first_text(row.get("experiment_arms"), override.get("arms"), row.get("arms"), fallback="군 미기록")
    metric = first_text(override.get("metric"), row.get("required_event_names"), fallback="측정 이벤트 미기록")
    channel = first_text(row.get("send_channel"), override.get("channel"), fallback="발송 채널 미기록")

    return [
        f"  {status_label} {row['experiment_name']} ({slot}, {owner})",
        f"    목적: {purpose}",
        f"    설계/측정: {arms} · {metric}",
        f"    운영: {channel} · {latest} · 관측 {observed} · {product_status}",
    ]


def first_text(*values: Any, fallback: str) -> str:
    for value in values:
        cleaned = clean_value(value)
        if cleaned:
            return cleaned
    return fallback


def clean_value(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if not text or text.lower() in {"none", "null", "nan"} or text.upper() == "TBD":
        return ""
    return text


def slack_channel() -> str:
    return (
        os.environ.get("FLARELANE_MONITOR_SLACK_CHANNEL", "").strip()
        or os.environ.get("PRODUCT_LABS_SLACK_CHANNEL", "").strip()
        or os.environ.get("SLACK_CHANNEL", "").strip()
        or DEFAULT_SLACK_CHANNEL
    )


def send_slack(message: str) -> str:
    token = os.environ.get("SLACK_BOT_TOKEN", "").strip() or os.environ.get("SLACK_TOKEN", "").strip()
    channel = slack_channel()
    if not token:
        raise RuntimeError("SLACK_BOT_TOKEN 환경변수가 없습니다.")
    response = requests.post(
        "https://slack.com/api/chat.postMessage",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"channel": channel, "text": message},
        timeout=15,
    )
    body = response.json()
    if not body.get("ok"):
        raise RuntimeError(f"Slack 발송 실패: {body.get('error') or json.dumps(body, ensure_ascii=False)[:200]}")
    return channel


def main() -> int:
    parser = argparse.ArgumentParser(description="FlareLane live experiment monitoring")
    parser.add_argument("--no-slack", action="store_true", help="Print the report without posting to Slack.")
    parser.add_argument("--dry-run", action="store_true", help="Alias for --no-slack.")
    args = parser.parse_args()

    started_at = time.time()
    logger.info("시작: FlareLane 핵심 실험 모니터")

    client = bigquery.Client(project=PROJECT)
    inventory = fetch_inventory(client)
    friend_invite = fetch_friend_invite_summary(client)
    bag_nudge_d3 = fetch_bag_nudge_d3_summary(client)
    live = fetch_flarelane_live()
    message = build_message(inventory, friend_invite, bag_nudge_d3, live)
    logger.info(
        "조회 완료: inventory=%d friend_invite_rows=%d bag_nudge_rows=%d live_status=%s live_active=%d",
        len(inventory),
        len(friend_invite),
        len(bag_nudge_d3),
        live.status,
        live.active_count,
    )

    if args.no_slack or args.dry_run:
        print(message)
        logger.info("완료 : %.1f초 (dry-run)", time.time() - started_at)
        return 0

    channel = send_slack(message)
    logger.info("Slack 발송 완료: channel=%s", channel)
    logger.info("완료 : %.1f초", time.time() - started_at)
    print("Slack 발송 완료")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        logger.exception("실패")
        print(f"[error] {exc}", file=sys.stderr)
        raise SystemExit(1)
