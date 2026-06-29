from __future__ import annotations

import csv
import json
import subprocess
from pathlib import Path


ARTIFACT_FILENAMES = {
    "summary": "today_sugeo_summary.json",
    "rows_json": "today_sugeo_regions.json",
    "rows_csv": "today_sugeo_regions.csv",
    "blocks_json": "today_sugeo_blocks.json",
}


def build_artifact_paths(output_root: Path, snapshot_date: str, snapshot_time: str) -> dict[str, dict[str, Path]]:
    latest_dir = output_root / "latest"
    snapshot_dir = output_root / "snapshots" / snapshot_date / snapshot_time
    latest_dir.mkdir(parents=True, exist_ok=True)
    snapshot_dir.mkdir(parents=True, exist_ok=True)
    return {
        "latest": {key: latest_dir / name for key, name in ARTIFACT_FILENAMES.items()},
        "snapshot": {key: snapshot_dir / name for key, name in ARTIFACT_FILENAMES.items()},
    }


def write_artifacts(
    paths: dict[str, dict[str, Path]],
    summary: dict[str, object],
    rows: list[dict[str, object]],
    blocks: list[dict[str, object]],
) -> None:
    for group in ("latest", "snapshot"):
        write_json(paths[group]["summary"], summary)
        write_json(paths[group]["rows_json"], rows)
        write_json(paths[group]["blocks_json"], blocks)
        write_csv(paths[group]["rows_csv"], rows)


def write_json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    fieldnames = [
        "snapshot_date",
        "collected_at_kst",
        "competitor_key",
        "competitor_name",
        "source_url",
        "source_hash",
        "city_name",
        "district_name",
        "region_label",
        "sgg_code",
        "coverage_type",
        "dong_count",
        "dong_names",
        "raw_text",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def upload_artifacts(
    gsutil_bin: str,
    bucket: str,
    prefix: str,
    snapshot_date: str,
    snapshot_time: str,
    paths: dict[str, dict[str, Path]],
) -> list[str]:
    uploaded: list[str] = []
    targets = {
        "latest": f"gs://{bucket}/{prefix.rstrip('/')}/latest",
        "snapshot": f"gs://{bucket}/{prefix.rstrip('/')}/snapshots/{snapshot_date}/{snapshot_time}",
    }
    for group, base_uri in targets.items():
        for path in paths[group].values():
            destination = f"{base_uri}/{path.name}"
            subprocess.run([gsutil_bin, "cp", str(path), destination], check=True)
            uploaded.append(destination)
    return uploaded
