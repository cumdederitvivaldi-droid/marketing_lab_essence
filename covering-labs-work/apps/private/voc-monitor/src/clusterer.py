"""신규 voc_items를 임베딩 유사도로 기존 테마에 병합하거나 신규 테마 생성."""
import hashlib
import json
import logging
import math
import os
from datetime import datetime, timezone
from typing import List, Optional

import google.generativeai as genai
from dotenv import load_dotenv

from config import EMBEDDING_SIMILARITY_THRESHOLD
from storage import get_all_themes, get_unthemed_items, update_item_theme, upsert_theme

load_dotenv()

LENS_MAP = {
    "가격": "단위경제학",
    "품목": "시장",
    "수거품질": "운영레버리지",
    "결제오류": "운영레버리지",
    "지역확장": "시장",
    "앱버그": "리텐션",
    "문의": "조직역량",
    "기타": "리텐션",
}


def _configure():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY 없음")
    genai.configure(api_key=api_key)


def _get_embedding(text: str) -> Optional[List[float]]:
    try:
        result = genai.embed_content(
            model="models/gemini-embedding-001",
            content=text,
            task_type="CLUSTERING",
        )
        return result["embedding"]
    except Exception as e:
        logging.error(f"임베딩 생성 실패: {e}")
        return None


def _cosine_similarity(v1: list[float], v2: list[float]) -> float:
    if len(v1) != len(v2):
        logging.warning(f"임베딩 길이 불일치: {len(v1)} != {len(v2)}")
        return 0.0
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return dot / (norm1 * norm2)


def _generate_title(quote: str) -> str:
    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        resp = model.generate_content(
            f"다음 고객 피드백을 20자 이내 한 줄 제목으로 요약. 제목만 출력:\n\"{quote}\""
        )
        return resp.text.strip().strip('"')
    except Exception as e:
        logging.error(f"제목 생성 실패: {e}")
        return quote[:20]


def cluster_new_items() -> int:
    """theme_id 미배정 voc_items를 클러스터링. Returns: 처리 건수."""
    _configure()

    items = get_unthemed_items()
    if not items:
        logging.info("클러스터링할 항목 없음")
        return 0

    logging.info(f"클러스터링 대상 {len(items)}건")

    themes = get_all_themes()
    # 임베딩 벡터 파싱 (메모리 캐시)
    for t in themes:
        try:
            t["_vec"] = json.loads(t["embedding_json"]) if t.get("embedding_json") else None
        except (json.JSONDecodeError, TypeError):
            t["_vec"] = None

    now_iso = datetime.now(timezone.utc).isoformat()
    processed = 0

    for item in items:
        quote = item.get("quote") or item.get("raw_text", "")[:200]
        if not quote:
            continue

        vec = _get_embedding(quote)
        if vec is None:
            continue

        # 기존 테마와 유사도 비교
        best_theme = None
        best_sim = -1.0
        for t in themes:
            if t.get("_vec"):
                sim = _cosine_similarity(vec, t["_vec"])
                if sim > best_sim:
                    best_sim = sim
                    best_theme = t

        if best_theme and best_sim >= EMBEDDING_SIMILARITY_THRESHOLD:
            # 기존 테마 병합
            best_theme["total_count"] = best_theme.get("total_count", 0) + 1
            best_theme["last_seen_at"] = item.get("posted_at", now_iso)
            payload = {k: v for k, v in best_theme.items() if not k.startswith("_")}
            upsert_theme(payload)
            update_item_theme(item["id"], best_theme["id"])
            logging.info(f"아이템 {item['id']} → 테마 '{best_theme['title']}' (유사도 {best_sim:.3f})")
        else:
            # 신규 테마 생성
            posted_at = item.get("posted_at", now_iso)
            title = _generate_title(quote)
            theme_key = "|".join([
                quote,
                str(item.get("slack_ts", "")),
                str(item.get("posted_at", "")),
                str(item.get("category", "")),
            ])
            theme_id = hashlib.sha256(theme_key.encode()).hexdigest()[:16]

            new_theme = {
                "id": theme_id,
                "title": title,
                "problem_statement": "",
                "first_seen_at": posted_at,
                "last_seen_at": posted_at,
                "total_count": 1,
                "rice_reach": 0,
                "rice_impact": 1.0,
                "rice_confidence": 0.5,
                "rice_effort": 1.0,
                "rice_score": 0.0,
                "lens": LENS_MAP.get(item.get("category"), "리텐션"),
                "status": "발견",
                "embedding_json": json.dumps(vec),
            }
            upsert_theme(new_theme)
            update_item_theme(item["id"], theme_id)
            new_theme["_vec"] = vec
            themes.append(new_theme)
            logging.info(f"아이템 {item['id']} → 신규 테마 '{title}' 생성")

        processed += 1

    logging.info(f"클러스터링 완료 {processed}건")
    return processed


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    cluster_new_items()
