# -*- coding: utf-8 -*-
"""
기존 광고세트에 새 소재(영상) 추가
────────────────────────────────────
① 영상 파일 업로드 → video_id 취득  (--video_id 제공 시 업로드 스킵)
② Creative 생성
③ Ad 생성 (기본 PAUSED)

사용법:
    # 영상 파일로 업로드 + 추가
    python add_to_adset.py --adset_id 120231883282870514 \
                           --video "C:/path/to/video.mp4" \
                           --ad_name "aos_vd_re_990원(드디어)3_26.05.14"

    # 이미 업로드된 영상 ID로 추가 (업로드 스킵 — 병렬 복수 세팅 시 활용)
    python add_to_adset.py --adset_id 120231883282870514 \
                           --video_id 1369437815015996 \
                           --ad_name "aos_vd_all_990원(드디어)3_mk1_26.05.14"

옵션:
    --title     광고 제목 (생략 시 광고세트 내 첫 광고 제목 자동 복사)
    --message   광고 문구 (생략 시 광고세트 내 첫 광고 문구 자동 복사)
    --status    PAUSED 고정 (ACTIVE 불가 — 활성화는 Meta 광고 관리자에서 직접)
    --dry-run   실제 업로드/생성 없이 미리보기

병렬화:
    제목/문구 자동 복사 API 호출은 영상 업로드와 동시에 실행됩니다 (threading).
    동일 영상을 여러 광고세트에 추가할 때는 --video_id를 사용하면 업로드가 1회로 줄어듭니다.
"""

import os, sys, time, json, argparse, threading
from pathlib import Path
import requests

sys.stdout.reconfigure(encoding="utf-8")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(SCRIPT_DIR, "config.json"), encoding="utf-8") as f:
    CFG = json.load(f)

TOKEN         = os.environ.get("FACEBOOK_ACCESS_TOKEN", "")
ACCOUNT       = CFG["account_id"]
BASE          = "https://graph.facebook.com/v19.0"
PAGE_ID       = CFG["page_id"]
IG_ID         = CFG["instagram_user_id"]
AOS_STORE_URL = CFG["apps"]["aos"]["store_url"]

CHUNK_SIZE = 4 * 1024 * 1024  # 4 MB


def api_get(endpoint, params):
    r = requests.get(f"{BASE}/{endpoint}", params={**params, "access_token": TOKEN}, timeout=30)
    d = r.json()
    if "error" in d:
        raise RuntimeError(f"GET 오류: {d['error']['message']}")
    return d


def api_post(endpoint, data=None, files=None, dry_run=False):
    if dry_run:
        print(f"  [DRY-RUN] POST /{endpoint}")
        if data:
            safe = {k: (v[:80] + "...") if isinstance(v, str) and len(v) > 80 else v
                    for k, v in data.items() if k != "access_token"}
            print(f"  {json.dumps(safe, ensure_ascii=False, indent=4)}")
        return {"id": "DRY_RUN"}
    payload = {**(data or {}), "access_token": TOKEN}
    if files:
        r = requests.post(f"{BASE}/{endpoint}", data=payload, files=files, timeout=120)
    else:
        r = requests.post(f"{BASE}/{endpoint}", json=payload, timeout=60)
    d = r.json()
    if "error" in d:
        raise RuntimeError(f"POST 오류 [{endpoint}]: {d['error']['message']}")
    return d


# ── 광고세트 내 첫 광고에서 크리에이티브 정보 복사 ──────────────────
def fetch_adset_creative_template(adset_id):
    r = api_get(f"{adset_id}/ads", {
        "fields": "creative{object_story_spec,call_to_action_type}",
        "limit": 5
    })
    for ad in r.get("data", []):
        spec = ad.get("creative", {}).get("object_story_spec", {})
        vd   = spec.get("video_data", {})
        title   = vd.get("title")
        message = vd.get("message")
        cta     = vd.get("call_to_action", {}).get("type")
        link    = vd.get("call_to_action", {}).get("value", {}).get("link")
        if title and message:
            return title, message, cta or "ORDER_NOW", link or AOS_STORE_URL
    return None, None, "ORDER_NOW", AOS_STORE_URL


