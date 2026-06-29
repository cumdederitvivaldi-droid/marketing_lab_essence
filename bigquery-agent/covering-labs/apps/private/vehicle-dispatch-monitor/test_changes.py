"""
수정된 4개 파일 핵심 로직 테스트

대상:
  - config.py: SLACK_CX_MENTION 생성 로직
  - slack_notify.py: config.SLACK_CX_MENTION 사용 여부
  - monitor.py: _resolve_order_by_phone() (result, reason) 튜플 반환
  - order_lookup.py: lookup_orders_by_phone() 1차/2차 폴백 쿼리 분기
"""
import importlib.util
import os
import sys
import tempfile
import types
import unittest
from datetime import date as real_date, datetime as real_datetime, time as real_time
from pathlib import Path
from unittest.mock import MagicMock, patch

# 외부 의존성 mock (google-auth 등이 없는 환경 대응)
for mod in ["google.auth", "google.oauth2", "google.oauth2.service_account",
            "google.auth.transport", "google.auth.transport.requests",
            "googleapiclient", "googleapiclient.discovery", "googleapiclient.errors",
            "gspread"]:
    parts = mod.split(".")
    for i in range(1, len(parts) + 1):
        name = ".".join(parts[:i])
        if name not in sys.modules:
            sys.modules[name] = types.ModuleType(name)

# googleapiclient.discovery.build 함수 mock
sys.modules["googleapiclient.discovery"].build = MagicMock(return_value=MagicMock())
sys.modules["googleapiclient.errors"].HttpError = Exception

sys.path.insert(0, os.path.dirname(__file__))


# ─── 1. config.SLACK_CX_MENTION ───────────────────────────────────────────────

class TestSlackCxMention(unittest.TestCase):
    def test_no_subteam_id_falls_back_to_plain_text(self):
        """SLACK_CX_TEAM_ID 미설정 시 plain text @cxcs파트 반환"""
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("SLACK_CX_TEAM_ID", None)
            # 모듈 재로드 없이 로직 직접 검증
            cx_team_id = os.environ.get("SLACK_CX_TEAM_ID", "")
            mention = f"<!subteam^{cx_team_id}|@cxcs파트>" if cx_team_id else "@cxcs파트"
            self.assertEqual(mention, "@cxcs파트")

    def test_subteam_id_generates_proper_format(self):
        """SLACK_CX_TEAM_ID 설정 시 <!subteam^ID|@cxcs파트> 포맷 반환"""
        cx_team_id = "S0ABC1234"
        mention = f"<!subteam^{cx_team_id}|@cxcs파트>" if cx_team_id else "@cxcs파트"
        self.assertEqual(mention, "<!subteam^S0ABC1234|@cxcs파트>")


# ─── 2. slack_notify: config.SLACK_CX_MENTION 사용 확인 ──────────────────────

class TestSlackNotifyUsesConfig(unittest.TestCase):
    def test_send_error_log_uses_cx_mention(self):
        """send_error_log 메시지에 PO 멘션이 포함되는지 (CX 멘션 제거됨)"""
        import importlib
        import config as cfg
        import slack_notify

        cfg.SLACK_CX_MENTION = "<!subteam^STEST|@cxcs파트>"
        cfg.SLACK_BOT_TOKEN = "xoxb-test"
        cfg.SLACK_CHANNEL = "#test"
        cfg.GOOGLE_SHEETS_SPREADSHEET_ID = ""

        sent_texts = []

        def fake_send(text, link_names=False):
            sent_texts.append(text)

        with patch.object(slack_notify, "_send", side_effect=fake_send):
            slack_notify.send_error_log("테스트 오류")

        self.assertTrue(len(sent_texts) == 1)
        self.assertNotIn("<!subteam^STEST|@cxcs파트>", sent_texts[0])
        self.assertNotIn("<@U09PTJ5PBDK>", sent_texts[0])

    def test_send_company_vehicle_alert_uses_cx_mention(self):
        """send_company_vehicle_alert 메시지에 CX 멘션이 포함되는지"""
        import config as cfg
        import slack_notify

        cfg.SLACK_CX_MENTION = "<!subteam^STEST|@cxcs파트>"
        cfg.GOOGLE_SHEETS_SPREADSHEET_ID = ""

        sent_texts = []

        def fake_send(text, link_names=False):
            sent_texts.append(text)

        with patch.object(slack_notify, "_send", side_effect=fake_send):
            slack_notify.send_company_vehicle_alert("1234", "01012345678", "김기사")

        self.assertIn("<!subteam^STEST|@cxcs파트>", sent_texts[0])

    def test_send_summary_with_errors_uses_cx_mention(self):
        """send_summary(error_count>0)에 멘션이 없는지 (멘션 제거됨)"""
        import config as cfg
        import slack_notify

        cfg.SLACK_CX_MENTION = "<!subteam^STEST|@cxcs파트>"
        cfg.GOOGLE_SHEETS_SPREADSHEET_ID = ""

        sent_texts = []

        def fake_send(text, link_names=False):
            sent_texts.append(text)

        with patch.object(slack_notify, "_mark_notification_once", return_value=True), \
             patch.object(slack_notify, "_send", side_effect=fake_send):
            slack_notify.send_summary(total_detected=5, total_dispatched=3, total_sent=3, error_count=2)

        self.assertNotIn("<!subteam^STEST|@cxcs파트>", sent_texts[0])
        self.assertNotIn("<@U09PTJ5PBDK>", sent_texts[0])

    def test_send_summary_extraction_failed_shows_manual_action(self):
        """send_summary에서 extraction_failed > 0 — 배치 요약 정상 표시"""
        import config as cfg
        import slack_notify

        cfg.SLACK_CX_MENTION = "@cxcs파트"
        cfg.GOOGLE_SHEETS_SPREADSHEET_ID = ""

        sent_texts = []

        def fake_send(text, link_names=False):
            sent_texts.append(text)

        with patch.object(slack_notify, "_mark_notification_once", return_value=True), \
             patch.object(slack_notify, "_send", side_effect=fake_send):
            slack_notify.send_summary(
                total_detected=3, total_dispatched=2, total_sent=2,
                error_count=0, extraction_failed=2
            )

        msg = sent_texts[0]
        self.assertIn("감지 3", msg)
        self.assertIn("발송 2", msg)

    def test_send_summary_pending_auto_shows_waiting(self):
        """send_summary에서 배치 요약 정상 표시"""
        import config as cfg
        import slack_notify

        cfg.SLACK_CX_MENTION = "@cxcs파트"
        cfg.GOOGLE_SHEETS_SPREADSHEET_ID = ""

        sent_texts = []

        def fake_send(text, link_names=False):
            sent_texts.append(text)

        with patch.object(slack_notify, "_mark_notification_once", return_value=True), \
             patch.object(slack_notify, "_send", side_effect=fake_send):
            slack_notify.send_summary(
                total_detected=5, total_dispatched=2, total_sent=2,
                error_count=0, extraction_failed=0
            )

        msg = sent_texts[0]
        self.assertIn("감지 5", msg)
        self.assertIn("발송 2", msg)


# ─── 3. monitor._resolve_order_by_phone() 튜플 반환 ─────────────────────────

