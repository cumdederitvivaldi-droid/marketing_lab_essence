# -*- coding: utf-8 -*-
"""
커버링 Meta 광고 자동 생성 도구
────────────────────────────────
캠페인 → 광고세트 → 소재(Creative) → 광고(Ad) 계층 전체를 API로 자동 생성.
모든 항목은 기본 PAUSED 상태로 생성되어 실수로 집행되지 않습니다.

사용법:
    python create_campaign.py job_example.json              # 실제 생성
    python create_campaign.py job_example.json --dry-run   # 미리보기만 (API 호출 없음)

Job JSON 예시:
    {
        "concept": "청소부2500",
        "hook": "신고",
        "version": 1,
        "manager": "mk1",
        "os": ["aos", "ios"],       # 생성할 OS 목록
        "format": "vd",             # vd=영상, im=이미지
        "targeting": "all",         # all / re / lookalike
        "daily_budget_krw": 30000,
        "video_ids": {              # format=vd 일 때. OS별로 다른 영상 가능
            "aos": "1234567890",
            "ios": "0987654321"
        },
        "image_hash": {             # format=im 일 때
            "aos": "abc123...",
            "ios": "def456..."
        },
        "title": "커버링으로 빠르게 청소하기",     # 생략 시 config.json 기본값 사용
        "message": null,            # null 이면 config.json 기본 광고 문구 사용
        "audience_ids": [],         # re/lookalike 타겟일 때 오디언스 ID 목록
        "campaign_id": null,        # 기존 캠페인에 추가 시 캠페인 ID 입력, null=새 캠페인 생성
        "status": "PAUSED"          # PAUSED(기본/안전) 또는 ACTIVE
    }
"""

import os, sys, json, time, argparse, copy
from datetime import datetime
import requests

sys.stdout.reconfigure(encoding="utf-8")

# ── 설정 로드 ──────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(SCRIPT_DIR, "config.json"), encoding="utf-8") as f:
    CFG = json.load(f)

TOKEN   = os.environ.get("FACEBOOK_ACCESS_TOKEN", "")
ACCOUNT = CFG["account_id"]
BASE    = "https://graph.facebook.com/v19.0"

TARGETING_LABEL = {"all": "논타겟", "re": "리타겟", "lookalike": "유사타겟"}
OS_LABEL        = {"aos": "AOS", "ios": "iOS"}


# ── API 헬퍼 ──────────────────────────────────────────────────────
def api_get(endpoint, params):
    """Meta Graph API GET 요청을 실행하고 응답 dict를 반환합니다. 오류 시 RuntimeError를 발생시킵니다."""
    params = {**params, "access_token": TOKEN}
    r = requests.get(f"{BASE}/{endpoint}", params=params, timeout=30)
    d = r.json()
    if "error" in d:
        raise RuntimeError(f"API GET 오류: {d['error'].get('message')}")
    return d


def api_post(endpoint, data, dry_run=False):
    """Meta Graph API POST 요청을 실행합니다. dry_run=True이면 실제 호출 없이 더미 ID를 반환합니다."""
    if dry_run:
        print(f"    [DRY-RUN] POST /{endpoint}")
        print(f"    {json.dumps(data, ensure_ascii=False, indent=6)}")
        return {"id": f"DRY_RUN_{endpoint}"}
    data = {**data, "access_token": TOKEN}
    r = requests.post(f"{BASE}/{endpoint}", json=data, timeout=30)
    d = r.json()
    if "error" in d:
        raise RuntimeError(f"API POST 오류 [{endpoint}]: {d['error'].get('message')}")
    return d


# ── 이름 생성 ──────────────────────────────────────────────────────
def make_date():
    """현재 날짜를 YY.MM.DD 형식의 문자열로 반환합니다."""
    return datetime.now().strftime("%y.%m.%d")


def campaign_name(os_key, targeting, date):
    """OS·타겟·날짜를 조합하여 캠페인 이름을 생성합니다."""
    return f"{OS_LABEL[os_key]}_{TARGETING_LABEL[targeting]}_앱홍보(구매)_{date}"


def adset_name(os_key, targeting, fmt, concept, hook, ver, manager, date):
    """네이밍 규칙에 따라 광고세트 이름을 생성합니다."""
    tgt = {"all": "all", "re": "re", "lookalike": "lookalike"}[targeting]
    hook_part = f"({hook})" if hook else ""
    return f"{os_key}_purchase_{tgt}_{fmt}_{concept}{hook_part}{ver}_{manager}_{date}"


def ad_name(os_key, fmt, targeting, concept, hook, ver, manager, date):
    """네이밍 규칙에 따라 광고 이름을 생성합니다."""
    tgt = {"all": "all", "re": "re", "lookalike": "lookalike"}[targeting]
    hook_part = f"({hook})" if hook else ""
    return f"{os_key}_{fmt}_{tgt}_{concept}{hook_part}{ver}_{manager}_{date}"


