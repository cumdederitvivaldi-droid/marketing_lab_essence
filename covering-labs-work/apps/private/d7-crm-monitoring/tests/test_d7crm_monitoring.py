from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import d7crm_monitoring


def test_select_query_keys_daily() -> None:
    """Daily mode runs the three lightweight monitoring queries."""
    assert d7crm_monitoring.select_query_keys("daily") == ["1", "2", "3"]


def test_select_query_keys_all() -> None:
    """All mode runs every registered query."""
    assert d7crm_monitoring.select_query_keys("all") == list(d7crm_monitoring.QUERIES.keys())


def test_select_query_keys_specific() -> None:
    """A numbered query runs only that query."""
    assert d7crm_monitoring.select_query_keys("2") == ["2"]


def test_print_sql_skips_bigquery(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    """Printing SQL does not create a BigQuery client."""
    def fail_client(*args: object, **kwargs: object) -> object:
        raise AssertionError("BigQuery client should not be created for --print-sql")

    monkeypatch.setattr(sys, "argv", ["d7crm_monitoring.py", "1", "--print-sql"])
    monkeypatch.setattr(d7crm_monitoring.bigquery, "Client", fail_client)

    assert d7crm_monitoring.main() == 0
    assert d7crm_monitoring.QUERIES["1"][1] in capsys.readouterr().out


def test_daily_runs_expected_queries(monkeypatch: pytest.MonkeyPatch) -> None:
    """Daily mode executes only Q1, Q2, and Q3."""
    executed: list[str] = []

    class DummyClient:
        def __init__(self, project: str) -> None:
            self.project = project

    monkeypatch.setattr(sys, "argv", ["d7crm_monitoring.py", "daily"])
    monkeypatch.setattr(d7crm_monitoring.bigquery, "Client", DummyClient)
    monkeypatch.setattr(
        d7crm_monitoring,
        "run_query",
        lambda client, key, query: executed.append(key),
    )

    assert d7crm_monitoring.main() == 0
    assert executed == ["1", "2", "3"]


def test_invalid_query_exits(monkeypatch: pytest.MonkeyPatch) -> None:
    """Argparse exits for unsupported query names."""
    monkeypatch.setattr(sys, "argv", ["d7crm_monitoring.py", "unknown"])

    with pytest.raises(SystemExit):
        d7crm_monitoring.main()
