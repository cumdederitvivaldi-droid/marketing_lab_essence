from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import main


def test_render_audit_message_for_clean_state() -> None:
    assert main.render_audit_message([]) == "FlareLane 실험 장부 점검: 오늘 추가 조치가 필요한 누락 신호가 없습니다."


def test_render_audit_message_counts_missing_and_revision() -> None:
    rows = [
        {
            "experiment_key": "d3_crm_ab_test_v3",
            "inventory_status": "registered_without_bigquery_signal",
            "product_labs_status": "needs_revision",
            "latest_activity_date": None,
            "observed_units": None,
        },
        {
            "experiment_key": "friend_invite_experiment_v1",
            "inventory_status": "registered_recent_signal",
            "product_labs_status": "needs_revision",
            "latest_activity_date": "2026-04-28",
            "observed_units": 44633,
        },
    ]

    message = main.render_audit_message(rows)

    assert "BigQuery 신호 없음: 1건" in message
    assert "Product Labs 수정필요: 2건" in message
    assert "판정: 주의" in message
    assert "우선 액션" in message
    assert "d3_crm_ab_test_v3" in message


def test_render_audit_message_includes_contamination_and_ledger_state() -> None:
    risk_rows = [
        {
            "metric": "same_user_multi_arm",
            "key_a": "friend_invite_experiment_v1",
            "key_b": None,
            "user_count": 1,
            "rate_a": None,
            "rate_b": None,
            "min_day_gap": None,
            "max_day_gap": None,
        },
        {
            "metric": "cross_experiment_overlap_30d",
            "key_a": "eng_2549_subscription_first_month_free",
            "key_b": "friend_invite_experiment_v1",
            "user_count": 37799,
            "rate_a": 50.79,
            "rate_b": 84.69,
            "min_day_gap": 2,
            "max_day_gap": 4,
        },
    ]
    ledger_rows = [
        {"table_name": "flarelane_experiment_assignments", "row_count": 0},
        {"table_name": "flarelane_experiment_exposures", "row_count": 0},
        {"table_name": "flarelane_experiment_conversions", "row_count": 0},
    ]

    message = main.render_audit_message([], risk_rows=risk_rows, ledger_rows=ledger_rows)

    assert "같은 실험 다중 arm: 1명" in message
    assert "30일 내 실험 간 중복 노출: 1쌍" in message
    assert "eng_2549_subscription_first_month_free ↔ friend_invite_experiment_v1" in message
    assert "canonical ledger 빈 테이블: 3개" in message


def test_evaluate_guardrail_fails_when_risk_exceeds_baseline() -> None:
    audit_rows = [
        {
            "experiment_key": "d3_crm_ab_test_v3",
            "inventory_status": "registered_without_bigquery_signal",
            "product_labs_status": "needs_revision",
        }
    ]
    risk_rows = [
        {
            "metric": "same_user_multi_arm",
            "key_a": "friend_invite_experiment_v1",
            "key_b": None,
            "user_count": 1,
            "rate_a": None,
            "rate_b": None,
            "min_day_gap": None,
            "max_day_gap": None,
        },
        {
            "metric": "cross_experiment_overlap_30d",
            "key_a": "eng_2549_subscription_first_month_free",
            "key_b": "friend_invite_experiment_v1",
            "user_count": 37799,
            "rate_a": 50.79,
            "rate_b": 84.69,
            "min_day_gap": 2,
            "max_day_gap": 4,
        },
    ]
    ledger_rows = [{"table_name": "flarelane_experiment_assignments", "row_count": 0}]
    thresholds = main.GuardrailThresholds(
        max_missing_bigquery_signal=0,
        max_product_labs_revision=0,
        max_multi_arm_users=0,
        max_cross_overlap_rate=3.0,
        max_canonical_empty_tables=0,
    )

    result = main.evaluate_guardrail(audit_rows, risk_rows, ledger_rows, thresholds)

    assert not result.ok
    assert "BigQuery 신호 없음 1건" in result.message
    assert "같은 실험 다중 arm 1명" in result.message
    assert "30일 중복 노출 최대 84.69%" in result.message
    assert "canonical ledger 빈 테이블 1개" in result.message


