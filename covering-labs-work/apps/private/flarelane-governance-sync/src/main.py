#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import logging
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import google.auth
import requests
from google.api_core import retry as api_retry
from google.api_core.exceptions import InternalServerError, ServiceUnavailable, TooManyRequests
from google.cloud import bigquery

from config import BIGQUERY_SCOPES, GCP_PROJECT, _load_env_file
from queries import audit_sql, canonical_ledger_sql, governance_risk_sql

_load_env_file()

PROJECT = GCP_PROJECT
DEFAULT_CHANNEL = "#실험실_notifications"
LOG_DIR = Path(__file__).resolve().parents[1] / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler(LOG_DIR / "batch.log", encoding="utf-8")],
)
logger = logging.getLogger("flarelane-governance-sync")

TAG_TO_EXPERIMENT = {
    "d3_treatment": ("d3_crm_ab_test_v3", "treatment", 14),
    "d3_control": ("d3_crm_ab_test_v3", "control", 14),
    "d8_v1": ("d8_crm_ab_test_v3", "variant1", 21),
    "d8_v2": ("d8_crm_ab_test_v3", "variant2", 21),
    "d8_control": ("d8_crm_ab_test_v3", "control", 21),
}

AUDIT_SQL = audit_sql(PROJECT)
GOVERNANCE_RISK_SQL = governance_risk_sql(PROJECT)
CANONICAL_LEDGER_SQL = canonical_ledger_sql(PROJECT)


_BQ_RETRY = api_retry.Retry(
    predicate=api_retry.if_exception_type(ServiceUnavailable, InternalServerError, TooManyRequests),
    initial=2.0,
    maximum=60.0,
    multiplier=2.0,
    deadline=300.0,
)


def query_rows(sql: str) -> list[dict[str, Any]]:
    rows = bigquery_client().query(sql, retry=_BQ_RETRY).result(retry=_BQ_RETRY, timeout=300)
    return [dict(row.items()) for row in rows]


def bigquery_client() -> bigquery.Client:
    """Create a BigQuery client with explicit ADC scopes."""
    creds, _ = google.auth.default(scopes=BIGQUERY_SCOPES)
    return bigquery.Client(project=PROJECT, credentials=creds)


@dataclass(frozen=True)
class GuardrailThresholds:
    max_missing_bigquery_signal: int
    max_product_labs_revision: int
    max_multi_arm_users: int
    max_cross_overlap_rate: float
    max_canonical_empty_tables: int


@dataclass(frozen=True)
class GuardrailResult:
    ok: bool
    message: str


@dataclass(frozen=True)
class RemediationItem:
    priority: int
    title: str
    actor: str
    action: str
    verify: str


NEW_EXPERIMENT_PR_TEMPLATE = """Product Labs FlareLane 실험 PR 템플릿

제목:
feat(product-labs): register <experiment_key>

본문:
## 실험 기본 정보
- experiment_key:
- owner:
- 상태: planned | running | paused | ended
- 시작일 / 종료 예정일:
- 가설:
- 대상 고객:
- 제외 고객:
- arm 구성:
- 주 지표:
- 보조 지표:
- guardrail 지표:
- readout date:
- kill criteria:

## 측정과 장부
- BigQuery source/view:
- assignment 기록 위치:
- exposure 기록 위치:
- conversion 기록 위치:
- canonical ledger backfill 계획:
- 최근 30일 실험 참여자 제외 기준:
- 다중 arm 방지 기준:

## 운영 확인
- FlareLane 캠페인/여정 링크:
- QA 대상:
- Slack 공유 채널:
- 롤백/중단 방법:

## Merge 전 체크
- [ ] experiment_key가 고유하다.
- [ ] owner, 기간, 상태, 지표가 비어 있지 않다.
- [ ] BigQuery source 또는 backfill 계획이 있다.
- [ ] assignment/exposure/conversion 기록 기준이 있다.
- [ ] 최근 30일 중복 노출 제외 기준이 있다.
- [ ] 다중 arm 방지 기준이 있다.
- [ ] readout date와 kill criteria가 있다.
- [ ] 운영 발송/노출은 사람 승인 후 실행한다.
"""


def _as_int(value: Any) -> int:
    return int(value or 0)


def _as_float(value: Any) -> float:
    return float(value or 0)


def _format_rate(value: Any) -> str:
    return f"{_as_float(value):.2f}%"


