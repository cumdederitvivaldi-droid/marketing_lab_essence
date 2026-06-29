import sys
import pytest
from unittest.mock import MagicMock, patch


def _get_slack_client():
    mock_config = MagicMock()
    mock_config.SLACK_BOT_TOKEN = "xoxb-test"
    mock_config.SLACK_CHANNEL = "C0ABHQGEDU1"
    sys.modules.pop("slack_client", None)
    with patch.dict("sys.modules", {"config": mock_config}):
        import slack_client
        return slack_client


def test_no_riders_sends_success_message():
    sc = _get_slack_client()
    with patch.object(sc, "_post") as mock_post:
        sc.send_alert([])
        mock_post.assert_called_once()
        msg = mock_post.call_args[0][0]
        assert "✅" in msg
        assert "모든 기사님이 1건 이상 수거를 완료했습니다" in msg


def test_riders_sends_alert_message():
    sc = _get_slack_client()
    riders = [
        {"rider_name": "홍길동", "assigned_count": "3"},
        {"rider_name": "김영희", "assigned_count": "2"},
    ]
    with patch.object(sc, "_post") as mock_post:
        sc.send_alert(riders)
        mock_post.assert_called_once()
        msg = mock_post.call_args[0][0]
        assert "🚨" in msg
        assert "2명" in msg
        assert "홍길동" in msg
        assert "배차 3건" in msg
        assert "김영희" in msg
        assert "배차 2건" in msg


def test_missing_rider_name_falls_back_to_default():
    sc = _get_slack_client()
    riders = [{"assigned_count": "5"}]
    with patch.object(sc, "_post") as mock_post:
        sc.send_alert(riders)
        msg = mock_post.call_args[0][0]
        assert "이름없음" in msg


def test_none_rider_name_falls_back_to_default():
    sc = _get_slack_client()
    riders = [{"rider_name": None, "assigned_count": "3"}]
    with patch.object(sc, "_post") as mock_post:
        sc.send_alert(riders)
        msg = mock_post.call_args[0][0]
        assert "이름없음" in msg
        assert "None" not in msg


def test_none_assigned_count_falls_back_to_question_mark():
    sc = _get_slack_client()
    riders = [{"rider_name": "홍길동", "assigned_count": None}]
    with patch.object(sc, "_post") as mock_post:
        sc.send_alert(riders)
        msg = mock_post.call_args[0][0]
        assert "배차 ?건" in msg
        assert "None" not in msg