# ── 타겟팅 빌더 ───────────────────────────────────────────────────
def build_targeting(os_key, targeting_key, job, os_cfg):
    """config 템플릿과 OS·타겟 설정을 조합하여 Meta 광고 타겟팅 dict를 생성합니다."""
    tpl = copy.deepcopy(CFG["targeting_templates"][targeting_key])
    base = CFG["default_adset"]

    t = {
        "age_min": base["age_min"],
        "age_max": base["age_max"],
        "geo_locations": tpl.get("geo_locations", {"countries": ["KR"]}),
    }

    # iOS 전용 디바이스/OS 필터
    if os_cfg.get("user_os"):
        t["user_os"]     = os_cfg["user_os"]
        t["user_device"] = os_cfg["user_device"]

    # 논타겟 전용 제외 설정
    if targeting_key == "all":
        t["app_install_state"] = "not_installed"
        if tpl.get("excluded_geo_locations"):
            t["excluded_geo_locations"] = tpl["excluded_geo_locations"]
        if tpl.get("excluded_custom_audiences"):
            t["excluded_custom_audiences"] = tpl["excluded_custom_audiences"]

    # 리타겟/유사타겟: 오디언스 ID 주입
    if targeting_key in ("re", "lookalike") and job.get("audience_ids"):
        t["custom_audiences"] = [{"id": aid} for aid in job["audience_ids"]]

    return t


# ── Creative 생성 ─────────────────────────────────────────────────
def create_creative(os_key, os_cfg, fmt, job, ad_nm, dry_run):
    """영상 또는 이미지 기반 Ad Creative를 생성하고 creative_id를 반환합니다."""
    title   = job.get("title")   or CFG["default_creative"]["title"]
    message = job.get("message") or CFG["default_creative"]["message"]
    cta_type = CFG["default_creative"]["call_to_action_type"]
    store_url = os_cfg["store_url"]

    if fmt == "vd":
        video_id = job["video_ids"][os_key]
        story_spec = {
            "page_id": CFG["page_id"],
            "instagram_user_id": CFG["instagram_user_id"],
            "video_data": {
                "video_id": video_id,
                "title": title,
                "message": message,
                "call_to_action": {
                    "type": cta_type,
                    "value": {"link": store_url}
                }
            }
        }
    else:  # im
        image_hash = job["image_hash"][os_key]
        story_spec = {
            "page_id": CFG["page_id"],
            "instagram_user_id": CFG["instagram_user_id"],
            "link_data": {
                "image_hash": image_hash,
                "name": title,
                "message": message,
                "link": store_url,
                "call_to_action": {
                    "type": cta_type,
                    "value": {"link": store_url}
                }
            }
        }

    payload = {
        "name": f"[AUTO] {ad_nm}",
        "object_story_spec": story_spec,
    }
    print(f"    소재 생성 중: {ad_nm}")
    result = api_post(f"{ACCOUNT}/adcreatives", payload, dry_run)
    return result.get("id")