# ── 영상 업로드 (청크 방식 — 파일 크기 무관) ─────────────────────────
def upload_video(video_path: Path, dry_run=False) -> str:
    file_size = video_path.stat().st_size
    print(f"\n📤 영상 업로드: {video_path.name}  ({file_size / 1024 / 1024:.1f} MB)")

    if dry_run:
        print("  [DRY-RUN] 업로드 건너뜀")
        return "DRY_RUN_VIDEO_ID"

    # ① 업로드 세션 시작
    r = api_post(f"{ACCOUNT}/advideos", data={
        "upload_phase": "start",
        "file_size": str(file_size),
        "name": video_path.name,
    })
    upload_session_id = r.get("upload_session_id")
    video_id          = r.get("video_id")
    start_offset      = int(r.get("start_offset", 0))
    end_offset        = int(r.get("end_offset", CHUNK_SIZE))
    print(f"  세션 ID: {upload_session_id}  video_id(예비): {video_id}")

    # ② 청크 전송
    chunk_num = 0
    with open(video_path, "rb") as fh:
        while start_offset < file_size:
            fh.seek(start_offset)
            chunk = fh.read(end_offset - start_offset)
            chunk_num += 1
            print(f"  청크 {chunk_num}: {start_offset:,} ~ {end_offset:,} bytes 전송 중...", end=" ")

            r2 = api_post(f"{ACCOUNT}/advideos", data={
                "upload_phase":     "transfer",
                "upload_session_id": upload_session_id,
                "start_offset":      str(start_offset),
            }, files={"video_file_chunk": (video_path.name, chunk, "application/octet-stream")})

            start_offset = int(r2.get("start_offset", end_offset))
            end_offset   = int(r2.get("end_offset", min(start_offset + CHUNK_SIZE, file_size)))
            print("✓")
            time.sleep(0.3)

    # ③ 업로드 완료
    r3 = api_post(f"{ACCOUNT}/advideos", data={
        "upload_phase":     "finish",
        "upload_session_id": upload_session_id,
    })
    print(f"  ✅ 업로드 완료 — video_id: {video_id}")
    return video_id


# ── 썸네일 조회 ───────────────────────────────────────────────────────
def get_video_thumbnail(video_id):
    r = api_get(video_id, {"fields": "thumbnails"})
    thumbs = r.get("thumbnails", {}).get("data", [])
    preferred = next((t["uri"] for t in thumbs if t.get("is_preferred")), None)
    return preferred or (thumbs[0]["uri"] if thumbs else None)


# ── 소재 생성 ─────────────────────────────────────────────────────────
def create_creative(video_id, ad_name, title, message, cta_type, link, dry_run=False):
    print("\n🎨 소재 생성 중...")
    thumb_url = None if dry_run else get_video_thumbnail(video_id)
    video_data = {
        "video_id": video_id,
        "title": title,
        "message": message,
        "call_to_action": {"type": cta_type, "value": {"link": link}},
    }
    if thumb_url:
        video_data["image_url"] = thumb_url
    story_spec = {
        "page_id": PAGE_ID,
        "instagram_user_id": IG_ID,
        "video_data": video_data,
    }
    r = api_post(f"{ACCOUNT}/adcreatives", data={
        "name": f"[AUTO] {ad_name}",
        "object_story_spec": json.dumps(story_spec, ensure_ascii=False),
    }, dry_run=dry_run)
    cid = r.get("id")
    print(f"  소재 ID: {cid}")
    return cid


# ── 광고 생성 ─────────────────────────────────────────────────────────
def create_ad(adset_id, ad_name, creative_id, status, dry_run=False):
    print(f"\n📢 광고 생성 중: {ad_name}  상태: {status}")
    r = api_post(f"{ACCOUNT}/ads", data={
        "name":      ad_name,
        "adset_id":  adset_id,
        "creative":  {"creative_id": creative_id},
        "status":    status,
    }, dry_run=dry_run)
    aid = r.get("id")
    print(f"  광고 ID: {aid}")
    return aid