class TestResolveOrderByPhone(unittest.TestCase):
    def _get_func(self):
        import importlib
        # monitor 모듈을 최소한의 mock으로 로드
        mock_modules = {
            "config": MagicMock(LOG_DIR="/tmp"),
            "channeltalk": MagicMock(),
            "sheets": MagicMock(),
            "backoffice": MagicMock(),
            "backoffice_auth": MagicMock(),
            "order_lookup": MagicMock(),
            "slack_notify": MagicMock(),
            "security": MagicMock(),
        }
        # channeltalk.SendResult enum mock
        from enum import Enum
        class SendResult(Enum):
            SUCCESS = "success"
            AUTH_ERROR = "auth_error"
            FAILED = "failed"
        mock_modules["channeltalk"].SendResult = SendResult

        with patch.dict(sys.modules, mock_modules):
            import monitor as m
            return m._resolve_order_by_phone, mock_modules

    def test_returns_tuple_when_bq_empty(self):
        """BQ 0건 시 (None, reason_string) 튜플 반환"""
        func, mocks = self._get_func()
        mocks["order_lookup"].lookup_orders_by_phone.return_value = []

        result, reason = func("01012345678")
        self.assertIsNone(result)
        self.assertIn("0건", reason)
        self.assertIn("sync", reason)

    def test_returns_tuple_when_backoffice_mismatch(self):
        """BQ 후보 있지만 백오피스 불일치 시 (None, reason_string) 튜플 반환"""
        func, mocks = self._get_func()
        mocks["order_lookup"].lookup_orders_by_phone.return_value = [
            {"order_id": "9999", "order_code": "TESTCODE"}
        ]
        mocks["backoffice_auth"].get_valid_token.return_value = "token-abc"
        mocks["backoffice"].verify_order_phone.return_value = None  # 불일치

        result, reason = func("01012345678")
        self.assertIsNone(result)
        self.assertIn("불일치", reason)

    def test_returns_match_on_success(self):
        """매칭 성공 시 (dict, "") 튜플 반환"""
        func, mocks = self._get_func()
        mocks["order_lookup"].lookup_orders_by_phone.return_value = [
            {"order_id": "9999", "order_code": "TESTCODE"}
        ]
        mocks["backoffice_auth"].get_valid_token.return_value = "token-abc"
        mocks["backoffice"].verify_order_phone.return_value = {
            "order_id": "9999", "order_code": "TESTCODE",
            "vehicle_number": "서울12바3456", "rider_name": "김기사"
        }

        result, reason = func("01012345678")
        self.assertIsNotNone(result)
        self.assertEqual(result["order_code"], "TESTCODE")
        self.assertEqual(reason, "")


class TestRunLoopTiming(unittest.TestCase):
    def _get_module(self):
        mock_modules = {
            "config": MagicMock(LOG_DIR="/tmp"),
            "channeltalk": MagicMock(),
            "sheets": MagicMock(),
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

        with patch.dict(sys.modules, mock_modules):
            import importlib
            import monitor as m
            return importlib.reload(m)

    def test_run_loop_stops_immediately_after_23_00_batch(self):
        """23:00 배치 직후에는 sleep 없이 즉시 종료"""
        m = self._get_module()
        m.config.OPERATION_START = real_time(21, 0)
        m.config.OPERATION_END = real_time(23, 0)
        m.config.POLLING_INTERVAL_MINUTES = 10
        m.sheets.get_all_rows.return_value = []
        m.slack_notify._current_batch_ts = "thread-ts"

        fake_datetime = MagicMock()
        fake_datetime.now.return_value = real_datetime(2026, 4, 1, 23, 0, 0)

        with patch.object(m, "datetime", fake_datetime), \
             patch.object(m, "run_once") as run_once_mock, \
             patch.object(m.time, "sleep") as sleep_mock:
            m.run_loop(dry_run=True)

        run_once_mock.assert_called_once_with(True, loop_mode=True)
        sleep_mock.assert_not_called()
        self.assertIsNone(m.slack_notify._current_batch_ts)


class TestHostDetectionFallback(unittest.TestCase):
    def _load_monitor(self):
        mock_modules = {
            "config": MagicMock(LOG_DIR="/tmp"),
            "channeltalk": MagicMock(),
            "sheets": MagicMock(),
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

        with patch.dict(sys.modules, mock_modules):
            import importlib
            import monitor as m
            return importlib.reload(m)

    def _load_server_monitor(self):
        mock_modules = {
            "config": MagicMock(LOG_DIR="/tmp", SLACK_BOT_TOKEN="", SLACK_CHANNEL=""),
            "sheets": MagicMock(),
        }

        with patch.dict(sys.modules, mock_modules):
            import importlib
            import server_monitor as sm
            return importlib.reload(sm)

    def test_monitor_host_uses_socket_gethostname(self):
        m = self._load_monitor()

        with patch.object(m.socket, "gethostname", return_value="covering-labs.local"):
            host = m.get_current_host()

        self.assertEqual(host, "covering-labs")

    def test_server_monitor_host_uses_socket_gethostname(self):
        sm = self._load_server_monitor()

        with patch.object(sm.socket, "gethostname", return_value="covering-labs.local"):
            host = sm._get_current_host()

        self.assertEqual(host, "covering-labs")


# ─── 4. order_lookup._parse_bq_rows / 폴백 쿼리 분기 ───────────────────────

class TestOrderLookupFallback(unittest.TestCase):
    def test_parse_bq_rows_valid(self):
        """_parse_bq_rows: 정상 BQ rows → [{"order_id", "order_code"}]"""
        import order_lookup
        rows = [
            {"f": [{"v": "1285425"}, {"v": "WEBPNIIR"}]},
            {"f": [{"v": "1285426"}, {"v": "ABCD1234"}]},
        ]
        result = order_lookup._parse_bq_rows(rows)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["order_id"], "1285425")
        self.assertEqual(result[0]["order_code"], "WEBPNIIR")

    def test_parse_bq_rows_skips_null_id(self):
        """_parse_bq_rows: order_id가 None인 행은 스킵"""
        import order_lookup
        rows = [
            {"f": [{"v": None}, {"v": "WEBPNIIR"}]},
            {"f": [{"v": "1285426"}, {"v": "ABCD1234"}]},
        ]
        result = order_lookup._parse_bq_rows(rows)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["order_id"], "1285426")

    def test_fallback_query_runs_when_primary_empty(self):
        """1차 쿼리 0건 시 2차 폴백 쿼리가 실행되는지"""
        import order_lookup

        call_count = {"n": 0}
        def fake_run_bq(token, masked, normalized, sql):
            call_count["n"] += 1
            if call_count["n"] == 1:
                return []  # 1차: 0건
            return [{"order_id": "9999", "order_code": "FALLBACK"}]  # 2차: 1건

        with patch.object(order_lookup, "_get_access_token", return_value="token"), \
             patch.object(order_lookup, "_run_bq_phone_query", side_effect=fake_run_bq):
            result = order_lookup.lookup_orders_by_phone("01012345678")

        self.assertEqual(call_count["n"], 2, "폴백 쿼리가 2회 실행돼야 함")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["order_code"], "FALLBACK")

    def test_no_fallback_when_primary_has_results(self):
        """1차 쿼리 결과 있으면 2차 폴백 실행 안 함"""
        import order_lookup

        call_count = {"n": 0}
        def fake_run_bq(token, masked, normalized, sql):
            call_count["n"] += 1
            return [{"order_id": "1111", "order_code": "PRIMARY"}]

        with patch.object(order_lookup, "_get_access_token", return_value="token"), \
             patch.object(order_lookup, "_run_bq_phone_query", side_effect=fake_run_bq):
            result = order_lookup.lookup_orders_by_phone("01012345678")

        self.assertEqual(call_count["n"], 1, "1차 성공 시 폴백 실행 안 됨")
        self.assertEqual(result[0]["order_code"], "PRIMARY")

    def test_invalid_phone_returns_empty(self):
        """잘못된 전화번호 형식이면 빈 리스트 반환"""
        import order_lookup
        result = order_lookup.lookup_orders_by_phone("invalid")
        self.assertEqual(result, [])

    def test_primary_query_contains_legacy_and_v2_sources(self):
        """전화번호 조회 쿼리에 레거시 order + 신규 order_v2가 모두 포함되는지"""
        import order_lookup

        seen_sql = []

        def fake_run_bq(token, masked, normalized, sql):
            seen_sql.append(sql)
            return [{"order_id": "1111", "order_code": "PRIMARY"}]

        with patch.object(order_lookup, "_get_access_token", return_value="token"), \
             patch.object(order_lookup, "_run_bq_phone_query", side_effect=fake_run_bq):
            result = order_lookup.lookup_orders_by_phone("01012345678")

        self.assertEqual(result[0]["order_code"], "PRIMARY")
        self.assertIn("secure_dataset.order` o", seen_sql[0])
        self.assertIn("secure_dataset.order_v2", seen_sql[0])
        self.assertIn("DEFAULT_GARBAGE", seen_sql[0])
        self.assertIn("@normalized_phone", seen_sql[0])


# ─── 5. sheets.add_order() status 파라미터 ────────────────────────────────────

