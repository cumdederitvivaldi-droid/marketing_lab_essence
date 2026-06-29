from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import d7crm_analysis


class FakeResponse:
    def __init__(self, status_code: int, payload: object | None = None) -> None:
        self.status_code = status_code
        self.payload = {} if payload is None else payload

    def json(self) -> object:
        return self.payload


class FakeSession:
    def __init__(self, responses: list[FakeResponse | Exception]) -> None:
        self.responses = responses
        self.calls = 0

    def get(self, url: str, params: dict[str, str | int], timeout: int) -> FakeResponse:
        self.calls += 1
        assert url == "https://example.test/devices"
        assert params == {"tagKey": "tag", "offset": 0, "limit": 100}
        assert timeout == 30
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def test_bq_literal_escapes_control_characters() -> None:
    """User IDs from CSV/API are safe to inline into generated SQL."""
    value = "a\\b'c\nd\re\tf\fg\vh\0i"

    assert d7crm_analysis.bq_literal(value) == "'a\\\\b\\'c\\nd\\re\\tf\\fg\\vh\\x00i'"


def test_dedupe_users_keeps_single_assignment() -> None:
    """Repeated rows for the same group are collapsed."""
    users = [
        {"user_id": "100", "group": "d3_treatment"},
        {"user_id": "100", "group": "d3_treatment"},
    ]

    assert d7crm_analysis.dedupe_users(users) == [
        {"user_id": "100", "group": "d3_treatment", "has_conflict": "false"}
    ]


def test_dedupe_users_marks_conflicts() -> None:
    """Different groups for one user are marked as a conflict."""
    users = [
        {"user_id": "100", "group": "d3_treatment"},
        {"user_id": "100", "group": "d3_control"},
    ]

    assert d7crm_analysis.dedupe_users(users) == [
        {"user_id": "100", "group": "MULTIPLE:d3_control|d3_treatment", "has_conflict": "true"}
    ]


def test_read_groups_dedupes_duplicate_rows(tmp_path: Path) -> None:
    """Analysis CSV reads one row per user after dedupe."""
    groups_csv = tmp_path / "groups.csv"
    groups_csv.write_text("user_id,group\n100,d3_treatment\n100,d3_treatment\n", encoding="utf-8")

    assert d7crm_analysis.read_groups(groups_csv) == [{"user_id": "100", "group": "d3_treatment"}]


def test_read_groups_rejects_conflicting_rows(tmp_path: Path) -> None:
    """Analysis CSV fails when one user belongs to multiple groups."""
    groups_csv = tmp_path / "groups.csv"
    groups_csv.write_text("user_id,group\n100,d3_treatment\n100,d3_control\n", encoding="utf-8")

    with pytest.raises(SystemExit):
        d7crm_analysis.read_groups(groups_csv)


def test_read_groups_rejects_pre_marked_conflict(tmp_path: Path) -> None:
    """CSV conflict markers are preserved through the unified dedupe path."""
    groups_csv = tmp_path / "groups.csv"
    groups_csv.write_text("user_id,group,has_conflict\n100,d3_treatment,true\n", encoding="utf-8")

    with pytest.raises(SystemExit):
        d7crm_analysis.read_groups(groups_csv)


def test_flarelane_data_accepts_user_id_variants() -> None:
    """FlareLane user identifiers are validated before extraction."""
    rows = d7crm_analysis._flarelane_data(
        FakeResponse(200, {"data": [{"userId": "100"}, {"user_id": 200}, {"userId": ""}]})
    )

    assert [d7crm_analysis._flarelane_user_id(row) for row in rows] == ["100", "200", None]


def test_flarelane_data_rejects_unknown_user_schema() -> None:
    """Schema changes fail loudly instead of producing an empty CSV."""
    rows = d7crm_analysis._flarelane_data(FakeResponse(200, {"data": [{"id": "100"}]}))

    with pytest.raises(SystemExit):
        d7crm_analysis._flarelane_user_id(rows[0])


def test_flarelane_data_rejects_invalid_payload() -> None:
    """Invalid response shapes are rejected before processing."""
    with pytest.raises(SystemExit):
        d7crm_analysis._flarelane_data(FakeResponse(200, {"data": {"userId": "100"}}))


def test_request_with_retry_retries_server_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    """Transient 5xx failures are retried before succeeding."""
    session = FakeSession([FakeResponse(500), FakeResponse(200)])
    sleeps: list[float] = []
    monkeypatch.setattr(d7crm_analysis.time, "sleep", sleeps.append)

    response = d7crm_analysis._request_with_retry(
        session,
        "https://example.test/devices",
        {"tagKey": "tag", "offset": 0, "limit": 100},
    )

    assert response.status_code == 200
    assert session.calls == 2
    assert sleeps == [1.0]


def test_request_with_retry_retries_network_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    """Transient request exceptions are retried before succeeding."""
    session = FakeSession([d7crm_analysis.requests.Timeout("temporary"), FakeResponse(200)])
    sleeps: list[float] = []
    monkeypatch.setattr(d7crm_analysis.time, "sleep", sleeps.append)

    response = d7crm_analysis._request_with_retry(
        session,
        "https://example.test/devices",
        {"tagKey": "tag", "offset": 0, "limit": 100},
    )

    assert response.status_code == 200
    assert session.calls == 2
    assert sleeps == [1.0]


def test_request_with_retry_does_not_retry_client_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    """Non-transient 4xx responses fail immediately."""
    session = FakeSession([FakeResponse(400)])
    sleeps: list[float] = []
    monkeypatch.setattr(d7crm_analysis.time, "sleep", sleeps.append)

    with pytest.raises(SystemExit):
        d7crm_analysis._request_with_retry(
            session,
            "https://example.test/devices",
            {"tagKey": "tag", "offset": 0, "limit": 100},
        )

    assert session.calls == 1
    assert sleeps == []
