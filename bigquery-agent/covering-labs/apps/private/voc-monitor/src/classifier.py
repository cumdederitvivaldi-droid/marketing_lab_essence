"""미분류 VOC 메시지를 Gemini로 배치 분류해서 voc_items에 저장."""
import json
import logging
import os
import random
import time

import google.generativeai as genai
from dotenv import load_dotenv
from google.generativeai.types import GenerationConfig

from config import BATCH_SIZE, MAX_CLASSIFY_PER_RUN
from storage import get_unclassified_messages, insert_items

load_dotenv()

SYSTEM_PROMPT = "당신은 커버링 앱(폐기물 수거 서비스) PO를 돕는 VOC 분류관이다."

USER_PROMPT_TEMPLATE = """
아래 고객 피드백 메시지 목록을 분류하라. 각 메시지에 대해 다음 JSON 객체를 출력하라:
- category: "가격"|"품목"|"수거품질"|"결제오류"|"지역확장"|"앱버그"|"문의"|"기타"
- severity: "critical"|"high"|"mid"|"low"  (critical = 결제실패/수거미집행 등 즉각 대응 필요)
- sentiment: "anger"|"frustration"|"request"|"praise"
- theme_keywords: 문제 주제 한글 키워드 3~5개 배열
- quote: 원문 핵심 1~2줄
- impact_score: 1|2|3  (3=매출/해지 직결, 2=만족도 저하, 1=사소)
- effort_hint: 1|2|3  (3=개발·운영 대공사, 2=기능 단위 수정, 1=FAQ/카피 수준)

입력: slack_ts와 text를 포함하는 JSON 배열
출력: 반드시 입력의 slack_ts를 포함해서 위 7개 필드를 추가한 JSON 객체 배열. 다른 설명 절대 추가 금지.

입력:
{batch_json_str}
"""


def _get_model():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY 없음")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=SYSTEM_PROMPT,
        generation_config=GenerationConfig(temperature=0.2, response_mime_type="application/json"),
    )


def classify_unclassified() -> int:
    """미분류 메시지 전량 분류 후 voc_items 저장. Returns: 처리 건수."""
    msgs = get_unclassified_messages()
    if not msgs:
        logging.info("분류할 메시지 없음")
        return 0

    total = len(msgs)
    logging.info(f"미분류 메시지 {total}건 처리 시작")
    if total > MAX_CLASSIFY_PER_RUN:
        logging.warning(f"[비용 경고] 처리 건수 {total} > {MAX_CLASSIFY_PER_RUN}")

    model = _get_model()
    processed = 0

    for i in range(0, total, BATCH_SIZE):
        batch = msgs[i : i + BATCH_SIZE]
        batch_input = [{"slack_ts": m["slack_ts"], "text": m["raw_text"]} for m in batch]
        prompt = USER_PROMPT_TEMPLATE.format(batch_json_str=json.dumps(batch_input, ensure_ascii=False))

        classified = None
        for attempt in range(2):
            try:
                resp = model.generate_content(prompt)
                classified = json.loads(resp.text)
                break
            except (json.JSONDecodeError, ValueError) as e:
                logging.error(f"배치 {i // BATCH_SIZE + 1} JSON 파싱 실패 (시도 {attempt+1}): {e}")
            except Exception as e:
                logging.error(f"배치 {i // BATCH_SIZE + 1} API 오류 (시도 {attempt+1}): {e}")
            if attempt < 1:
                time.sleep((2 ** attempt) + random.uniform(0, 0.5))

        if classified:
            if not isinstance(classified, list):
                logging.error(f"배치 {i // BATCH_SIZE + 1} LLM 응답 형식 오류: list 아님")
                classified = []

            items_to_insert = []
            for idx, c in enumerate(classified):
                if not isinstance(c, dict):
                    logging.warning(f"배치 {i // BATCH_SIZE + 1} 응답 항목 스킵: dict 아님 index={idx}")
                    continue
                if not c.get("slack_ts"):
                    logging.warning(f"배치 {i // BATCH_SIZE + 1} 응답 항목 스킵: slack_ts 없음 index={idx}")
                    continue
                items_to_insert.append({
                    "slack_ts": c.get("slack_ts"),
                    "theme_id": None,  # clusterer가 채움
                    "category": c.get("category"),
                    "severity": c.get("severity"),
                    "sentiment": c.get("sentiment"),
                    "quote": c.get("quote", ""),
                    "impact_score": c.get("impact_score", 1),
                    "effort_hint": c.get("effort_hint", 1),
                })
            if not items_to_insert:
                logging.error(f"배치 {i // BATCH_SIZE + 1} 유효한 분류 결과 없음")
                continue
            try:
                insert_items(items_to_insert)
                processed += len(items_to_insert)
                logging.info(f"배치 {i // BATCH_SIZE + 1} 저장 완료 {len(items_to_insert)}건")
            except Exception as e:
                logging.error(f"배치 {i // BATCH_SIZE + 1} DB 저장 실패: {e}")
        else:
            logging.error(f"배치 {i // BATCH_SIZE + 1} 최종 실패 → 스킵")

    logging.info(f"분류 완료 {processed}건")
    return processed


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    classify_unclassified()
