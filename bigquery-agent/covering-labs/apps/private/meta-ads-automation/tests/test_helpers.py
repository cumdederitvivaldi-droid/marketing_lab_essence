"""Unit tests for pure helper functions defined in src/app.py.

Strategy: app.py is a Streamlit app that runs module-level UI code on import.
We stub `streamlit` in sys.modules before loading the module, then let execution
reach the first `st.stop()` guard (fired when no access token is present).
All helper functions are defined before that point, so we capture them from the
partially-loaded module.
"""
import importlib.util
import sys
import types
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# ── 1. Build a minimal streamlit stub ────────────────────────────────────────


class _AppHalt(BaseException):
    """Raised by the st.stop() stub to abort top-level UI execution."""


def _make_st_stub() -> types.ModuleType:
    st = types.ModuleType("streamlit")

    def _cache_data(*args, **kwargs):
        if args and callable(args[0]):
            return args[0]
        return lambda fn: fn

    def _stop():
        raise _AppHalt()

    st.set_page_config = MagicMock()
    st.cache_data = _cache_data
    st.session_state = {}
    st.stop = _stop
    for _name in (
        "header", "subheader", "title", "caption", "info", "warning",
        "error", "success", "divider", "text_input", "sidebar",
    ):
        setattr(st, _name, MagicMock())
    return st


if "streamlit" not in sys.modules:
    sys.modules["streamlit"] = _make_st_stub()


# ── 2. Load app.py; halt at first st.stop() call ─────────────────────────────

_SRC = Path(__file__).parent.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

_spec = importlib.util.spec_from_file_location("app", str(_SRC / "app.py"))
_app = importlib.util.module_from_spec(_spec)
try:
    _spec.loader.exec_module(_app)
except _AppHalt:
    pass  # expected — helper functions are all defined before this point

# Convenience aliases
detect_targeting    = _app.detect_targeting
parse_budget        = _app.parse_budget
make_ad_name        = _app.make_ad_name
validate_adset_name = _app.validate_adset_name
apply_os_placements = _app.apply_os_placements
build_targeting     = _app.build_targeting
run_creation        = _app.run_creation
DEFAULT_BUDGET      = _app.DEFAULT_BUDGET


# ══ detect_targeting ══════════════════════════════════════════════════════════

def test_detect_targeting_no_audiences():
    kind, ids = detect_targeting({"targeting": {}})
    assert kind == "all"
    assert ids == []


def test_detect_targeting_re():
    adset = {"targeting": {"custom_audiences": [{"id": "111"}, {"id": "222"}]}}
    kind, ids = detect_targeting(adset)
    assert kind == "re"
    assert ids == ["111", "222"]


def test_detect_targeting_lookalike():
    adset = {
        "targeting": {
            "custom_audiences": [{"id": "333"}],
            "lookalike_specs": [{"ratio": 0.01}],
        }
    }
    kind, ids = detect_targeting(adset)
    assert kind == "lookalike"
    assert ids == ["333"]


# ══ parse_budget ══════════════════════════════════════════════════════════════

def test_parse_budget_valid():
    assert parse_budget({"daily_budget": "50000"}) == 50000


def test_parse_budget_missing_returns_default():
    assert parse_budget({}) == DEFAULT_BUDGET


def test_parse_budget_invalid_string_returns_default():
    assert parse_budget({"daily_budget": "abc"}) == DEFAULT_BUDGET


# ══ make_ad_name ══════════════════════════════════════════════════════════════

def test_make_ad_name_standard_pattern():
    base = "aos_purchase_all_cr_vd_이사워킹맘(대형폐기물)_mk1_26.03.04"
    result = make_ad_name(base, "_B")
    assert result == "aos_purchase_all_cr_vd_이사워킹맘(대형폐기물)_B_mk1_26.03.04"


def test_make_ad_name_fallback_when_no_pattern():
    result = make_ad_name("simple_name", "1")
    assert result == "simple_name_1"


# ══ validate_adset_name ═══════════════════════════════════════════════════════

VALID = "aos_purchase_all_cr_vd_이사워킹맘(대형폐기물)_mk1_26.03.04"


def test_validate_valid_name():
    ok, msg = validate_adset_name(VALID)
    assert ok
    assert msg == ""


def test_validate_too_few_segments():
    ok, msg = validate_adset_name("aos_purchase_all")
    assert not ok
    assert "부족" in msg


def test_validate_bad_os():
    name = "win_purchase_all_cr_vd_concept(test)_mk1_26.03.04"
    ok, msg = validate_adset_name(name)
    assert not ok
    assert "[1]" in msg


def test_validate_bad_goal():
    name = "aos_click_all_cr_vd_concept(test)_mk1_26.03.04"
    ok, msg = validate_adset_name(name)
    assert not ok
    assert "[2]" in msg


