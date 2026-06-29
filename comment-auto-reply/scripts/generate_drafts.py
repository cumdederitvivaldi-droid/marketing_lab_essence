# -*- coding: utf-8 -*-
"""
Claude Code 없이 독립 실행용 답글 초안 생성기.
out/comments.json(수집된 댓글) + out/rules.json(CS 기준 시트)을 읽어
Anthropic API(Claude)로 댓글별 답글 초안을 만들고 out/drafts.json 에 저장한다.

필요: Anthropic API 키 (환경변수 ANTHROPIC_API_KEY 또는 config.json).
사용:  python generate_drafts.py
"""
import sys, os, json
_usersite = os.path.join(os.environ.get("APPDATA", ""), "Python", "Python312", "site-packages")
if os.path.isdir(_usersite) and _usersite not in sys.path:
    sys.path.insert(0, _usersite)
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import config

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
COMMENTS = OUT / "comments.json"
RULES = OUT / "rules.json"                              # gcloud로 갱신된 최신본(있으면 우선)
RULES_SNAPSHOT = ROOT / "references" / "rules_snapshot.json"  # 저장소 동봉 스냅샷(gcloud 불필요)
DRAFTS = OUT / "drafts.json"


def load_rules():
    """최신 out/rules.json 우선, 없으면 저장소 동봉 스냅샷 사용(gcloud 불필요)."""
    if RULES.exists():
        return json.loads(RULES.read_text(encoding="utf-8"))
    if RULES_SNAPSHOT.exists():
        print("  · (rules.json 없음 → 동봉 스냅샷 사용)")
        return json.loads(RULES_SNAPSHOT.read_text(encoding="utf-8"))
    return {}

BATCH = 15   # 한 번에 처리할 댓글 수 (출력 길이 제한 대비)

SYSTEM = """당신은 커버링(생활폐기물 방문수거 서비스)의 SNS 댓글 응대 담당자입니다.
인스타그램/틱톡 광고에 달린 댓글에 다는 '답글 초안'을 작성합니다. 아래 CS 기준을 따르세요.

[말투/톤]
- 항상 "안녕하세요 커버링입니다!"로 시작, 따뜻하고 친근하게, 이모지 1~2개(😊 🍀 😆 🥹 등) 사용.
- 1~3문장으로 짧고 명확하게. 과장·허위 정보 금지.

[유형별]
- 질문(요금/품목/지역 등): 아는 범위에서 친절히 답하고, 정확한 확인이 필요하면 "채널톡 1:1 문의"로 안내.
- 칭찬/긍정/후기: 진심으로 감사 표현.
- 농담/가벼운 댓글: 위트있게 받되 브랜드 톤 유지(예: "사람은 소중하니 두고 갈게요 ㅎㅎ").
- 제안/건의: 감사 + "내부에 전달하겠다".
- 컴플레인/항의/불만: "먼저 불편을 드려 정말 죄송합니다 😭"로 사과 + 정확한 확인을 위해 "채널톡 1:1 문의"로 안내. needs_human=true.
- 부정/법적이슈/민감/욕설/광고 인물 관련/내용없는 태그(@아이디만)·오타·의미불명: needs_human=true 로 표시. 내용이 전혀 없으면 draft_reply는 빈 문자열("").

[정책 참고 - 무게/품목]
- 봉투당 10kg, 수거 건당 100kg 제한. 액체류·폐유·엔진오일은 누수 위험으로 수거 어려움. 폐의약품은 약국/보건소 전용수거함.
- 서비스 지역 한정(서울·수도권 등). 안 되는 지역은 정중히 사과 + 확대 노력 안내.

각 댓글에 대해 draft_reply(답글 초안)와 needs_human(사람이 직접 확인할지)을 정하세요.
covering_replied=true 인 댓글은 이미 답변된 것이니 무시하세요(입력에 포함되지 않습니다)."""

