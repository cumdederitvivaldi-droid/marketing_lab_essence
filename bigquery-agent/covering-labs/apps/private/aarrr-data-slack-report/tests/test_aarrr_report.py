from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import main


def sample_report() -> main.ReportData:
    return main.ReportData(
        metrics={
            "report_date": "2026-05-07",
            "curr_start": "2026-04-08",
            "curr_end": "2026-05-07",
            "prev_mau": 57821,
            "mau": 65824,
            "mau_change": 0.1384,
            "signups": 42327,
            "signup_change": -0.0919,
            "first_paid_users": 20697,
            "first_paid_change": 0.1156,
            "paid_receipts": 142985,
            "paid_receipts_change": 0.1386,
            "revenue": 1759352476,
            "revenue_change": 0.1452,
            "arpu": 26728,
            "arpu_change": 0.006,
            "ads_signup_cac": 22777,
            "friend_referral_signups": 4392,
            "friend_referral_to_mau_rate": 0.0667,
            "mature_signups": 42737,
            "d7_first_paid_users": 9846,
            "d7_first_paid_rate": 0.2304,
            "d7_first_paid_rate_p_diff": 0.0351,
            "first_paid_cohort": 15339,
            "retained_users": 4755,
            "m1_retention_rate": 0.31,
            "m1_retention_rate_p_diff": -0.0467,
        },
        services=[
            {
                "name": "대형폐기물",
                "users": 5948,
                "users_change": 0.445,
                "revenue": 184870917,
                "revenue_change": 0.425,
            },
            {
                "name": "생활쓰레기",
                "users": 62048,
                "users_change": 0.128,
                "revenue": 1525660328,
                "revenue_change": 0.124,
            },
            {
                "name": "박스",
                "users": 2253,
                "users_change": 0.003,
                "revenue": 48821231,
                "revenue_change": -0.016,
            },
        ],
        channels=[
            {
                "name": "ADS",
                "users": 20045,
                "users_change": -0.134,
                "d7_rate": 0.236,
                "d7_rate_p_diff": 0.042,
            },
            {
                "name": "FRIEND_REFERRAL",
                "users": 4263,
                "users_change": 0.035,
                "d7_rate": 0.338,
                "d7_rate_p_diff": 0.033,
            },
            {
                "name": "NEIGHBOR_USE",
                "users": 925,
                "users_change": 0.036,
                "d7_rate": 0.376,
                "d7_rate_p_diff": 0.067,
            },
        ],
        retention=[
            {
                "name": "생활쓰레기",
                "cohort_users": 13990,
                "retained_users": 4436,
                "retention_rate": 0.317,
                "retention_rate_p_diff": -0.036,
            },
            {
                "name": "대형폐기물",
                "cohort_users": 1075,
                "retained_users": 199,
                "retention_rate": 0.185,
                "retention_rate_p_diff": None,
            },
        ],
    )


def test_build_message_uses_graph_style_not_markdown_table() -> None:
    report = sample_report()
    root = main.build_root_message(report)
    message = main.build_message(report, max_segments=3)

    assert root.startswith("*AARRR 리포트 | 2026-05-07*")
    assert "결제 MAU 65,824명(+13.8%)" in root
    assert "M1 리텐션 -4.7%p(고단가 mix)" in root
    assert "*AARRR 리포트 | 2026-05-07*" in message
    assert "████" in message
    assert "D7 전환" in message
    assert "가입 42,737 -> 첫결제 9,846" in message
    assert "고단가 유저 증가에 따른 건강한 하락" in message
    table_divider = "|" + "---" + "|"
    assert table_divider not in message


def test_send_state_records_latest_root_and_detail_without_reusing_threads() -> None:
    state = {}
    state = main.update_state_with_send(
        state,
        report_date=date(2026, 5, 7),
        channel=main.DEFAULT_SLACK_CHANNEL,
        root_ts="111.222",
        detail_ts=None,
    )
    state = main.update_state_with_send(
        state,
        report_date=date(2026, 5, 8),
        channel=main.DEFAULT_SLACK_CHANNEL,
        root_ts="111.222",
        detail_ts="111.444",
    )

    assert state["last_send"]["root_ts"] == "111.222"
    assert state["last_send"]["detail_ts"] == "111.444"
    assert len(state["recent_sends"]) == 1
    assert state["recent_sends"][0]["root_ts"] == "111.222"
    assert state["recent_sends"][0]["detail_ts"] == "111.444"


def test_state_io_handles_malformed_json_and_writes_atomically(tmp_path: Path) -> None:
    state_path = tmp_path / "state.json"
    state_path.write_text("{not-json", encoding="utf-8")

    assert main.load_state(state_path) == {}

    main.save_state(
        state_path,
        {"last_send": {"channel": main.DEFAULT_SLACK_CHANNEL, "root_ts": "r1", "detail_ts": "d1"}},
    )

    loaded = main.load_state(state_path)["last_send"]
    assert loaded["channel"] == main.DEFAULT_SLACK_CHANNEL
    assert loaded["root_ts"] == "r1"
    assert loaded["detail_ts"] == "d1"
    assert not list(tmp_path.glob("*.tmp"))


def test_money_text_switches_to_eok() -> None:
    assert main.money_text(1759352476) == "17.6억"
    assert main.money_text(48821231) == "4,882만원"
