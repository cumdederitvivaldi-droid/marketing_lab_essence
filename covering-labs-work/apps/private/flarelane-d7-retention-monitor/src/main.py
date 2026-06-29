#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests

ROOT_TITLE = "ENG-1559 D7 분리 여정 모니터"
DEFAULT_SLACK_CHANNEL = "C0ARXKB2Y9L"
DEFAULT_BQ_BIN = shutil.which("bq") or str(Path.home() / "google-cloud-sdk" / "bin" / "bq")
DEFAULT_BASH_BIN = shutil.which("bash") or "/bin/bash"
KST = timezone(timedelta(hours=9))
COUPON_SINCE_KST = "2026-04-15 00:00:00"
COUPON_POLICY_B = 192
COUPON_POLICY_C = 193
SERVICE_API_BASE = "https://service-api.flarelane.com/v1"
ASSIGNMENT_TABLE = "`covering-app-ccd23.product.experiment_user_assignments`"
EVENT_HISTORY_TABLE = "`covering-app-ccd23.product.eng_1559_event_history`"
ORDER_TABLE = "`covering-app-ccd23.secure_dataset.order_v2`"
USER_COUPON_TABLE = "`covering-app-ccd23.secure_dataset.user_coupon`"
JOURNEY_NAME_BY_ARM = {
    "MSG_ONLY": "[ENG-1559] D7 Journey - MSG_ONLY v2",
    "PCT50": "[ENG-1559] D7 Journey - PCT50 v2",
    "FIXED5000": "[ENG-1559] D7 Journey - FIXED5000 v2",
}
ARM_LABELS = {
    "CONTROL": "대조군",
    "MSG_ONLY": "A군",
    "PCT50": "B군",
    "FIXED5000": "C군",
}


def load_dotenv() -> None:
    env_path = Path(os.environ.get("ENV_FILE", "/shared/.env"))
    if not env_path.exists():
        return
    try:
        raw_text = env_path.read_text(encoding="utf-8")
    except PermissionError:
        load_dotenv_via_bash(env_path)
        return
    for raw_line in raw_text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def load_dotenv_via_bash(env_path: Path) -> None:
    # On the VM, bash can source /shared/.env even when Python direct file reads are denied.
    try:
        result = subprocess.run(
            [DEFAULT_BASH_BIN, "-lc", 'set -a; source "$ENV_FILE"; env -0'],
            capture_output=True,
            timeout=10,
            env={**os.environ, "ENV_FILE": str(env_path)},
        )
    except (subprocess.TimeoutExpired, OSError) as exc:
        print(f"[warn] ENV fallback failed: {exc}", file=sys.stderr, flush=True)
        return
    if result.returncode != 0:
        print(f"[warn] ENV fallback exited with code={result.returncode}: {result.stderr.decode('utf-8', errors='ignore').strip()}", file=sys.stderr, flush=True)
        return
    for raw_item in result.stdout.split(b"\0"):
        if not raw_item or b"=" not in raw_item:
            continue
        key, value = raw_item.decode("utf-8", errors="ignore").split("=", 1)
        os.environ.setdefault(key, value)


def bq_query(sql: str) -> list[dict[str, Any]]:
    cmd = [os.environ.get("BQ_BIN", DEFAULT_BQ_BIN), "query", "--use_legacy_sql=false", "--format=json", sql]
    env = os.environ.copy()
    env.setdefault("CLOUDSDK_PYTHON", "/usr/bin/python3")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=180, env=env)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"BQ 쿼리 타임아웃: {exc}") from exc
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "BQ 쿼리 실패")
    stdout = result.stdout.strip()
    if not stdout:
        return []
    if not stdout.startswith(("[", "{")):
        indices = [idx for idx in (stdout.find("["), stdout.find("{")) if idx >= 0]
        if not indices:
            raise RuntimeError(f"BQ JSON 응답을 찾지 못했습니다.\n{stdout}")
        stdout = stdout[min(indices) :]
    return json.loads(stdout)


def iter_actions(actions: list[dict[str, Any]]) -> Any:
    for action in actions or []:
        yield action
        yield from iter_actions(action.get("nextActions") or [])


