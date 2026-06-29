"""[ENG-3199] 대형폐기물 크로스셀 일일 KPI 리포트 — 매일 KST 09:00 cron.

ledger 단일 테이블 집계 → Slack 발송. 발사 책임은 largewaste-crosssell-coupon-sync 가
담당하므로 본 앱은 read-only 분석만 수행.
"""

import argparse
import logging
import os
import time
from datetime import datetime, timedelta, timezone

import google.auth
from google.cloud import bigquery

LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "logs")
os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(os.path.join(LOG_DIR, "batch.log"), encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)


KST = timezone(timedelta(hours=9))


def _pct(num: int, den: int) -> str:
    if den == 0:
        return "—"
    return f"{(num / den) * 100:.1f}%"


def _format_report(summary: dict, conversions: list[dict]) -> str:
    yesterday_kst = (datetime.now(KST) - timedelta(days=1)).strftime("%Y-%m-%d")
    cum_e = summary["cum_eligible"]
    cum_d = summary["cum_disqualified_total"]

    lines = [
        f":bar_chart: *[ENG-3199] 대형폐기물 크로스셀 — 일일 리포트* ({yesterday_kst} KST 기준)",
        "",
        "*어제 신규*",
        f"• 진입: {summary['yesterday_eligible']:,}명 (쿠폰 발급 {summary['yesterday_eligible']:,}건)",
        f"• 자격 해제: {summary['yesterday_disqualified_total']:,}명",
        f"   - 쿠폰 사용: {summary['yesterday_coupon_used']:,}",
        f"   - 대형폐기물 신청 (쿠폰 미사용): {summary['yesterday_largewaste_submitted']:,}",
        "",
        "*누적 (실험 시작 이후)*",
        f"• 진입: {cum_e:,}명",
        f"• 자격 해제: {cum_d:,}명 ({_pct(cum_d, cum_e)})",
        f"   - 쿠폰 사용: {summary['cum_coupon_used']:,}",
        f"   - 대형폐기물 신청: {summary['cum_largewaste_submitted']:,}",
        "",
        "*회차별 전환율 (진입 후 경과 시간, 윈도우 이상 경과 모수)*",
    ]
    for c in conversions:
        lines.append(
            f"• {c['label']} ({c['lower']}h ~ {c['upper']}h): "
            f"{_pct(c['numerator'], c['denominator'])} ({c['numerator']:,}/{c['denominator']:,})"
        )
    return "\n".join(lines)


def main(dry_run: bool = False):
    started_at = time.time()
    logger.info(f"시작{' (dry-run)' if dry_run else ''}")

    from config import GCP_PROJECT, CONVERSION_WINDOWS_HOURS
    from queries import query_daily_summary, query_conversions

    credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    bq = bigquery.Client(project=GCP_PROJECT, credentials=credentials)

    summary = query_daily_summary(bq)
    logger.info(f"요약 집계: {summary}")

    conversions = query_conversions(bq, CONVERSION_WINDOWS_HOURS)
    logger.info(f"회차별 전환: {conversions}")

    report_text = _format_report(summary, conversions)
    logger.info("리포트 생성 완료")

    if dry_run:
        logger.info(f"[dry-run] 발송 스킵. 본문:\n{report_text}")
    else:
        from slack import post_report
        ok = post_report(report_text)
        logger.info(f"Slack 발송 결과: {'ok' if ok else 'failed'}")

    elapsed = time.time() - started_at
    logger.info(f"완료 : {elapsed:.1f}초")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="[ENG-3199] 대형폐기물 크로스셀 일일 KPI 리포트")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Slack 발송 스킵, 본문만 로그.",
    )
    args = parser.parse_args()
    main(dry_run=args.dry_run)