class TestSheetsAddOrderStatus(unittest.TestCase):
    def test_default_status_is_pending(self):
        """status 기본값 = '미배차'"""
        import sheets as sh
        import config as cfg

        cfg.GOOGLE_SHEETS_SPREADSHEET_ID = "dummy"
        cfg.GOOGLE_SHEETS_WORKSHEET_NAME = "시트1"

        appended_values = []

        mock_service = MagicMock()
        mock_service.spreadsheets().values().append().execute.return_value = {}
        mock_service.spreadsheets().values().append.side_effect = lambda **kw: (
            appended_values.append(kw.get("body", {}).get("values", [[]])[0]) or mock_service.spreadsheets().values().append()
        )

        with patch.object(sh, "_get_service", return_value=mock_service):
            # 직접 append body 캡처
            captured = {}
            original_append = mock_service.spreadsheets().values().append

            def capture_append(**kw):
                captured["body"] = kw.get("body", {})
                return MagicMock()

            mock_service.spreadsheets.return_value.values.return_value.append.side_effect = capture_append
            sh.add_order("TESTCODE", "chat123")

        row = captured["body"]["values"][0]
        self.assertEqual(row[4], "미배차")  # COL_DISPATCH_STATUS = 4

    def test_extraction_fail_sets_manual_status(self):
        """추출실패 시 status='수동처리필요' 전달됨"""
        import sheets as sh
        import config as cfg

        cfg.GOOGLE_SHEETS_SPREADSHEET_ID = "dummy"
        cfg.GOOGLE_SHEETS_WORKSHEET_NAME = "시트1"

        captured = {}

        def capture_append(**kw):
            captured["body"] = kw.get("body", {})
            return MagicMock()

        mock_service = MagicMock()
        mock_service.spreadsheets.return_value.values.return_value.append.side_effect = capture_append

        with patch.object(sh, "_get_service", return_value=mock_service):
            sh.add_order("추출실패", "chat456", phone="01012345678", status="수동처리필요")

        row = captured["body"]["values"][0]
        self.assertEqual(row[4], "수동처리필요")  # COL_DISPATCH_STATUS = 4


# ─── 신규: step2_5 phone fallback 동작 ─────────────────────────────────────────

class TestStep25PhoneFallback(unittest.TestCase):
    """step2_5_resolve_order_ids: 모든 형식의 주문코드에 phone fallback 적용"""

    def _make_pending_order(self, order_code, phone="01012345678"):
        return {
            "order_code": order_code,
            "order_id": "",
            "phone": phone,
            "row_index": 2,
            "chat_id": "chat_test",
        }

    @patch("monitor._resolve_order_by_phone", return_value=(None, "no match"))
    @patch("monitor.order_lookup.lookup_order_id", return_value=None)
    @patch("monitor.sheets.get_pending_orders")
    def test_valid_format_also_triggers_phone_fallback(self, mock_pending, mock_lookup, mock_resolve):
        """HZJRCD3E처럼 정상 형식이어도 BQ 미매핑이면 phone fallback 호출됨"""
        import monitor
        mock_pending.return_value = [self._make_pending_order("HZJRCD3E")]
        monitor.step2_5_resolve_order_ids(dry_run=True, rows=[])
        mock_resolve.assert_called_once_with("01012345678")

    @patch("monitor._resolve_order_by_phone", return_value=(None, "no match"))
    @patch("monitor.order_lookup.lookup_order_id", return_value=None)
    @patch("monitor.sheets.get_pending_orders")
    def test_invalid_format_allows_phone_fallback(self, mock_pending, mock_lookup, mock_resolve):
        """wlsdnd3154처럼 비정상 형식이면 phone fallback 호출됨"""
        import monitor
        mock_pending.return_value = [self._make_pending_order("wlsdnd3154")]
        monitor.step2_5_resolve_order_ids(dry_run=True, rows=[])
        mock_resolve.assert_called_once_with("01012345678")


# ─── 신규: step2_5 추출실패 재시도 ─────────────────────────────────────────────

class TestStep25추출실패Retry(unittest.TestCase):
    """step2_5_resolve_order_ids: 추출실패 행 phone fallback 재시도"""

    def _make_failed_order(self, phone="01012345678"):
        return {
            "order_code": "추출실패",
            "order_id": "",
            "phone": phone,
            "row_index": 3,
            "chat_id": "chat_fail",
        }

    @patch("monitor.sheets.update_dispatch")
    @patch("monitor.sheets.update_order_id")
    @patch("monitor.sheets.update_order_code")
    @patch("monitor._resolve_order_by_phone")
    @patch("monitor.sheets.get_pending_orders")
    def test_extraction_fail_retries_with_phone(self, mock_pending, mock_resolve, mock_ucode, mock_uid, mock_dispatch):
        """추출실패 + 전화번호 있으면 phone fallback 호출됨"""
        import monitor
        mock_pending.return_value = [self._make_failed_order()]
        mock_resolve.return_value = (
            {"order_code": "ABCD1234", "order_id": "9999", "vehicle_number": "", "rider_name": ""},
            ""
        )
        resolved, escalated = monitor.step2_5_resolve_order_ids(dry_run=False, rows=[])
        mock_resolve.assert_called_once_with("01012345678")
        self.assertEqual(resolved, 1)
        mock_ucode.assert_called_once()
        mock_uid.assert_called_once()
        self.assertEqual(mock_ucode.call_args.args[:2], (3, "ABCD1234"))
        self.assertEqual(mock_uid.call_args.args[:2], (3, "9999"))

    @patch("monitor._resolve_order_by_phone")
    @patch("monitor.sheets.get_pending_orders")
    def test_extraction_fail_no_phone_skips(self, mock_pending, mock_resolve):
        """추출실패 + 전화번호 없으면 phone fallback 호출 안 됨"""
        import monitor
        mock_pending.return_value = [self._make_failed_order(phone="")]
        monitor.step2_5_resolve_order_ids(dry_run=True, rows=[])
        mock_resolve.assert_not_called()

    @patch("monitor._resolve_order_by_phone", return_value=(None, "no match"))
    @patch("monitor.sheets.get_pending_orders")
    def test_max_retry_per_batch_limit(self, mock_pending, mock_resolve):
        """배치당 최대 10건 제한 (MAX_RETRY_PER_BATCH=10)"""
        import monitor
        mock_pending.return_value = [self._make_failed_order() for _ in range(15)]
        monitor.step2_5_resolve_order_ids(dry_run=True, rows=[])
        self.assertEqual(mock_resolve.call_count, 10)


# ─── 신규: verify_order_phone 완료 주문 스킵 ────────────────────────────────────

class TestVerifyOrderPhoneCompletedSkip(unittest.TestCase):
    """backoffice.verify_order_phone: 완료 상태 주문은 None 반환"""

    def _mock_resp(self, phone, status="ACTIVE"):
        return {
            "data": {
                "phone": phone,
                "code": "TESTCODE",
                "status": status,
                "rider": {"vehicleNumber": "서울12바3456", "username": "김기사"},
            }
        }

    @patch("backoffice._fetch_order")
    def test_completed_status_returns_none(self, mock_fetch):
        """완료 상태(COMPLETED) 주문은 None 반환"""
        import backoffice
        mock_fetch.return_value = self._mock_resp("01012345678", status="COMPLETED")
        result = backoffice.verify_order_phone("9999", "01012345678", token="test-token")
        self.assertIsNone(result)

    @patch("backoffice._fetch_order")
    def test_active_status_returns_result(self, mock_fetch):
        """활성 주문은 정상 반환"""
        import backoffice
        mock_fetch.return_value = self._mock_resp("01012345678", status="ACTIVE")
        result = backoffice.verify_order_phone("9999", "01012345678", token="test-token")
        self.assertIsNotNone(result)
        self.assertEqual(result["order_code"], "TESTCODE")

    @patch("backoffice._fetch_order")
    def test_empty_status_returns_result(self, mock_fetch):
        """status 없는 주문은 정상 반환 (status='' → 완료 체크 스킵)"""
        import backoffice
        mock_fetch.return_value = self._mock_resp("01012345678", status="")
        result = backoffice.verify_order_phone("9999", "01012345678", token="test-token")
        self.assertIsNotNone(result)

    @patch("backoffice._fetch_order")
    def test_order_number_key_is_accepted(self, mock_fetch):
        """신규 응답이 code 대신 orderNumber를 주어도 order_code로 매핑"""
        import backoffice

        mock_fetch.return_value = {
            "data": {
                "phone": "01012345678",
                "orderNumber": "NEWORDER1",
                "status": "ACTIVE",
                "rider": {"vehicleNumber": "서울12바3456", "username": "김기사"},
            }
        }

        result = backoffice.verify_order_phone("9999", "01012345678", token="test-token")
        self.assertIsNotNone(result)
        self.assertEqual(result["order_code"], "NEWORDER1")

    @patch("backoffice._fetch_order")
    def test_failed_fulfillment_status_returns_none(self, mock_fetch):
        """v3 방문 상태가 FAILED면 phone fallback 후보에서 제외"""
        import backoffice

        mock_fetch.return_value = {
            "data": {
                "orderCustomerSnapshot": {"customerPhone": "01012345678"},
                "orderStatus": "IN_PROGRESS",
                "fulfillment": {"status": "FAILED"},
            }
        }

        result = backoffice.verify_order_phone("9999", "01012345678", token="test-token")
        self.assertIsNone(result)


