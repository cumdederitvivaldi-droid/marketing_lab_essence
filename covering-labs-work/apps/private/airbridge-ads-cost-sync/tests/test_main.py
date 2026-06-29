from __future__ import annotations

import importlib.util
import sys
from datetime import date
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "src" / "main.py"
SPEC = importlib.util.spec_from_file_location("airbridge_main", MODULE_PATH)
assert SPEC and SPEC.loader
main = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = main
SPEC.loader.exec_module(main)


def test_parse_cost_rows_keeps_creative_fields():
    result = {
        "actuals": {
            "data": {
                "rows": [
                    {
                        "groupBys": ["facebook.business", "camp", "group", "creative"],
                        "values": {
                            "cost_channel": {"value": 123.0},
                            "app_installs": {"value": 4.0},
                            "impressions": {"value": 100.0},
                            "clicks": {"value": 10.0},
                            "cpi_channel": {"value": 30.75},
                            "roas_channel": {"value": 1.2},
                        },
                    }
                ]
            }
        }
    }

    rows = main.parse_cost_rows(result, date(2026, 4, 22))

    assert rows[0]["channel"] == "facebook.business"
    assert rows[0]["campaign"] == "camp"
    assert rows[0]["ad_group"] == "group"
    assert rows[0]["ad_creative"] == "creative"
    assert rows[0]["cost"] == 123.0


def test_parse_cost_rows_skips_zero_cost_and_zero_installs():
    result = {
        "actuals": {
            "data": {
                "rows": [
                    {
                        "groupBys": ["facebook.business", "camp", "group", "creative"],
                        "values": {"cost_channel": {"value": 0.0}, "app_installs": {"value": 0.0}},
                    }
                ]
            }
        }
    }

    assert main.parse_cost_rows(result, date(2026, 4, 22)) == []


def test_retryable_airbridge_errors():
    assert main.is_retryable_error("Airbridge HTTP 429")
    assert main.is_retryable_error("대역폭 할당량 초과")
    assert not main.is_retryable_error("No taskId from Airbridge")


def test_parse_iso_date_rejects_invalid_format():
    try:
        main.parse_iso_date("2026/02/10", "MIN_SIGNUP_DATE")
    except ValueError as exc:
        assert "MIN_SIGNUP_DATE must be YYYY-MM-DD" in str(exc)
    else:
        raise AssertionError("parse_iso_date should reject non ISO dates")


def test_required_airbridge_token_rejects_missing_env(monkeypatch):
    monkeypatch.delenv("AIRBRIDGE_TOKEN", raising=False)

    try:
        main.required_airbridge_token()
    except ValueError as exc:
        assert "AIRBRIDGE_TOKEN is required" in str(exc)
    else:
        raise AssertionError("required_airbridge_token should reject empty token")


def test_replace_cost_rows_requires_explicit_approval():
    class DummyClient:
        def query(self, *args, **kwargs):
            raise AssertionError("BigQuery query must not run without approval")

    try:
        main.replace_cost_rows(DummyClient(), date(2026, 4, 22), [{"date": "2026-04-22"}], approve_bq_write=False)
    except ValueError as exc:
        assert "--approve-bq-write" in str(exc)
    else:
        raise AssertionError("replace_cost_rows should require explicit approval")


def test_iter_dates_inclusive():
    assert main.iter_dates(date(2026, 4, 1), date(2026, 4, 3)) == [
        date(2026, 4, 1),
        date(2026, 4, 2),
        date(2026, 4, 3),
    ]
