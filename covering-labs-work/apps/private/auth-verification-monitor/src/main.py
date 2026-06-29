#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import logging
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests

ROOT_TITLE = "인증번호 퍼널 모니터"
DEFAULT_SLACK_CHANNEL = "#실험실_notifications"
DEFAULT_BQ_BIN = shutil.which("bq") or str(Path.home() / "google-cloud-sdk" / "bin" / "bq")
KST = timezone(timedelta(hours=9))
LOG_DIR = Path(__file__).resolve().parents[1] / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_DIR / "batch.log"),
    ],
)
logger = logging.getLogger(__name__)


def load_dotenv() -> None:
    env_path = Path(os.environ.get("ENV_FILE", "/shared/.env"))
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def bq_query(sql: str) -> list[dict[str, Any]]:
    cmd = [os.environ.get("BQ_BIN", DEFAULT_BQ_BIN), "query", "--quiet", "--use_legacy_sql=false", "--format=json", sql]
    env = os.environ.copy()
    env.setdefault("CLOUDSDK_PYTHON", "/usr/bin/python3")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=180, env=env)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"BigQuery 쿼리 타임아웃: {exc}") from exc
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "BigQuery 쿼리 실패")
    stdout = result.stdout.strip()
    if not stdout:
        return []
    if not stdout.startswith(("[", "{")):
        indices = [idx for idx in (stdout.find("["), stdout.find("{")) if idx >= 0]
        if not indices:
            raise RuntimeError(f"BigQuery JSON 응답을 찾지 못했습니다.\n{stdout}")
        stdout = stdout[min(indices) :]
    parsed = json.loads(stdout)
    if isinstance(parsed, dict):
        return [parsed]
    return parsed


