#!/usr/bin/env python3
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

from artifact_store import build_artifact_paths, upload_artifacts, write_artifacts
from region_parser import build_blocks, build_rows, extract_chunks, fetch_html, load_region_map, source_hash
from settings import (
    DEFAULT_BUCKET,
    DEFAULT_GSUTIL_BIN,
    DEFAULT_PREFIX,
    DEFAULT_SOURCE_URL,
    DEFAULT_USER_AGENT,
    OUTPUT_DIR,
    REGION_MAP_PATH,
    env,
)


KST = timezone(timedelta(hours=9))


def build_summary(
    blocks: list[dict[str, object]],
    rows: list[dict[str, object]],
    collected_at_kst: datetime,
    source_url: str,
    source_sha256: str,
) -> dict[str, object]:
    block_counter = Counter(str(block["coverage_type"]) for block in blocks)
    row_counter = Counter(str(row["coverage_type"]) for row in rows)
    return {
        "snapshot_date": collected_at_kst.strftime("%Y-%m-%d"),
        "collected_at_kst": collected_at_kst.isoformat(),
        "competitor_key": "today_sugeo",
        "competitor_name": "오늘수거",
        "source_url": source_url,
        "source_hash": source_sha256,
        "block_count": len(blocks),
        "row_count": len(rows),
        "block_count_by_type": dict(block_counter),
        "row_count_by_type": dict(row_counter),
        "city_count": len({str(block["city_name"]) for block in blocks}),
        "region_count": len({str(row["sgg_code"]) for row in rows}),
        "cities": sorted({str(block["city_name"]) for block in blocks}),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="업로드 없이 로컬 산출물만 생성")
    parser.add_argument("--skip-upload", action="store_true", help="Cloud Storage 업로드 생략")
    parser.add_argument("--output-dir", default=str(OUTPUT_DIR), help="로컬 산출물 저장 경로")
    return parser.parse_args()


def validate_summary(summary: dict[str, object]) -> None:
    if int(summary["block_count"]) <= 0 or int(summary["row_count"]) <= 0:
        raise ValueError(
            "오늘수거 서비스 지역을 파싱하지 못했습니다. 빈 latest 산출물 업로드를 막기 위해 실행을 중단합니다."
        )


def main() -> int:
    args = parse_args()
    source_url = env("TODAY_SUGEO_SOURCE_URL", DEFAULT_SOURCE_URL)
    user_agent = env("TODAY_SUGEO_USER_AGENT", DEFAULT_USER_AGENT)
    bucket = env("TODAY_SUGEO_BUCKET", DEFAULT_BUCKET)
    prefix = env("TODAY_SUGEO_PREFIX", DEFAULT_PREFIX)
    gsutil_bin = env("TODAY_SUGEO_GSUTIL_BIN", DEFAULT_GSUTIL_BIN)

    collected_at_kst = datetime.now(KST)
    html = fetch_html(source_url, user_agent)
    chunks = extract_chunks(html)
    blocks = build_blocks(chunks)
    rows = build_rows(
        blocks=blocks,
        region_map=load_region_map(REGION_MAP_PATH),
        snapshot_date=collected_at_kst.strftime("%Y-%m-%d"),
        collected_at_kst=collected_at_kst,
        source_url=source_url,
        source_sha256=source_hash(html),
    )
    summary = build_summary(blocks, rows, collected_at_kst, source_url, source_hash(html))
    validate_summary(summary)
    snapshot_time = collected_at_kst.strftime("%H%M%S")
    output_root = Path(args.output_dir).resolve()
    paths = build_artifact_paths(output_root, summary["snapshot_date"], snapshot_time)
    write_artifacts(paths, summary, rows, blocks)

    print(f"[today-sugeo-region-sync] 블록 {summary['block_count']}개 / 시군구 행 {summary['row_count']}개")
    print(f"[today-sugeo-region-sync] 도시 {summary['city_count']}개 / 시군구 {summary['region_count']}개")
    print(f"[today-sugeo-region-sync] latest 산출물: {paths['latest']['summary'].parent}")

    if args.dry_run or args.skip_upload:
        print("[today-sugeo-region-sync] Cloud Storage 업로드 생략")
        return 0

    uploaded = upload_artifacts(
        gsutil_bin=gsutil_bin,
        bucket=bucket,
        prefix=prefix,
        snapshot_date=str(summary["snapshot_date"]),
        snapshot_time=snapshot_time,
        paths=paths,
    )
    print("[today-sugeo-region-sync] 업로드 완료")
    for uri in uploaded:
        print(f"  - {uri}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
