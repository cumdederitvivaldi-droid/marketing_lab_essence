"""주간 LLM 클러스터링 — 최근 N일치 voc_items를 카테고리별로 그룹핑."""
import json
import logging
import os
import sqlite3
import time
from datetime import datetime, timedelta, timezone

import google.generativeai as genai

from config import CATEGORIES, DB_PATH, _load_env_file

KST = timezone(timedelta(hours=9))
BATCH = 150  # Gemini 입력 한 번에 최대 건수
CLUSTER_CATEGORIES = [c for c in CATEGORIES if c != "기타"]


def _load_items(conn: sqlite3.Connection, cat: str, cutoff: str) -> list:
    return conn.execute(
        """
        SELECT i.id, i.quote, m.permalink, i.severity
        FROM voc_items i
        JOIN voc_messages m ON i.slack_ts = m.slack_ts
        WHERE m.posted_at >= ?
          AND i.category = ?
          AND i.severity IN ('critical', 'high')
          AND LENGTH(TRIM(i.quote)) >= 15
        ORDER BY m.posted_at DESC
        """,
        (cutoff, cat),
    ).fetchall()


def _cluster_batch(cat: str, batch: list) -> list:
    prompt = (
        f"당신은 VOC 분석가다. 아래는 커버링 앱 '{cat}' 영역의 실제 고객 피드백 {len(batch)}건이다.\n"
        "각 줄: [ID|severity] 본문\n\n"
        "지시:\n"
        "1. 의미적으로 반복되는 같은 세부 문제를 그룹핑\n"
        "2. 5~10개 그룹 (너무 뭉치지 말 것)\n"
        "3. 각 그룹: name(15자 이내, 구체적), desc(한 줄), ids(포함 ID 전부)\n"
        '4. JSON만 출력: {"groups":[{"name":"...","desc":"...","ids":[1,2]}]}\n\n'
        "데이터:\n" + "\n".join(batch)
    )
    model = genai.GenerativeModel(
        "gemini-2.5-flash",
        generation_config={"response_mime_type": "application/json"},
    )
    resp = model.generate_content(prompt)
    try:
        return json.loads(resp.text).get("groups", [])
    except (json.JSONDecodeError, AttributeError) as e:
        logging.warning(f"[{cat}] LLM 응답 파싱 실패: {e} | raw={resp.text[:200]}")
        return []


def _merge_clusters(cat: str, raw_groups: list) -> list:
    if len(raw_groups) <= 8:
        return raw_groups
    summary = [
        f'{i}. "{g["name"]}" ({len(g["ids"])}건) — {g.get("desc", "")[:80]}'
        for i, g in enumerate(raw_groups)
    ]
    prompt = (
        f"'{cat}' 영역 VOC 그룹 {len(raw_groups)}개를 6~8개로 병합하라.\n\n"
        "원본 그룹:\n" + "\n".join(summary) + "\n\n"
        "지시:\n"
        "1. 의미적으로 같은/비슷한 그룹을 묶는다\n"
        "2. 최종 6~8개 그룹으로 축약\n"
        "3. 각 최종 그룹: name(구체적 15자), 포함할 원본 인덱스 리스트\n"
        '4. JSON만: {"merged":[{"name":"...","desc":"한줄","from_indices":[0,3,5]}]}'
    )
    model = genai.GenerativeModel(
        "gemini-2.5-flash",
        generation_config={"response_mime_type": "application/json"},
    )
    resp = model.generate_content(prompt)
    try:
        merged_plan = json.loads(resp.text).get("merged", [])
    except (json.JSONDecodeError, AttributeError):
        return raw_groups  # 병합 실패 시 원본 반환
    final = []
    for m in merged_plan:
        all_ids: list[int] = []
        for idx in m["from_indices"]:
            if 0 <= idx < len(raw_groups):
                all_ids.extend(raw_groups[idx]["ids"])
        final.append(
            {"name": m["name"], "desc": m.get("desc", ""), "ids": list(set(all_ids))}
        )
    return final


def _run_category(conn: sqlite3.Connection, cat: str, cutoff: str) -> list:
    rows = _load_items(conn, cat, cutoff)
    if not rows:
        return []
    logging.info(f"[{cat}] 주간 클러스터링 시작: {len(rows)}건")
    items_for_prompt = [
        f"[{r[0]}|{r[3]}] {r[1][:200]}" for r in rows
    ]
    raw: list = []
    error_count = 0
    for start in range(0, len(items_for_prompt), BATCH):
        batch = items_for_prompt[start : start + BATCH]
        try:
            groups = _cluster_batch(cat, batch)
            raw.extend(groups)
            time.sleep(1)
        except Exception as e:
            error_count += 1
            logging.exception(f"[{cat}] 주간 클러스터링 배치 오류: {e}")
    if error_count:
        logging.warning(f"[{cat}] 주간 클러스터링 완료: 처리={len(rows)}건, 오류={error_count}건")
    else:
        logging.info(f"[{cat}] 주간 클러스터링 완료: 처리={len(rows)}건, 오류=0건")
    return _merge_clusters(cat, raw)


def run(lookback_days: int = 7) -> dict:
    """최근 lookback_days일치 voc_items를 LLM으로 카테고리별 클러스터링.

    Returns:
        dict[category, list[{name, desc, ids}]]
    """
    _load_env_file()
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY 없음")
    genai.configure(api_key=api_key)

    cutoff = (datetime.now(KST) - timedelta(days=lookback_days)).isoformat()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    result: dict = {}
    try:
        for cat in CLUSTER_CATEGORIES:
            groups = _run_category(conn, cat, cutoff)
            if groups:
                result[cat] = groups
    finally:
        conn.close()
    return result
