#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from collections import OrderedDict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from google.cloud import bigquery


PROJECT = "covering-app-ccd23"
KST = timezone(timedelta(hours=9))
APP_DIR = Path(__file__).resolve().parents[1]
SRC_DIR = Path(__file__).resolve().parent
LOG_DIR = APP_DIR / "logs"
DEFAULT_SLACK_CHANNEL = "C0A198Z0P2N"  # 제품팀_data
DEFAULT_DASHBOARD_URL = "https://grafana.covering.app/d/4b064546-09fd-475a-83de-bfd07ded7072/87fb26e"


def load_env_file() -> None:
    env_path = Path(os.environ.get("ENV_FILE", "/shared/.env"))
    try:
        lines = env_path.read_text(encoding="utf-8").splitlines()
    except (FileNotFoundError, OSError):
        return
    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def setup_logging() -> logging.Logger:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(LOG_DIR / "batch.log", encoding="utf-8"),
        ],
    )
    return logging.getLogger("large-waste-monitoring-report")


def parse_report_date(raw_value: str | None) -> date:
    if raw_value:
        return date.fromisoformat(raw_value)
    return (datetime.now(KST) - timedelta(days=1)).date()


def run_sql(client: bigquery.Client, sql_path: Path, report_date: date) -> list[dict[str, Any]]:
    sql = sql_path.read_text(encoding="utf-8")
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("report_date", "DATE", report_date.isoformat())]
    )
    return [dict(row) for row in client.query(sql, job_config=job_config).result()]


def format_line(row: dict[str, Any]) -> str:
    suffixes: list[str] = []
    if row.get("vs_30d"):
        suffixes.append(f"30일전 {row['vs_30d']}")
    if row.get("vs_7d"):
        suffixes.append(f"1주전 {row['vs_7d']}")
    suffix = f" ({' / '.join(suffixes)})" if suffixes else ""
    return f"- {row['metric']}: {row['current_value']}{suffix}"


def group_rows(rows: list[dict[str, Any]]) -> OrderedDict[str, list[dict[str, Any]]]:
    grouped: OrderedDict[str, list[dict[str, Any]]] = OrderedDict()
    for row in sorted(rows, key=lambda item: (item["section_sort"], item["line_sort"])):
        grouped.setdefault(str(row["section_title"]), []).append(row)
    return grouped


def find_current_value(rows: list[dict[str, Any]], section: str, metric: str) -> str:
    for row in rows:
        if row.get("section_title") == section and row.get("metric") == metric:
            return str(row.get("current_value") or "")
    return ""


def build_report(rows: list[dict[str, Any]], report_day: date, dashboard_url: str) -> str:
    kr1 = find_current_value(rows, "제품팀 KR1", "MAU 대비 대형폐기물 D30 이용률")
    daily_large = find_current_value(rows, "대폐 일별 실적", "대폐 유료 신청량")
    after_7am = find_current_value(rows, "운영 가드레일", "오전 7시 이후 수거율")
    report_label = report_day.strftime("%m/%d")

    lines = [
        "# 대형폐기물 일일 모니터링 리포트",
        "",
        f"기준일: {report_label} KST 전일 마감",
        f"Grafana: {dashboard_url}",
        "지표 정의: 대커봉 구매는 `LARGE_COVERING_BAG`, 대형폐기물 이용은 `PICKUP_LARGE_COVERING_BAG` 기준입니다.",
        "",
        "## 결론",
        "",
        f"KR1은 {kr1}입니다.",
        f"전일 대폐 유료 신청량은 {daily_large}이고, 수거 지연 판단은 실제 기사 수거 시각 기준 {after_7am}입니다.",
        "",
    ]
    for section_title, section_rows in group_rows(rows).items():
        lines += [f"## {section_title}", ""]
        lines.extend(format_line(row) for row in section_rows)
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def build_slack_title(rows: list[dict[str, Any]], report_day: date) -> str:
    kr1 = find_current_value(rows, "제품팀 KR1", "MAU 대비 대형폐기물 D30 이용률")
    daily_large = find_current_value(rows, "대폐 일별 실적", "대폐 유료 신청량")
    label = report_day.strftime("%m/%d")
    return f"대형폐기물 일일 모니터링 ({label}): KR1 {kr1}, 대폐 신청 {daily_large}"


def write_reports(report: str, report_day: date) -> tuple[Path, Path]:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    latest_path = LOG_DIR / "latest-report.md"
    dated_path = LOG_DIR / f"report-{report_day.isoformat()}.md"
    latest_path.write_text(report, encoding="utf-8")
    dated_path.write_text(report, encoding="utf-8")
    return latest_path, dated_path


def post_to_slack(token: str, channel: str, text: str, thread_ts: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"channel": channel, "text": text}
    if thread_ts:
        payload["thread_ts"] = thread_ts
    request = Request(
        "https://slack.com/api/chat.postMessage",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:
            body = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError) as exc:
        raise RuntimeError(f"Slack 발송 실패: {exc}") from exc
    if not body.get("ok"):
        raise RuntimeError(f"Slack 발송 실패: {body}")
    return body


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report-date", help="KST 기준 보고일. 기본값은 실행일 전일")
    parser.add_argument("--no-slack", action="store_true", help="Slack 발송 없이 리포트 파일만 생성")
    parser.add_argument("--dry-run", action="store_true", help="--no-slack alias")
    args = parser.parse_args()

    started_at = time.time()
    load_env_file()
    logger = setup_logging()
    report_day = parse_report_date(args.report_date)
    no_slack = args.no_slack or args.dry_run
    logger.info("시작: report_date=%s no_slack=%s", report_day.isoformat(), no_slack)

    client = bigquery.Client(project=PROJECT)
    metric_rows = run_sql(client, SRC_DIR / "metric_context.sql", report_day)
    ops_rows = run_sql(client, SRC_DIR / "daily_ops.sql", report_day)
    rows = metric_rows + ops_rows
    dashboard_url = os.environ.get("LARGE_WASTE_REPORT_DASHBOARD_URL", DEFAULT_DASHBOARD_URL)
    report = build_report(rows, report_day, dashboard_url)
    latest_path, dated_path = write_reports(report, report_day)
    logger.info("리포트 생성 완료: rows=%d latest=%s dated=%s", len(rows), latest_path, dated_path)

    title = build_slack_title(rows, report_day)
    print(title)
    print(report)

    if no_slack:
        logger.info("Slack 발송 생략: --no-slack")
    else:
        token = os.environ.get("SLACK_BOT_TOKEN", "").strip()
        channel = os.environ.get("LARGE_WASTE_REPORT_SLACK_CHANNEL", DEFAULT_SLACK_CHANNEL).strip()
        if not token:
            raise RuntimeError("SLACK_BOT_TOKEN 환경변수가 필요합니다.")
        root = post_to_slack(token, channel, title)
        thread_ts = str(root.get("ts") or "")
        if not thread_ts:
            raise RuntimeError(f"Slack 루트 메시지 ts를 찾지 못했습니다: {root}")
        post_to_slack(token, channel, report, thread_ts=thread_ts)
        logger.info("Slack 발송 완료: channel=%s thread_ts=%s", channel, thread_ts)

    logger.info("완료 : %.1f초", time.time() - started_at)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        logging.getLogger("large-waste-monitoring-report").exception("실패: %s", exc)
        print(f"[error] {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