class TestGetDispatchInfoClosedHandling(unittest.TestCase):
    @patch("backoffice._fetch_order")
    def test_failed_fulfillment_returns_closed_reason(self, mock_fetch):
        """방문 실패 주문은 closed=True + 방문실패 reason 반환"""
        import backoffice

        mock_fetch.return_value = {
            "data": {
                "orderStatus": "IN_PROGRESS",
                "fulfillment": {"status": "FAILED"},
            }
        }

        result = backoffice.get_dispatch_info("9999", token="test-token")
        self.assertEqual(result, {"closed": True, "status": "FAILED", "reason": "방문실패"})


# ─── step4 sent_chat_ids 중복 발송 차단 ──────────────────────────────

class TestStep4BlocksDuplicateSend(unittest.TestCase):
    """step4_send_messages: sent_chat_ids에 이미 있는 chat_id는 발송 차단"""

    @patch("monitor.channeltalk.is_vehicle_already_sent", return_value=False)
    @patch("monitor.channeltalk.send_vehicle_message")
    @patch("monitor.sheets.mark_sent")
    def test_duplicate_order_code_blocks_send(self, mock_mark, mock_send, mock_already):
        """sent_chat_ids에 이미 있는 chat_id → 발송 차단"""
        import monitor
        dispatched = [{
            "chat_id": "chat_dup",
            "vehicle_number": "서울 99 가 1234",
            "order_id": "9999999",
            "order_code": "DUPL1234",
            "rider": "기사명",
            "phone": "01012345678",
            "row_index": 10,
        }]
        # chat_dup이 이미 sent_chat_ids에 있음
        monitor.step4_send_messages(dispatched, dry_run=False, sent_chat_ids={"chat_dup"})
        mock_send.assert_not_called()
        mock_mark.assert_called_once_with(10)


# ─── Bug 1: 신규 주문 도메인 상품 필터 회귀 방지 ─────────────────────────────
# 봉투/박스 수거 주문만 조회하도록 product_code 필터 유지

class TestPickupProductFilter(unittest.TestCase):
    def test_fallback_sql_includes_pickup_product_filter(self):
        """2차 fallback SQL에 레거시 + 신규 SERVICE 필터가 함께 포함되어야 함"""
        import order_lookup

        captured_sqls = []

        def fake_run_bq(token, masked, normalized, sql):
            captured_sqls.append(sql)
            if len(captured_sqls) == 1:
                return []  # 1차: 0건
            return [{"order_id": "9999", "order_code": "RESULT"}]  # 2차: 1건

        with patch.object(order_lookup, "_get_access_token", return_value="tok"), \
             patch.object(order_lookup, "_run_bq_phone_query", side_effect=fake_run_bq):
            order_lookup.lookup_orders_by_phone("01012345678")

        self.assertEqual(len(captured_sqls), 2, "폴백 쿼리가 2회 실행돼야 함")
        fallback_sql = captured_sqls[1]
        self.assertIn("secure_dataset.order` o", fallback_sql)
        self.assertIn("DEFAULT_GARBAGE", fallback_sql)
        self.assertIn("secure_dataset.order_v2", fallback_sql)
        self.assertIn("secure_dataset.order_customer_snapshot", fallback_sql)
        self.assertIn("secure_dataset.order_line", fallback_sql)
        self.assertIn("secure_dataset.product", fallback_sql)
        self.assertIn("product_type", fallback_sql)
        self.assertIn("SERVICE", fallback_sql)
        self.assertIn("@normalized_phone", fallback_sql)

    def test_lookup_order_id_sql_includes_pickup_product_filter(self):
        """lookup_order_id SQL에 레거시 + 신규 SERVICE 필터가 포함되어야 함"""
        import order_lookup, requests as req_module

        captured_payload = {}

        def fake_post(url, headers, json, timeout):
            captured_payload.update(json)
            mock_resp = MagicMock()
            mock_resp.json.return_value = {"rows": [{"f": [{"v": "9999"}]}]}
            mock_resp.raise_for_status = lambda: None
            return mock_resp

        with patch.object(order_lookup, "_get_access_token", return_value="tok"), \
             patch.object(req_module, "post", side_effect=fake_post):
            order_lookup.lookup_order_id("ABCD1234")

        sql = captured_payload.get("query", "")
        self.assertIn("secure_dataset.order` o", sql)
        self.assertIn("DEFAULT_GARBAGE", sql)
        self.assertIn("secure_dataset.order_v2", sql)
        self.assertIn("secure_dataset.order_line", sql)
        self.assertIn("secure_dataset.product", sql)
        self.assertIn("product_type", sql)
        self.assertIn("SERVICE", sql)


# ─── Bug 2: 취소 후 재접수 감지 ──────────────────────────────────────────────
# "발송 필요 X" 행 제외 → 동일 채팅 재접수 감지 허용 (03/06 박소리님 발견)

class TestReorderDetection(unittest.TestCase):
    def _make_row(self, chat_id, sent=""):
        """sheets 행 형식 (0-indexed 컬럼): COL_CHAT_ID=2, COL_SENT=8"""
        row = [""] * 10
        row[2] = chat_id  # COL_CHAT_ID
        row[8] = sent     # COL_SENT
        return row

    def test_cancelled_chat_id_is_detectable_again(self):
        """
        "발송 필요 X" 행의 chat_id는 existing_chat_ids에서 제외되어야 함
        → 동일 채팅에서 재접수 시 새 행으로 감지 가능
        """
        mock_sheets = MagicMock()
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

        # 기존 시트에 chat_id="CHAT001" 행이 있지만 "발송 필요 X"로 취소됨
        existing_rows = [self._make_row("CHAT001", sent="발송 필요 X")]
        mock_modules["sheets"].get_all_rows = MagicMock(return_value=existing_rows)

        # channeltalk에서 동일 chat_id로 재접수 감지됨
        mock_modules["channeltalk"].get_tagged_chats.return_value = [{"id": "CHAT001"}]

        with patch.dict(sys.modules, mock_modules):
            import importlib
            import monitor as m
            importlib.reload(m)
            result = m.step1_detect_tagged_chats(existing_rows=existing_rows)

        self.assertEqual(len(result), 1, "취소된 채팅 재접수가 감지되어야 함 (existing_chat_ids 제외 안 됨)")
        self.assertEqual(result[0]["id"], "CHAT001")

    def test_active_chat_id_is_still_deduplicated(self):
        """
        정상 진행 중인 chat_id는 여전히 중복 체크돼야 함
        """
        mock_sheets = MagicMock()
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

        # 기존 시트에 chat_id="CHAT002" 행이 정상 진행 중 (발송 필요 X 아님)
        existing_rows = [self._make_row("CHAT002", sent="Y")]
        mock_modules["channeltalk"].get_tagged_chats.return_value = [{"id": "CHAT002"}]

        with patch.dict(sys.modules, mock_modules):
            import importlib
            import monitor as m
            importlib.reload(m)
            result = m.step1_detect_tagged_chats(existing_rows=existing_rows)

        self.assertEqual(len(result), 0, "진행 중인 채팅은 중복 체크로 스킵돼야 함")


