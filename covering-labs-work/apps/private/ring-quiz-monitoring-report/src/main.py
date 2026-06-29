#!/usr/bin/env python3
"""Daily Slack monitoring report for disposal-guide ring quiz."""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from google.cloud import bigquery

from config import _load_env_file


PROJECT = "covering-app-ccd23"
KST = timezone(timedelta(hours=9))
APP_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = Path(__file__).resolve().parent
LOG_DIR = APP_ROOT / "logs"
LOG_PATH = LOG_DIR / "batch.log"
DEFAULT_SLACK_CHANNEL = "C0ARXKB2Y9L"  # #제품팀_실험실_notification
BAR_WIDTH = 10

CATEGORY_LABELS = {
    "GENERAL_FOOD_RECYCLE": "재활용·음식물·일반",
    "BEDDING_CLOTHES_MISC": "이불·의류·잡화",
    "APPLIANCE_FURNITURE": "가전·가구",
    "ETC": "기타",
}
RECOMMENDATION_LABELS = {
    "GENERAL_BAG_SINGLE": "일반 봉투 1장",
    "GENERAL_BAG_MULTIPLE": "일반 봉투 여러 장",
    "LARGE_COVERING_BAG": "대형 봉투",
    "VISIT_PICKUP": "방문수거",
}
LENGTH_LABELS = {
    "UNDER_80": "80cm 미만",
    "AROUND_80": "80cm 내외",
    "OVER_80_UNDER_140": "86~140cm",
    "OVER_140_UNDER_150": "141~150cm",
    "OVER_150": "150cm 초과",
}
WEIGHT_LABELS = {
    "UNDER_15": "15kg 이하",
    "OVER_15_UNDER_25": "15~25kg",
    "OVER_25": "25kg 이상",
    "UNKNOWN": "모름",
}
PERCEIVED_WEIGHT_LABELS = {
    "EASY_TO_LIFT": "쉽게 들 수 있음",
    "HARD_TO_HOLD_LONG": "오래 들기 어려움",
    "HARD_TO_LIFT": "혼자 들기 어려움",
}
SPLITTABLE_LABELS = {
    "CAN_SPLIT": "나눠 담기 가능",
    "CANNOT_SPLIT": "나눠 담기 불가",
    "UNKNOWN": "모름",
}
FOOD_WASTE_LABELS = {
    "true": "음식물 포함",
    "false": "음식물 미포함",
    "TRUE": "음식물 포함",
    "FALSE": "음식물 미포함",
}
DIMENSION_LABELS = {
    "recommendation": "추천 결과",
    "category": "선택 카테고리",
    "length_range": "길이",
    "weight_range": "무게",
    "splittable_status": "나눠 담기",
    "perceived_weight": "체감 무게",
    "has_food_waste": "음식물",
}
VALUE_LABELS_BY_DIMENSION = {
    "category": CATEGORY_LABELS,
    "recommendation": RECOMMENDATION_LABELS,
    "length_range": LENGTH_LABELS,
    "weight_range": WEIGHT_LABELS,
    "perceived_weight": PERCEIVED_WEIGHT_LABELS,
    "splittable_status": SPLITTABLE_LABELS,
    "has_food_waste": FOOD_WASTE_LABELS,
}


_load_env_file()


def setup_logging() -> logging.Logger:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(LOG_PATH, encoding="utf-8"),
        ],
    )
    return logging.getLogger("ring-quiz-monitoring-report")


def parse_report_date(raw_value: str | None) -> date:
    if raw_value:
        return date.fromisoformat(raw_value)
    return (datetime.now(KST) - timedelta(days=1)).date()


def query_params(report_day: date) -> list[bigquery.ScalarQueryParameter]:
    return [bigquery.ScalarQueryParameter("report_date", "DATE", report_day.isoformat())]


def run_sql(client: bigquery.Client, sql_path: Path, report_day: date) -> list[dict[str, Any]]:
    sql = sql_path.read_text(encoding="utf-8")
    job_config = bigquery.QueryJobConfig(query_parameters=query_params(report_day))
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


def fmt_pct(value: Any) -> str:
    if value is None:
        return "—"
    return f"{to_float(value) * 100:.1f}%"


def fmt_rate(rate: Any, numerator: Any, denominator: Any) -> str:
    return f"{fmt_pct(rate)} ({fmt_count(numerator)}/{fmt_count(denominator)})"


def fmt_delta_pp(current: Any, previous: Any) -> str:
    if current is None or previous is None:
        return ""
    delta = (to_float(current) - to_float(previous)) * 100
    if abs(delta) < 0.05:
        return " · 전일 대비 0.0%p"
    return f" · 전일 대비 {delta:+.1f}%p"


def bar(value: Any, max_value: float = 1.0, width: int = BAR_WIDTH) -> str:
    ratio = 0.0 if max_value <= 0 else max(0.0, min(1.0, to_float(value) / max_value))
    filled = int(round(ratio * width))
    filled = max(0, min(width, filled))
    return "█" * filled + "░" * (width - filled)