def test_evaluate_guardrail_passes_with_known_baseline() -> None:
    audit_rows = [
        {
            "experiment_key": "d3_crm_ab_test_v3",
            "inventory_status": "registered_without_bigquery_signal",
            "product_labs_status": "needs_revision",
        }
    ]
    risk_rows = [
        {
            "metric": "same_user_multi_arm",
            "key_a": "friend_invite_experiment_v1",
            "key_b": None,
            "user_count": 1,
            "rate_a": None,
            "rate_b": None,
            "min_day_gap": None,
            "max_day_gap": None,
        }
    ]
    ledger_rows = [{"table_name": "flarelane_experiment_assignments", "row_count": 0}]
    thresholds = main.GuardrailThresholds(
        max_missing_bigquery_signal=1,
        max_product_labs_revision=1,
        max_multi_arm_users=1,
        max_cross_overlap_rate=3.0,
        max_canonical_empty_tables=1,
    )

    result = main.evaluate_guardrail(audit_rows, risk_rows, ledger_rows, thresholds)

    assert result.ok
    assert result.message == "FlareLane governance check passed"


def test_render_remediation_report_is_human_run_only() -> None:
    audit_rows = [
        {
            "experiment_key": "d3_crm_ab_test_v3",
            "inventory_status": "registered_without_bigquery_signal",
            "product_labs_status": "needs_revision",
        }
    ]
    risk_rows = [
        {
            "metric": "cross_experiment_overlap_30d",
            "key_a": "eng_2549_subscription_first_month_free",
            "key_b": "friend_invite_experiment_v1",
            "user_count": 37799,
            "rate_a": 50.79,
            "rate_b": 84.69,
            "min_day_gap": 2,
            "max_day_gap": 4,
        }
    ]
    ledger_rows = [{"table_name": "flarelane_experiment_assignments", "row_count": 0}]

    report = main.render_remediation_report(audit_rows, risk_rows, ledger_rows)

    assert "Codex는 Product Labs 상태 변경" in report
    assert "BigQuery 신호 없는 실험 1건 정리" in report
    assert "30일 내 실험 간 중복 노출 1쌍 검산" in report
    assert "canonical ledger 빈 테이블 1개 backfill 결정" in report


def test_render_product_labs_pr_template_requires_governance_fields() -> None:
    template = main.render_product_labs_pr_template()

    assert "Product Labs FlareLane 실험 PR 템플릿" in template
    assert "experiment_key" in template
    assert "BigQuery source" in template
    assert "최근 30일 중복 노출 제외 기준" in template
    assert "다중 arm 방지 기준" in template
    assert "readout date와 kill criteria" in template


def test_render_product_labs_pr_template_can_include_current_cleanup() -> None:
    audit_rows = [
        {
            "experiment_key": "d3_crm_ab_test_v3",
            "inventory_status": "registered_without_bigquery_signal",
            "product_labs_status": "needs_revision",
        }
    ]
    report = main.render_product_labs_pr_template(audit_rows, [], [])

    assert "현재 장부는 완전 정리 상태가 아니다" in report
    assert "BigQuery 신호 없는 실험 1건 정리" in report
    assert "Product Labs needs_revision 1건 정리" in report


def test_render_product_labs_pr_template_has_neutral_cleanup_state_when_clean() -> None:
    report = main.render_product_labs_pr_template([], [], [])

    assert "현재 장부 정리 PR에 추가할 항목이 없습니다" in report
    assert "현재 장부는 완전 정리 상태가 아니다" not in report