def test_validate_bad_targeting():
    name = "aos_purchase_broad_cr_vd_concept(test)_mk1_26.03.04"
    ok, msg = validate_adset_name(name)
    assert not ok
    assert "[3]" in msg


def test_validate_bad_region_code():
    name = "aos_purchase_all_seoul_vd_concept(test)_mk1_26.03.04"
    ok, msg = validate_adset_name(name)
    assert not ok
    assert "[4]" in msg


def test_validate_bad_content_type():
    name = "aos_purchase_all_cr_banner_concept(test)_mk1_26.03.04"
    ok, msg = validate_adset_name(name)
    assert not ok
    assert "[5]" in msg


def test_validate_bad_manager_version():
    name = "aos_purchase_all_cr_vd_concept(test)_MK1_26.03.04"
    ok, msg = validate_adset_name(name)
    assert not ok
    assert "[7]" in msg


def test_validate_bad_date():
    name = "aos_purchase_all_cr_vd_concept(test)_mk1_2026-03-04"
    ok, msg = validate_adset_name(name)
    assert not ok
    assert "날짜" in msg


# ══ apply_os_placements ═══════════════════════════════════════════════════════

def test_apply_os_placements_clears_stale_keys():
    dirty = {
        "publisher_platforms": ["facebook"],
        "facebook_positions":  ["feed"],
        "messenger_positions": ["inbox"],
        "age_min": 20,
    }
    result = apply_os_placements(dirty, "ios")
    assert "messenger_positions" not in result
    assert result["publisher_platforms"] == ["instagram"]
    assert result["age_min"] == 20


def test_apply_os_placements_aos():
    result = apply_os_placements({}, "aos")
    assert "facebook" in result["publisher_platforms"]
    assert "instagram" in result["publisher_platforms"]
    assert "facebook_positions" in result
    assert "instagram_positions" in result


def test_apply_os_placements_ios():
    result = apply_os_placements({}, "ios")
    assert result["publisher_platforms"] == ["instagram"]
    assert "facebook_positions" not in result
    assert "instagram_positions" in result


def test_apply_os_placements_does_not_mutate_input():
    original = {"publisher_platforms": ["facebook"], "age_min": 25}
    apply_os_placements(original, "ios")
    assert original["publisher_platforms"] == ["facebook"]


# ══ build_targeting ═══════════════════════════════════════════════════════════

def test_build_targeting_all_aos():
    t = build_targeting("aos", "all")
    assert t["app_install_state"] == "not_installed"
    assert "facebook" in t["publisher_platforms"]
    assert "excluded_geo_locations" in t


def test_build_targeting_all_ios():
    t = build_targeting("ios", "all")
    assert t["publisher_platforms"] == ["instagram"]
    assert "facebook_positions" not in t
    assert t.get("user_os") is not None


def test_build_targeting_re_requires_audience_ids():
    with pytest.raises(ValueError, match="audience_ids"):
        build_targeting("aos", "re")


def test_build_targeting_re_with_ids():
    t = build_targeting("aos", "re", audience_ids=["111", "222"])
    assert {"id": "111"} in t["custom_audiences"]
    assert {"id": "222"} in t["custom_audiences"]


def test_build_targeting_lookalike_with_ids():
    t = build_targeting("ios", "lookalike", audience_ids=["999"])
    assert {"id": "999"} in t["custom_audiences"]
    assert t["publisher_platforms"] == ["instagram"]


# ══ run_creation — CBO re-check fallback ══════════════════════════════════════

def test_cbo_recheck_fallback_preserves_initial_value():
    """When api_get raises RuntimeError during CBO re-check, is_cbo keeps its
    initial value from params and the function logs the fallback warning."""
    logs: list = []

    params = {
        "dry_run": False,
        "os_key": "aos",
        "campaign_id": "120242377089160514",
        "adset_name": "aos_purchase_all_cr_vd_test_mk1_26.01.01",
        "targeting_key": "all",
        "audience_ids": [],
        "budget": DEFAULT_BUDGET,
        "is_cbo": True,
        "ad_names": [],
        "title": "테스트",
        "message": "테스트 메시지",
    }

    with patch.object(_app, "api_get", side_effect=RuntimeError("connection timeout")), \
         patch.object(_app, "api_post", return_value={"id": "adset_001"}):
        adset_id, results = run_creation(params, [], logs.append)

    assert adset_id == "adset_001"
    assert results == []
    fallback_msgs = [msg for msg in logs if "CBO 재확인 실패" in msg]
    assert len(fallback_msgs) == 1
    assert "is_cbo=True" in fallback_msgs[0]
