# -*- coding: utf-8 -*-
"""
콘텐츠 폴더 → 신규 광고세트 생성 + 소재 일괄 등록
────────────────────────────────────────────────────
폴더 1개 = 광고세트 1개
폴더 안 미디어 파일(mp4/mov/jpg/jpeg/png) = 각각 광고 소재

사용법:
    python create_adset_from_folder.py \\
        --campaign_id 120231883282870514 \\
        --folder "C:/path/to/content_folder" \\
        --adset_name "aos_purchase_all_vd_신규컨셉(후킹)_mk1_26.05.15" \\
        --ad_name "aos_vd_all_신규컨셉(후킹)_mk1_26.05.15" \\
        --os aos \\
        --targeting all \\
        --title "첫 주문 990원" \\
        --message "드디어! 첫 주문 단 990원"

    --dry-run 으로 미리보기 가능

광고명 자동 번호 부여:
    패턴에서 (hook) 뒤에 버전 번호 삽입.
    예: "aos_vd_all_신규컨셉(후킹)_mk1_26.05.15" →
        파일1: aos_vd_all_신규컨셉(후킹)1_mk1_26.05.15
        파일2: aos_vd_all_신규컨셉(후킹)2_mk1_26.05.15
    (hook) 패턴 없으면 끝에 _1, _2 ... 붙임
"""

import os, sys, re, time, json, argparse, copy
from pathlib import Path
from datetime import datetime
import requests

sys.stdout.reconfigure(encoding="utf-8")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(SCRIPT_DIR, "config.json"), encoding="utf-8") as f:
    CFG = json.load(f)

TOKEN   = os.environ.get("FACEBOOK_ACCESS_TOKEN", "")
ACCOUNT = CFG["account_id"]
BASE    = "https://graph.facebook.com/v19.0"
PAGE_ID = CFG["page_id"]
IG_ID   = CFG["instagram_user_id"]