def fetch_live_journeys() -> tuple[dict[str, dict[str, int]], str]:
    project_id = (os.environ.get("FLARELANE_PROJECT_ID") or "").strip()
    bearer = (os.environ.get("ENG1559_FLARELANE_CONSOLE_BEARER") or "").strip()
    if not project_id or not bearer:
        return {}, "서버 monitor env에 live bearer 미설정"

    headers = {"Authorization": f"Bearer {bearer}", "Content-Type": "application/json"}
    response = requests.get(
        f"{SERVICE_API_BASE}/projects/{project_id}/automations",
        headers=headers,
        timeout=20,
    )
    if not response.ok:
        return {}, f"FlareLane automations 조회 실패 {response.status_code}"
    automations = {item.get("name", ""): item for item in response.json().get("data", [])}

    journeys: dict[str, dict[str, int]] = {}
    for arm, journey_name in JOURNEY_NAME_BY_ARM.items():
        journey = automations.get(journey_name)
        if not journey:
            journeys[arm] = {"sent": 0, "clicked": 0, "failed": 0, "waiting": 0, "active": 0}
            continue
        detail_response = requests.get(
            f"{SERVICE_API_BASE}/projects/{project_id}/automations/{journey['id']}",
            headers=headers,
            timeout=20,
        )
        if not detail_response.ok:
            return {}, f"FlareLane automation detail 실패 {detail_response.status_code}"
        detail = detail_response.json().get("data", {})
        friendtalk = next(
            (action for action in iter_actions(detail.get("startActions") or []) if action.get("type") == "SEND_FRIENDTALK"),
            None,
        )
        journeys[arm] = {
            "sent": int(friendtalk.get("sent") or 0) if friendtalk else 0,
            "clicked": int(friendtalk.get("clicked") or 0) if friendtalk else 0,
            "failed": int(friendtalk.get("failed") or 0) if friendtalk else 0,
            "waiting": int(friendtalk.get("waiting") or 0) if friendtalk else 0,
            "active": 1 if detail.get("active") else 0,
        }
    return journeys, ""


def fetch_assignments() -> dict[str, dict[str, int]]:
    sql = (
        "SELECT CAST(eligible_date AS STRING) AS cohort_date, variant, COUNT(DISTINCT user_id) AS assigned "
        f"FROM {ASSIGNMENT_TABLE} "
        "WHERE experiment_key = 'eng_1559_d7_reward_v2' "
        "AND eligible_date >= DATE '2026-04-15' "
        "GROUP BY eligible_date, variant ORDER BY eligible_date, variant"
    )
    rows = bq_query(sql)
    result: dict[str, dict[str, int]] = {}
    for row in rows:
        result.setdefault(row["cohort_date"], {})[row["variant"]] = int(row["assigned"])
    return result


def fetch_coupons() -> dict[str, int]:
    sql = (
        "SELECT CAST(coupon_policy_id AS STRING) AS pid, COUNT(*) AS cnt "
        f"FROM {USER_COUPON_TABLE} "
        f"WHERE coupon_policy_id IN ({COUPON_POLICY_B}, {COUPON_POLICY_C}) "
        f"AND created_date >= TIMESTAMP('{COUPON_SINCE_KST}', 'Asia/Seoul') "
        "GROUP BY coupon_policy_id ORDER BY coupon_policy_id"
    )
    return {row["pid"]: int(row["cnt"]) for row in bq_query(sql)}