def sanitize_text(value: Any, max_length: int = 60) -> str:
    text = str(value or "").replace("\n", " ").replace("\r", " ").strip()
    if len(text) <= max_length:
        return text
    return f"{text[:max_length - 1]}…"


def label_value(dimension: str, value: Any) -> str:
    raw = str(value or "")
    return VALUE_LABELS_BY_DIMENSION.get(dimension, {}).get(raw, raw or "없음")


def rows_by_period(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(row["period"]): row for row in rows}


def group_keywords(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[str(row["period"])].append(row)
    return grouped


def group_dimensions(rows: list[dict[str, Any]]) -> dict[str, dict[str, list[dict[str, Any]]]]:
    grouped: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
    for row in rows:
        grouped[str(row["period"])][str(row["dimension"])].append(row)
    return grouped


def keyword_line(rows: list[dict[str, Any]], limit: int = 10) -> str:
    if not rows:
        return "없음"
    items = []
    for row in rows[:limit]:
        items.append(f"{sanitize_text(row['item_search_keyword'])} {fmt_count(row['sessions'])}")
    return ", ".join(items)


def dimension_line(rows: list[dict[str, Any]], dimension: str, limit: int = 5) -> str:
    if not rows:
        return "없음"
    items = []
    for row in rows[:limit]:
        items.append(f"{label_value(dimension, row['value'])} {fmt_count(row['sessions'])}")
    return ", ".join(items)


def summary_line(row: dict[str, Any], previous: dict[str, Any] | None = None) -> list[str]:
    previous = previous or {}
    return [
        (
            "• 결과 도달 "
            f"{bar(row.get('result_per_intro_rate'))} "
            f"{fmt_rate(row.get('result_per_intro_rate'), row.get('result_sessions'), row.get('intro_sessions'))}"
            f"{fmt_delta_pp(row.get('result_per_intro_rate'), previous.get('result_per_intro_rate'))}"
        ),
        (
            "• CTA "
            f"{bar(row.get('cta_per_result_rate'))} "
            f"{fmt_rate(row.get('cta_per_result_rate'), row.get('cta_sessions'), row.get('result_sessions'))}"
            f"{fmt_delta_pp(row.get('cta_per_result_rate'), previous.get('cta_per_result_rate'))}"
        ),
        (
            "• 피드백 선택 "
            f"{bar(row.get('feedback_choice_per_result_rate'))} "
            f"{fmt_rate(row.get('feedback_choice_per_result_rate'), row.get('feedback_choice_sessions'), row.get('result_sessions'))}"
            f"{fmt_delta_pp(row.get('feedback_choice_per_result_rate'), previous.get('feedback_choice_per_result_rate'))}"
        ),
    ]


def build_root_title(summary_rows: list[dict[str, Any]], report_day: date) -> str:
    periods = rows_by_period(summary_rows)
    day = periods.get("report_day", {})
    under80 = to_int(day.get("under80_visit_pickup_sessions"))
    result_rate = fmt_pct(day.get("result_per_intro_rate"))
    cta_rate = fmt_pct(day.get("cta_per_result_rate"))
    return (
        f"[링퀴즈] {report_day.isoformat()} 결과도달 {result_rate}, "
        f"CTA {cta_rate}, 80cm 미만 방문수거 {under80}건"
    )


def build_report(
    summary_rows: list[dict[str, Any]],
    keyword_rows: list[dict[str, Any]],
    dimension_rows: list[dict[str, Any]],
    report_day: date,
) -> str:
    periods = rows_by_period(summary_rows)
    report = periods.get("report_day", {})
    previous = periods.get("previous_day", {})
    last7 = periods.get("last_7d", {})
    keywords = group_keywords(keyword_rows)
    dimensions = group_dimensions(dimension_rows)

    lines = [
        f":bar_chart: [링퀴즈] 일일 모니터링 ({report_day.isoformat()} KST)",
        "",
        "전일 전환",
        f"• 첫 진입 {fmt_count(report.get('intro_sessions'))} → 시작 {fmt_count(report.get('start_sessions'))} → 결과 {fmt_count(report.get('result_sessions'))} → CTA {fmt_count(report.get('cta_sessions'))}",
        *summary_line(report, previous),
        "",
        "추천 품질",
        (
            "• 80cm 미만 방문수거 "
            f"{fmt_count(report.get('under80_visit_pickup_sessions'))}건 "
            f"(방문수거 {fmt_count(report.get('visit_pickup_result_sessions'))}건 중 "
            f"{fmt_pct(report.get('under80_share_of_visit_pickup_rate'))})"
        ),
        (
            "• 최근 7일 80cm 미만 방문수거 "
            f"{fmt_count(last7.get('under80_visit_pickup_sessions'))}건 "
            f"(방문수거 {fmt_count(last7.get('visit_pickup_result_sessions'))}건 중 "
            f"{fmt_pct(last7.get('under80_share_of_visit_pickup_rate'))})"
        ),
        "",
        "피드백",
        (
            f"• 선택 {fmt_count(report.get('feedback_choice_sessions'))}건, "
            f"별로에요 {fmt_count(report.get('feedback_negative_sessions'))}건 "
            f"({fmt_pct(report.get('negative_share_rate'))}), "
            f"제출 {fmt_count(report.get('feedback_submit_sessions'))}건"
        ),
        (
            f"• 최근 7일 선택 {fmt_count(last7.get('feedback_choice_sessions'))}건, "
            f"별로에요 {fmt_count(last7.get('feedback_negative_sessions'))}건 "
            f"({fmt_pct(last7.get('negative_share_rate'))}), "
            f"제출 {fmt_count(last7.get('feedback_submit_sessions'))}건"
        ),
        "",
        "검색어",
        f"• 전일 Top: {keyword_line(keywords.get('report_day', []))}",
        f"• 최근 7일 Top: {keyword_line(keywords.get('last_7d', []))}",
        "",
        "전일 선택값",
        f"• 추천 결과: {dimension_line(dimensions.get('report_day', {}).get('recommendation', []), 'recommendation')}",
        f"• 카테고리: {dimension_line(dimensions.get('report_day', {}).get('category', []), 'category')}",
        f"• 길이: {dimension_line(dimensions.get('report_day', {}).get('length_range', []), 'length_range')}",
        f"• 무게: {dimension_line(dimensions.get('report_day', {}).get('weight_range', []), 'weight_range')}",
        f"• 나눠 담기: {dimension_line(dimensions.get('report_day', {}).get('splittable_status', []), 'splittable_status')}",
        f"• 음식물: {dimension_line(dimensions.get('report_day', {}).get('has_food_waste', []), 'has_food_waste')}",
        "",
        "최근 7일 기준",
        f"• 결과 도달 {fmt_rate(last7.get('result_per_intro_rate'), last7.get('result_sessions'), last7.get('intro_sessions'))}",
        f"• CTA {fmt_rate(last7.get('cta_per_result_rate'), last7.get('cta_sessions'), last7.get('result_sessions'))}",
        f"• 수기 입력 {fmt_count(last7.get('item_text_input_sessions'))}세션",
    ]
    return "\n".join(lines)


def resolve_slack_channel() -> str:
    for key in (
        "RING_QUIZ_MONITOR_SLACK_CHANNEL",
        "PRODUCT_LABS_SLACK_CHANNEL",
        "FLARELANE_MONITOR_SLACK_CHANNEL",
        "COVERING_LABS_SLACK_CHANNEL",
        "SLACK_CHANNEL",
    ):
        value = os.environ.get(key, "").strip()
        if value:
            return value
    return DEFAULT_SLACK_CHANNEL


def post_to_slack(token: str, channel: str, text: str, thread_ts: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"channel": channel, "text": text, "unfurl_links": False, "unfurl_media": False}
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
    parser.add_argument("--no-slack", action="store_true", help="Slack 발송 없이 리포트를 출력")
    parser.add_argument("--dry-run", action="store_true", help="--no-slack alias")
    args = parser.parse_args()

    started_at = time.time()
    logger = setup_logging()
    report_day = parse_report_date(args.report_date)
    no_slack = args.no_slack or args.dry_run
    logger.info("시작: report_date=%s no_slack=%s", report_day.isoformat(), no_slack)

    client = bigquery.Client(project=PROJECT)
    summary_rows = run_sql(client, SRC_DIR / "summary.sql", report_day)
    keyword_rows = run_sql(client, SRC_DIR / "keywords.sql", report_day)
    dimension_rows = run_sql(client, SRC_DIR / "dimensions.sql", report_day)

    root_title = build_root_title(summary_rows, report_day)
    report = build_report(summary_rows, keyword_rows, dimension_rows, report_day)
    logger.info(
        "리포트 생성 완료: summary=%d keywords=%d dimensions=%d",
        len(summary_rows),
        len(keyword_rows),
        len(dimension_rows),
    )
    print(root_title)
    print()
    print(report)

    if no_slack:
        logger.info("Slack 발송 생략: --no-slack")
    else:
        token = os.environ.get("SLACK_BOT_TOKEN", "").strip()
        if not token:
            raise RuntimeError("SLACK_BOT_TOKEN 환경변수가 필요합니다.")
        channel = resolve_slack_channel()
        root = post_to_slack(token, channel, root_title)
        thread_ts = str(root.get("ts") or "")
        if not thread_ts:
            raise RuntimeError(f"Slack 루트 메시지 ts를 찾지 못했습니다: {root}")
        post_to_slack(token, channel, report, thread_ts=thread_ts)
        logger.info("Slack 발송 완료: channel=%s thread_ts=%s", channel, thread_ts)

    processed_count = to_int(rows_by_period(summary_rows).get("report_day", {}).get("sessions"))
    logger.info("처리 완료: processed_count=%d / error_count=0", processed_count)
    logger.info("완료 : %.1f초", time.time() - started_at)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        logging.getLogger("ring-quiz-monitoring-report").exception("실패: %s", exc)
        print(f"[error] {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