# ── 메인 생성 흐름 ────────────────────────────────────────────────
def run(job, dry_run=False):
    """Job dict에 따라 캠페인→광고세트→소재→광고를 순서대로 생성합니다. 결과 dict를 반환합니다."""
    if not TOKEN and not dry_run:
        print("❌ FACEBOOK_ACCESS_TOKEN 환경변수가 없습니다.")
        sys.exit(1)

    date    = make_date()
    concept = job["concept"]
    hook    = job.get("hook", "")
    ver     = job.get("version", 1)
    manager = job["manager"]
    fmt     = job.get("format", "vd")
    targeting_key = job.get("targeting", "all")
    os_list = job.get("os", ["aos"])
    budget  = int(job.get("daily_budget_krw", CFG["default_adset"]["daily_budget_krw"]))
    if job.get("status") == "ACTIVE":
        print("⚠️  status=ACTIVE 요청이 무시됩니다. 자동 세팅은 항상 PAUSED로 생성됩니다.")
        print("   활성화는 Meta 광고 관리자에서 직접 진행하세요.")
    status  = "PAUSED"  # 자동 세팅은 항상 PAUSED — 사람만이 활성화 가능

    created = {}

    for os_key in os_list:
        os_cfg = CFG["apps"][os_key]
        print(f"\n{'='*60}")
        print(f"▶ OS: {OS_LABEL[os_key]}  타겟: {TARGETING_LABEL[targeting_key]}  예산: ₩{budget:,}/일")

        # ── 1. 캠페인 ─────────────────────────────────────────────
        is_cbo = False
        if job.get("campaign_id"):
            camp_id   = job["campaign_id"]
            camp_nm   = f"(기존 캠페인 {camp_id})"
            print(f"\n[캠페인] 기존 사용: {camp_nm}")
            if not dry_run:
                try:
                    rc = api_get(camp_id, {"fields": "budget_rebalance_flag"})
                    is_cbo = bool(rc.get("budget_rebalance_flag"))
                except RuntimeError as e:
                    raise RuntimeError(
                        f"CBO 여부를 확인하지 못했습니다: {camp_id}. 조회 실패 상태에서는 생성하지 않습니다."
                    ) from e
        else:
            camp_nm = campaign_name(os_key, targeting_key, date)
            print(f"\n[캠페인] 생성: {camp_nm}")
            r = api_post(f"{ACCOUNT}/campaigns", {
                "name": camp_nm,
                "objective": "OUTCOME_APP_PROMOTION" if os_key == "aos" else "APP_INSTALLS",
                "status": status,
                "special_ad_categories": [],
            }, dry_run)
            camp_id = r.get("id")
            print(f"  → ID: {camp_id}")

        # ── 2. 광고세트 ───────────────────────────────────────────
        as_nm = adset_name(os_key, targeting_key, fmt, concept, hook, ver, manager, date)
        print(f"\n[광고세트] 생성: {as_nm}")
        if is_cbo:
            print("  ℹ️  CBO 캠페인 — 예산은 캠페인 레벨에서 관리됩니다. 세트 예산 미설정.")

        promoted = {
            "application_id": os_cfg["application_id"],
            "object_store_url": os_cfg["store_url"],
            "smart_pse_enabled": False,
        }
        if os_cfg.get("custom_event_type"):
            promoted["custom_event_type"] = os_cfg["custom_event_type"]

        adset_payload = {
            "name": as_nm,
            "campaign_id": camp_id,
            "status": status,
            "billing_event": CFG["default_adset"]["billing_event"],
            "optimization_goal": os_cfg["optimization_goal"],
            "bid_strategy": CFG["default_adset"]["bid_strategy"],
            "promoted_object": promoted,
            "targeting": build_targeting(os_key, targeting_key, job, os_cfg),
        }
        if not is_cbo:
            adset_payload["daily_budget"] = str(budget)
        r = api_post(f"{ACCOUNT}/adsets", adset_payload, dry_run)
        adset_id = r.get("id")
        print(f"  → ID: {adset_id}")

        # ── 3. 소재 + 광고 생성 (video_ids 목록 순회) ────────────
        video_ids_raw = job.get("video_ids", {}).get(os_key)
        if isinstance(video_ids_raw, str):
            video_ids_raw = [video_ids_raw]
        video_ids = video_ids_raw or []

        image_hashes_raw = job.get("image_hash", {}).get(os_key)
        if isinstance(image_hashes_raw, str):
            image_hashes_raw = [image_hashes_raw]
        image_hashes = image_hashes_raw or []

        assets = video_ids if fmt == "vd" else image_hashes
        if not assets:
            print("  ⚠️  video_ids / image_hash 없음 — 소재 생성 건너뜀")
            continue

        for i, asset_id in enumerate(assets, start=1):
            ad_ver  = ver if len(assets) == 1 else f"{ver}_{i}"
            ad_nm   = ad_name(os_key, fmt, targeting_key, concept, hook, ad_ver, manager, date)

            # asset 주입
            sub_job = dict(job)
            if fmt == "vd":
                sub_job["video_ids"] = {os_key: asset_id}
            else:
                sub_job["image_hash"] = {os_key: asset_id}

            print(f"\n[소재+광고 {i}/{len(assets)}] {ad_nm}")
            creative_id = create_creative(os_key, os_cfg, fmt, sub_job, ad_nm, dry_run)
            print(f"  소재 ID: {creative_id}")

            r = api_post(f"{ACCOUNT}/ads", {
                "name": ad_nm,
                "adset_id": adset_id,
                "creative": {"creative_id": creative_id},
                "status": status,
            }, dry_run)
            ad_id = r.get("id")
            print(f"  광고 ID: {ad_id}")

            created.setdefault(os_key, []).append({
                "ad_name": ad_nm, "campaign_id": camp_id,
                "adset_id": adset_id, "creative_id": creative_id, "ad_id": ad_id,
            })

        time.sleep(0.5)  # Rate limit 방지

    # ── 결과 저장 ──────────────────────────────────────────────────
    if not dry_run and created:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        out_path = os.path.join(SCRIPT_DIR, f"created_{ts}.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(created, f, ensure_ascii=False, indent=2)
        print(f"\n✅ 생성 완료 → {out_path}")
    elif dry_run:
        print("\n✅ [DRY-RUN] 미리보기 완료 — 실제 API 호출 없음")

    return created


# ── CLI ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="커버링 Meta 광고 자동 생성")
    parser.add_argument("job", help="Job JSON 파일 경로")
    parser.add_argument("--dry-run", action="store_true", help="미리보기만 (API 호출 없음)")
    args = parser.parse_args()

    with open(args.job, encoding="utf-8") as f:
        job = json.load(f)

    print(f"📋 Job 로드: {args.job}")
    print(f"   컨셉: {job.get('concept')}  OS: {job.get('os')}  타겟: {job.get('targeting')}")
    if args.dry_run:
        print("   ⚠️  DRY-RUN 모드 — 실제 생성 없음\n")

    run(job, dry_run=args.dry_run)