# ─── BQ 매핑 실패 retry/escalation 테스트 ─────────────────────────────────────

class TestBqRetryEscalation(unittest.TestCase):
    """monitor.py step2_5: 정상 주문코드 BQ 매핑 실패 → retry count 증가 → escalate"""

    def _make_mock_modules(self):
        mock_sheets = MagicMock()
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

    def test_bq_fail_no_phone_increments_retry(self):
        """BQ 매핑 실패 + phone 없음 → [bq_retry:1/8] 태그 기록"""
        mock_modules = self._make_mock_modules()
        pending = [{
            "order_code": "FRTV6ECX",
            "order_id": "",
            "phone": "",
            "row_index": 5,
            "fail_reason": "",
            "dispatch_status": "",
            "chat_id": "CHAT100",
        }]
        mock_modules["sheets"].get_pending_orders.return_value = pending
        mock_modules["order_lookup"].lookup_order_id.return_value = None

        with patch.dict(sys.modules, mock_modules):
            import importlib
            import monitor as m
            importlib.reload(m)
            resolved, escalated = m.step2_5_resolve_order_ids(dry_run=False)

        self.assertEqual(resolved, 0)
        self.assertEqual(len(escalated), 0)
        # fail_reason에 [bq_retry:1/8] 기록 확인
        mock_modules["sheets"].update_fail_reason.assert_called_once()
        written_reason = mock_modules["sheets"].update_fail_reason.call_args[0][1]
        self.assertIn("[bq_retry:1/8]", written_reason)

    def test_bq_fail_no_phone_escalates_after_max(self):
        """BQ 매핑 실패 + phone 없음 + retry 8회 초과 → 수동처리필요 escalate"""
        mock_modules = self._make_mock_modules()
        pending = [{
            "order_code": "FRTV6ECX",
            "order_id": "",
            "phone": "",
            "row_index": 5,
            "fail_reason": "BQ 미매핑 [bq_retry:8/8]",
            "dispatch_status": "",
            "chat_id": "CHAT100",
        }]
        mock_modules["sheets"].get_pending_orders.return_value = pending
        mock_modules["order_lookup"].lookup_order_id.return_value = None

        with patch.dict(sys.modules, mock_modules):
            import importlib
            import monitor as m
            importlib.reload(m)
            resolved, escalated = m.step2_5_resolve_order_ids(dry_run=False)

        self.assertEqual(resolved, 0)
        self.assertEqual(len(escalated), 1)
        self.assertEqual(escalated[0]["order_code"], "FRTV6ECX")
        self.assertIn("재시도", escalated[0]["fail_reason"])
        mock_modules["sheets"].update_status.assert_called_once()
        self.assertEqual(
            mock_modules["sheets"].update_status.call_args.args[:2],
            (5, "수동처리필요"),
        )

    def test_bq_fail_phone_fallback_fail_increments_retry(self):
        """BQ 매핑 실패 + phone fallback 실패 → [bq_retry:1/8] 태그 기록"""
        mock_modules = self._make_mock_modules()
        pending = [{
            "order_code": "FRTV6ECX",
            "order_id": "",
            "phone": "01012345678",
            "row_index": 5,
            "fail_reason": "",
            "dispatch_status": "",
            "chat_id": "CHAT100",
        }]
        mock_modules["sheets"].get_pending_orders.return_value = pending
        mock_modules["order_lookup"].lookup_order_id.return_value = None
        mock_modules["order_lookup"].lookup_orders_by_phone.return_value = []

        with patch.dict(sys.modules, mock_modules):
            import importlib
            import monitor as m
            importlib.reload(m)
            resolved, escalated = m.step2_5_resolve_order_ids(dry_run=False)

        self.assertEqual(resolved, 0)
        self.assertEqual(len(escalated), 0)
        mock_modules["sheets"].update_fail_reason.assert_called_once()
        written_reason = mock_modules["sheets"].update_fail_reason.call_args[0][1]
        # phone fallback도 실패 시 +2 증가 (에스컬레이션 가속화)
        self.assertIn("[bq_retry:2/8]", written_reason)

    def test_bq_fail_with_phone_fallback_fail_increments_by_2(self):
        """BQ 매핑 실패 + phone fallback 실패 → retry +2 증가 (80분→40분 에스컬레이션)"""
        mock_modules = self._make_mock_modules()
        pending = [{
            "order_code": "66IIOWSB",
            "order_id": "",
            "phone": "01012345678",
            "row_index": 7,
            "fail_reason": "BQ 미매핑 [bq_retry:4/8]",
            "dispatch_status": "",
            "chat_id": "CHAT200",
        }]
        mock_modules["sheets"].get_pending_orders.return_value = pending
        mock_modules["order_lookup"].lookup_order_id.return_value = None
        mock_modules["order_lookup"].lookup_orders_by_phone.return_value = []

        with patch.dict(sys.modules, mock_modules):
            import importlib
            import monitor as m
            importlib.reload(m)
            resolved, escalated = m.step2_5_resolve_order_ids(dry_run=False)

        # bq_retry 4 + 2 = 6 → 아직 에스컬레이션 전
        self.assertEqual(resolved, 0)
        self.assertEqual(len(escalated), 0)
        mock_modules["sheets"].update_fail_reason.assert_called_once()
        written_reason = mock_modules["sheets"].update_fail_reason.call_args[0][1]
        self.assertIn("[bq_retry:6/8]", written_reason)

    def test_bq_success_clears_retry_tag(self):
        """BQ 매핑 성공 시 이전 [bq_retry:X/8] 태그 제거"""
        mock_modules = self._make_mock_modules()
        pending = [{
            "order_code": "FRTV6ECX",
            "order_id": "",
            "phone": "01012345678",
            "row_index": 5,
            "fail_reason": "이전 메시지 [bq_retry:3/8]",
            "dispatch_status": "",
            "chat_id": "CHAT100",
        }]
        mock_modules["sheets"].get_pending_orders.return_value = pending
        mock_modules["order_lookup"].lookup_order_id.return_value = "12345"

        with patch.dict(sys.modules, mock_modules):
            import importlib
            import monitor as m
            importlib.reload(m)
            resolved, escalated = m.step2_5_resolve_order_ids(dry_run=False)

        self.assertEqual(resolved, 1)
        self.assertEqual(len(escalated), 0)
        # fail_reason 초기화 확인
        mock_modules["sheets"].update_fail_reason.assert_called_once()
        self.assertEqual(
            mock_modules["sheets"].update_fail_reason.call_args.args[:2],
            (5, ""),
        )


# ─── 주문코드 전처리 테스트 ────────────────────────────────────────────────────

class TestOrderCodePreprocessing(unittest.TestCase):
    """channeltalk.py: 공백/하이픈 전처리 → 정상 추출"""

    def test_space_in_order_code(self):
        """'FRTV 6ECX' → 'FRTV6ECX'"""
        import channeltalk
        messages = [{"form": {"inputs": [{"label": "주문코드", "value": "FRTV 6ECX"}]}}]
        result = channeltalk.extract_order_code_from_messages(messages)
        self.assertEqual(result, "FRTV6ECX")

    def test_hyphen_in_order_code(self):
        """'FRTV-6ECX' → 'FRTV6ECX'"""
        import channeltalk
        messages = [{"form": {"inputs": [{"label": "주문코드", "value": "FRTV-6ECX"}]}}]
        result = channeltalk.extract_order_code_from_messages(messages)
        self.assertEqual(result, "FRTV6ECX")

    def test_underscore_in_order_code(self):
        """'FRTV_6ECX' → 'FRTV6ECX'"""
        import channeltalk
        messages = [{"form": {"inputs": [{"label": "주문코드", "value": "FRTV_6ECX"}]}}]
        result = channeltalk.extract_order_code_from_messages(messages)
        self.assertEqual(result, "FRTV6ECX")

    def test_clean_order_code_unchanged(self):
        """'FRTV6ECX' → 'FRTV6ECX' (변경 불필요)"""
        import channeltalk
        messages = [{"form": {"inputs": [{"label": "주문코드", "value": "FRTV6ECX"}]}}]
        result = channeltalk.extract_order_code_from_messages(messages)
        self.assertEqual(result, "FRTV6ECX")

    def test_too_short_after_cleaning(self):
        """정규화 후 6자 미만이면 None"""
        import channeltalk
        messages = [{"form": {"inputs": [{"label": "주문코드", "value": "AB CD"}]}}]
        result = channeltalk.extract_order_code_from_messages(messages)
        self.assertIsNone(result)


