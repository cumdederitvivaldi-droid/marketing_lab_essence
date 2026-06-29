import importlib
import importlib.util
import os
import sys
import tempfile
import types
import unittest
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch


APP_DIR = Path(__file__).resolve().parent
CONFIG_PATH = APP_DIR / "config.py"


def _load_config_with_env(env: dict[str, str]):
    module_name = f"config_test_{uuid.uuid4().hex}"
    spec = importlib.util.spec_from_file_location(module_name, CONFIG_PATH)
    module = importlib.util.module_from_spec(spec)
    with patch.dict(os.environ, env, clear=True):
        assert spec.loader is not None
        spec.loader.exec_module(module)
    return module


class TestGoogleCredentialResolution(unittest.TestCase):
    def test_expand_home_in_google_sheets_key_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            home = Path(tmpdir)
            key_path = home / ".config" / "gcloud" / "sheets-service-account.json"
            key_path.parent.mkdir(parents=True)
            key_path.write_text("{}", encoding="utf-8")

            credentials_cls = MagicMock()
            expected = object()
            credentials_cls.from_service_account_file.return_value = expected

            google = types.ModuleType("google")
            oauth2 = types.ModuleType("google.oauth2")
            service_account = types.ModuleType("google.oauth2.service_account")
            service_account.Credentials = credentials_cls
            oauth2.service_account = service_account
            google.oauth2 = oauth2

            with patch.dict(
                sys.modules,
                {
                    "google": google,
                    "google.oauth2": oauth2,
                    "google.oauth2.service_account": service_account,
                },
            ):
                config = _load_config_with_env(
                    {
                        "HOME": str(home),
                        "GOOGLE_SHEETS_KEY_FILE": "$HOME/.config/gcloud/sheets-service-account.json",
                    }
                )
                with patch.dict(os.environ, {"HOME": str(home)}, clear=False):
                    creds = config.get_google_service_account_credentials(["scope-a"])

            self.assertIs(creds, expected)
            credentials_cls.from_service_account_file.assert_called_once_with(
                str(key_path),
                scopes=["scope-a"],
            )

    def test_google_service_account_json_takes_priority(self):
        credentials_cls = MagicMock()
        expected = object()
        credentials_cls.from_service_account_info.return_value = expected

        google = types.ModuleType("google")
        oauth2 = types.ModuleType("google.oauth2")
        service_account = types.ModuleType("google.oauth2.service_account")
        service_account.Credentials = credentials_cls
        oauth2.service_account = service_account
        google.oauth2 = oauth2

        with patch.dict(
            sys.modules,
            {
                "google": google,
                "google.oauth2": oauth2,
                "google.oauth2.service_account": service_account,
            },
        ):
            config = _load_config_with_env(
                {
                    "GOOGLE_SERVICE_ACCOUNT_JSON": '{"client_email":"test@covering.app","private_key":"abc","token_uri":"https://oauth2.googleapis.com/token"}',
                    "GOOGLE_SHEETS_KEY_FILE": "/does/not/matter.json",
                }
            )
            creds = config.get_google_service_account_credentials(["scope-b"])

        self.assertIs(creds, expected)
        credentials_cls.from_service_account_info.assert_called_once()


class TestRunOnceBlocking(unittest.TestCase):
    def _make_mock_modules(self):
        mock_sheets = MagicMock()
        mock_sheets.ensure_headers.side_effect = RuntimeError("403 PERMISSION_DENIED")
        mock_sheets.COL_CHAT_ID = 2
        mock_sheets.COL_SENT = 8
        mock_modules = {
            "config": MagicMock(LOG_DIR="/tmp"),
            "channeltalk": MagicMock(),
            "sheets": mock_sheets,
            "backoffice": MagicMock(),
            "backoffice_auth": MagicMock(),
            "order_lookup": MagicMock(),
            "slack_notify": MagicMock(),
            "security": MagicMock(),
        }
        from enum import Enum

        class SendResult(Enum):
            SUCCESS = "success"
            AUTH_ERROR = "auth_error"
            FAILED = "failed"

        mock_modules["channeltalk"].SendResult = SendResult
        return mock_modules

    def test_step1_failure_stops_remaining_steps(self):
        mock_modules = self._make_mock_modules()
        with patch.dict(sys.modules, mock_modules):
            import monitor as m

            importlib.reload(m)
            with patch.object(m, "step2_extract_and_save", side_effect=AssertionError("step2 should not run")), \
                 patch.object(m, "step2_5_resolve_order_ids", side_effect=AssertionError("step2.5 should not run")), \
                 patch.object(m, "step3_check_dispatch", side_effect=AssertionError("step3 should not run")), \
                 patch.object(m, "step4_send_messages", side_effect=AssertionError("step4 should not run")):
                result = m.run_once(dry_run=False)

        self.assertFalse(result)
        mock_modules["slack_notify"].send_error_log.assert_called_once()
        mock_modules["slack_notify"].send_summary.assert_not_called()
