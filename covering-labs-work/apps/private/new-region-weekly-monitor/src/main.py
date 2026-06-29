#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
APP_ROOT = ROOT.parent
SQL_PATH = ROOT / "weekly_metrics.sql"
UNMAPPED_SQL_PATH = ROOT / "unmapped_regions.sql"
DEFAULT_BQ_BIN = shutil.which("bq") or str(Path.home() / "google-cloud-sdk" / "bin" / "bq")
DEFAULT_DASHBOARD_URL = "https://grafana.covering.app/d/2fe7ef6b-1288-4541-a955-2ee58106272f"
SLACK_CHANNEL = "C0A198Z0P2N"  # 제품팀_data
THREAD_TITLE = "[충청도권 신규 지역 500 MAU 달성률]"
KST = timezone(timedelta(hours=9))
ZONE_ICON = {"통과권": "✅", "근접권": "🟡", "보류권": "🔴"}
LOGGER = logging.getLogger("new_region_weekly_monitor")


def load_dotenv() -> None:
    """crontab 실행 환경에서 /shared/.env를 자동 로드한다.
    이미 설정된 환경변수는 덮어쓰지 않는다(setdefault).
    """
    env_path = Path(os.environ.get("ENV_FILE", "/shared/.env"))
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def setup_logging() -> None:
    log_dir = APP_ROOT / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    if LOGGER.handlers:
        return
    handler = logging.FileHandler(log_dir / "batch.log", encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    LOGGER.addHandler(handler)
    LOGGER.setLevel(logging.INFO)
    LOGGER.propagate = False


def clean_json_output(raw: str) -> str:
    stripped = raw.strip()
    if stripped.startswith(("[", "{")):
        return stripped
    indices = [idx for idx in (stripped.find("["), stripped.find("{")) if idx >= 0]
    if not indices:
        raise RuntimeError(f"BigQuery JSON 응답을 찾지 못했습니다.\n{raw}")
    return stripped[min(indices) :]


def run_query(sql_path: Path) -> list[dict]:
    sql = sql_path.read_text(encoding="utf-8")
    cmd = [os.environ.get("BQ_BIN", DEFAULT_BQ_BIN), "query", "--use_legacy_sql=false", "--format=json", sql]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"bq query 타임아웃 (180s 초과): {exc}") from exc
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "bq query 실패")
    return json.loads(clean_json_output(result.stdout))


def parse_int(value: object) -> int:
    return int(value or 0)


def parse_float(value: object) -> float:
    if value in (None, ""):
        return 0.0
    return float(value)


def format_group_name(title: str) -> str:
    return re.sub(r"^[0-9]+-[0-9]+(?:\.\(정산용\))?\s*", "", title).strip()


def format_eta(row: dict) -> str:
    eta = row.get("eta_500_date")
    if not eta:
        return "도달"
    try:
        return datetime.fromisoformat(str(eta)).strftime("%m/%d")
    except ValueError:
        return str(eta)