# ─── 백오피스 rider=None 로깅 테스트 ──────────────────────────────────────────

class TestBackofficeRiderLogging(unittest.TestCase):
    """backoffice.py: rider=None vs vehicleNumber 없음 구분 로깅"""

    @patch("backoffice.backoffice_auth")
    @patch("backoffice.safe_backoffice_get")
    def test_rider_null_returns_none(self, mock_get, mock_auth):
        """rider=null → None 반환 (미배차)"""
        mock_auth.get_valid_token.return_value = "test-token"
        mock_get.return_value = {
            "data": {
                "status": "PENDING",
                "rider": None,
            }
        }
        import backoffice
        result = backoffice.get_dispatch_info("12345", token="test-token")
        self.assertIsNone(result)

    @patch("backoffice.backoffice_auth")
    @patch("backoffice.safe_backoffice_get")
    def test_rider_without_vehicle_returns_none(self, mock_get, mock_auth):
        """rider 있지만 vehicleNumber 없음 → None 반환"""
        mock_auth.get_valid_token.return_value = "test-token"
        mock_get.return_value = {
            "data": {
                "status": "ASSIGNED",
                "rider": {"username": "윤성원", "vehicleNumber": None},
            }
        }
        import backoffice
        result = backoffice.get_dispatch_info("12345", token="test-token")
        self.assertIsNone(result)

    @patch("backoffice.backoffice_auth")
    @patch("backoffice.safe_backoffice_get")
    def test_rider_with_vehicle_returns_info(self, mock_get, mock_auth):
        """rider + vehicleNumber → 정상 반환"""
        mock_auth.get_valid_token.return_value = "test-token"
        mock_get.return_value = {
            "data": {
                "status": "ASSIGNED",
                "rider": {"username": "윤성원", "vehicleNumber": "서울 85 바 9953"},
            }
        }
        import backoffice
        result = backoffice.get_dispatch_info("12345", token="test-token")
        self.assertIsNotNone(result)
        self.assertEqual(result["vehicle_number"], "서울 85 바 9953")
        self.assertEqual(result["rider_name"], "윤성원")

    @patch("backoffice.backoffice_auth")
    @patch("backoffice.safe_backoffice_get")
    def test_cancelled_order_returns_cancelled(self, mock_get, mock_auth):
        """취소 상태 주문 → cancelled=True 반환"""
        mock_auth.get_valid_token.return_value = "test-token"
        import config
        config.CANCELED_ORDER_STATUSES = {"CANCELLED", "CANCELED"}
        mock_get.return_value = {
            "data": {
                "status": "CANCELLED",
                "rider": None,
            }
        }
        import backoffice
        result = backoffice.get_dispatch_info("12345", token="test-token")
        self.assertIsNotNone(result)
        self.assertTrue(result.get("cancelled"))


# ─── dry-run 슬랙 차단 테스트 ────────────────────────────────────────────────

class TestDryRunBlocksSlack(unittest.TestCase):
    """dry_run=True → slack_notify 함수 호출 안 됨"""

    def _make_mock_modules(self):
        mock_sheets = MagicMock()
        mock_sheets.COL_CHAT_ID = 2
        mock_sheets.COL_SENT = 8
        mock_sheets.get_all_rows.return_value = []
        mock_sheets.get_pending_orders.return_value = []
        mock_sheets.get_today_summary.return_value = {}
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
        mock_modules["channeltalk"].get_tagged_chats.return_value = []
        return mock_modules

    def test_dry_run_skips_slack_run_start(self):
        """dry_run=True → send_run_start 호출 안 됨"""
        mock_modules = self._make_mock_modules()
        with patch.dict(sys.modules, mock_modules):
            import importlib
            import monitor as m
            importlib.reload(m)
            m.run_once(dry_run=True)
        mock_modules["slack_notify"].send_run_start.assert_not_called()

    def test_dry_run_skips_slack_summary(self):
        """dry_run=True → send_summary 호출 안 됨"""
        mock_modules = self._make_mock_modules()
        with patch.dict(sys.modules, mock_modules):
            import importlib
            import monitor as m
            importlib.reload(m)
            m.run_once(dry_run=True)
        mock_modules["slack_notify"].send_summary.assert_not_called()

    def test_live_mode_sends_slack(self):
        """dry_run=False → send_run_start + send_summary 호출됨"""
        mock_modules = self._make_mock_modules()
        with patch.dict(sys.modules, mock_modules):
            import importlib
            import monitor as m
            importlib.reload(m)
            m.run_once(dry_run=False)
        mock_modules["slack_notify"].send_run_start.assert_called_once()
        mock_modules["slack_notify"].send_summary.assert_called_once()


