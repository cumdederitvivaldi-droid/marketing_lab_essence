from __future__ import annotations

import sys
from datetime import date
from pathlib import Path


SRC_DIR = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC_DIR))

from main import DEFAULT_SLACK_CHANNEL, build_report, build_root_title, keyword_line, resolve_slack_channel  # noqa: E402


def summary_rows():
    return [
        {
            "period": "report_day",
            "sessions": 100,
            "intro_sessions": 100,
            "start_sessions": 80,
            "result_sessions": 50,
            "cta_sessions": 25,
            "feedback_choice_sessions": 5,
            "feedback_negative_sessions": 1,
            "feedback_submit_sessions": 1,
            "visit_pickup_result_sessions": 4,
            "under80_visit_pickup_sessions": 0,
            "item_text_input_sessions": 20,
            "result_per_intro_rate": 0.5,
            "cta_per_result_rate": 0.5,
            "feedback_choice_per_result_rate": 0.1,
            "negative_share_rate": 0.2,
            "under80_share_of_visit_pickup_rate": 0.0,
        },
        {
            "period": "previous_day",
            "result_per_intro_rate": 0.45,
            "cta_per_result_rate": 0.4,
            "feedback_choice_per_result_rate": 0.08,
        },
        {
            "period": "last_7d",
            "intro_sessions": 700,
            "result_sessions": 350,
            "cta_sessions": 140,
            "feedback_choice_sessions": 30,
            "feedback_negative_sessions": 3,
            "feedback_submit_sessions": 2,
            "visit_pickup_result_sessions": 20,
            "under80_visit_pickup_sessions": 0,
            "item_text_input_sessions": 120,
            "result_per_intro_rate": 0.5,
            "cta_per_result_rate": 0.4,
            "negative_share_rate": 0.1,
            "under80_share_of_visit_pickup_rate": 0.0,
        },
    ]


def test_root_title_includes_guardrail_count():
    title = build_root_title(summary_rows(), date(2026, 5, 24))

    assert "2026-05-24" in title
    assert "결과도달 50.0%" in title
    assert "80cm 미만 방문수거 0건" in title


def test_keyword_line_sanitizes_newlines_and_truncates():
    line = keyword_line(
        [
            {
                "item_search_keyword": "겨울이불\n강아지하우스 음식물 안입는옷 매우 긴 입력입니다",
                "sessions": 3,
            }
        ]
    )

    assert "\n" not in line
    assert "3" in line


def test_report_contains_conversion_guardrail_keywords_and_choices():
    report = build_report(
        summary_rows(),
        [
            {"period": "report_day", "item_search_keyword": "이불", "sessions": 4},
            {"period": "last_7d", "item_search_keyword": "소파", "sessions": 7},
        ],
        [
            {"period": "report_day", "dimension": "recommendation", "value": "GENERAL_BAG_MULTIPLE", "sessions": 20},
            {"period": "report_day", "dimension": "category", "value": "BEDDING_CLOTHES_MISC", "sessions": 30},
            {"period": "report_day", "dimension": "length_range", "value": "UNDER_80", "sessions": 40},
            {"period": "report_day", "dimension": "weight_range", "value": "OVER_25", "sessions": 5},
            {"period": "report_day", "dimension": "splittable_status", "value": "CAN_SPLIT", "sessions": 8},
            {"period": "report_day", "dimension": "has_food_waste", "value": "true", "sessions": 12},
        ],
        date(2026, 5, 24),
    )

    assert "전일 전환" in report
    assert "80cm 미만 방문수거 0건" in report
    assert "검색어" in report
    assert "이불 4" in report
    assert "전일 선택값" in report
    assert "일반 봉투 여러 장 20" in report
    assert "이불·의류·잡화 30" in report


def test_slack_channel_default_and_override(monkeypatch):
    for key in (
        "RING_QUIZ_MONITOR_SLACK_CHANNEL",
        "PRODUCT_LABS_SLACK_CHANNEL",
        "FLARELANE_MONITOR_SLACK_CHANNEL",
        "COVERING_LABS_SLACK_CHANNEL",
        "SLACK_CHANNEL",
    ):
        monkeypatch.delenv(key, raising=False)

    assert resolve_slack_channel() == DEFAULT_SLACK_CHANNEL

    monkeypatch.setenv("RING_QUIZ_MONITOR_SLACK_CHANNEL", "C123")
    assert resolve_slack_channel() == "C123"