def _split_audit_rows(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    missing = [r for r in rows if r["inventory_status"] == "registered_without_bigquery_signal"]
    revision = [r for r in rows if r["product_labs_status"] == "needs_revision"]
    return missing, revision


def _split_risk_rows(risk_rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    multi_arm = [r for r in risk_rows if r["metric"] == "same_user_multi_arm"]
    cross_overlap = [r for r in risk_rows if r["metric"] == "cross_experiment_overlap_30d"]
    cross_overlap = sorted(
        cross_overlap,
        key=lambda r: (
            max(_as_float(r["rate_a"]), _as_float(r["rate_b"])),
            _as_int(r["user_count"]),
        ),
        reverse=True,
    )
    return multi_arm, cross_overlap


def _empty_ledgers(ledger_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [r for r in ledger_rows if _as_int(r["row_count"]) == 0]


def build_remediation_items(
    rows: list[dict[str, Any]],
    risk_rows: list[dict[str, Any]],
    ledger_rows: list[dict[str, Any]],
) -> list[RemediationItem]:
    """Build read-only remediation guidance for humans; never mutates operational state."""
    missing, revision = _split_audit_rows(rows)
    multi_arm, cross_overlap = _split_risk_rows(risk_rows)
    empty_ledgers = _empty_ledgers(ledger_rows)
    items: list[RemediationItem] = []

    if missing:
        keys = ", ".join(row["experiment_key"] for row in missing[:4])
        if len(missing) > 4:
            keys += f" 외 {len(missing) - 4}건"
        items.append(
            RemediationItem(
                priority=1,
                title=f"BigQuery 신호 없는 실험 {len(missing)}건 정리",
                actor="사람 실행",
                action=(
                    f"{keys}의 실제 운영 여부를 확인한다. 운영 중이면 source/backfill을 연결한다. "
                    "종료/예시 실험이면 Product Labs에서 비활성 정리한다."
                ),
                verify=(
                    "다음 audit에서 BigQuery 신호 없음이 0건이거나 "
                    "명시적으로 제외된 실험만 남는지 확인한다."
                ),
            )
        )

    if revision:
        keys = ", ".join(row["experiment_key"] for row in revision[:4])
        if len(revision) > 4:
            keys += f" 외 {len(revision) - 4}건"
        items.append(
            RemediationItem(
                priority=2,
                title=f"Product Labs needs_revision {len(revision)}건 정리",
                actor="사람 실행",
                action=f"{keys}의 상태값, owner, 종료 여부, 측정 지표를 Product Labs에서 정리한다.",
                verify=(
                    "다음 audit에서 Product Labs 수정필요가 0건이거나 "
                    "실제 진행 중인 실험만 남는지 확인한다."
                ),
            )
        )

    multi_arm_users = sum(_as_int(row["user_count"]) for row in multi_arm)
    if multi_arm_users:
        keys = ", ".join(row["key_a"] for row in multi_arm[:3])
        items.append(
            RemediationItem(
                priority=3,
                title=f"같은 실험 다중 arm 사용자 {multi_arm_users}명 검산",
                actor="사람 실행",
                action=(
                    f"{keys}에서 동일 사용자가 여러 arm으로 기록된 원인을 확인한다. "
                    "분석 readout에서는 해당 사용자를 제외하거나 단일 arm 기준을 확정한다."
                ),
                verify=(
                    "다음 audit에서 같은 실험 다중 arm이 0명이거나 "
                    "제외 기준이 문서화됐는지 확인한다."
                ),
            )
        )

    if cross_overlap:
        top = cross_overlap[0]
        top_rate = max(_as_float(top["rate_a"]), _as_float(top["rate_b"]))
        items.append(
            RemediationItem(
                priority=4,
                title=f"30일 내 실험 간 중복 노출 {len(cross_overlap)}쌍 검산",
                actor="사람 실행",
                action=(
                    f"최대 중복 {top['key_a']} ↔ {top['key_b']} "
                    f"({top_rate:.2f}%)부터 readout 해석 가능 여부를 판단하고, "
                    "다음 실험 배정 전에는 최근 30일 실험 참여자 제외 조건을 검산한다."
                ),
                verify=(
                    "다음 audit에서 최대 중복률이 baseline 이하로 유지되고, "
                    "신규 실험 설계 문서에 중복 제외 기준이 남는지 확인한다."
                ),
            )
        )

    if empty_ledgers:
        tables = ", ".join(row["table_name"] for row in empty_ledgers)
        items.append(
            RemediationItem(
                priority=5,
                title=f"canonical ledger 빈 테이블 {len(empty_ledgers)}개 backfill 결정",
                actor="사람 승인 후 실행",
                action=(
                    f"{tables}에 대해 CSV/source별 dry-run SQL을 먼저 검토한다. "
                    "Codex는 SQL 생성과 dry-run까지만 수행한다. "
                    "BigQuery write는 승인된 사람이 실행한다."
                ),
                verify=(
                    "dry-run bytes와 예상 row 수를 기록한 뒤, "
                    "실행 후 ledger row_count와 audit 결과를 다시 확인한다."
                ),
            )
        )

    return sorted(items, key=lambda item: item.priority)


def render_remediation_report(
    rows: list[dict[str, Any]],
    risk_rows: list[dict[str, Any]] | None = None,
    ledger_rows: list[dict[str, Any]] | None = None,
) -> str:
    """Render a human-run remediation plan without executing any operational mutation."""
    items = build_remediation_items(rows, risk_rows or [], ledger_rows or [])
    if not items:
        return "FlareLane 실험 장부 정리 절차: 현재 사람이 추가 정리할 항목이 없습니다."
    lines = [
        "FlareLane 실험 장부 정리 절차",
        (
            "원칙: Codex는 Product Labs 상태 변경, FlareLane 운영 변경, "
            "BigQuery write를 직접 실행하지 않는다."
        ),
        "",
    ]
    for item in items:
        lines.extend(
            [
                f"{item.priority}. {item.title}",
                f"   - 실행 주체: {item.actor}",
                f"   - 할 일: {item.action}",
                f"   - 검증: {item.verify}",
            ]
        )
    return "\n".join(lines)


def render_product_labs_pr_template(
    rows: list[dict[str, Any]] | None = None,
    risk_rows: list[dict[str, Any]] | None = None,
    ledger_rows: list[dict[str, Any]] | None = None,
) -> str:
    """Render the Product Labs PR template and optional current cleanup checklist."""
    lines = [NEW_EXPERIMENT_PR_TEMPLATE.rstrip()]
    if rows is None and risk_rows is None and ledger_rows is None:
        return "\n".join(lines)

    items = build_remediation_items(rows or [], risk_rows or [], ledger_rows or [])
    lines.extend(
        [
            "",
            "현재 실험 장부 정리 PR에 같이 넣을 항목",
        ]
    )
    if not items:
        lines.append("판정: 현재 장부 정리 PR에 추가할 항목이 없습니다.")
        lines.append("- 추가 정리 항목 없음")
    else:
        lines.append("판정: 현재 장부는 완전 정리 상태가 아니다. 아래 항목은 사람 실행/승인이 필요하다.")
    for item in items:
        lines.extend(
            [
                f"- P{item.priority} {item.title}",
                f"  - 실행 주체: {item.actor}",
                f"  - 할 일: {item.action}",
                f"  - 검증: {item.verify}",
            ]
        )
    return "\n".join(lines)


def render_cleanup_execution_pack(
    rows: list[dict[str, Any]],
    risk_rows: list[dict[str, Any]],
    ledger_rows: list[dict[str, Any]],
) -> str:
    """Render a complete human-run cleanup pack for Product Labs and ledger owners."""
    missing, revision = _split_audit_rows(rows)
    multi_arm, cross_overlap = _split_risk_rows(risk_rows)
    empty_ledgers = _empty_ledgers(ledger_rows)
    multi_arm_users = sum(_as_int(row["user_count"]) for row in multi_arm)

    lines = [
        "FlareLane 실험 장부 완전 정리 실행팩",
        (
            "원칙: Codex는 Product Labs 상태 변경, FlareLane 운영 변경, BigQuery write를 "
            "직접 실행하지 않는다. 아래 내용은 사람이 PR로 승인하고 실행한다."
        ),
        "",
        "현재 상태",
        f"- BigQuery 신호 없음: {len(missing)}건",
        f"- Product Labs needs_revision: {len(revision)}건",
        f"- 같은 실험 다중 arm: {multi_arm_users}명",
        f"- 30일 내 실험 간 중복 노출: {len(cross_overlap)}쌍",
        f"- canonical ledger 빈 테이블: {len(empty_ledgers)}개",
        "",
        "Product Labs 정리 PR",
        "제목: chore(product-labs): clean up FlareLane experiment ledger",
        "",
        "본문:",
        "## 정리 목표",
        "- BigQuery 신호가 없는 실험은 운영 여부를 확정하고 source/backfill 또는 비활성 처리를 남긴다.",
        "- `needs_revision` 실험은 owner, 상태, 기간, 지표, readout 기준을 비워두지 않는다.",
        "- 다중 arm과 30일 중복 노출은 readout 제외 또는 해석 제한을 명시한다.",
        "- canonical ledger는 source별 dry-run 검토 후 사람 승인으로만 backfill한다.",
        "",
        "## 변경 대상",
    ]

    if not rows:
        lines.append("- 현재 정리 대상 없음")
    for row in rows:
        latest = row["latest_activity_date"] or "없음"
        units = row["observed_units"] if row["observed_units"] is not None else "없음"
        action = row.get("recommended_action") or "Product Labs에서 owner/status/source/readout 기준을 확정한다."
        lines.append(
            f"- {row['experiment_key']}: inventory={row['inventory_status']} / "
            f"status={row['product_labs_status'] or '없음'} / latest={latest} / units={units} / "
            f"정리={action}"
        )

    lines.extend(["", "## 오염 검산 대상"])
    if multi_arm:
        for row in multi_arm:
            lines.append(f"- 같은 실험 다중 arm: {row['key_a']} / {row['user_count']}명")
    else:
        lines.append("- 같은 실험 다중 arm 없음")
    if cross_overlap:
        for row in cross_overlap:
            lines.append(
                f"- 30일 중복: {row['key_a']} ↔ {row['key_b']} / {row['user_count']}명 / "
                f"{_format_rate(row['rate_a'])}·{_format_rate(row['rate_b'])} / "
                f"{row['min_day_gap']}~{row['max_day_gap']}일"
            )
    else:
        lines.append("- 30일 중복 노출 없음")

    lines.extend(["", "## canonical ledger 처리"])
    if empty_ledgers:
        for row in empty_ledgers:
            lines.append(
                f"- {row['table_name']}: 현재 0행. source 확정, dry-run, 사람 승인, 실행 후 row_count 검증 필요"
            )
    else:
        lines.append("- 빈 canonical ledger 테이블 없음")

    lines.extend(
        [
            "",
            "## 사람 실행 순서",
            "1. Product Labs PR에 위 변경 대상과 오염 검산 대상을 그대로 붙인다.",
            (
                f"2. BigQuery 신호 없음 {len(missing)}건은 운영 중이면 source/backfill을 연결하고, "
                "종료/예시 실험이면 비활성 또는 종료 상태로 정리한다."
            ),
            (
                f"3. `needs_revision` {len(revision)}건은 owner, 상태, 기간, 지표, "
                "readout date, kill criteria를 확정한다."
            ),
            f"4. 같은 실험 다중 arm {multi_arm_users}명은 분석 제외 또는 단일 arm 기준을 PR에 명시한다.",
            (
                f"5. 30일 중복 노출 {len(cross_overlap)}쌍은 readout 해석 제한과 "
                "다음 실험 제외 조건을 PR에 명시한다."
            ),
            "6. canonical ledger backfill은 아래 dry-run을 먼저 기록하고, 승인된 사람이 write를 실행한다.",
            "",
            "## dry-run 명령",
            "```bash",
            "python3 src/main.py sync-d3d8 --groups-csv <approved_flarelane_tag_export.csv> --print-sql",
            "python3 src/main.py sync-d3d8 --groups-csv <approved_flarelane_tag_export.csv> --dry-run",
            "python3 src/main.py sync-stage2 --print-sql",
            "python3 src/main.py sync-stage2",
            "```",
            "",
            "## 완료 검증",
            "```bash",
            "python3 src/main.py audit",
            (
                "python3 src/main.py check --max-missing-bigquery-signal 0 "
                "--max-product-labs-revision 0 --max-multi-arm-users 0 "
                "--max-cross-overlap-rate 3.0 --max-canonical-empty-tables 0"
            ),
            "```",
            "",
            "완료 기준: strict check가 통과하거나, 30일 중복처럼 시간이 지나야 해소되는 항목은 "
            "Product Labs PR에 readout 제외/해석 제한과 재검증일이 명시돼 있어야 한다.",
            "",
            "되돌리기: Product Labs 변경은 PR revert로 되돌리고, BigQuery write는 실행자가 source/run 단위로 "
            "삭제 기준을 남긴 뒤 별도 승인으로 되돌린다.",
        ]
    )
    return "\n".join(lines)


def render_audit_message(
    rows: list[dict[str, Any]],
    risk_rows: list[dict[str, Any]] | None = None,
    ledger_rows: list[dict[str, Any]] | None = None,
) -> str:
    """Render the daily FlareLane governance audit summary for Slack or stdout."""
    risk_rows = risk_rows or []
    ledger_rows = ledger_rows or []
    if not rows and not risk_rows and not ledger_rows:
        return "FlareLane 실험 장부 점검: 오늘 추가 조치가 필요한 누락 신호가 없습니다."

    missing, revision = _split_audit_rows(rows)
    multi_arm, cross_overlap = _split_risk_rows(risk_rows)
    multi_arm_users = sum(_as_int(r["user_count"]) for r in multi_arm)
    empty_ledgers = _empty_ledgers(ledger_rows)
    items = build_remediation_items(rows, risk_rows, ledger_rows)
    lines = [
        "FlareLane 실험 장부 점검",
        "판정: 주의 - 운영 정리가 필요합니다.",
        f"- BigQuery 신호 없음: {len(missing)}건",
        f"- Product Labs 수정필요: {len(revision)}건",
        f"- 같은 실험 다중 arm: {multi_arm_users}명",
        f"- 30일 내 실험 간 중복 노출: {len(cross_overlap)}쌍",
        f"- canonical ledger 빈 테이블: {len(empty_ledgers)}개",
        "",
    ]
    for row in rows[:12]:
        latest = row["latest_activity_date"] or "없음"
        units = row["observed_units"] if row["observed_units"] is not None else "없음"
        lines.append(
            f"- {row['experiment_key']}: {row['inventory_status']} / "
            f"status={row['product_labs_status'] or '없음'} / latest={latest} / units={units}"
        )
    if len(rows) > 12:
        lines.append(f"- 외 {len(rows) - 12}건")
    for row in multi_arm[:5]:
        lines.append(f"- 같은 실험 다중 arm: {row['key_a']} / {row['user_count']}명")
    for row in cross_overlap[:5]:
        lines.append(
            f"- {row['key_a']} ↔ {row['key_b']}: {row['user_count']}명 / "
            f"{_format_rate(row['rate_a'])}·{_format_rate(row['rate_b'])} / "
            f"{row['min_day_gap']}~{row['max_day_gap']}일"
        )
    for row in empty_ledgers:
        lines.append(f"- 빈 장부: {row['table_name']}")
    if items:
        lines.extend(["", "우선 액션"])
        for item in items[:5]:
            lines.append(f"- P{item.priority} {item.title}: {item.action}")
    return "\n".join(lines)


def evaluate_guardrail(
    audit_rows: list[dict[str, Any]],
    risk_rows: list[dict[str, Any]],
    ledger_rows: list[dict[str, Any]],
    thresholds: GuardrailThresholds,
) -> GuardrailResult:
    """Evaluate live governance risk against the configured CI baseline."""
    missing_count = sum(1 for row in audit_rows if row["inventory_status"] == "registered_without_bigquery_signal")
    revision_count = sum(1 for row in audit_rows if row["product_labs_status"] == "needs_revision")
    multi_arm_users = sum(
        _as_int(row["user_count"]) for row in risk_rows if row["metric"] == "same_user_multi_arm"
    )
    cross_rates = [
        max(_as_float(row["rate_a"]), _as_float(row["rate_b"]))
        for row in risk_rows
        if row["metric"] == "cross_experiment_overlap_30d"
    ]
    max_cross_rate = max(cross_rates) if cross_rates else 0.0
    empty_ledger_count = sum(1 for row in ledger_rows if _as_int(row["row_count"]) == 0)

    violations = []
    if missing_count > thresholds.max_missing_bigquery_signal:
        violations.append(f"BigQuery 신호 없음 {missing_count}건 > baseline {thresholds.max_missing_bigquery_signal}건")
    if revision_count > thresholds.max_product_labs_revision:
        violations.append(f"Product Labs 수정필요 {revision_count}건 > baseline {thresholds.max_product_labs_revision}건")
    if multi_arm_users > thresholds.max_multi_arm_users:
        violations.append(f"같은 실험 다중 arm {multi_arm_users}명 > baseline {thresholds.max_multi_arm_users}명")
    if max_cross_rate > thresholds.max_cross_overlap_rate:
        violations.append(f"30일 중복 노출 최대 {max_cross_rate:.2f}% > baseline {thresholds.max_cross_overlap_rate:.2f}%")
    if empty_ledger_count > thresholds.max_canonical_empty_tables:
        violations.append(f"canonical ledger 빈 테이블 {empty_ledger_count}개 > baseline {thresholds.max_canonical_empty_tables}개")

    if violations:
        return GuardrailResult(False, " / ".join(violations))
    return GuardrailResult(True, "FlareLane governance check passed")


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    return default if raw is None else int(raw)


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    return default if raw is None else float(raw)


def build_thresholds(args: argparse.Namespace) -> GuardrailThresholds:
    """Build CI guardrail thresholds from CLI args or env baselines."""
    return GuardrailThresholds(
        max_missing_bigquery_signal=(
            args.max_missing_bigquery_signal
            if args.max_missing_bigquery_signal is not None
            else _env_int("FLARELANE_MAX_MISSING_BIGQUERY_SIGNAL", 0)
        ),
        max_product_labs_revision=(
            args.max_product_labs_revision
            if args.max_product_labs_revision is not None
            else _env_int("FLARELANE_MAX_PRODUCT_LABS_REVISION", 0)
        ),
        max_multi_arm_users=(
            args.max_multi_arm_users
            if args.max_multi_arm_users is not None
            else _env_int("FLARELANE_MAX_MULTI_ARM_USERS", 0)
        ),
        max_cross_overlap_rate=(
            args.max_cross_overlap_rate
            if args.max_cross_overlap_rate is not None
            else _env_float("FLARELANE_MAX_CROSS_OVERLAP_RATE", 3.0)
        ),
        max_canonical_empty_tables=(
            args.max_canonical_empty_tables
            if args.max_canonical_empty_tables is not None
            else _env_int("FLARELANE_MAX_CANONICAL_EMPTY_TABLES", 0)
        ),
    )


def post_slack(text: str) -> None:
    """Post the audit summary to Slack when a token is configured."""
    token = os.environ.get("FLARELANE_GOVERNANCE_SLACK_TOKEN") or os.environ.get("SLACK_BOT_TOKEN")
    channel = os.environ.get("FLARELANE_GOVERNANCE_SLACK_CHANNEL") or DEFAULT_CHANNEL
    if not token:
        logger.warning("Slack token missing; message was not sent")
        print(text)
        return
    resp = requests.post(
        "https://slack.com/api/chat.postMessage",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"channel": channel, "text": text},
        timeout=20,
    )
    payload = resp.json()
    if not resp.ok or not payload.get("ok"):
        raise RuntimeError(f"Slack 발송 실패: {resp.status_code} {payload.get('error')}")


def read_groups_csv(path: Path) -> list[dict[str, str]]:
    """Read and validate the D3/D8 FlareLane tag export CSV."""
    with path.open(newline="", encoding="utf-8") as f:
        rows = [
            {"user_id": row["user_id"].strip(), "group": row["group"].strip()}
            for row in csv.DictReader(f)
            if row.get("user_id") and row.get("group")
        ]
    unknown = sorted({row["group"] for row in rows if row["group"] not in TAG_TO_EXPERIMENT})
    if unknown:
        raise SystemExit(f"알 수 없는 D3/D8 그룹: {', '.join(unknown)}")
    return rows


def d3d8_assignment_sql(groups: list[dict[str, str]]) -> str:
    """Build the idempotent assignment merge SQL for D3/D8 tag groups."""
    values = []
    for row in groups:
        experiment_key, arm, _ = TAG_TO_EXPERIMENT[row["group"]]
        try:
            user_id = int(row["user_id"])
        except ValueError as exc:
            raise SystemExit(f"D3/D8 그룹 CSV user_id가 숫자가 아닙니다: user_id={row['user_id']}, group={row['group']}") from exc
        values.append(f"STRUCT({user_id} AS user_id, '{experiment_key}' AS experiment_key, '{arm}' AS arm)")
    if not values:
        raise SystemExit("D3/D8 그룹 CSV가 비어 있습니다.")
    value_sql = ",\n    ".join(values)
    return f"""
MERGE `{PROJECT}.product.flarelane_experiment_assignments` AS target
USING (
  WITH group_rows AS (
    SELECT * FROM UNNEST([
      {value_sql}
    ])
  ),
  paid_orders AS (
    SELECT DISTINCT o.id AS order_id, o.user_id, o.created_at
    FROM `{PROJECT}.secure_dataset.order_v2` o
    JOIN `{PROJECT}.secure_dataset.order_invoice` oi ON oi.order_id = o.id
    JOIN `{PROJECT}.secure_dataset.receipt` r ON r.invoice_id = oi.invoice_id
    WHERE o.deleted_at IS NULL AND o.status != 'CANCELED' AND r.status = 'PAID' AND r.deleted_at IS NULL
  ),
  first_bag AS (
    SELECT po.user_id, MIN(po.created_at) AS first_bag_ts
    FROM paid_orders po
    JOIN `{PROJECT}.secure_dataset.order_line` ol ON ol.order_id = po.order_id AND ol.deleted_at IS NULL
    JOIN `{PROJECT}.secure_dataset.product` p ON p.id = ol.product_id
    WHERE p.product_code IN ('COVERING_BAG', 'LARGE_COVERING_BAG')
    GROUP BY po.user_id
  )
  SELECT g.user_id, g.experiment_key, g.arm, fb.first_bag_ts
  FROM group_rows g
  JOIN first_bag fb ON fb.user_id = g.user_id
) AS source
ON target.experiment_key = source.experiment_key
 AND target.user_id = source.user_id
 AND target.arm = source.arm
 AND target.source_system = 'flarelane_tag_csv'
WHEN NOT MATCHED THEN INSERT (
  experiment_key, slot_key, user_id, arm, assignment_status,
  assigned_at, eligible_at, source_system, source_run_id, loaded_at
) VALUES (
  source.experiment_key, 'post_order_retention', source.user_id, source.arm, 'tag_observed',
  source.first_bag_ts, source.first_bag_ts, 'flarelane_tag_csv', FORMAT_TIMESTAMP('%Y%m%d%H%M%S', CURRENT_TIMESTAMP()), CURRENT_TIMESTAMP()
)
"""


def d3d8_conversion_sql() -> str:
    """Build the idempotent pickup conversion merge SQL for D3/D8 assignments."""
    return f"""
MERGE `{PROJECT}.product.flarelane_experiment_conversions` AS target
USING (
  WITH paid_orders AS (
    SELECT DISTINCT o.id AS order_id, o.user_id, o.created_at, r.total_amount
    FROM `{PROJECT}.secure_dataset.order_v2` o
    JOIN `{PROJECT}.secure_dataset.order_invoice` oi ON oi.order_id = o.id
    JOIN `{PROJECT}.secure_dataset.receipt` r ON r.invoice_id = oi.invoice_id
    WHERE o.deleted_at IS NULL AND o.status != 'CANCELED' AND r.status = 'PAID' AND r.deleted_at IS NULL
  ),
  pickup_orders AS (
    SELECT po.user_id, po.order_id, po.created_at, po.total_amount
    FROM paid_orders po
    JOIN `{PROJECT}.secure_dataset.order_line` ol ON ol.order_id = po.order_id AND ol.deleted_at IS NULL
    JOIN `{PROJECT}.secure_dataset.product` p ON p.id = ol.product_id
    WHERE p.product_type = 'SERVICE'
  )
  SELECT
    a.experiment_key,
    a.user_id,
    'pickup_order_after_tag_assignment' AS conversion_type,
    MIN(p.created_at) AS conversion_at,
    IF(a.experiment_key = 'd3_crm_ab_test_v3', 14, 21) AS conversion_window_days,
    ARRAY_AGG(p.order_id ORDER BY p.created_at LIMIT 1)[OFFSET(0)] AS order_id,
    CAST(NULL AS STRING) AS subscription_id,
    CAST(NULL AS STRING) AS referral_id,
    CAST(ARRAY_AGG(p.total_amount ORDER BY p.created_at LIMIT 1)[OFFSET(0)] AS NUMERIC) AS gross_value,
    CAST(ARRAY_AGG(p.total_amount ORDER BY p.created_at LIMIT 1)[OFFSET(0)] AS NUMERIC) AS net_value
  FROM `{PROJECT}.product.flarelane_experiment_assignments` a
  JOIN pickup_orders p ON p.user_id = a.user_id AND p.created_at >= a.assigned_at
  WHERE a.experiment_key IN ('d3_crm_ab_test_v3', 'd8_crm_ab_test_v3')
    AND a.source_system = 'flarelane_tag_csv'
    AND p.created_at < TIMESTAMP_ADD(a.assigned_at, INTERVAL IF(a.experiment_key = 'd3_crm_ab_test_v3', 14, 21) DAY)
  GROUP BY a.experiment_key, a.user_id
) AS source
ON target.experiment_key = source.experiment_key
 AND target.user_id = source.user_id
 AND target.conversion_type = source.conversion_type
WHEN NOT MATCHED THEN INSERT (
  experiment_key, user_id, conversion_type, conversion_at, conversion_window_days,
  order_id, subscription_id, referral_id, gross_value, net_value, source_system, loaded_at
) VALUES (
  source.experiment_key, source.user_id, source.conversion_type, source.conversion_at, source.conversion_window_days,
  source.order_id, source.subscription_id, source.referral_id, source.gross_value, source.net_value,
  'flarelane_tag_csv', CURRENT_TIMESTAMP()
)
"""


def stage2_sql() -> str:
    """Return a guarded Stage2 status query until a user-level source exists."""
    return """
SELECT 'eng_2144_stage2_reward_coupon' AS experiment_key,
       'no_bigquery_source_registered' AS sync_status,
       'Stage2 console automation is live, but no source table with Stage2 user-level exposure exists yet.' AS reason
"""


def run_dry_run(sql: str) -> int:
    """Dry-run a BigQuery statement and return scanned bytes."""
    job_config = bigquery.QueryJobConfig(dry_run=True, use_query_cache=False)
    job = bigquery_client().query(sql, job_config=job_config)
    logger.info("dry-run bytes: %s", job.total_bytes_processed)
    return int(job.total_bytes_processed or 0)


def main() -> int:
    """Run the selected audit or sync helper command."""
    parser = argparse.ArgumentParser(description="FlareLane governance audit and sync helpers")
    sub = parser.add_subparsers(dest="command", required=True)
    audit = sub.add_parser("audit")
    audit.add_argument("--send-slack", action="store_true")
    check = sub.add_parser("check")
    check.add_argument("--max-missing-bigquery-signal", type=int)
    check.add_argument("--max-product-labs-revision", type=int)
    check.add_argument("--max-multi-arm-users", type=int)
    check.add_argument("--max-cross-overlap-rate", type=float)
    check.add_argument("--max-canonical-empty-tables", type=int)
    check.add_argument("--warn-only", action="store_true")
    sub.add_parser("remediation")
    product_labs_pr = sub.add_parser("product-labs-pr")
    product_labs_pr.add_argument("--include-current-cleanup", action="store_true")
    sub.add_parser("cleanup-pack")
    d3d8 = sub.add_parser("sync-d3d8")
    d3d8.add_argument("--groups-csv", type=Path, required=True)
    d3d8.add_argument("--print-sql", action="store_true")
    d3d8.add_argument("--dry-run", action="store_true")
    stage2 = sub.add_parser("sync-stage2")
    stage2.add_argument("--print-sql", action="store_true")
    args = parser.parse_args()

    started = time.time()
    logger.info("시작: %s", args.command)
    if args.command == "audit":
        rows = query_rows(AUDIT_SQL)
        risk_rows = query_rows(GOVERNANCE_RISK_SQL)
        ledger_rows = query_rows(CANONICAL_LEDGER_SQL)
        missing_count = sum(1 for row in rows if row["inventory_status"] == "registered_without_bigquery_signal")
        revision_count = sum(1 for row in rows if row["product_labs_status"] == "needs_revision")
        logger.info(
            "audit result: rows=%d missing=%d revision=%d risk_rows=%d ledger_rows=%d",
            len(rows),
            missing_count,
            revision_count,
            len(risk_rows),
            len(ledger_rows),
        )
        text = render_audit_message(rows, risk_rows=risk_rows, ledger_rows=ledger_rows)
        post_slack(text) if args.send_slack else print(text)
    elif args.command == "check":
        rows = query_rows(AUDIT_SQL)
        risk_rows = query_rows(GOVERNANCE_RISK_SQL)
        ledger_rows = query_rows(CANONICAL_LEDGER_SQL)
        text = render_audit_message(rows, risk_rows=risk_rows, ledger_rows=ledger_rows)
        print(text)
        result = evaluate_guardrail(rows, risk_rows, ledger_rows, build_thresholds(args))
        if result.ok:
            logger.info(result.message)
        else:
            logger.error(result.message)
            if not args.warn_only:
                return 1
    elif args.command == "remediation":
        rows = query_rows(AUDIT_SQL)
        risk_rows = query_rows(GOVERNANCE_RISK_SQL)
        ledger_rows = query_rows(CANONICAL_LEDGER_SQL)
        print(render_remediation_report(rows, risk_rows=risk_rows, ledger_rows=ledger_rows))
    elif args.command == "product-labs-pr":
        if args.include_current_cleanup:
            logger.info("product-labs-pr cleanup context query start")
            rows = query_rows(AUDIT_SQL)
            risk_rows = query_rows(GOVERNANCE_RISK_SQL)
            ledger_rows = query_rows(CANONICAL_LEDGER_SQL)
            logger.info(
                "product-labs-pr cleanup context: rows=%d risk_rows=%d ledger_rows=%d",
                len(rows),
                len(risk_rows),
                len(ledger_rows),
            )
            print(render_product_labs_pr_template(rows, risk_rows=risk_rows, ledger_rows=ledger_rows))
        else:
            logger.info("product-labs-pr template only: no BigQuery cleanup context requested")
            print(render_product_labs_pr_template())
    elif args.command == "cleanup-pack":
        logger.info("cleanup-pack context query start")
        rows = query_rows(AUDIT_SQL)
        risk_rows = query_rows(GOVERNANCE_RISK_SQL)
        ledger_rows = query_rows(CANONICAL_LEDGER_SQL)
        logger.info(
            "cleanup-pack context: rows=%d risk_rows=%d ledger_rows=%d",
            len(rows),
            len(risk_rows),
            len(ledger_rows),
        )
        print(render_cleanup_execution_pack(rows, risk_rows=risk_rows, ledger_rows=ledger_rows))
    elif args.command == "sync-d3d8":
        groups = read_groups_csv(args.groups_csv)
        sql = d3d8_assignment_sql(groups) + ";\n" + d3d8_conversion_sql()
        if args.print_sql:
            print(sql)
        dry_run_bytes = 0
        if args.dry_run:
            dry_run_bytes = run_dry_run(sql)
        logger.info("sync-d3d8 result: groups=%d statements=2 sql_chars=%d dry_run_bytes=%d", len(groups), len(sql), dry_run_bytes)
    elif args.command == "sync-stage2":
        sql = stage2_sql()
        dry_run_bytes = 0
        if args.print_sql:
            print(sql)
        else:
            dry_run_bytes = run_dry_run(sql)
        logger.info("sync-stage2 result: statements=1 sql_chars=%d dry_run_bytes=%d", len(sql), dry_run_bytes)
    logger.info("완료 : %.1f초", time.time() - started)
    return 0


if __name__ == "__main__":
    sys.exit(main())
