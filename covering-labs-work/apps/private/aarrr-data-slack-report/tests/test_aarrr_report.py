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
            "prev_start": "2026-03-09",
            "prev_end": "2026-04-07",
            "week_start": "2026-04-01",
            "week_end": "2026-04-30",
            "prev_mau": 57821,
            "mau": 65824,
            "mau_change": 0.1384,
            "week_mau": 64220,
            "mau_week_change": 0.0250,
            "signups": 42327,
            "signup_change": -0.0919,
            "week_signups": 43001,
            "signup_week_change": -0.0157,
            "first_paid_users": 20697,
            "first_paid_change": 0.1156,
            "week_first_paid_users": 20240,
            "first_paid_week_change": 0.0226,
            "paid_receipts": 142985,
            "paid_receipts_change": 0.1386,
            "week_paid_receipts": 139800,
            "paid_receipts_week_change": 0.0228,
            "revenue": 1759352476,
            "revenue_change": 0.1452,
            "week_revenue": 1711000000,
            "revenue_week_change": 0.0283,
            "arpu": 26728,
            "arpu_change": 0.006,
            "week_arpu": 26642,
            "arpu_week_change": 0.0032,
            "ads_signup_cac": 22777,
            "friend_referral_signups": 4392,
            "friend_referral_to_mau_rate": 0.0667,
            "mature_signups": 42737,
            "d7_first_paid_users": 9846,
            "d7_first_paid_rate": 0.2304,
            "d7_first_paid_rate_p_diff": 0.0351,
            "d7_first_paid_rate_week_p_diff": 0.0048,
            "first_paid_cohort": 15339,
            "retained_users": 4755,
            "m1_retention_rate": 0.31,
            "m1_retention_rate_p_diff": -0.0467,
            "m1_retention_rate_week_p_diff": -0.0072,
        },
        channels=[
            {
                "name": "ADS",
                "users": 20045,
                "users_change": -0.134,
                "users_week_change": -0.022,
                "d7_rate": 0.236,
                "d7_rate_p_diff": 0.042,
                "d7_rate_week_p_diff": 0.006,
            },
            {
                "name": "FRIEND_REFERRAL",
                "users": 4263,
                "users_change": 0.035,
                "users_week_change": 0.013,
                "d7_rate": 0.338,
                "d7_rate_p_diff": 0.033,
                "d7_rate_week_p_diff": 0.004,
            },
            {
                "name": "NEIGHBOR_USE",
                "users": 925,
                "users_change": 0.036,
                "users_week_change": 0.018,
                "d7_rate": 0.376,
                "d7_rate_p_diff": 0.067,
                "d7_rate_week_p_diff": 0.012,
            },
        ],
    )


def test_build_message_uses_graph_style_not_markdown_table() -> None:
    report = sample_report()
    root = main.build_root_message(report)
    message = main.build_message(report, max_segments=3)

    assert root.startswith("*AARRR 리포트 | 2026-05-07*")
    assert "최근 30일 결제 유저 65,824명(30일전 +13.8% / 1주전 +2.5%)" in root
    assert "M1 30일전 -4.7%p / 1주전 -0.7%p" in root
    assert "*AARRR 리포트 | 2026-05-07*" in message
    assert "비교: 30일전 2026-03-09~2026-04-07 / 1주전 2026-04-01~2026-04-30" in message
    assert "*Acquisition*" in message
    assert "*Activation*" in message
    assert "*Retention*" in message
    assert "*Revenue*" in message
    assert "*Referral*" in message
    assert "*생활쓰레기 기능 맥락*" not in message
    assert "*대커봉 기능 맥락*" not in message
    assert "*서비스별 전체*" not in message
    assert "D7 전환        가입 42,737 -> 첫결제 9,846" in message
    assert "M1 후속        첫결제 15,339 -> 후속결제 4,755" in message
    assert "최근 30일 결제 유저 65,824명    30일전 +13.8% / 1주전 +2.5%" in message
    assert "친구추천 가입 4,392명 / 결제 유저 대비 6.7%" in message
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


def test_won_renders_missing_value_as_na() -> None:
    assert main.won(None) == "n/a"
    assert main.won(0) == "0원"