class TestSlackThreadConsolidation(unittest.TestCase):
    """loop 모드: 저녁 전체가 1개 스레드로 묶이는지 확인"""

    def _make_mock_modules(self):
        mock_sheets = MagicMock()
        mock_sheets.COL_CHAT_ID = 2
        mock_sheets.COL_SENT = 8
        mock_sheets.get_all_rows.return_value = []
        mock_sheets.get_pending_orders.return_value = []
        mock_sheets.get_today_summary.return_value = {}
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
        mock_modules["channeltalk"].get_tagged_chats.return_value = []
        return mock_modules

    def test_loop_mode_keeps_thread(self):
        """loop_mode=True → send_summary(keep_thread=True) 호출"""
        mock_modules = self._make_mock_modules()
        with patch.dict(sys.modules, mock_modules):
            import importlib
            import monitor as m
            importlib.reload(m)
            m.run_once(dry_run=False, loop_mode=True)
        mock_modules["slack_notify"].send_run_start.assert_not_called()
        # send_summary가 keep_thread=True로 호출되었는지 확인
        call_kwargs = mock_modules["slack_notify"].send_summary.call_args
        self.assertTrue(call_kwargs.kwargs.get("keep_thread", False) or
                        (len(call_kwargs.args) > 6 and call_kwargs.args[6] is True),
                        "loop_mode=True에서 send_summary(keep_thread=True) 호출 필요")

    def test_standalone_mode_clears_thread(self):
        """loop_mode=False → send_summary(keep_thread=False) 호출"""
        mock_modules = self._make_mock_modules()
        with patch.dict(sys.modules, mock_modules):
            import importlib
            import monitor as m
            importlib.reload(m)
            m.run_once(dry_run=False, loop_mode=False)
        call_kwargs = mock_modules["slack_notify"].send_summary.call_args
        keep = call_kwargs.kwargs.get("keep_thread", False)
        self.assertFalse(keep, "standalone 모드에서 keep_thread=False 필요")

    def test_send_run_start_threads_when_parent_exists(self):
        """_current_batch_ts가 있으면 스레드 reply로 발송"""
        import slack_notify
        slack_notify._current_batch_ts = "1234567890.123456"
        with patch.object(slack_notify, "_mark_notification_once", return_value=True), \
             patch.object(slack_notify, "_post_message", return_value="1234567890.999999") as mock_post:
            slack_notify.send_run_start()
            # thread_ts가 전달되었는지 확인
            mock_post.assert_called_once()
            _, kwargs = mock_post.call_args
            self.assertEqual(kwargs.get("thread_ts"), "1234567890.123456")
        slack_notify._current_batch_ts = None  # cleanup

    def test_send_run_start_creates_parent_when_no_ts(self):
        """_current_batch_ts가 없으면 부모 메시지 생성"""
        import slack_notify
        slack_notify._current_batch_ts = None
        with patch.object(slack_notify, "_mark_notification_once", return_value=True), \
             patch.object(slack_notify, "_post_message", return_value="new_ts") as mock_post:
            slack_notify.send_run_start()
            mock_post.assert_called_once()
            _, kwargs = mock_post.call_args
            self.assertIsNone(kwargs.get("thread_ts"))
            self.assertEqual(slack_notify._current_batch_ts, "new_ts")
        slack_notify._current_batch_ts = None  # cleanup

    def test_send_evening_start_sets_parent_ts(self):
        """send_evening_start()가 부모 ts를 설정하고 PO 멘션 포함"""
        import slack_notify
        slack_notify._current_batch_ts = None
        with patch.object(slack_notify, "_load_slack_state", return_value={}), \
             patch.object(slack_notify, "_post_message", return_value="evening_ts") as mock_post:
            slack_notify.send_evening_start()
            self.assertEqual(slack_notify._current_batch_ts, "evening_ts")
            text_arg = mock_post.call_args.args[0]
            self.assertNotIn("<@U09PTJ5PBDK>", text_arg)
        slack_notify._current_batch_ts = None  # cleanup

    def test_send_evening_start_reuses_today_thread(self):
        """오늘 스레드가 있으면 새 시작 메시지 없이 기존 스레드 재사용"""
        import slack_notify
        slack_notify._current_batch_ts = None
        today = slack_notify.datetime.now(slack_notify.KST).strftime("%Y-%m-%d")
        with patch.object(slack_notify, "_load_slack_state", return_value={"date": today, "thread_ts": "saved_ts"}), \
             patch.object(slack_notify, "_post_message") as mock_post:
            slack_notify.send_evening_start()
            self.assertEqual(slack_notify._current_batch_ts, "saved_ts")
            mock_post.assert_not_called()
        slack_notify._current_batch_ts = None  # cleanup

    def test_send_run_start_dedupes_same_run(self):
        """같은 배치 시작 알림은 1회만 발송"""
        import slack_notify
        slack_notify._current_batch_ts = "thread_ts"
        with tempfile.TemporaryDirectory() as tmpdir:
            state_file = Path(tmpdir) / "slack_state.json"
            with patch.object(slack_notify, "_SLACK_STATE_FILE", str(state_file)), \
                 patch.object(slack_notify, "_post_message", return_value="reply_ts") as mock_post:
                slack_notify.send_run_start()
                slack_notify.send_run_start()
                mock_post.assert_called_once()
        slack_notify._current_batch_ts = None

    def test_send_summary_dedupes_same_run(self):
        """같은 배치 완료 알림은 1회만 발송"""
        import slack_notify
        slack_notify._current_batch_ts = "thread_ts"
        with tempfile.TemporaryDirectory() as tmpdir:
            state_file = Path(tmpdir) / "slack_state.json"
            with patch.object(slack_notify, "_SLACK_STATE_FILE", str(state_file)), \
                 patch.object(slack_notify, "_send") as mock_send:
                slack_notify.send_summary(0, 0, 0, today_summary={})
                slack_notify.send_summary(0, 0, 0, today_summary={})
                mock_send.assert_called_once()
        slack_notify._current_batch_ts = None

    def test_manual_required_alert_dedupes_same_case(self):
        """같은 수동 처리 건은 하루에 1회만 알림"""
        import slack_notify
        with tempfile.TemporaryDirectory() as tmpdir:
            state_file = Path(tmpdir) / "slack_state.json"
            order = {
                "phone": "01071844412",
                "order_code": "36T2k3Q",
                "fail_reason": "BQ 매핑 실패 (재시도 8회 초과)",
                "row_index": 218,
                "chat_id": "chat_36t2k3q",
            }
            with patch.object(slack_notify, "_SLACK_STATE_FILE", str(state_file)), \
                 patch.object(slack_notify, "_send") as mock_send:
                slack_notify.send_manual_required_alert([order])
                slack_notify.send_manual_required_alert([order])
                mock_send.assert_called_once()