def fetch_reorders() -> dict[str, dict[str, dict[str, int]]]:
    mature_cutoff = (datetime.now(KST) - timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")
    sql = (
        "WITH raw_assignments AS ( "
        "  SELECT user_id, variant, MIN(eligible_date) AS cohort_date, MIN(assigned_at) AS assigned_at "
        f"  FROM {ASSIGNMENT_TABLE} "
        "  WHERE experiment_key = 'eng_1559_d7_reward_v2' "
        "    AND eligible_date >= DATE '2026-04-15' "
        "  GROUP BY user_id, variant "
        "), "
        "assignments AS ( "
        "  SELECT * FROM raw_assignments "
        f"  WHERE assigned_at <= TIMESTAMP('{mature_cutoff}', 'Asia/Seoul') "
        "), "
        "reorders AS ( "
        "  SELECT o.user_id, o.user_coupon_id, o.created_at, DATE(o.created_at, 'Asia/Seoul') AS order_date "
        f"  FROM {ORDER_TABLE} o "
        "  WHERE o.status = 'COMPLETED' "
        "    AND o.deleted_at IS NULL "
        "    AND o.payment_policy_id IS NOT NULL "
        "    AND DATE(o.created_at, 'Asia/Seoul') >= DATE '2026-04-15' "
        ") "
        "SELECT CAST(a.cohort_date AS STRING) AS cohort_date, a.variant, "
        "  COUNT(DISTINCT a.user_id) AS assigned, "
        "  COUNT(DISTINCT IF(r.created_at IS NOT NULL, a.user_id, NULL)) AS reordered, "
        "  COUNT(DISTINCT IF(uc.coupon_policy_id IN (192, 193), a.user_id, NULL)) AS reordered_with_coupon "
        "FROM assignments a "
        "LEFT JOIN reorders r "
        "  ON a.user_id = r.user_id "
        " AND r.created_at > a.assigned_at "
        " AND r.created_at <= TIMESTAMP_ADD(a.assigned_at, INTERVAL 7 DAY) "
        f"LEFT JOIN {USER_COUPON_TABLE} uc ON r.user_coupon_id = uc.id "
        "GROUP BY cohort_date, variant ORDER BY cohort_date, variant"
    )
    rows = bq_query(sql)
    result: dict[str, dict[str, dict[str, int]]] = {}
    for row in rows:
        cohort = row["cohort_date"]
        result.setdefault(cohort, {})[row["variant"]] = {
            "assigned": int(row["assigned"]),
            "reordered": int(row["reordered"]),
            "reordered_with_coupon": int(row["reordered_with_coupon"]),
        }
    return result


def render_bar(value: float, max_value: float, width: int = 12) -> str:
    if max_value <= 0:
        return "·" * width
    filled = round((value / max_value) * width)
    filled = max(0, min(width, filled))
    return "█" * filled + "·" * (width - filled)


def summarize_reorders(reorders: dict[str, dict[str, dict[str, int]]]) -> dict[str, dict[str, int]]:
    summary: dict[str, dict[str, int]] = {}
    for cohort_rows in reorders.values():
        for arm, data in cohort_rows.items():
            bucket = summary.setdefault(
                arm,
                {"assigned": 0, "reordered": 0, "reordered_with_coupon": 0},
            )
            bucket["assigned"] += int(data.get("assigned", 0) or 0)
            bucket["reordered"] += int(data.get("reordered", 0) or 0)
            bucket["reordered_with_coupon"] += int(data.get("reordered_with_coupon", 0) or 0)
    return summary


def build_message(
    now: datetime,
    assignments: dict[str, dict[str, int]],
    coupons: dict[str, int],
    reorders: dict[str, dict[str, dict[str, int]]],
    live_journeys: dict[str, dict[str, int]],
    live_error: str,
) -> str:
    lines = [f"*{ROOT_TITLE}*", "핵심 확인: 친구톡 live 수집 복구 여부, 전체기간 평균, 코호트별 재주문율, 쿠폰 등록 추이"]
    badges = "[주의] FlareLane live 미조회" if live_error else "[정상]"
    lines.append(f"확인 시각: {now.strftime('%m/%d %H:%M')} KST {badges}")
    lines.append("")

    if live_error:
        lines.append(f"FlareLane live 조회: 실패 ({live_error})")
        lines.append("친구톡 sent/click 실시간 지표는 제외하고, BQ 기준 배정/쿠폰/재주문 그래프로 보고합니다.")
        lines.append("")
    else:
        live_rows = [("A군", live_journeys["MSG_ONLY"]["sent"]), ("B군", live_journeys["PCT50"]["sent"]), ("C군", live_journeys["FIXED5000"]["sent"])]
        live_max = max((value for _, value in live_rows), default=0)
        lines += ["친구톡 누적 그래프", "```"]
        for label, value in live_rows:
            lines.append(f"{label:<4} {render_bar(value, live_max)} {value:>4}")
        lines += ["```", ""]

    assignment_totals = {arm: 0 for arm in ARM_LABELS}
    cohort_totals: dict[str, int] = {}
    for cohort, per_arm in assignments.items():
        cohort_totals[cohort] = sum(per_arm.values())
        for arm, count in per_arm.items():
            assignment_totals[arm] = assignment_totals.get(arm, 0) + count

    assignment_max = max(assignment_totals.values(), default=0)
    total_assigned = sum(assignment_totals.values())
    lines += [f"배정 누적 그래프 ({total_assigned}명)", "```"]
    for arm in ("CONTROL", "MSG_ONLY", "PCT50", "FIXED5000"):
        lines.append(f"{ARM_LABELS[arm]:<4} {render_bar(assignment_totals[arm], assignment_max)} {assignment_totals[arm]:>4}")
    lines += ["```", ""]

    if cohort_totals:
        cohort_max = max(cohort_totals.values())
        lines += ["배정 코호트 규모", "```"]
        for cohort in sorted(cohort_totals):
            label = datetime.strptime(cohort, "%Y-%m-%d").strftime("%m/%d")
            lines.append(f"{label:<5} {render_bar(cohort_totals[cohort], cohort_max)} {cohort_totals[cohort]:>4}")
        lines += ["```", ""]

    coupon_rows = [("B군", coupons.get(str(COUPON_POLICY_B), 0)), ("C군", coupons.get(str(COUPON_POLICY_C), 0))]
    coupon_max = max((value for _, value in coupon_rows), default=0)
    lines += [f"쿠폰 등록 그래프 ({COUPON_SINCE_KST[:10]} 이후)", "```"]
    for label, value in coupon_rows:
        lines.append(f"{label:<4} {render_bar(value, coupon_max)} {value:>4}")
    lines += ["```", ""]

    lines += ["전체기간 평균 (D+7 관찰 완료 코호트)", "```"]
    if not reorders:
        lines.append("아직 관찰 기간 도달한 코호트 없음")
    else:
        summary = summarize_reorders(reorders)
        control = summary.get("CONTROL", {"assigned": 0, "reordered": 0, "reordered_with_coupon": 0})
        control_rate = (control["reordered"] / control["assigned"]) if control["assigned"] else 0.0
        max_rate = max(
            (
                data["reordered"] / data["assigned"]
                for data in summary.values()
                if data["assigned"]
            ),
            default=0.0,
        )
        for arm in ("CONTROL", "MSG_ONLY", "PCT50", "FIXED5000"):
            data = summary.get(arm, {"assigned": 0, "reordered": 0, "reordered_with_coupon": 0})
            rate = (data["reordered"] / data["assigned"]) if data["assigned"] else 0.0
            diff = "기준" if arm == "CONTROL" else f"{(rate - control_rate) * 100:+.1f}p"
            coupon = ""
            if arm in ("PCT50", "FIXED5000"):
                coupon = f" 쿠폰{data['reordered_with_coupon']}"
            lines.append(
                f"{ARM_LABELS[arm]:<4} {render_bar(rate, max_rate, 10)} {rate * 100:>4.1f}% {data['reordered']:>3}/{data['assigned']:<4} {diff:>6}{coupon}"
            )
    lines.append("```")

    lines += ["", "D+7 코호트별 재주문율", "```"]
    if not reorders:
        lines.append("아직 관찰 기간 도달한 코호트 없음")
    else:
        for cohort in sorted(reorders):
            cohort_rows = reorders[cohort]
            lines.append(f"[{datetime.strptime(cohort, '%Y-%m-%d').strftime('%m/%d')}]")
            control = cohort_rows.get("CONTROL", {"assigned": 0, "reordered": 0})
            control_rate = (control["reordered"] / control["assigned"]) if control["assigned"] else 0.0
            cohort_max_rate = max(
                (
                    data["reordered"] / data["assigned"]
                    for data in cohort_rows.values()
                    if data["assigned"]
                ),
                default=0.0,
            )
            for arm in ("CONTROL", "MSG_ONLY", "PCT50", "FIXED5000"):
                data = cohort_rows.get(arm, {"assigned": 0, "reordered": 0})
                rate = (data["reordered"] / data["assigned"]) if data["assigned"] else 0.0
                diff = "기준" if arm == "CONTROL" else f"{(rate - control_rate) * 100:+.1f}p"
                lines.append(f"{ARM_LABELS[arm]:<4} {render_bar(rate, cohort_max_rate, 10)} {rate * 100:>4.1f}% {diff:>6}")
            lines.append("")
        if lines[-1] == "":
            lines.pop()
    lines.append("```")
    return "\n".join(lines)


def send_slack(token: str, channel: str, text: str) -> None:
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=utf-8"}
    last_error = ""
    for delay in (0, 2, 5, 10):
        if delay:
            time.sleep(delay)
        try:
            response = requests.post(
                "https://slack.com/api/chat.postMessage",
                headers=headers,
                json={"channel": channel, "text": text},
                timeout=20,
            )
            body = response.json()
            if body.get("ok"):
                return
            last_error = str(body)
        except Exception as exc:
            last_error = str(exc)
    raise RuntimeError(f"Slack 발송 실패: {last_error}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_dotenv()
    assignments = fetch_assignments()
    coupons = fetch_coupons()
    reorders = fetch_reorders()
    live_journeys, live_error = fetch_live_journeys()
    message = build_message(datetime.now(KST), assignments, coupons, reorders, live_journeys, live_error)
    print(message)

    if args.dry_run:
        return 0

    token = (os.environ.get("SLACK_BOT_TOKEN") or "").strip()
    channel = (os.environ.get("ENG1559_MONITOR_SLACK_CHANNEL") or DEFAULT_SLACK_CHANNEL).strip()
    if not token:
        raise RuntimeError("SLACK_BOT_TOKEN 환경변수가 필요합니다.")
    send_slack(token, channel, message)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"[error] {exc}", file=sys.stderr, flush=True)
        raise
