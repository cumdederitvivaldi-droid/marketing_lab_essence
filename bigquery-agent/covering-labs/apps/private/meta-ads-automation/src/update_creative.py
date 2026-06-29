# -*- coding: utf-8 -*-
"""
범용 소재(Creative) 업데이트 CLI
─────────────────────────────────
기존 광고의 소재를 새 소재로 교체한다.
영상은 이미 업로드된 video_id를 사용하며, 스폰서는 FB 페이지로 설정된다.

사용법:
    python update_creative.py \
        --ad_id 120247784894080514 \
        --video_id 1369437815015996 \
        --title "첫 주문 990원" \
        --message "드디어!..."

옵션:
    --ig_user_id    Instagram 계정 ID (생략 시 FB 페이지를 스폰서로 사용)
    --dry-run       실제 API 호출 없이 미리보기
"""

import os, sys, json, argparse
import requests
sys.stdout.reconfigure(encoding="utf-8")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(SCRIPT_DIR, "config.json"), encoding="utf-8") as f:
    CFG = json.load(f)

TOKEN   = os.environ.get("FACEBOOK_ACCESS_TOKEN", "")
ACCOUNT = CFG["account_id"]
BASE    = "https://graph.facebook.com/v19.0"
PAGE_ID = CFG["page_id"]
AOS_STORE_URL = CFG["apps"]["aos"]["store_url"]


def api_get(endpoint, params):
    r = requests.get(f"{BASE}/{endpoint}",
                     params={**params, "access_token": TOKEN}, timeout=30)
    d = r.json()
    if "error" in d:
        raise RuntimeError(f"GET 오류: {d['error']['message']}")
    return d


def api_post(endpoint, data, dry_run=False):
    if dry_run:
        safe = {k: (v[:80] + "...") if isinstance(v, str) and len(v) > 80 else v
                for k, v in data.items() if k != "access_token"}
        print(f"  [DRY-RUN] POST /{endpoint}")
        print(f"  {json.dumps(safe, ensure_ascii=False, indent=4)}")
        return {"id": "DRY_RUN", "success": True}
    payload = {**data, "access_token": TOKEN}
    r = requests.post(f"{BASE}/{endpoint}", data=payload, timeout=60)
    d = r.json()
    if "error" in d:
        raise RuntimeError(f"POST 오류 [{endpoint}]: {d['error']['message']}")
    return d


def get_thumbnail(video_id):
    r = api_get(video_id, {"fields": "thumbnails"})
    thumbs = r.get("thumbnails", {}).get("data", [])
    preferred = next((t["uri"] for t in thumbs if t.get("is_preferred")), None)
    return preferred or (thumbs[0]["uri"] if thumbs else None)


def get_ad_info(ad_id):
    r = api_get(ad_id, {"fields": "name,creative{id}"})
    return r.get("name", ""), r.get("creative", {}).get("id", "")


def main():
    parser = argparse.ArgumentParser(description="기존 광고 소재 교체")
    parser.add_argument("--ad_id",      required=True, help="교체할 광고 ID")
    parser.add_argument("--video_id",   required=True, help="사용할 영상 ID (이미 업로드된 것)")
    parser.add_argument("--title",      required=True, help="새 광고 제목")
    parser.add_argument("--message",    required=True, help="새 광고 문구")
    parser.add_argument("--cta",        default="ORDER_NOW", help="CTA 유형 (기본: ORDER_NOW)")
    parser.add_argument("--link",       default=AOS_STORE_URL, help="CTA 링크")
    parser.add_argument("--ig_user_id", default=None,
                        help="Instagram 계정 ID (생략 시 FB 페이지를 스폰서로 사용)")
    parser.add_argument("--dry-run",    action="store_true")
    args = parser.parse_args()

    if not TOKEN and not args.dry_run:
        print("❌ FACEBOOK_ACCESS_TOKEN 환경변수가 없습니다.")
        sys.exit(1)

    print("=" * 60)
    print(f"광고 ID    : {args.ad_id}")
    print(f"영상 ID    : {args.video_id}")
    print(f"제목       : {args.title}")
    print(f"문구 미리보기: {args.message[:60]}...")
    print(f"스폰서     : {'Instagram (' + args.ig_user_id + ')' if args.ig_user_id else 'FB 페이지 (' + PAGE_ID + ')'}")
    if args.dry_run:
        print("⚠️  DRY-RUN 모드")
    print("=" * 60)

    # ── 1. 광고 현재 정보 조회 ───────────────────────────────────────
    old_cr_id = ""
    if not args.dry_run:
        print("\n🔍 기존 광고 정보 조회 중...")
        ad_name, old_cr_id = get_ad_info(args.ad_id)
        print(f"  광고명: {ad_name}")
        print(f"  이전 소재 ID: {old_cr_id}")

    # ── 2. 썸네일 조회 ───────────────────────────────────────────────
    thumb_url = None
    if not args.dry_run:
        print("\n🖼️  썸네일 조회 중...")
        thumb_url = get_thumbnail(args.video_id)
        print(f"  OK: {thumb_url[:60]}..." if thumb_url else "  ⚠️  썸네일 없음")

    # ── 3. 새 소재 생성 ──────────────────────────────────────────────
    print("\n🎨 새 소재(Creative) 생성 중...")
    video_data = {
        "video_id": args.video_id,
        "title": args.title,
        "message": args.message,
        "call_to_action": {"type": args.cta, "value": {"link": args.link}},
    }
    if thumb_url:
        video_data["image_url"] = thumb_url

    story_spec = {"page_id": PAGE_ID, "video_data": video_data}
    if args.ig_user_id:
        story_spec["instagram_user_id"] = args.ig_user_id
    # ig_user_id 미지정 → FB 페이지가 Instagram 스폰서/랜딩 페이지로 자동 설정

    cr = api_post(f"{ACCOUNT}/adcreatives", {
        "name": f"[AUTO] {args.ad_id}_updated",
        "object_story_spec": json.dumps(story_spec, ensure_ascii=False),
    }, dry_run=args.dry_run)
    new_cr_id = cr.get("id")
    print(f"  ✅ 새 소재 ID: {new_cr_id}")

    # ── 4. 광고에 새 소재 적용 ────────────────────────────────────────
    print(f"\n🔄 광고 {args.ad_id} → 새 소재로 교체 중...")
    result = api_post(args.ad_id, {
        "creative": json.dumps({"creative_id": new_cr_id}),
    }, dry_run=args.dry_run)
    print(f"  ✅ 교체 완료 (success: {result.get('success', 'DRY_RUN')})")

    # ── 5. 결과 저장 ─────────────────────────────────────────────────
    if not args.dry_run:
        out_data = {
            "ad_id": args.ad_id,
            "old_creative_id": old_cr_id,
            "new_creative_id": new_cr_id,
            "video_id": args.video_id,
            "title": args.title,
            "status": "PAUSED (변경 없음)",
        }
        out = os.path.join(SCRIPT_DIR, f"updated_{args.ad_id}.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(out_data, f, ensure_ascii=False, indent=2)

    print(f"""
{'='*60}
✅ 소재 업데이트 완료

  광고 ID   : {args.ad_id}
  이전 소재 : {old_cr_id or 'N/A'}
  새 소재   : {new_cr_id}
  상태      : PAUSED (변경 없음)

⚠️  광고는 여전히 PAUSED 상태입니다.
    활성화는 Meta 광고 관리자에서 직접 진행하세요.
{'='*60}""")


if __name__ == "__main__":
    main()