def test_render_cleanup_execution_pack_is_complete_and_human_run_only() -> None:
    audit_rows = [
        {
            "experiment_key": "d3_crm_ab_test_v3",
            "inventory_status": "registered_without_bigquery_signal",
            "product_labs_status": "needs_revision",
            "latest_activity_date": None,
            "observed_units": None,
            "recommended_action": "connect_source_or_mark_inactive",
        },
        {
            "experiment_key": "friend_invite_experiment_v1",
            "inventory_status": "registered_recent_signal",
            "product_labs_status": "needs_revision",
            "latest_activity_date": "2026-04-28",
            "observed_units": 44633,
            "recommended_action": "complete_product_labs_metadata",
        },
    ]
    risk_rows = [
        {
            "metric": "same_user_multi_arm",
            "key_a": "friend_invite_experiment_v1",
            "key_b": None,
            "user_count": 1,
            "rate_a": None,
            "rate_b": None,
            "min_day_gap": None,
            "max_day_gap": None,
        },
        {
            "metric": "cross_experiment_overlap_30d",
            "key_a": "eng_2549_subscription_first_month_free",
            "key_b": "friend_invite_experiment_v1",
            "user_count": 37799,
            "rate_a": 50.79,
            "rate_b": 84.69,
            "min_day_gap": 2,
            "max_day_gap": 4,
        },
    ]
    ledger_rows = [{"table_name": "flarelane_experiment_assignments", "row_count": 0}]

    report = main.render_cleanup_execution_pack(audit_rows, risk_rows, ledger_rows)

    assert "완전 정리 실행팩" in report
    assert "Codex는 Product Labs 상태 변경" in report
    assert "chore(product-labs): clean up FlareLane experiment ledger" in report
    assert "d3_crm_ab_test_v3" in report
    assert "friend_invite_experiment_v1" in report
    assert "30일 중복: eng_2549_subscription_first_month_free ↔ friend_invite_experiment_v1" in report
    assert "sync-d3d8 --groups-csv <approved_flarelane_tag_export.csv> --dry-run" in report
    assert "python3 src/main.py sync-stage2" in report
    assert "--max-missing-bigquery-signal 0" in report
    assert "되돌리기" in report


def test_render_cleanup_execution_pack_handles_clean_state() -> None:
    ledger_rows = [
        {"table_name": "flarelane_experiment_assignments", "row_count": 12},
        {"table_name": "flarelane_experiment_exposures", "row_count": 34},
        {"table_name": "flarelane_experiment_conversions", "row_count": 56},
    ]

    report = main.render_cleanup_execution_pack([], [], ledger_rows)

    assert "현재 정리 대상 없음" in report
    assert "같은 실험 다중 arm 없음" in report
    assert "30일 중복 노출 없음" in report
    assert "빈 canonical ledger 테이블 없음" in report


def test_post_slack_uses_lab_notifications_default_and_ignores_generic_channel(monkeypatch: pytest.MonkeyPatch) -> None:
    sent_payloads = []

    class FakeResponse:
        ok = True

        @staticmethod
        def json() -> dict[str, bool]:
            return {"ok": True}

    def fake_post(*args, **kwargs):
        sent_payloads.append(kwargs["json"])
        return FakeResponse()

    monkeypatch.setenv("SLACK_BOT_TOKEN", "xoxb-test")
    monkeypatch.setenv("SLACK_CHANNEL_ID", "C0ANGG5KPGT")
    monkeypatch.delenv("FLARELANE_GOVERNANCE_SLACK_CHANNEL", raising=False)
    monkeypatch.delenv("FLARELANE_GOVERNANCE_SLACK_TOKEN", raising=False)
    monkeypatch.setattr(main.requests, "post", fake_post)

    main.post_slack("test")

    assert sent_payloads == [{"channel": "#실험실_notifications", "text": "test"}]


def test_read_groups_csv_rejects_unknown_group(tmp_path: Path) -> None:
    csv_path = tmp_path / "groups.csv"
    csv_path.write_text("user_id,group\n1,unknown\n", encoding="utf-8")

    with pytest.raises(SystemExit):
        main.read_groups_csv(csv_path)


def test_d3d8_assignment_sql_maps_groups(tmp_path: Path) -> None:
    rows = [{"user_id": "100", "group": "d3_treatment"}, {"user_id": "200", "group": "d8_v2"}]

    sql = main.d3d8_assignment_sql(rows)

    assert "d3_crm_ab_test_v3" in sql
    assert "d8_crm_ab_test_v3" in sql
    assert "'variant2'" in sql
    assert "flarelane_tag_csv" in sql


def test_d3d8_assignment_sql_rejects_non_numeric_user_id() -> None:
    rows = [{"user_id": "abc", "group": "d3_treatment"}]

    with pytest.raises(SystemExit) as exc:
        main.d3d8_assignment_sql(rows)

    assert "user_id=abc" in str(exc.value)


def test_stage2_sql_is_guarded_until_source_exists() -> None:
    sql = main.stage2_sql()

    assert "no_bigquery_source_registered" in sql
    assert "eng_2144_stage2_reward_coupon" in sql
