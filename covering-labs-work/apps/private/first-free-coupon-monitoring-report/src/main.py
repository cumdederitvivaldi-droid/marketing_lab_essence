#!/usr/bin/env python3
"""Daily Slack report for the first purchase free coupon CRM experiment."""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from google.cloud import bigquery

from config import _load_env_file


_load_env_file()

PROJECT = "covering-app-ccd23"
KST = timezone(timedelta(hours=9))
APP_DIR = Path(__file__).resolve().parents[1]
SRC_DIR = Path(__file__).resolve().parent
LOG_DIR = APP_DIR / "logs"
DEFAULT_SLACK_CHANNEL = "C0ARXKB2Y9L"
DEFAULT_COUPON_POLICY_ID = 215
DEFAULT_COUPON_AMOUNT = 20_000
DEFAULT_CONTRIBUTION_MARGIN_RATE = 0.30
BAR_WIDTH = 10


def setup_logging() -> logging.Logger:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(LOG_DIR / "batch.log", encoding="utf-8"),
        ],
    )
    return logging.getLogger("first-free-coupon-monitoring-report")


def parse_report_date(raw_value: str | None) -> date:
    if raw_value:
        return date.fromisoformat(raw_value)
    return (datetime.now(KST) - timedelta(days=1)).date()


def env_int(name: str, default: int) -> int:
    raw_value = os.environ.get(name, "").strip()
    if not raw_value:
        return default
    return int(raw_value)


def env_float(name: str, default: float) -> float:
    raw_value = os.environ.get(name, "").strip()
    if not raw_value:
        return default
    return float(raw_value)


def query_params(report_day: date) -> list[bigquery.ScalarQueryParameter]:
    coupon_policy_id = env_int("FIRST_FREE_COUPON_POLICY_ID", DEFAULT_COUPON_POLICY_ID)
    coupon_amount = env_int("FIRST_FREE_COUPON_AMOUNT", DEFAULT_COUPON_AMOUNT)
    contribution_margin_rate = env_float(
        "FIRST_FREE_COUPON_CONTRIBUTION_MARGIN_RATE",
        DEFAULT_CONTRIBUTION_MARGIN_RATE,
    )
    return [
        bigquery.ScalarQueryParameter("report_date", "DATE", report_day.isoformat()),
        bigquery.ScalarQueryParameter("coupon_policy_id", "INT64", coupon_policy_id),
        bigquery.ScalarQueryParameter("coupon_amount", "INT64", coupon_amount),
        bigquery.ScalarQueryParameter("contribution_margin_rate", "FLOAT64", contribution_margin_rate),
    ]


def run_sql(
    client: bigquery.Client,
    sql_path: Path,
    report_day: date,
    *,
    include_coupon_params: bool,
) -> list[dict[str, Any]]:
    sql = sql_path.read_text(encoding="utf-8")
    params = query_params(report_day)
    if not include_coupon_params:
        params = params[:1]
    job_config = bigquery.QueryJobConfig(query_parameters=params)
    return [dict(row.items()) for row in client.query(sql, job_config=job_config).result()]


def to_int(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, Decimal):
        return int(value)
    return int(round(float(value)))