def auth_funnel_sql(lookback_days: int) -> str:
    return f"""
WITH limits AS (
  SELECT
    DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL {lookback_days} DAY) AS start_date,
    DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 1 DAY) AS end_date
),
base_events AS (
  SELECT
    device_id,
    event_name,
    time,
    DATE(time, 'Asia/Seoul') AS event_date,
    COALESCE(NULLIF(JSON_VALUE(properties, '$."$os"'), ''), 'unknown') AS os,
    COALESCE(NULLIF(JSON_VALUE(properties, '$."$app_version_string"'), ''), 'unknown') AS app_version
  FROM `covering-app-ccd23.mixpanel.mp_master_event`
  CROSS JOIN limits
  WHERE DATE(time, 'Asia/Seoul') BETWEEN start_date AND DATE_ADD(end_date, INTERVAL 1 DAY)
    AND device_id IS NOT NULL
    AND device_id != ''
    AND event_name IN (
      '[ROUTE] AuthPhoneScreen',
      '[ROUTE] AuthCodeScreen',
      '[CLICK] AuthCode_completeButton'
    )
),
phone AS (
  SELECT device_id, MIN(time) AS phone_time
  FROM base_events
  CROSS JOIN limits
  WHERE event_name = '[ROUTE] AuthPhoneScreen'
    AND event_date BETWEEN start_date AND end_date
  GROUP BY 1
),
phone_meta AS (
  SELECT
    p.device_id,
    p.phone_time,
    DATE(p.phone_time, 'Asia/Seoul') AS cohort_date,
    ARRAY_AGG(e.os ORDER BY e.time LIMIT 1)[SAFE_OFFSET(0)] AS os,
    ARRAY_AGG(e.app_version ORDER BY e.time LIMIT 1)[SAFE_OFFSET(0)] AS app_version
  FROM phone p
  JOIN base_events e
    ON e.device_id = p.device_id
   AND e.event_name = '[ROUTE] AuthPhoneScreen'
   AND e.time = p.phone_time
  GROUP BY 1, 2, 3
),
code_step AS (
  SELECT p.device_id, MIN(e.time) AS code_time
  FROM phone_meta p
  LEFT JOIN base_events e
    ON e.device_id = p.device_id
   AND e.event_name = '[ROUTE] AuthCodeScreen'
   AND e.time >= p.phone_time
   AND e.time < TIMESTAMP_ADD(p.phone_time, INTERVAL 24 HOUR)
  GROUP BY 1
),
complete_step AS (
  SELECT c.device_id, MIN(e.time) AS complete_time
  FROM code_step c
  LEFT JOIN base_events e
    ON e.device_id = c.device_id
   AND e.event_name = '[CLICK] AuthCode_completeButton'
   AND c.code_time IS NOT NULL
   AND e.time >= c.code_time
   AND e.time < TIMESTAMP_ADD(c.code_time, INTERVAL 24 HOUR)
  GROUP BY 1
),
per_device AS (
  SELECT
    p.cohort_date,
    p.os,
    p.app_version,
    p.device_id,
    IF(c.code_time IS NOT NULL, 1, 0) AS reached_code_screen,
    IF(cs.complete_time IS NOT NULL, 1, 0) AS completed_auth
  FROM phone_meta p
  LEFT JOIN code_step c ON c.device_id = p.device_id
  LEFT JOIN complete_step cs ON cs.device_id = p.device_id
),
daily AS (
  SELECT
    cohort_date,
    COUNT(*) AS phone_input_devices,
    SUM(reached_code_screen) AS code_screen_devices,
    SUM(completed_auth) AS complete_devices,
    ROUND(SAFE_DIVIDE(SUM(reached_code_screen), COUNT(*)) * 100, 2) AS code_screen_rate_pct,
    ROUND(SAFE_DIVIDE(SUM(completed_auth), NULLIF(SUM(reached_code_screen), 0)) * 100, 2) AS complete_rate_pct,
    ROUND(SAFE_DIVIDE(SUM(completed_auth), COUNT(*)) * 100, 2) AS total_rate_pct
  FROM per_device
  GROUP BY 1
),
periods AS (
  SELECT
    CASE
      WHEN cohort_date BETWEEN DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 3 DAY)
                           AND DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 1 DAY)
        THEN 'recent_3d'
      WHEN cohort_date BETWEEN DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 10 DAY)
                           AND DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 4 DAY)
        THEN 'previous_7d'
      ELSE 'earlier'
    END AS period,
    *
  FROM daily
),
period_summary AS (
  SELECT
    period,
    SUM(phone_input_devices) AS phone_input_devices,
    SUM(code_screen_devices) AS code_screen_devices,
    SUM(complete_devices) AS complete_devices,
    ROUND(SAFE_DIVIDE(SUM(code_screen_devices), SUM(phone_input_devices)) * 100, 2) AS code_screen_rate_pct,
    ROUND(SAFE_DIVIDE(SUM(complete_devices), NULLIF(SUM(code_screen_devices), 0)) * 100, 2) AS complete_rate_pct,
    ROUND(SAFE_DIVIDE(SUM(complete_devices), SUM(phone_input_devices)) * 100, 2) AS total_rate_pct
  FROM periods
  GROUP BY 1
),
segment AS (
  SELECT
    os,
    app_version,
    COUNT(*) AS phone_input_devices,
    SUM(reached_code_screen) AS code_screen_devices,
    SUM(completed_auth) AS complete_devices,
    ROUND(SAFE_DIVIDE(SUM(completed_auth), COUNT(*)) * 100, 2) AS total_rate_pct
  FROM per_device
  GROUP BY 1, 2
)
SELECT
  'period' AS row_type,
  period AS label,
  phone_input_devices,
  code_screen_devices,
  complete_devices,
  code_screen_rate_pct,
  complete_rate_pct,
  total_rate_pct,
  NULL AS os,
  NULL AS app_version,
  NULL AS cohort_date
FROM period_summary
UNION ALL
SELECT
  'daily' AS row_type,
  FORMAT_DATE('%m/%d', cohort_date) AS label,
  phone_input_devices,
  code_screen_devices,
  complete_devices,
  code_screen_rate_pct,
  complete_rate_pct,
  total_rate_pct,
  NULL AS os,
  NULL AS app_version,
  cohort_date
FROM daily
WHERE cohort_date >= DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 7 DAY)
UNION ALL
SELECT
  'segment' AS row_type,
  CONCAT(os, ' ', app_version) AS label,
  phone_input_devices,
  code_screen_devices,
  complete_devices,
  NULL AS code_screen_rate_pct,
  NULL AS complete_rate_pct,
  total_rate_pct,
  os,
  app_version,
  NULL AS cohort_date
FROM segment
WHERE phone_input_devices >= 100
ORDER BY row_type, cohort_date DESC, phone_input_devices DESC
""".strip()