def build_message(rows: list[dict], unmapped_rows: list[dict], dashboard_url: str) -> str:
    now = datetime.now(KST)
    end_date = (now - timedelta(days=1)).strftime("%m/%d")
    start_date = (now - timedelta(days=7)).strftime("%m/%d")
    zone_counts = {"통과권": 0, "근접권": 0, "보류권": 0}
    total_mau = 0
    top_new = None
    near_regions: list[str] = []
    for row in rows:
        zone_counts[row["zone"]] += 1
        total_mau += parse_int(row["mau_30d"])
        if row["zone"] == "근접권":
            near_regions.append(format_group_name(str(row["group_title"])))
        if top_new is None or parse_int(row["new_payers_7d"]) > parse_int(top_new["new_payers_7d"]):
            top_new = row

    summary = [
        f"*신규 지역 주간 모니터*  ({start_date}~{end_date})",
        f"최근 30일 신규 지역 권역 합산 MAU는 *{total_mau:,}명*입니다.",
        f"통과권 {zone_counts['통과권']}곳 / 근접권 {zone_counts['근접권']}곳 / 보류권 {zone_counts['보류권']}곳",
    ]
    if top_new is not None:
        summary.append(
            f"지난 7일 첫 결제가 가장 많았던 곳은 *{format_group_name(str(top_new['group_title']))}* {parse_int(top_new['new_payers_7d']):,}명입니다."
        )
    if near_regions:
        summary.append(f"지금 속도면 90일 안에 500에 닿는 곳은 *{', '.join(near_regions)}*입니다.")

    lines = summary + ["", "*권역별 점수판*"]
    for row in rows:
        zone = str(row["zone"])
        wow = parse_float(row.get("wow_pct"))
        wow_text = "-" if row.get("wow_pct") in (None, "") else f"{wow:+.1f}%"
        lines.append(
            (
                f"{ZONE_ICON[zone]} {format_group_name(str(row['group_title']))}: "
                f"MAU {parse_int(row['mau_30d']):,}명 / 전주 {wow_text} / "
                f"최근 첫결제 {parse_int(row['new_payers_7d']):,}명 / "
                f"500까지 {parse_int(row['gap_to_500']):,}명 / 예상 {format_eta(row)}"
            )
        )

    if unmapped_rows:
        risk_text = ", ".join(
            f"{item['city']} {item['region']} {parse_int(item['unmapped_mau_30d']):,}명"
            for item in unmapped_rows
        )
        lines += ["", f"*데이터 리스크* {risk_text}은 현재 권역 매핑 밖이라 strict 집계에서 빠집니다."]

    lines += ["", f"*Grafana* {dashboard_url}"]
    return "\n".join(lines)


def post_to_slack(token: str, channel: str, text: str, thread_ts: str | None = None) -> dict:
    payload = {"channel": channel, "text": text}
    if thread_ts:
        payload["thread_ts"] = thread_ts
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(
        "https://slack.com/api/chat.postMessage",
        data=data,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=15) as response:
            body = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError) as exc:
        raise RuntimeError(f"Slack 발송 실패: {exc}") from exc
    if not body.get("ok"):
        raise RuntimeError(f"Slack 발송 실패: {body}")
    return body


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Slack 발송 없이 본문만 출력")
    args = parser.parse_args()

    load_dotenv()
    setup_logging()
    LOGGER.info("시작 : 신규 지역 주간 모니터 dry_run=%s", args.dry_run)
    rows = run_query(SQL_PATH)
    unmapped_rows = run_query(UNMAPPED_SQL_PATH)
    dashboard_url = os.environ.get("NEW_REGION_DASHBOARD_URL", DEFAULT_DASHBOARD_URL)
    message = build_message(rows, unmapped_rows, dashboard_url)
    LOGGER.info("루트 제목: %s", THREAD_TITLE)
    LOGGER.info("처리 건수: rows=%d, unmapped_rows=%d", len(rows), len(unmapped_rows))
    print(THREAD_TITLE)
    print(message)

    if args.dry_run:
        LOGGER.info("완료 : dry-run rows=%d, unmapped_rows=%d", len(rows), len(unmapped_rows))
        return 0

    token = os.environ.get("SLACK_BOT_TOKEN", "").strip()
    if not token:
        LOGGER.error("SLACK_BOT_TOKEN 환경변수가 필요합니다.")
        raise RuntimeError("SLACK_BOT_TOKEN 환경변수가 필요합니다.")

    root = post_to_slack(token, SLACK_CHANNEL, THREAD_TITLE)
    thread_ts = str(root.get("ts") or "")
    LOGGER.info("Slack 루트 메시지 생성: thread_ts=%s", thread_ts)
    if not thread_ts:
        LOGGER.error("Slack 루트 메시지 ts를 찾지 못했습니다: %s", root)
        raise RuntimeError(f"Slack 루트 메시지 ts를 찾지 못했습니다: {root}")
    post_to_slack(token, SLACK_CHANNEL, message, thread_ts=thread_ts)
    LOGGER.info("완료 : thread_ts=%s rows=%d, unmapped_rows=%d", thread_ts, len(rows), len(unmapped_rows))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"[error] {exc}", file=sys.stderr)
        raise SystemExit(1)
