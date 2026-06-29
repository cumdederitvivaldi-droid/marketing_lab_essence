# -*- coding: utf-8 -*-
"""
API 키 없이 동작하는 템플릿 기반 답글 초안 생성기.
댓글을 키워드로 유형 분류하여 CS 가이드 톤의 정형 답글을 만든다.
유연성은 낮지만(자주 나오는 질문 위주), 키·비용 0. 엑셀 검토에서 사람이 수정.

generate_drafts.py 가 API 키가 없을 때 이 모듈을 사용한다.
"""
import re

BRAND = "안녕하세요 커버링입니다!"

# (라벨, 정규식, 답글, needs_human) — 위에서부터 첫 매칭 적용
RULES = [
    # 컴플레인/항의 — 가장 먼저(부정 신호 우선)
    ("컴플레인",
     re.compile(r"(썩은내|썩는|악취|냄새|민원|안\s*가져|안가저|안가저감|안치워|안\s*치워|덜\s*가져|늦게|연락\s*(이\s*)?없|환불|취소.*안|짜증|최악|별로|화나|왜\s*말\s*안|왜\s*안|불만|항의|싸움|피해|실망|엉망|버리고\s*감|두고\s*감|안\s*와|안와요|기다렸)"),
     f"{BRAND} 먼저 불편을 드려 정말 죄송합니다 😭 정확한 확인과 빠른 해결을 위해 채널톡 1:1 문의로 내용 남겨주시면 신속히 도와드리겠습니다! 소중한 의견 감사합니다.",
     True),

    # 액체/폐유/엔진오일
    ("액체류",
     re.compile(r"(엔진\s*오일|폐\s*오일|폐유|기름|액체|페인트|시너)"),
     f"{BRAND} 😊 엔진오일·폐유 같은 액체류는 누수 위험이 있어 수거가 어려운 품목이에요 ㅠ 정확한 배출 방법은 채널톡으로 안내 도와드릴게요 🍀",
     False),

    # 약/의약품
    ("의약품",
     re.compile(r"(폐?의약품|알약|약\s|약을|약도|약은|약 |약이|먹다\s*남은\s*약)"),
     f"{BRAND} 😊 폐의약품은 약국·보건소의 전용 수거함 배출이 원칙이라 일반 수거가 어려울 수 있어요! 정확한 안내는 채널톡으로 도와드릴게요 🍀",
     False),

    # 지역 문의 — 지역명 + 가능/오픈 맥락 ('면/읍/지방'은 오매칭 많아 제외)
    ("지역",
     re.compile(r"((서울|경기|인천|대전|세종|청주|부산|대구|광주|울산|제주|양평|천안|아산|일산|수원|성남|화성|동탄|평택).{0,8}(되|안되|안돼|되나|되요|되니|언제|오픈|서비스|가능|아직))|((지역|동네|우리\s*지역|여기[는도]?)\s*(는|도)?\s*(언제|아직|안되|안돼|되나|가능))"),
     f"{BRAND} 😢 아직 해당 지역에서 못 뵙는 점 아쉬워요. 빠른 시일 내 서비스 지역을 넓히도록 노력할게요! 조금만 기다려주세요 🍀",
     True),

    # 농담(사람/동물/리얼돌/돼지/시체) — 칭찬/품목보다 먼저
    ("농담",
     re.compile(r"(사람|남편|와이프|오빠|언니|동생|시어머니|시母|상사|동물|강아지|고양이|반려|돼지|리얼돌|시체|마누라|애인)"),
     f"{BRAND} 😆 사람·반려동물처럼 소중한 건 절대 안 돼요~ ㅎㅎ 대형 폐기물은 든든하게 맡겨주세요! 🍀",
     False),

    # 제안/건의/확대 요청
    ("제안",
     re.compile(r"(건의|제안|하면\s*좋|있으면\s*좋|스티커|개선|희망|어떨까|추가해주|도입|확대|전국|늘려|넓혀|고려해|해주시면\s*좋)"),
     f"{BRAND} 😊 소중한 제안 정말 감사합니다! 말씀주신 의견 내부에 꼭 전달해 더 편리한 서비스로 발전하겠습니다 🍀",
     False),

    # 요금/비용
    ("요금",
     re.compile(r"(비용|얼마|요금|가격|금액|돈|무료|유료|결제|할인|쿠폰)"),
     f"{BRAND} 😊 비용은 버리시는 양(무게) 기준으로 합리적으로 책정돼요! 정확한 요금은 앱에서 바로 확인하실 수 있습니다 :) 🍀",
     False),

    # 칭찬/긍정/후기
    ("칭찬",
     re.compile(r"(좋아요|좋네|좋더|좋습니|감사|고마|도움|최고|잘\s*쓰|잘쓰|잘\s*사용|편하|편리|번창|추천|굿|짱|만족|행복|덕분|유용|대박|사랑|애용)"),
     f"{BRAND} 😊 따뜻한 말씀 정말 감사합니다 🍀 앞으로도 편리하게 곁에서 도와드릴게요!",
     False),

    # 정보 공유/팁 (단정 어조, 질문 아님)
    ("정보공유",
     re.compile(r"(버리면\s*(될|되)|버려도\s*(될|됨|돼)|하면\s*(됨|된다|되요)|만들어요|만들어여|쓰면\s*돼|이렇게\s*하|가져가는데|가저가는데|안\s*넣어도)"),
     f"{BRAND} 😊 유용한 정보 나눠주셔서 감사합니다! 더 편하게 처리하고 싶으실 땐 커버링도 기억해주세요 🍀",
     False),

    # 품목 가능 여부 질문 ('수거하시는' 등 오매칭 방지: 수거+가능/되 맥락만)
    ("품목질문",
     re.compile(r"(되나요|되요|되니|되남|되나|수거\s*(되|돼|가능|해\s*가|해가|해\s*주|해주)|가져가|가저가|버려도\s*(되|돼)|담으면|넣어도|처리\s*(되|돼|해\s*주)|가능할까|가능한가|가능해|가능할가)"),
     f"{BRAND} 😊 봉투당 10kg·건당 100kg 이내라면 대부분 수거 가능해요! 정확한 품목 가능 여부는 채널톡으로 확인 도와드릴게요 🍀",
     False),

    # 후기 요청/궁금(해보신분 등)
    ("후기요청",
     re.compile(r"(해보신|써보신|이용해\s*보신|후기|괜찮|어때요|어떤가|쓸만)"),
     f"{BRAND} 😊 망설이셨다면 한 번 경험해보세요~ 문 앞에 두기만 하면 끝이라 정말 편하답니다! 궁금한 점은 언제든 남겨주세요 🍀",
     False),

    # 일반 질문(물음표) — 사람이 확인
    ("일반질문",
     re.compile(r"\?|나요|까요|어떻|언제|어디|무엇|뭐|궁금"),
     f"{BRAND} 😊 문의 감사합니다! 궁금하신 점은 채널톡 1:1 문의로 편하게 남겨주시면 빠르게 도와드릴게요 🍀",
     True),
]

