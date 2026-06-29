from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup


SECTION_TITLE = "서비스 지역 안내"
SECTION_END_MARKERS = {"자주 묻는 질문", "Q. 이용 금액이 얼마인가요?"}
IGNORE_TOKENS = {
    SECTION_TITLE,
    "주말 · 공휴일에도 매일 이용 가능",
    "주말·공휴일에도",
    "매일 이용 가능",
    "일부 지역에서는 아직 이용이 어려우나,",
    "수도권부터 서비스 지역을 빠르게 확장하고 있습니다.",
}
CITY_PATTERN = re.compile(r"^[가-힣]+시$")
CITY_WITH_DONGS_PATTERN = re.compile(r"^([가-힣]+시)\s+(.+)$")
DISTRICT_LINE_PATTERN = re.compile(r"^([가-힣]+[구군])\s*:\s*(.*)$")


def normalize_text(text: str) -> str:
    cleaned = text.replace("\u200b", "").replace("\u200d", "").replace("\xa0", " ")
    cleaned = re.sub(r"\s*:\s*", ": ", cleaned)
    cleaned = re.sub(r":\s*$", ":", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def split_embedded_tokens(token: str) -> list[str]:
    exploded = re.sub(r"\s+([가-힣]+[구군]\s*:)", r"\n\1", token)
    return [normalize_text(part) for part in exploded.splitlines() if normalize_text(part)]


def fetch_html(source_url: str, user_agent: str, timeout: int = 30) -> str:
    request = Request(source_url, headers={"User-Agent": user_agent})
    with urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8")


def source_hash(html: str) -> str:
    return hashlib.sha256(html.encode("utf-8")).hexdigest()


def extract_chunks(html: str) -> list[list[str]]:
    soup = BeautifulSoup(html, "html.parser")
    tokens = [normalize_text(token) for token in soup.stripped_strings]
    chunks: list[list[str]] = []
    starts = [index for index, token in enumerate(tokens) if token == SECTION_TITLE]
    for start in starts:
        chunk: list[str] = []
        for token in tokens[start:]:
            if token in SECTION_END_MARKERS:
                break
            if token:
                chunk.extend(split_embedded_tokens(token))
        if chunk:
            chunks.append(chunk)
    return chunks


def build_blocks(chunks: list[list[str]]) -> list[dict[str, object]]:
    blocks: list[dict[str, object]] = []
    seen: set[tuple[object, ...]] = set()
    for chunk in chunks:
        current_city: str | None = None
        current_district: str | None = None
        index = 0
        while index < len(chunk):
            token = chunk[index]
            index += 1
            if not token or token in IGNORE_TOKENS:
                continue

            if "전 지역 가능" in token:
                city_text = normalize_text(token.replace("전 지역 가능", "").strip(" ,"))
                cities = [city.strip() for city in city_text.split(",") if city.strip()]
                for city in cities:
                    key = ("full_city", city)
                    if key in seen:
                        continue
                    seen.add(key)
                    blocks.append(
                        {
                            "coverage_type": "full_city",
                            "city_name": city,
                            "district_name": None,
                            "dong_names": [],
                            "raw_text": f"{city} 전 지역 가능",
                        }
                    )
                current_city = None
                current_district = None
                continue

            if index < len(chunk) and chunk[index] == "전 지역 가능":
                cities = [city.strip() for city in token.split(",") if city.strip()]
                index += 1
                for city in cities:
                    key = ("full_city", city)
                    if key in seen:
                        continue
                    seen.add(key)
                    blocks.append(
                        {
                            "coverage_type": "full_city",
                            "city_name": city,
                            "district_name": None,
                            "dong_names": [],
                            "raw_text": f"{city} 전 지역 가능",
                        }
                    )
                current_city = None
                current_district = None
                continue

            if CITY_PATTERN.fullmatch(token):
                current_city = token
                current_district = None
                continue

            city_with_dongs_match = CITY_WITH_DONGS_PATTERN.match(token)
            if city_with_dongs_match:
                current_city = city_with_dongs_match.group(1).strip()
                current_district = None
                token = city_with_dongs_match.group(2).strip()

            district_match = DISTRICT_LINE_PATTERN.match(token)
            if district_match:
                current_district = district_match.group(1).strip()
                remainder = district_match.group(2).strip()
                if not remainder:
                    continue
                token = remainder

            if not current_city:
                continue

            dong_names = [part.strip() for part in token.split(",") if part.strip()]
            key = ("partial_dong", current_city, current_district or current_city, tuple(dong_names))
            if key in seen:
                continue
            seen.add(key)
            blocks.append(
                {
                    "coverage_type": "partial_dong",
                    "city_name": current_city,
                    "district_name": current_district,
                    "dong_names": dong_names,
                    "raw_text": token,
                }
            )
    return blocks


def load_region_map(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def build_rows(
    blocks: list[dict[str, object]],
    region_map: dict[str, object],
    snapshot_date: str,
    collected_at_kst: datetime,
    source_url: str,
    source_sha256: str,
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    unmapped: list[str] = []
    for block in blocks:
        coverage_type = str(block["coverage_type"])
        city_name = str(block["city_name"])
        district_name = block["district_name"]
        mappings: list[dict[str, str]] = []

        if coverage_type == "full_city":
            mappings = list(region_map["full_city"].get(city_name, []))
        else:
            city_map = dict(region_map["partial"].get(city_name, {}))
            if district_name:
                mapping = city_map.get(str(district_name))
            else:
                mapping = city_map.get("__self__")
            if mapping:
                mappings = [mapping]

        if not mappings:
            unmapped.append(f"{city_name} {district_name or ''}".strip())
            continue

        dong_names = list(block["dong_names"])
        for mapping in mappings:
            rows.append(
                {
                    "snapshot_date": snapshot_date,
                    "collected_at_kst": collected_at_kst.isoformat(),
                    "competitor_key": "today_sugeo",
                    "competitor_name": "오늘수거",
                    "source_url": source_url,
                    "source_hash": source_sha256,
                    "city_name": city_name,
                    "district_name": mapping["district_name"],
                    "region_label": mapping["region_label"],
                    "sgg_code": mapping["sgg_code"],
                    "coverage_type": coverage_type,
                    "dong_count": len(dong_names),
                    "dong_names": ", ".join(dong_names),
                    "raw_text": str(block["raw_text"]),
                }
            )

    if unmapped:
        unmapped_list = ", ".join(sorted(set(unmapped)))
        raise ValueError(f"시군구 코드 매핑이 없는 오늘수거 권역이 있습니다: {unmapped_list}")

    return sorted(rows, key=lambda row: (str(row["sgg_code"]), str(row["coverage_type"])))
