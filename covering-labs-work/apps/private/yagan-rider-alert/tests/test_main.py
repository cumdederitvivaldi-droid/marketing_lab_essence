import sys
import pytest
from unittest.mock import MagicMock


def _run_main(token="xoxb-test", riders=None, bq_side_effect=None):
    mock_config = MagicMock()
    mock_config.SLACK_BOT_TOKEN = token

    mock_bq = MagicMock()
    if bq_side_effect:
        mock_bq.fetch_riders_without_completion.side_effect = bq_side_effect
    else:
        mock_bq.fetch_riders_without_completion.return_value = riders or []

    mock_slack = MagicMock()

    sys.modules.pop("main", None)
    with __import__("unittest.mock", fromlist=["patch"]).patch.dict(
        "sys.modules",
        {"config": mock_config, "bq_client": mock_bq, "slack_client": mock_slack},
    ):
        import main
        main.main()

    return mock_slack


def test_missing_token_raises_runtime_error():
    with pytest.raises(RuntimeError, match="SLACK_BOT_TOKEN"):
        _run_main(token="")


def test_zero_riders_calls_send_alert_with_empty_list():
    mock_slack = _run_main(riders=[])
    mock_slack.send_alert.assert_called_once_with([])


def test_nonzero_riders_calls_send_alert_with_list():
    riders = [
        {"rider_name": "홍길동", "assigned_count": "3"},
        {"rider_name": "김영희", "assigned_count": "2"},
    ]
    mock_slack = _run_main(riders=riders)
    mock_slack.send_alert.assert_called_once_with(riders)


def test_bq_exception_propagates():
    with pytest.raises(RuntimeError, match="BQ 조회 실패"):
        _run_main(bq_side_effect=RuntimeError("BQ 조회 실패"))
