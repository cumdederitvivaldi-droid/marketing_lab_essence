from __future__ import annotations

from datetime import date

import sys
from pathlib import Path


SRC_DIR = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC_DIR))

from main import (
    DailyPoint,
    MetricRow,
    ReportData,
    build_root_message,
    daily_trend_line,
    find_existing_send,
    format_delta,
    format_value,
    metric_line,
    report_log_fields,
    sparkline,
    update_state_with_send,
)


def test_format_value_by_unit() -> None:
    assert format_value(7391, "krw") == "7,391원"
    assert format_value(82.34, "pct") == "82.3%"
    assert format_value(5852, "count") == "5,852건"
    assert format_value(15.16, "hour") == "15.2시"
    assert format_value(5.346, "ratio") == "5.35배"
    assert format_value(0, "krw") == "0원"
    assert format_value(-1234, "count") == "-1,234건"
    assert format_value(1234567890, "count") == "1,234,567,890건"
    assert format_value(82.349, "pct") == "82.3%"
    assert format_value(82.351, "pct") == "82.4%"


def test_format_delta_by_unit() -> None:
    assert format_delta(7391, 7413, "krw") == "-0.3%"
    assert format_delta(82.0, 80.5, "pct") == "+1.5%p"
    assert format_delta(15.2, 14.8, "hour") == "+0.4h"
    assert format_delta(5.35, 5.25, "ratio") == "+0.10x"
    assert format_delta(100, 100, "krw") == "+0.0%"
    assert format_delta(0, 0, "count") == "-"
    assert format_delta(50, 0, "pct") == "-"


def test_metric_line_matches_requested_shape() -> None:
    metric = MetricRow(
        sort_order=140,
        key="m1_follow_payment_arpu",
        label="M1 후속 결제",
        unit="krw",
        value=7391,
        value_7d_ago=7466,
        value_30d_ago=7413,
        value_1d_ago=7520,
    )

    assert metric_line(metric) == "- M1 후속 결제: 7,391원 (전일 -1.7% / 1주전 -1.0% / 30일전 -0.3%)"


def test_build_root_message_contains_headline_metrics() -> None:
    report = ReportData(
        report_date=date(2026, 5, 18),
        week_date=date(2026, 5, 11),
        month_date=date(2026, 4, 18),
        metrics=[
            MetricRow(10, "bag_application_orders", "일반 봉투 신청", "count", 5852, 5100, 4900),
            MetricRow(20, "pickup_orders", "일반 수거 신청", "count", 5289, 5000, 4700),
            MetricRow(30, "after_7_rate", "오전 7시 이후 수거율", "pct", 82.0, 80.0, 79.0),
            MetricRow(140, "m1_follow_payment_arpu", "M1 후속 결제", "krw", 7391, 7466, 7413),
        ],
    )

    message = build_root_message(report)

    assert "일반 커버링 봉투 리포트 | 2026-05-18" in message
    assert "봉투 신청 5,852건" in message
    assert "수거 신청 5,289건" in message
    assert "오전7시 이후 82.0%" in message
    assert "M1 후속 결제 7,391원" in message
    assert "전일대비 봉투 -" in message


def test_daily_trend_line_shows_recent_daily_values_and_day_over_day_delta() -> None:
    metric = MetricRow(
        sort_order=10,
        key="bag_application_orders",
        label="일반 봉투 신청",
        unit="count",
        value=5811,
        value_7d_ago=5100,
        value_30d_ago=4900,
        value_1d_ago=5400,
        daily_values=(
            DailyPoint(date(2026, 5, 12), 5200),
            DailyPoint(date(2026, 5, 13), 5310),
            DailyPoint(date(2026, 5, 14), 5420),
            DailyPoint(date(2026, 5, 15), 5550),
            DailyPoint(date(2026, 5, 16), 5700),
            DailyPoint(date(2026, 5, 17), 5400),
            DailyPoint(date(2026, 5, 18), 5811),
        ),
    )

    assert daily_trend_line(metric) == (
        "- 일반 봉투 신청 (05/12~05/18): "
        "▁▁▁▁ ▂▂▂▂ ▃▃▃▃ ▅▅▅▅ ▆▆▆▆ ▃▃▃▃ ████ / 5,200건 -> 5,811건 / 7일 +11.8% "
        "/ 전일 +7.6%"
    )


def test_sparkline_handles_flat_and_missing_daily_values() -> None:
    assert sparkline(
        (
            DailyPoint(date(2026, 5, 12), 10),
            DailyPoint(date(2026, 5, 13), None),
            DailyPoint(date(2026, 5, 14), 10),
        )
    ) == "▄▄▄▄ ---- ▄▄▄▄"
    assert sparkline(
        (
            DailyPoint(date(2026, 5, 12), None),
            DailyPoint(date(2026, 5, 13), None),
        )
    ) == "---- ----"


def test_update_state_with_send_is_keyed_by_report_date_and_channel() -> None:
    state = update_state_with_send({}, date(2026, 5, 18), "C0A198Z0P2N", "111.000", "222.000")

    existing = find_existing_send(state, date(2026, 5, 18), "C0A198Z0P2N")

    assert existing is not None
    assert existing["root_ts"] == "111.000"
    assert existing["detail_ts"] == "222.000"
    assert find_existing_send(state, date(2026, 5, 19), "C0A198Z0P2N") is None
    assert find_existing_send(state, date(2026, 5, 18), "OTHER") is None


def test_report_log_fields_contains_core_operational_metrics() -> None:
    report = ReportData(
        report_date=date(2026, 5, 18),
        week_date=date(2026, 5, 11),
        month_date=date(2026, 4, 18),
        metrics=[
            MetricRow(10, "bag_application_orders", "일반 봉투 신청", "count", 5852, 5100, 4900),
            MetricRow(20, "pickup_orders", "일반 수거 신청", "count", 5289, 5000, 4700),
            MetricRow(30, "after_7_rate", "오전 7시 이후 수거율", "pct", 82.0, 80.0, 79.0),
            MetricRow(40, "completion_p90_hour", "수거 완료시각 p90", "hour", 6.0, 5.8, 4.9),
            MetricRow(140, "m1_follow_payment_arpu", "M1 후속 결제", "krw", 7391, 7466, 7413),
        ],
    )

    fields = report_log_fields(report)

    assert fields["report_date"] == "2026-05-18"
    assert fields["metric_count"] == 5
    assert fields["bag_application_orders"] == 5852
    assert fields["pickup_orders"] == 5289
    assert fields["after_7_rate"] == 82.0
    assert fields["completion_p90_hour"] == 6.0
    assert fields["m1_follow_payment_arpu"] == 7391