CHUNK_SIZE = 4 * 1024 * 1024  # 4 MB
VIDEO_EXTS = {".mp4", ".mov"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png"}


# ── API 헬퍼 ──────────────────────────────────────────────────────

def api_get(endpoint, params):
    r = requests.get(f"{BASE}/{endpoint}",
                     params={**params, "access_token": TOKEN}, timeout=30)
    d = r.json()
    if "error" in d:
        raise RuntimeError(f"GET 오류: {d['error']['message']}")
    return d


def api_post(endpoint, data=None, files=None, dry_run=False):
    if dry_run:
        safe = {k: (v[:80] + "...") if isinstance(v, str) and len(v) > 80 else v
                for k, v in (data or {}).items() if k != "access_token"}
        print(f"  [DRY-RUN] POST /{endpoint}")
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


# ── 광고명 번호 삽입 ───────────────────────────────────────────────

def make_ad_name(base: str, index: int) -> str:
    """(hook) 뒤 _manager_date 앞에 버전 번호 삽입. 패턴 없으면 끝에 붙임."""
    m = re.match(r'^(.*\([^)]+\))(_[^_]+_\d{2}\.\d{2}\.\d{2})$', base)
    if m:
        return f"{m.group(1)}{index}{m.group(2)}"
    return f"{base}_{index}"


# ── 타겟팅 빌더 ───────────────────────────────────────────────────

def build_targeting(os_key, targeting_key, audience_ids=None):
    tpl    = copy.deepcopy(CFG["targeting_templates"][targeting_key])
    base   = CFG["default_adset"]
    os_cfg = CFG["apps"][os_key]

    t = {
        "age_min":       base["age_min"],
        "age_max":       base["age_max"],
        "geo_locations": tpl.get("geo_locations", {"countries": ["KR"]}),
    }

    if os_cfg.get("user_os"):
        t["user_os"]     = os_cfg["user_os"]
        t["user_device"] = os_cfg["user_device"]

    if targeting_key == "all":
        t["app_install_state"] = "not_installed"
        if tpl.get("excluded_geo_locations"):
            t["excluded_geo_locations"] = tpl["excluded_geo_locations"]
        if tpl.get("excluded_custom_audiences"):
            t["excluded_custom_audiences"] = tpl["excluded_custom_audiences"]

    if targeting_key in ("re", "lookalike"):
        if not audience_ids:
            raise ValueError(f"타겟팅 '{targeting_key}'에는 audience_ids가 필요합니다.")
        t["custom_audiences"] = [{"id": aid} for aid in audience_ids]

    # OS별 지면 고정 (iOS=Instagram만, AOS=Facebook+Instagram)
    if os_key == "ios":
        t["publisher_platforms"] = ["instagram"]
        t["instagram_positions"] = ["stream", "story", "reels", "explore"]
    else:
        t["publisher_platforms"] = ["facebook", "instagram"]
        t["facebook_positions"]  = ["feed", "story", "reels"]
        t["instagram_positions"] = ["stream", "story", "reels", "explore"]

    return t


# ── 광고세트 생성 ──────────────────────────────────────────────────

def create_adset(campaign_id, adset_name, os_key, targeting_key, budget, audience_ids, dry_run, is_cbo=False):
    os_cfg = CFG["apps"][os_key]
    base   = CFG["default_adset"]

    promoted = {
        "application_id":   os_cfg["application_id"],
        "object_store_url": os_cfg["store_url"],
        "smart_pse_enabled": False,
    }
    if os_cfg.get("custom_event_type"):
        promoted["custom_event_type"] = os_cfg["custom_event_type"]

    payload = {
        "name":              adset_name,
        "campaign_id":       campaign_id,
        "status":            "PAUSED",
        "billing_event":     base["billing_event"],
        "optimization_goal": os_cfg["optimization_goal"],
        "bid_strategy":      base["bid_strategy"],
        "promoted_object":   promoted,
        "targeting":         build_targeting(os_key, targeting_key, audience_ids),
    }
    if not is_cbo:
        payload["daily_budget"] = str(budget)
    else:
        print("  ℹ️  CBO 캠페인 — 예산은 캠페인 레벨에서 관리됩니다. 세트 예산 미설정.")

    print(f"\n[광고세트] 생성: {adset_name}")
    r = api_post(f"{ACCOUNT}/adsets", data=payload, dry_run=dry_run)
    adset_id = r.get("id")
    print(f"  → 광고세트 ID: {adset_id}")
    return adset_id


# ── 영상 업로드 (청크) ─────────────────────────────────────────────

def upload_video(video_path: Path, dry_run=False) -> str:
    file_size = video_path.stat().st_size
    print(f"  📤 영상 업로드: {video_path.name}  ({file_size / 1024 / 1024:.1f} MB)")

    if dry_run:
        return "DRY_RUN_VIDEO_ID"

    r = api_post(f"{ACCOUNT}/advideos", data={
        "upload_phase": "start",
        "file_size":    str(file_size),
        "name":         video_path.name,
    })
    session_id   = r["upload_session_id"]
    video_id     = r["video_id"]
    start_offset = int(r["start_offset"])
    end_offset   = int(r["end_offset"])

    chunk_num = 0
    with open(video_path, "rb") as fh:
        while start_offset < file_size:
            fh.seek(start_offset)
            chunk = fh.read(end_offset - start_offset)
            chunk_num += 1
            print(f"  청크 {chunk_num}: {start_offset:,}~{end_offset:,} bytes", end=" ")
            r2 = api_post(f"{ACCOUNT}/advideos", data={
                "upload_phase":      "transfer",
                "upload_session_id": session_id,
                "start_offset":      str(start_offset),
            }, files={"video_file_chunk": (video_path.name, chunk, "application/octet-stream")})
            start_offset = int(r2["start_offset"])
            end_offset   = int(r2["end_offset"])
            print("✓")
            time.sleep(0.3)

    api_post(f"{ACCOUNT}/advideos", data={
        "upload_phase":      "finish",
        "upload_session_id": session_id,
    })
    print(f"  ✅ 업로드 완료 — video_id: {video_id}")
    if not wait_for_video_ready(video_id):
        raise RuntimeError(f"영상 처리 타임아웃 — video_id: {video_id}. 잠시 후 --video_id 옵션으로 소재를 직접 생성하세요.")
    return video_id


# ── 이미지 업로드 ──────────────────────────────────────────────────

def upload_image(image_path: Path, dry_run=False) -> str:
    print(f"  📤 이미지 업로드: {image_path.name}")
    if dry_run:
        return "DRY_RUN_IMAGE_HASH"
    with open(image_path, "rb") as f:
        r = api_post(f"{ACCOUNT}/adimages",
                     files={"filename": (image_path.name, f, "image/jpeg")})
    images = r.get("images", {})
    hash_  = next(iter(images.values())).get("hash") if images else None
    print(f"  ✅ 이미지 업로드 완료 — hash: {hash_}")
    return hash_


# ── 영상 처리 완료 대기 ────────────────────────────────────────────

def wait_for_video_ready(video_id, timeout_sec=600, poll_interval=15):
    """Meta 영상 처리 완료까지 폴링. 최대 timeout_sec 초 대기."""
    print(f"  ⏳ 영상 처리 대기 중... (최대 {timeout_sec // 60}분)", end="", flush=True)
    start = time.time()
    while time.time() - start < timeout_sec:
        r   = api_get(video_id, {"fields": "status"})
        st  = r.get("status", {})
        vst = st.get("video_status", "processing")
        prog = st.get("processing_progress", 0)
        print(f"\r  ⏳ 영상 처리 중... {prog}%  ({vst})      ", end="", flush=True)
        if vst == "ready":
            print("\n  ✅ 영상 처리 완료")
            return True
        if vst == "error":
            raise RuntimeError(f"영상 처리 실패: {st}")
        time.sleep(poll_interval)
    print(f"\n  ❌ 타임아웃 ({timeout_sec}초) — 영상 처리 미완료. 이 파일을 실패로 처리합니다.")
    return False


# ── 썸네일 조회 ────────────────────────────────────────────────────

def get_thumbnail(video_id, dry_run=False):
    if dry_run:
        return None
    r      = api_get(video_id, {"fields": "thumbnails"})
    thumbs = r.get("thumbnails", {}).get("data", [])
    preferred = next((t["uri"] for t in thumbs if t.get("is_preferred")), None)
    return preferred or (thumbs[0]["uri"] if thumbs else None)


# ── 소재 생성 (영상) ───────────────────────────────────────────────

def create_video_creative(video_id, ad_name, title, message, os_key, dry_run=False):
    print("  🎨 영상 소재 생성...")
    store_url = CFG["apps"][os_key]["store_url"]
    thumb_url = get_thumbnail(video_id, dry_run)

    video_data = {
        "video_id": video_id,
        "title":    title,
        "message":  message,
        "call_to_action": {
            "type":  CFG["default_creative"]["call_to_action_type"],
            "value": {"link": store_url},
        },
    }
    if thumb_url:
        video_data["image_url"] = thumb_url

    story_spec = {
        "page_id":            PAGE_ID,
        "instagram_user_id":  IG_ID,
        "video_data":         video_data,
    }
    # 어드벤티지 크리에이티브 전체 OFF
    adv_off = json.dumps({
        "creative_features_spec": {
            "standard_enhancements": {"enroll_status": "OPT_OUT"},
            "adapt_to_placement":    {"enroll_status": "OPT_OUT"},
        }
    }, ensure_ascii=False)

    r = api_post(f"{ACCOUNT}/adcreatives", data={
        "name":                  f"[AUTO] {ad_name}",
        "object_story_spec":     json.dumps(story_spec, ensure_ascii=False),
        "degrees_of_freedom_spec": adv_off,
    }, dry_run=dry_run)
    cid = r.get("id")
    print(f"  → 소재 ID: {cid}")
    return cid


# ── 소재 생성 (이미지) ─────────────────────────────────────────────

def create_image_creative(image_hash, ad_name, title, message, os_key, dry_run=False):
    print("  🎨 이미지 소재 생성...")
    store_url = CFG["apps"][os_key]["store_url"]
    story_spec = {
        "page_id":           PAGE_ID,
        "instagram_user_id": IG_ID,
        "link_data": {
            "image_hash": image_hash,
            "name":       title,
            "message":    message,
            "link":       store_url,
            "call_to_action": {
                "type":  CFG["default_creative"]["call_to_action_type"],
                "value": {"link": store_url},
            },
        },
    }
    adv_off = json.dumps({
        "creative_features_spec": {
            "standard_enhancements": {"enroll_status": "OPT_OUT"},
            "adapt_to_placement":    {"enroll_status": "OPT_OUT"},
        }
    }, ensure_ascii=False)

    r = api_post(f"{ACCOUNT}/adcreatives", data={
        "name":                    f"[AUTO] {ad_name}",
        "object_story_spec":       json.dumps(story_spec, ensure_ascii=False),
        "degrees_of_freedom_spec": adv_off,
    }, dry_run=dry_run)
    cid = r.get("id")
    print(f"  → 소재 ID: {cid}")
    return cid


# ── 광고 생성 ──────────────────────────────────────────────────────

def create_ad(adset_id, ad_name, creative_id, dry_run=False):
    print(f"  📢 광고 생성: {ad_name}")
    r = api_post(f"{ACCOUNT}/ads", data={
        "name":      ad_name,
        "adset_id":  adset_id,
        "creative":  {"creative_id": creative_id},
        "status":    "PAUSED",
    }, dry_run=dry_run)
    aid = r.get("id")
    print(f"  → 광고 ID: {aid}")
    return aid


# ── 메인 ──────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="콘텐츠 폴더 → 신규 광고세트 생성 + 소재 일괄 등록")
    parser.add_argument("--campaign_id",  required=True, help="추가할 캠페인 ID")
    parser.add_argument("--folder",       required=True, help="콘텐츠 폴더 경로")
    parser.add_argument("--adset_name",   required=True, help="광고세트 이름")
    parser.add_argument("--ad_name",      required=True,
                        help="광고명 패턴 — (hook) 뒤에 번호 자동 삽입\n예: aos_vd_all_컨셉(후킹)_mk1_26.05.15")
    parser.add_argument("--os",           default="aos", choices=["aos", "ios"])
    parser.add_argument("--targeting",    default="all", choices=["all", "re", "lookalike"])
    parser.add_argument("--budget",       type=int, default=None, help="일예산 KRW (기본: config.json 값)")
    parser.add_argument("--title",        default=None, help="광고 제목 (기본: config.json 기본값)")
    parser.add_argument("--message",      default=None, help="광고 문구 (기본: config.json 기본값)")
    parser.add_argument("--audience_ids", nargs="*", default=[], help="리타겟/유사타겟 오디언스 ID 목록")
    parser.add_argument("--dry-run",      action="store_true", help="미리보기만 (API 호출 없음)")
    args = parser.parse_args()

    if not TOKEN and not args.dry_run:
        print("❌ FACEBOOK_ACCESS_TOKEN 환경변수가 없습니다.")
        sys.exit(1)

    folder = Path(args.folder)
    if not folder.is_dir():
        print(f"❌ 폴더를 찾을 수 없습니다: {folder}")
        sys.exit(1)

    # 미디어 파일 수집 (이름순 정렬)
    media_files = sorted(
        [f for f in folder.iterdir()
         if f.is_file() and f.suffix.lower() in (VIDEO_EXTS | IMAGE_EXTS)]
    )
    if not media_files:
        print(f"❌ 지원 형식 파일 없음 (mp4/mov/jpg/jpeg/png): {folder}")
        sys.exit(1)

    title   = args.title   or CFG["default_creative"]["title"]
    message = args.message or CFG["default_creative"]["message"]
    budget  = args.budget  or CFG["default_adset"]["daily_budget_krw"]

    # 광고명 패턴 미리보기
    ad_name_examples = [make_ad_name(args.ad_name, i) for i in range(1, min(3, len(media_files) + 1))]

    print("=" * 60)
    print(f"캠페인 ID  : {args.campaign_id}")
    print(f"콘텐츠 폴더: {folder}")
    print(f"미디어 파일 ({len(media_files)}개):")
    for mf in media_files:
        print(f"  - {mf.name}")
    print(f"광고세트명 : {args.adset_name}")
    print(f"광고명 예시: {' / '.join(ad_name_examples)}")
    print(f"OS / 타겟  : {args.os} / {args.targeting}")
    print(f"일예산     : ₩{budget:,}")
    print(f"제목 미리보: {title[:50]}")
    if args.dry_run:
        print("⚠️  DRY-RUN 모드 — 실제 API 호출 없음")
    print("=" * 60)

    # ── CBO 여부 확인 ─────────────────────────────────────────────
    is_cbo = False
    if not args.dry_run:
        try:
            r = api_get(args.campaign_id, {"fields": "budget_rebalance_flag"})
            is_cbo = bool(r.get("budget_rebalance_flag"))
        except RuntimeError as e:
            raise RuntimeError(
                f"CBO 여부를 확인하지 못했습니다: {args.campaign_id}. 조회 실패 상태에서는 생성하지 않습니다."
            ) from e

    # ── 광고세트 생성 ──────────────────────────────────────────────
    adset_id = create_adset(
        campaign_id=args.campaign_id,
        adset_name=args.adset_name,
        os_key=args.os,
        targeting_key=args.targeting,
        budget=budget,
        audience_ids=args.audience_ids,
        dry_run=args.dry_run,
        is_cbo=is_cbo,
    )

    # ── 파일별 소재 + 광고 생성 ─────────────────────────────────────
    results = []
    for i, media_file in enumerate(media_files, start=1):
        ext   = media_file.suffix.lower()
        ad_nm = make_ad_name(args.ad_name, i)
        print(f"\n[{i}/{len(media_files)}] {media_file.name}")
        print(f"  → 광고명: {ad_nm}")

        try:
            if ext in VIDEO_EXTS:
                asset_id    = upload_video(media_file, dry_run=args.dry_run)
                creative_id = create_video_creative(
                    asset_id, ad_nm, title, message, args.os, dry_run=args.dry_run)
            else:
                asset_id    = upload_image(media_file, dry_run=args.dry_run)
                creative_id = create_image_creative(
                    asset_id, ad_nm, title, message, args.os, dry_run=args.dry_run)

            ad_id = create_ad(adset_id, ad_nm, creative_id, dry_run=args.dry_run)
            results.append({
                "file":        media_file.name,
                "ad_name":     ad_nm,
                "asset_id":    asset_id,
                "creative_id": creative_id,
                "ad_id":       ad_id,
                "status":      "ok",
            })
        except (requests.RequestException, RuntimeError, ValueError, OSError) as e:
            print(f"  ❌ 오류: {e}")
            results.append({
                "file":   media_file.name,
                "ad_name": ad_nm,
                "status": "error",
                "error":  str(e),
            })

        time.sleep(0.5)

    # ── 결과 저장 및 출력 ──────────────────────────────────────────
    summary = {
        "campaign_id": args.campaign_id,
        "adset_id":    adset_id,
        "adset_name":  args.adset_name,
        "os":          args.os,
        "targeting":   args.targeting,
        "folder":      str(folder),
        "ads":         results,
    }

    if not args.dry_run:
        ts  = datetime.now().strftime("%Y%m%d_%H%M%S")
        out = os.path.join(SCRIPT_DIR, f"created_adset_{ts}.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        print(f"\n✅ 결과 저장: {out}")

    ok_count  = sum(1 for r in results if r["status"] == "ok")
    err_count = len(results) - ok_count

    print(f"\n{'='*60}")
    print(f"✅ 완료  광고세트 ID: {adset_id}")
    print(f"   성공 {ok_count}개 / 실패 {err_count}개 (모두 PAUSED)")
    print()
    for r in results:
        mark = "✅" if r["status"] == "ok" else "❌"
        ad_id_str = r.get("ad_id", r.get("error", "-"))
        print(f"  {mark} [{r['ad_name']}]  광고 ID: {ad_id_str}")
    print()
    print("⚠️  광고 활성화는 Meta 광고 관리자에서 직접 진행하세요.")
    print("=" * 60)


if __name__ == "__main__":
    main()