def render_bar(value: float, max_value: float, width: int = 12) -> str:
    if max_value <= 0:
        return "·" * width
    filled = round((value / max_value) * width)
    filled = max(0, min(width, filled))
    return "█" * filled + "·" * (width - filled)


def fmt_int(value: Any) -> str:
    return f"{int(float(value or 0)):,}"


def fmt_pct(value: Any) -> str:
    return f"{float(value or 0):.2f}%"


def period_by_label(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {row["label"]: row for row in rows if row["row_type"] == "period"}


def build_message(rows: list[dict[str, Any]], now: datetime) -> str:
    periods = period_by_label(rows)
    recent = periods.get("recent_3d", {})
    previous = periods.get("previous_7d", {})
    recent_total = float(recent.get("total_rate_pct") or 0)
    previous_total = float(previous.get("total_rate_pct") or 0)
    delta = recent_total - previous_total
    if delta >= 0.3:
        status = "상승 신호"
    elif delta <= -0.3:
        status = "하락 주의"
    else:
        status = "변화 없음"

    lines = [
        f"*{ROOT_TITLE}*",
        f"상태: {status} ({delta:+.2f}%p)",
        f"확인 시각: {now.strftime('%m/%d %H:%M')} KST",
        "",
        "최근 3일 퍼널",
        f"{fmt_int(recent.get('phone_input_devices'))}명 → {fmt_int(recent.get('code_screen_devices'))}명 → {fmt_int(recent.get('complete_devices'))}명",
        f"전체 인증 전환율 {fmt_pct(recent.get('total_rate_pct'))} / 직전 7일 {fmt_pct(previous.get('total_rate_pct'))}",
        f"인증번호 입력 화면 도달률 {fmt_pct(recent.get('code_screen_rate_pct'))}, 인증 완료율 {fmt_pct(recent.get('complete_rate_pct'))}",
        "",
    ]

    daily_rows = [row for row in rows if row["row_type"] == "daily"]
    daily_rows.sort(key=lambda row: row.get("cohort_date") or "")
    max_total = max((float(row.get("total_rate_pct") or 0) for row in daily_rows), default=0)
    lines += ["일별 전체 인증 전환율", "```"]
    for row in daily_rows:
        lines.append(f"{row['label']:<5} {render_bar(float(row.get('total_rate_pct') or 0), max_total)} {fmt_pct(row.get('total_rate_pct')):>7} ({fmt_int(row.get('phone_input_devices'))})")
    lines += ["```", ""]

    segment_rows = [row for row in rows if row["row_type"] == "segment"]
    segment_rows.sort(key=lambda row: int(float(row.get("phone_input_devices") or 0)), reverse=True)
    lines += ["OS·앱버전별", "```"]
    for row in segment_rows[:6]:
        label = row["label"][:18]
        lines.append(f"{label:<18} {fmt_pct(row.get('total_rate_pct')):>7} ({fmt_int(row.get('phone_input_devices'))})")
    lines += ["```", ""]

    lines.append("주의: 인증번호 요청 클릭 이벤트가 없어 인증번호 입력 화면 도달을 호출 성공 proxy로 봅니다.")
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
    parser.add_argument("--dry-run", action="store_true", help="Slack 발송 없이 본문만 출력")
    args = parser.parse_args()

    started_at = time.time()
    logger.info("시작")
    load_dotenv()
    lookback_days = int(os.environ.get("AUTH_VERIFICATION_MONITOR_LOOKBACK_DAYS", "30"))
    rows = bq_query(auth_funnel_sql(lookback_days))
    message = build_message(rows, datetime.now(KST))
    print(message)

    if not args.dry_run:
        token = (os.environ.get("SLACK_BOT_TOKEN") or "").strip()
        channel = (os.environ.get("AUTH_VERIFICATION_MONITOR_SLACK_CHANNEL") or DEFAULT_SLACK_CHANNEL).strip()
        if not token:
            raise RuntimeError("SLACK_BOT_TOKEN 환경변수가 필요합니다.")
        send_slack(token, channel, message)
        logger.info("Slack 발송 완료")
    else:
        logger.info("dry-run: Slack 발송 생략")

    logger.info(f"처리 완료: {len(rows)}행 / 오류: 0건")
    logger.info(f"완료 : {time.time() - started_at:.1f}초")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        logger.exception("실패")
        print(f"[error] {exc}", file=sys.stderr, flush=True)
        raise
