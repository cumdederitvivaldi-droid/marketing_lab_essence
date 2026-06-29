# -*- coding: utf-8 -*-
"""
광고 120247784894080514 소재 업데이트
① 새 Creative 생성
   - instagram_actor_id = FB Page ID (스폰서 + 프로필 랜딩 페이지)
   - 새 제목 / 새 문구
② 기존 Ad를 새 Creative로 교체
"""
import sys, os, json, requests
sys.stdout.reconfigure(encoding='utf-8')

TOKEN   = os.environ['FACEBOOK_ACCESS_TOKEN']
ACCOUNT = "act_225607806262602"
BASE    = "https://graph.facebook.com/v19.0"
PAGE_ID = "101050698831852"

VIDEO_ID    = "1369437815015996"
AD_ID       = "120247784894080514"
OLD_CR_ID   = "988399466928607"

AD_NAME     = "aos_vd_all_990원(드디어)3_dh1_26.05.14"
TITLE       = "첫 주문 990원"

# 영상(990원 드디어 ver3) 내용 기반 문구 — 이용 가능 지역 표준안 적용
MESSAGE = """드디어! 첫 주문 단 990원으로 시작하세요 🎉

음식물 쓰레기, 대형 폐기물, 신고 필요한 쓰레기까지
분류 없이 한 번에 수거해드리는 커버링!

지금 앱 설치하고 990원 혜택 받아가세요 👇

[이용 가능 지역 안내]
서울, 고양(일부), 남양주(일부), 구리, 인천(일부), 부천, 하남(일부), 광명, 안양, 성남, 군포, 안산, 시흥, 수원, 용인(기흥구·수지구), 의왕, 화성(동탄), 오산, 평택(일부), 과천, 김포, 의정부, 경기도  광주, 안성시, 파주시, 천안, 아산, 대전, 세종, 청주
*일부 지역은 서비스 제한구역이 있습니다
인근 지역은 서비스 확장 준비 중이니 조금만 기다려주세요"""

CTA_TYPE  = "ORDER_NOW"
STORE_URL = "http://play.google.com/store/apps/details?id=com.covering.recle"


def check(r, label):
    d = r.json()
    if "error" in d:
        print(f"❌ {label} 실패: {d['error']['message']} (코드 {d['error'].get('code')})")
        print(f"   {json.dumps(d['error'], ensure_ascii=False)}")
        sys.exit(1)
    return d


# ── 1. 썸네일 조회 ────────────────────────────────────────────────
print("🖼️  썸네일 조회 중...")
rt = requests.get(f"{BASE}/{VIDEO_ID}", params={
    "access_token": TOKEN, "fields": "thumbnails"
})
thumbs = rt.json().get("thumbnails", {}).get("data", [])
thumb_url = next((t["uri"] for t in thumbs if t.get("is_preferred")), None) or thumbs[0]["uri"]
print(f"  OK: {thumb_url[:60]}...")

# ── 2. 새 Creative 생성 ───────────────────────────────────────────
# instagram_actor_id = PAGE_ID → FB 페이지가 스폰서 + 프로필 랜딩 페이지
print("\n🎨 새 소재(Creative) 생성 중...")
story_spec = {
    "page_id": PAGE_ID,
    # instagram_actor_id 미설정 → Meta가 FB 페이지를 Instagram 스폰서/랜딩 페이지로 사용
    "video_data": {
        "video_id": VIDEO_ID,
        "image_url": thumb_url,
        "title": TITLE,
        "message": MESSAGE,
        "call_to_action": {
            "type": CTA_TYPE,
            "value": {"link": STORE_URL}
        }
    }
}
cr_payload = {
    "access_token": TOKEN,
    "name": f"[AUTO] {AD_NAME}_v2",
    "object_story_spec": json.dumps(story_spec, ensure_ascii=False),
}
r2 = check(requests.post(f"{BASE}/{ACCOUNT}/adcreatives", data=cr_payload, timeout=60),
           "소재 생성")
new_cr_id = r2["id"]
print(f"  ✅ 새 소재 ID: {new_cr_id}")

# ── 3. 기존 Ad를 새 Creative로 교체 ──────────────────────────────
print(f"\n🔄 광고 {AD_ID} → 새 소재로 교체 중...")
ad_payload = {
    "access_token": TOKEN,
    "creative": json.dumps({"creative_id": new_cr_id}),
}
r3 = check(requests.post(f"{BASE}/{AD_ID}", data=ad_payload, timeout=60),
           "광고 업데이트")
print(f"  ✅ 교체 완료 (success: {r3.get('success')})")

# ── 결과 ──────────────────────────────────────────────────────────
print(f"""
{'='*60}
✅ 소재 업데이트 완료

  광고 ID       : {AD_ID}
  이전 소재     : {OLD_CR_ID}
  새 소재       : {new_cr_id}
  스폰서 설정   : FB 페이지 ({PAGE_ID}) — 프로필 클릭 시 페이지 이동
  제목          : {TITLE}
  문구 미리보기 : {MESSAGE[:60]}...
  상태          : PAUSED (변경 없음)

⚠️  광고는 여전히 PAUSED 상태입니다.
    활성화는 Meta 광고 관리자에서 직접 진행하세요.
{'='*60}""")