SCHEMA = {
    "type": "object",
    "properties": {
        "drafts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "comment_id": {"type": "string"},
                    "draft_reply": {"type": "string"},
                    "needs_human": {"type": "boolean"},
                },
                "required": ["comment_id", "draft_reply", "needs_human"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["drafts"],
    "additionalProperties": False,
}


def rules_text(rules):
    """CS 기준 시트를 LLM에 줄 텍스트로 압축."""
    out = []
    for s in rules.get("sheets", []):
        if s["title"] in ("CS 운영가이드(필독)", "카카오톡&채널톡 답변 가이드"):
            out.append(f"=== {s['title']} ===")
            for row in s["rows"][:40]:
                line = " | ".join(c.strip() for c in row if c.strip())
                if line:
                    out.append(line[:300])
    return "\n".join(out)[:8000]


def main():
    if not COMMENTS.exists():
        raise SystemExit("out/comments.json 이 없습니다. 먼저 scrape_comments.py 를 실행하세요.")
    comments = json.loads(COMMENTS.read_text(encoding="utf-8"))
    rules = load_rules()
    if not comments:
        DRAFTS.write_text("[]", encoding="utf-8")
        print("처리할 댓글이 없습니다.")
        return

    key = config.anthropic_key(config.CFG)
    if not key:
        # API 키가 없으면 템플릿 엔진으로 폴백 (키·비용 0, 유연성은 낮음)
        import template_engine
        print("  · API 키 없음 → 템플릿 방식으로 초안 생성(무료). 더 자연스러운 답글은 키 설정 시 가능.")
        drafts = template_engine.generate(comments)
        DRAFTS.write_text(json.dumps(drafts, ensure_ascii=False, indent=2), encoding="utf-8")
        auto = [d for d in drafts if d["draft_reply"] and not d["needs_human"]]
        print(f"\n초안 {len(drafts)}건 (자동 {len(auto)} / 확인필요 {len(drafts) - len(auto)}) → out/drafts.json")
        return

    import anthropic
    client = anthropic.Anthropic(api_key=key)
    model = config.CFG.get("anthropic_model", "claude-opus-4-8")
    guide = rules_text(rules)
    # 설정 창에서 정한 '답글 톤/지침'을 시스템 프롬프트에 추가
    system_prompt = SYSTEM
    try:
        import settings_store
        tg = (settings_store.load().get("tone_guide") or "").strip()
        if tg:
            system_prompt = SYSTEM + "\n\n[운영자 추가 지침 — 아래를 우선 반영]\n" + tg
    except Exception:
        pass

    by_id = {c["comment_id"]: c for c in comments}
    drafts = []
    for i in range(0, len(comments), BATCH):
        batch = comments[i:i + BATCH]
        payload = [{"comment_id": c["comment_id"], "platform": c["platform"],
                    "author": c["author"], "text": c["text"]} for c in batch]
        user_msg = (
            f"[CS 기준 시트 발췌]\n{guide}\n\n"
            f"[답글 달 댓글 목록 (JSON)]\n{json.dumps(payload, ensure_ascii=False, indent=1)}\n\n"
            "각 댓글마다 위 기준에 맞는 답글 초안을 작성해 drafts 배열로 반환하세요."
        )
        resp = client.messages.create(
            model=model,
            max_tokens=8000,
            system=system_prompt,
            output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
            messages=[{"role": "user", "content": user_msg}],
        )
        text = next((b.text for b in resp.content if b.type == "text"), "{}")
        result = json.loads(text)
        for d in result.get("drafts", []):
            c = by_id.get(d["comment_id"])
            if not c:
                continue
            drafts.append({
                "platform": c["platform"], "comment_id": c["comment_id"],
                "author": c["author"], "comment_text": c["text"],
                "post_index": c.get("post_index", 0), "permalink": c.get("permalink", ""),
                "draft_reply": d.get("draft_reply", ""), "needs_human": bool(d.get("needs_human", False)),
            })
        print(f"  · {min(i + BATCH, len(comments))}/{len(comments)}건 초안 완료")

    DRAFTS.write_text(json.dumps(drafts, ensure_ascii=False, indent=2), encoding="utf-8")
    auto = [d for d in drafts if d["draft_reply"] and not d["needs_human"]]
    print(f"\n초안 {len(drafts)}건 (자동 {len(auto)} / 확인필요 {len(drafts) - len(auto)}) → out/drafts.json")


if __name__ == "__main__":
    main()