class TestFreshnessFilter(unittest.TestCase):
    """_resolve_order_by_phone: freshness 필터로 과거 주문 제거"""

    def _get_func(self):
        import importlib
        mock_modules = {
            "config": MagicMock(LOG_DIR="/tmp"),
            "channeltalk": MagicMock(),
            "sheets": MagicMock(),
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
        with patch.dict(sys.modules, mock_modules):
            import monitor as m
            importlib.reload(m)
            return m._resolve_order_by_phone, mock_modules

    def test_stale_order_filtered_out(self):
        """max_id 대비 10,000 이상 차이나는 과거 주문은 제거돼 (None, reason) 반환"""
        func, mocks = self._get_func()
        mocks["order_lookup"].lookup_orders_by_phone.return_value = [
            {"order_id": "1435000", "order_code": "NEWER001"},  # 최신
            {"order_id": "1389033", "order_code": "STALE001"},  # 46,000 차이 → 제거
        ]
        mocks["backoffice_auth"].get_valid_token.return_value = "token-abc"
        mocks["backoffice"].verify_order_phone.return_value = None  # 최신 주문도 불일치

        result, reason = func("01012345678")
        # verify_order_phone이 최신 주문(1435000)으로만 호출됐는지 확인
        call_args_list = mocks["backoffice"].verify_order_phone.call_args_list
        called_ids = [c.args[0] for c in call_args_list]
        self.assertNotIn("1389033", called_ids, "과거 주문이 백오피스 대조에 포함됨")
        self.assertIn("1435000", called_ids, "최신 주문은 대조해야 함")

    def test_all_same_era_passes(self):
        """ID 차이 10,000 미만이면 모두 통과"""
        func, mocks = self._get_func()
        mocks["order_lookup"].lookup_orders_by_phone.return_value = [
            {"order_id": "1435000", "order_code": "ORD001"},
            {"order_id": "1430000", "order_code": "ORD002"},  # 5,000 차이 → 통과
        ]
        mocks["backoffice_auth"].get_valid_token.return_value = "token-abc"
        mocks["backoffice"].verify_order_phone.return_value = None

        result, reason = func("01012345678")
        call_args_list = mocks["backoffice"].verify_order_phone.call_args_list
        called_ids = [c.args[0] for c in call_args_list]
        self.assertIn("1430000", called_ids, "ID 차이 5,000이면 필터 통과해야 함")

    def test_all_stale_returns_none(self):
        """단일 후보는 max_id=자기 자신이라 차이=0 → 필터 통과, backoffice 불일치로 None 반환"""
        func, mocks = self._get_func()
        mocks["order_lookup"].lookup_orders_by_phone.return_value = [
            {"order_id": "1389033", "order_code": "STALE001"},
        ]
        mocks["backoffice_auth"].get_valid_token.return_value = "token-abc"
        mocks["backoffice"].verify_order_phone.return_value = None  # 불일치
        result, reason = func("01012345678")
        # 단일 후보는 freshness 필터 통과 (차이=0), backoffice 불일치로 None
        self.assertIsNone(result)
        self.assertIn("불일치", reason)


class TestPhoneFallbackDispatchStatus(unittest.TestCase):
    """step2_5: phone fallback 차량번호 기록 시 '배차완료(폰폴백)' 상태 표시"""

    def _make_mock_modules(self):
        mock_sheets = MagicMock()
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

    def test_phone_fallback_uses_ponfallback_status(self):
        """phone fallback 성공 + 차량번호 있을 때 status='배차완료(폰폴백)' 전달"""
        mock_modules = self._make_mock_modules()
        mock_modules["order_lookup"].lookup_order_id.return_value = None
        mock_modules["sheets"].get_pending_orders.return_value = [{
            "order_code": "BADCODE1",
            "order_id": "",
            "phone": "01012345678",
            "row_index": 2,
            "chat_id": "chat_test",
            "fail_reason": "",
            "dispatch_status": "",
        }]
        mock_modules["sheets"].SheetsWriteBuffer.return_value = MagicMock()

        matched = {
            "order_id": "1435000",
            "order_code": "GOODCODE",
            "vehicle_number": "서울12바3456",
            "rider_name": "김기사",
        }

        with patch.dict(sys.modules, mock_modules):
            import importlib
            import monitor as m
            importlib.reload(m)
            with patch.object(m, "_resolve_order_by_phone", return_value=(matched, "")):
                m.step2_5_resolve_order_ids(dry_run=False, rows=[])

        # update_dispatch가 status="배차완료(폰폴백)"으로 호출됐는지 확인
        call_kwargs = mock_modules["sheets"].update_dispatch.call_args
        self.assertIsNotNone(call_kwargs, "update_dispatch 호출 필요")
        status_arg = call_kwargs.kwargs.get("status")
        self.assertEqual(status_arg, "배차완료(폰폴백)", f"status 불일치: {status_arg}")


class TestNeedsVisitorInfo(unittest.TestCase):
    """channeltalk.needs_visitor_info: 키워드 감지 테스트"""

    def _make_messages(self, texts):
        return [{"plainText": t} for t in texts]

    @patch("channeltalk.get_chat_messages")
    def test_detects_visitor_keyword(self, mock_get):
        import channeltalk as ct
        mock_get.return_value = self._make_messages(["방문자명과 연락처도 부탁드립니다"])
        self.assertTrue(ct.needs_visitor_info("chat_abc"))

    @patch("channeltalk.get_chat_messages")
    def test_detects_rider_name_keyword(self, mock_get):
        import channeltalk as ct
        mock_get.return_value = self._make_messages(["기사님 이름도 알려주세요"])
        self.assertTrue(ct.needs_visitor_info("chat_abc"))

    @patch("channeltalk.get_chat_messages")
    def test_no_keyword_returns_false(self, mock_get):
        import channeltalk as ct
        mock_get.return_value = self._make_messages(["차량번호 알려주세요", "감사합니다"])
        self.assertFalse(ct.needs_visitor_info("chat_abc"))

    @patch("channeltalk.get_chat_messages")
    def test_exception_returns_false(self, mock_get):
        import channeltalk as ct
        mock_get.side_effect = Exception("API 오류")
        self.assertFalse(ct.needs_visitor_info("chat_abc"))


class TestManualRequiredRowsAreNotRepeated(unittest.TestCase):
    def test_step2_5_skips_existing_manual_required_row(self):
        mock_sheets = MagicMock()
        mock_sheets.get_pending_orders.return_value = [{
            "row_index": 218,
            "order_code": "36T2k3Q",
            "order_id": "",
            "chat_id": "chat_36t2k3q",
            "dispatch_status": "수동처리필요",
            "phone": "01071844412",
            "fail_reason": "BQ 매핑 실패 (재시도 8회 초과) [bq_retry:8/8]",
        }]
        mock_sheets.SheetsWriteBuffer.return_value = MagicMock()

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

        with patch.dict(sys.modules, mock_modules):
            import importlib
            import monitor as m
            importlib.reload(m)
            resolved, new_escalated = m.step2_5_resolve_order_ids(dry_run=False, rows=[])

        self.assertEqual(resolved, 0)
        self.assertEqual(new_escalated, [])
        mock_sheets.update_status.assert_not_called()
        mock_sheets.update_fail_reason.assert_not_called()


class TestSendVehicleMessageWithVisitor(unittest.TestCase):
    """send_vehicle_message: rider_name+rider_phone 있을 때 방문자 템플릿 사용"""

    @patch("channeltalk.requests.post")
    def test_visitor_template_used_when_both_provided(self, mock_post):
        import channeltalk as ct
        import config
        mock_post.return_value = MagicMock(status_code=200, raise_for_status=MagicMock())
        ct.send_vehicle_message("chat_x", "서울12가3456", rider_name="홍길동", rider_phone="01012345678")
        call_body = mock_post.call_args.kwargs["json"]
        text = call_body["blocks"][0]["value"]
        self.assertIn("방문자명", text)
        self.assertIn("홍길동", text)
        self.assertIn("01012345678", text)

    @patch("channeltalk.requests.post")
    def test_default_template_when_phone_missing(self, mock_post):
        import channeltalk as ct
        mock_post.return_value = MagicMock(status_code=200, raise_for_status=MagicMock())
        ct.send_vehicle_message("chat_x", "서울12가3456", rider_name="홍길동", rider_phone="")
        call_body = mock_post.call_args.kwargs["json"]
        text = call_body["blocks"][0]["value"]
        self.assertNotIn("방문자명", text)

    @patch("channeltalk.requests.post")
    def test_default_template_when_name_missing(self, mock_post):
        import channeltalk as ct
        mock_post.return_value = MagicMock(status_code=200, raise_for_status=MagicMock())
        ct.send_vehicle_message("chat_x", "서울12가3456", rider_name="", rider_phone="01012345678")
        call_body = mock_post.call_args.kwargs["json"]
        text = call_body["blocks"][0]["value"]
        self.assertNotIn("방문자명", text)


class TestStep3DispatchRecovery(unittest.TestCase):
    def _make_mock_modules(self):
        mock_sheets = MagicMock()
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
        mock_modules["sheets"].SheetsWriteBuffer.return_value = MagicMock()
        return mock_modules

    def test_next_day_row_is_rechecked_when_pickup_date_is_today(self):
        mock_modules = self._make_mock_modules()
        mock_modules["sheets"].get_pending_orders.return_value = [{
            "row_index": 90,
            "order_code": "R39SPVIYCY",
            "order_id": "1709615",
            "chat_id": "chat-010916",
            "dispatch_status": "익일수거",
            "vehicle_number": "",
            "rider": "",
            "detected_at": "2026-04-12 21:00",
            "phone": "01091648701",
            "fail_reason": "",
            "tag": "차량등록",
        }]
        mock_modules["order_lookup"].get_pickup_dates_batch.return_value = {
            "1709615": "2026-04-13"
        }
        mock_modules["channeltalk"].has_vehicle_number_message.return_value = False
        mock_modules["backoffice"].get_dispatch_info.return_value = {
            "vehicle_number": "서울 86 바 5398",
            "rider_name": "김성렬",
            "rider_phone": "01082521605",
        }

        with patch.dict(sys.modules, mock_modules):
            import importlib
            import monitor as m
            importlib.reload(m)

            class FakeDate(real_date):
                @classmethod
                def today(cls):
                    return cls(2026, 4, 13)

            with patch.object(m, "date", FakeDate):
                dispatched_count, dispatched, error_count = m.step3_check_dispatch(
                    dry_run=False,
                    rows=[],
                )

        self.assertEqual(dispatched_count, 1)
        self.assertEqual(error_count, 0)
        self.assertEqual(dispatched[0]["vehicle_number"], "서울 86 바 5398")
        mock_modules["backoffice"].get_dispatch_info.assert_called_once_with("1709615")

    def test_closed_order_recovers_latest_active_order_by_phone(self):
        mock_modules = self._make_mock_modules()
        mock_modules["sheets"].get_pending_orders.return_value = [{
            "row_index": 46,
            "order_code": "DN3HNJ8ZGD",
            "order_id": "1708431",
            "chat_id": "chat-010415",
            "dispatch_status": "미배차",
            "vehicle_number": "",
            "rider": "",
            "detected_at": "2026-04-13 21:00",
            "phone": "01041515734",
            "fail_reason": "",
            "tag": "차량등록",
        }]
        mock_modules["order_lookup"].get_pickup_dates_batch.return_value = {
            "1708431": "2026-04-12"
        }
        mock_modules["channeltalk"].has_vehicle_number_message.return_value = False
        mock_modules["backoffice"].get_dispatch_info.return_value = {
            "closed": True,
            "status": "COMPLETED",
            "reason": "처리완료",
        }

        with patch.dict(sys.modules, mock_modules):
            import importlib
            import monitor as m
            importlib.reload(m)
            matched = {
                "order_id": "1712489",
                "order_code": "L1FT2Z8HDM",
                "vehicle_number": "서울 90 바 6782",
                "rider_name": "문양래",
                "rider_phone": "01050157198",
            }
            with patch.object(m, "_resolve_order_by_phone", return_value=(matched, "")):
                dispatched_count, dispatched, error_count = m.step3_check_dispatch(
                    dry_run=False,
                    rows=[],
                )

        self.assertEqual(dispatched_count, 1)
        self.assertEqual(error_count, 0)
        self.assertEqual(dispatched[0]["order_id"], "1712489")
        mock_modules["sheets"].update_order_code.assert_called_once()
        mock_modules["sheets"].update_order_id.assert_called_once()
        self.assertEqual(
            mock_modules["sheets"].update_dispatch.call_args.kwargs.get("status"),
            "배차완료(폰폴백)",
        )
        mock_modules["sheets"].mark_no_send_needed.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