def to_float(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def fmt_count(value: Any) -> str:
    return f"{to_int(value):,}"


def fmt_won(value: Any) -> str:
    return f"{to_int(value):,}원"


def fmt_pct_value(value: Any) -> str:
    return f"{100 * to_float(value):.1f}%"


def fmt_rate(numerator: Any, denominator: Any) -> str:
    num = to_int(numerator)
    den = to_int(denominator)
    if den == 0:
        return f"— ({num}/{den})"
    return f"{100 * num / den:.1f}% ({num:,}/{den:,})"


def ratio(numerator: Any, denominator: Any) -> float:
    den = to_int(denominator)
    if den == 0:
        return 0.0
    return to_int(numerator) / den


def rate_or_none(numerator: Any, denominator: Any) -> float | None:
    den = to_int(denominator)
    if den == 0:
        return None
    return to_int(numerator) / den


def bar(value: float, max_value: float, width: int = BAR_WIDTH) -> str:
    if max_value <= 0:
        return "░" * width
    filled_float = max(0.0, min(float(width), width * value / max_value))
    full_blocks = int(filled_float)
    partial_index = round((filled_float - full_blocks) * 8)
    if partial_index == 8:
        full_blocks += 1
        partial_index = 0
    full_blocks = max(0, min(width, full_blocks))
    if full_blocks >= width:
        return "█" * width
    partial_blocks = "▏▎▍▌▋▊▉"
    partial = partial_blocks[partial_index - 1] if partial_index else ""
    empty_blocks = width - full_blocks - len(partial)
    return "█" * full_blocks + partial + "░" * empty_blocks


def bar_count(value: Any, max_value: Any) -> str:
    return bar(to_float(value), max(to_float(max_value), 1.0))


def bar_rate(numerator: Any, denominator: Any) -> str:
    return bar(ratio(numerator, denominator), 1.0)


def fmt_delta_pp(treatment_num: Any, treatment_den: Any, control_num: Any, control_den: Any) -> str:
    treatment_rate = rate_or_none(treatment_num, treatment_den)
    control_rate = rate_or_none(control_num, control_den)
    if treatment_rate is None or control_rate is None:
        return ""
    return f", 비교군 대비 {(treatment_rate - control_rate) * 100:+.1f}%p"


def append_count_pair(
    lines: list[str],
    title: str,
    control_label: str,
    control_value: Any,
    treatment_label: str,
    treatment_value: Any,
) -> None:
    max_value = max(to_int(control_value), to_int(treatment_value), 1)
    lines.extend(
        [
            f"• {title}",
            f"  {control_label} {bar_count(control_value, max_value)} {fmt_count(control_value)}명",
            f"  {treatment_label} {bar_count(treatment_value, max_value)} {fmt_count(treatment_value)}명",
        ]
    )


def append_rate_pair(
    lines: list[str],
    title: str,
    control_num: Any,
    control_den: Any,
    treatment_num: Any,
    treatment_den: Any,
    *,
    nested: bool = False,
) -> None:
    title_prefix = "  " if nested else "• "
    row_prefix = "    " if nested else "  "
    lines.extend(
        [
            f"{title_prefix}{title}",
            f"{row_prefix}비교군 {bar_rate(control_num, control_den)} {fmt_rate(control_num, control_den)}",
            (
                f"{row_prefix}실험군 {bar_rate(treatment_num, treatment_den)} "
                f"{fmt_rate(treatment_num, treatment_den)}"
                f"{fmt_delta_pp(treatment_num, treatment_den, control_num, control_den)}"
            ),
        ]
    )


def append_won_line(lines: list[str], label: str, value: Any, max_abs_value: Any, *, signed: bool = False) -> None:
    amount = to_int(value)
    marker = ""
    if signed:
        marker = "▲" if amount > 0 else "▼" if amount < 0 else "·"
        marker += " "
    lines.append(f"  {label} {marker}{bar(abs(amount), max(to_int(max_abs_value), 1))} {fmt_won(amount)}")


def build_report(summary: dict[str, Any], windows: list[dict[str, Any]], report_day: date) -> str:
    control_assigned = summary["control_assigned"]
    treatment_assigned = summary["treatment_assigned"]
    margin_rate = to_float(summary["contribution_margin_rate"])
    yesterday_treatment_assigned = summary["yesterday_treatment_assigned"]
    yesterday_coupon_issued = summary["yesterday_coupon_issued_users"]
    yesterday_coupon_missing = summary["yesterday_coupon_missing_users"]
    coupon_issued = summary["coupon_issued_users"]
    coupon_used_orders = summary["coupon_used_orders"]

    lines = [
        f":bar_chart: [첫 구매 0원 CRM] 일일 리포트 ({report_day.isoformat()} KST 기준)",
        "",
        "어제 신규",
    ]

    append_count_pair(
        lines,
        "배정",
        "비교군",
        summary["yesterday_control_assigned"],
        "실험군",
        yesterday_treatment_assigned,
    )
    new_coupon_max = max(to_int(yesterday_treatment_assigned), to_int(yesterday_coupon_issued), 1)
    lines.extend(
        [
            "• 쿠폰",
            f"  발급 {bar_count(yesterday_coupon_issued, new_coupon_max)} {fmt_count(yesterday_coupon_issued)}건",
            f"  누락 {bar_count(yesterday_coupon_missing, new_coupon_max)} {fmt_count(yesterday_coupon_missing)}건",
            "",
            "누적",
        ]
    )

    append_count_pair(lines, "배정", "비교군", control_assigned, "실험군", treatment_assigned)
    lines.extend(
        [
            "• 쿠폰 퍼널",
            (
                f"  발급률 {bar(to_float(summary['coupon_issue_rate']), 1.0)} "
                f"{fmt_pct_value(summary['coupon_issue_rate'])} "
                f"({fmt_count(coupon_issued)}/{fmt_count(treatment_assigned)})"
            ),
            (
                f"  사용률 {bar(ratio(coupon_used_orders, coupon_issued), 1.0)} "
                f"{fmt_rate(coupon_used_orders, coupon_issued)}"
            ),
        ]
    )
    append_rate_pair(
        lines,
        "봉투 신청",
        summary["control_bag_users"],
        control_assigned,
        summary["treatment_bag_users"],
        treatment_assigned,
    )
    append_rate_pair(
        lines,
        "수거 신청",
        summary["control_pickup_users"],
        control_assigned,
        summary["treatment_pickup_users"],
        treatment_assigned,
    )

    cost_max = max(
        abs(to_int(summary["coupon_budget_won"])),
        abs(to_int(summary["coupon_budget_margin_deduction_won"])),
        abs(to_int(summary["treatment_pickup_contribution_won"])),
        abs(to_int(summary["net_contribution_won"])),
        1,
    )
    lines.extend(["", f"비용/공헌이익 (공헌이익률 {margin_rate * 100:.0f}% 기준)"])
    append_won_line(lines, "쿠폰 예산", summary["coupon_budget_won"], cost_max)
    append_won_line(lines, "예산 차감", summary["coupon_budget_margin_deduction_won"], cost_max)
    append_won_line(lines, "수거 CM", summary["treatment_pickup_contribution_won"], cost_max)
    append_won_line(lines, "순공헌", summary["net_contribution_won"], cost_max, signed=True)
    lines.extend(["", "회차별 전환율 (가입 후 경과 일수, 윈도우 이상 경과 모수)"])

    for row in sorted(windows, key=lambda item: item["sort_order"]):
        control_den = row["control_matured_users"]
        treatment_den = row["treatment_matured_users"]
        lines.append(
            f"• {row['window_label']} "
            f"(관측 모수: 비교군 {fmt_count(control_den)}명 / 실험군 {fmt_count(treatment_den)}명)"
        )
        if to_int(control_den) == 0 and to_int(treatment_den) == 0:
            lines.append("  관측 대기 — 아직 해당 윈도우가 지난 배정자가 없습니다.")
            continue
        append_rate_pair(
            lines,
            "봉투 신청",
            row["control_bag_users"],
            control_den,
            row["treatment_bag_users"],
            treatment_den,
            nested=True,
        )
        append_rate_pair(
            lines,
            "수거 신청",
            row["control_pickup_users"],
            control_den,
            row["treatment_pickup_users"],
            treatment_den,
            nested=True,
        )
    return "\n".join(lines)


def write_report(report: str, report_day: date) -> tuple[Path, Path]:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    latest_path = LOG_DIR / "latest-report.txt"
    dated_path = LOG_DIR / f"report-{report_day.isoformat()}.txt"
    latest_path.write_text(report + "\n", encoding="utf-8")
    dated_path.write_text(report + "\n", encoding="utf-8")
    return latest_path, dated_path


def resolve_slack_channel() -> str:
    for key in (
        "FIRST_FREE_COUPON_REPORT_SLACK_CHANNEL",
        "PRODUCT_LABS_SLACK_CHANNEL",
        "FLARELANE_MONITOR_SLACK_CHANNEL",
        "SLACK_CHANNEL",
    ):
        value = os.environ.get(key, "").strip()
        if value:
            return value
    return DEFAULT_SLACK_CHANNEL


def post_to_slack(token: str, channel: str, text: str) -> dict[str, Any]:
    payload = {"channel": channel, "text": text}
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
    logger = setup_logging()
    report_day = parse_report_date(args.report_date)
    no_slack = args.no_slack or args.dry_run
    logger.info("시작: report_date=%s no_slack=%s", report_day.isoformat(), no_slack)

    client = bigquery.Client(project=PROJECT)
    summary_rows = run_sql(client, SRC_DIR / "summary.sql", report_day, include_coupon_params=True)
    if len(summary_rows) != 1:
        raise RuntimeError(f"summary query returned {len(summary_rows)} rows")
    window_rows = run_sql(client, SRC_DIR / "windows.sql", report_day, include_coupon_params=False)

    report = build_report(summary_rows[0], window_rows, report_day)
    latest_path, dated_path = write_report(report, report_day)
    logger.info("리포트 생성 완료: windows=%d latest=%s dated=%s", len(window_rows), latest_path, dated_path)
    processed_count = to_int(summary_rows[0]["control_assigned"]) + to_int(summary_rows[0]["treatment_assigned"])
    error_count = 0
    logger.info(
        "처리 지표: processed_count=%d error_count=%d coupon_used_orders=%d windows=%d",
        processed_count,
        error_count,
        to_int(summary_rows[0]["coupon_used_orders"]),
        len(window_rows),
    )

    print(report)

    if no_slack:
        logger.info("Slack 발송 생략: --no-slack")
    else:
        token = os.environ.get("SLACK_BOT_TOKEN", "").strip()
        if not token:
            raise RuntimeError("SLACK_BOT_TOKEN 환경변수가 필요합니다.")
        channel = resolve_slack_channel()
        post_to_slack(token, channel, report)
        logger.info("Slack 발송 완료: channel=%s", channel)

    logger.info("처리 완료: processed_count=%d / error_count=%d", processed_count, error_count)
    logger.info("완료 : %.1f초", time.time() - started_at)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        logging.getLogger("first-free-coupon-monitoring-report").exception("실패: %s", exc)
        print(f"[error] {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