DEFAULT = ("기타", f"{BRAND} 😊 관심 가져주셔서 감사합니다! 궁금하신 점이 있으시면 채널톡 1:1 문의로 편하게 남겨주세요 🍀", True)


def default_templates():
    """{유형라벨: 기본 답글} — 설정 창에서 현재값 표시/편집용."""
    d = {label: reply for (label, _rx, reply, _nh) in RULES}
    d[DEFAULT[0]] = DEFAULT[1]
    return d


def _overrides():
    """reply_settings.json 의 유형별 답글 override (없으면 빈 dict)."""
    try:
        import settings_store
        return settings_store.load().get("templates", {}) or {}
    except Exception:
        return {}


def classify(text):
    """(라벨, draft_reply, needs_human) 반환. 설정 창에서 정한 유형별 문구가 있으면 우선 사용."""
    t = (text or "").strip()
    ov = _overrides()
    # 한글/영문 알맹이가 거의 없으면 내용없음 처리(@태그만, ㅋㅋ/ㅠ 등)
    core = re.sub(r"[\s@._\d]+", "", t)
    if len(core) < 2 or re.fullmatch(r"[ㄱ-ㅎㅏ-ㅣ~!.…ㅋㅎㅠㅜ]+", core or ""):
        return "내용없음", "", True
    for label, rx, reply, nh in RULES:
        if rx.search(t):
            return label, (ov.get(label) or reply), nh
    dl, dr, dnh = DEFAULT
    return dl, (ov.get(dl) or dr), dnh


def draft_for(text):
    """(draft_reply, needs_human) 반환."""
    _, reply, nh = classify(text)
    return reply, nh


def generate(comments):
    """comments(list) → drafts(list). generate_drafts.py 와 동일한 스키마."""
    out = []
    for c in comments:
        reply, nh = draft_for(c.get("text", ""))
        out.append({
            "platform": c["platform"], "comment_id": c["comment_id"],
            "author": c["author"], "comment_text": c["text"],
            "post_index": c.get("post_index", 0), "permalink": c.get("permalink", ""),
            "draft_reply": reply, "needs_human": nh,
        })
    return out