# ── 메인 ──────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="기존 광고세트에 영상 소재 추가")
    parser.add_argument("--adset_id",  required=True, help="추가할 광고세트 ID")
    parser.add_argument("--video",     default=None,  help="영상 파일 경로 (.mp4)")
    parser.add_argument("--video_id",  default=None,  help="이미 업로드된 영상 ID (업로드 스킵)")
    parser.add_argument("--ad_name",   required=True, help="생성될 광고 이름")
    parser.add_argument("--title",     default=None,  help="광고 제목 (생략 시 광고세트 내 기존 광고 복사)")
    parser.add_argument("--message",   default=None,  help="광고 문구 (생략 시 기존 광고 복사)")
    parser.add_argument("--status",    default="PAUSED", choices=["PAUSED"],
                        help="자동 생성은 PAUSED 고정 — 활성화는 Meta 광고 관리자에서 직접")
    parser.add_argument("--dry-run",   action="store_true")
    args = parser.parse_args()

    if not TOKEN and not args.dry_run:
        print("❌ FACEBOOK_ACCESS_TOKEN 환경변수가 없습니다.")
        sys.exit(1)
    if not args.video and not args.video_id:
        print("❌ --video 또는 --video_id 중 하나는 필수입니다.")
        sys.exit(1)

    video_path = Path(args.video) if args.video else None
    if video_path and not video_path.exists():
        print(f"❌ 파일을 찾을 수 없습니다: {video_path}")
        sys.exit(1)

    print(f"{'='*60}")
    print(f"광고세트 ID : {args.adset_id}")
    if video_path:
        print(f"영상 파일   : {video_path.name}")
    else:
        print(f"영상 ID     : {args.video_id}  (업로드 스킵)")
    print(f"광고 이름   : {args.ad_name}")
    print(f"생성 상태   : {args.status}")
    if args.dry_run:
        print("⚠️  DRY-RUN 모드")
    print(f"{'='*60}")

    # ── 제목/문구 fetch와 업로드를 병렬 실행 ────────────────────────
    title, message, cta_type, link = args.title, args.message, "ORDER_NOW", AOS_STORE_URL
    template_data: dict = {}

    def _fetch_template():
        if args.title and args.message:
            return
        print("\n🔍 광고세트 내 기존 광고 문구 자동 복사 중... (병렬)")
        t, m, c, link = fetch_adset_creative_template(args.adset_id)
        template_data.update({"title": t, "message": m, "cta": c, "link": link})

    needs_template = not args.title or not args.message
    fetch_thread = threading.Thread(target=_fetch_template, daemon=True)
    if needs_template:
        fetch_thread.start()

    # ① 영상 업로드 (또는 기존 ID 사용)
    if args.video_id:
        video_id = args.video_id
        print(f"\n✅ 기존 영상 ID 사용: {video_id}")
    else:
        video_id = upload_video(video_path, dry_run=args.dry_run)

    # 업로드 완료 후 템플릿 결과 반영 (보통 이미 완료됨)
    if needs_template:
        fetch_thread.join()
        title   = args.title   or template_data.get("title")   or "커버링"
        message = args.message or template_data.get("message") or ""
        cta_type = template_data.get("cta",  "ORDER_NOW")
        link     = template_data.get("link", AOS_STORE_URL)
        print(f"  제목: {title}")
        print(f"  CTA: {cta_type}")

    # ② 소재 생성
    creative_id = create_creative(video_id, args.ad_name, title, message, cta_type, link,
                                  dry_run=args.dry_run)

    # ③ 광고 생성
    ad_id = create_ad(args.adset_id, args.ad_name, creative_id, args.status,
                      dry_run=args.dry_run)

    print(f"\n{'='*60}")
    if not args.dry_run:
        result = {
            "adset_id": args.adset_id,
            "video_id": video_id,
            "creative_id": creative_id,
            "ad_id": ad_id,
            "ad_name": args.ad_name,
            "status": args.status,
        }
        out = os.path.join(os.path.dirname(__file__), f"added_{ad_id}.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"✅ 완료! 결과 저장: {out}")
        print("   ⚠️  광고가 PAUSED 상태입니다. 매니저에서 직접 활성화하세요.")
    else:
        print("✅ DRY-RUN 완료 — 실제 API 호출 없음")


if __name__ == "__main__":
    main()
