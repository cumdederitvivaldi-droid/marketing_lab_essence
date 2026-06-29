# -*- coding: utf-8 -*-
"""
커버링 Meta 광고 세팅 마법사 v2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OS 선택 → 캠페인 선택 → 복사할 광고세트 선택 → 신규 세트 설정 → 콘텐츠 폴더 → 실행

적용 정책:
  - 모든 세트·광고: PAUSED 상태로 생성 (사람이 직접 활성화)
  - iOS 지면: Instagram만
  - AOS 지면: Facebook + Instagram
  - 어드벤티지 크리에이티브: 전체 OFF

실행:
    $env:FACEBOOK_ACCESS_TOKEN = "토큰값"
    python 광고자동세팅/setup_wizard.py
"""

import os, sys, re, json, time
from pathlib import Path
from datetime import datetime

sys.stdout.reconfigure(encoding="utf-8")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(SCRIPT_DIR, "config.json"), encoding="utf-8") as f:
    CFG = json.load(f)

import requests

TOKEN   = os.environ.get("FACEBOOK_ACCESS_TOKEN", "")
ACCOUNT = CFG["account_id"]
BASE    = "https://graph.facebook.com/v19.0"

VIDEO_EXTS = {".mp4", ".mov"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png"}

DEFAULT_BUDGET   = 30_000  # KRW
TARGETING_LABELS = {
    "all":      "논타겟 (all)  — 앱 미설치 신규 유저",
    "re":       "리타겟 (re)   — 커스텀 오디언스",
    "lookalike": "유사타겟      — 유사 오디언스",
}
PLACEMENT_INFO = {
    "ios": "Instagram (스트림·스토리·릴스·탐색)",
    "aos": "Facebook + Instagram (피드·스토리·릴스)",
}


# ── API ──────────────────────────────────────────────────────────

def api_get(endpoint, params=None):
    r = requests.get(
        f"{BASE}/{endpoint}",
        params={**(params or {}), "access_token": TOKEN},
        timeout=30,
    )
    d = r.json()
    if "error" in d:
        raise RuntimeError(f"API 오류: {d['error']['message']}")
    return d


# ── 데이터 조회 ────────────────────────────────────────────────────

def fetch_campaigns(os_key: str):
    """캠페인 목록 — 최근 생성 순, 선택 OS 기준 필터링."""
    print("  Meta API에서 캠페인 목록을 불러오는 중...", end=" ", flush=True)
    r    = api_get(f"{ACCOUNT}/campaigns", {
        "fields": "id,name,status,objective,created_time,budget_rebalance_flag",
        "limit":  "50",
    })
    data = [c for c in r.get("data", []) if c.get("status") in ("ACTIVE", "PAUSED")]
    data.sort(key=lambda x: x.get("created_time", ""), reverse=True)

    # OS 키워드로 필터 (이름 기반)
    keyword   = "ios" if os_key == "ios" else "aos"
    filtered  = [c for c in data if keyword in c.get("name", "").lower()]
    result    = filtered if filtered else data   # 필터 결과 없으면 전체 표시
    print(f"{len(result)}개" + (" (전체 캠페인 표시 — OS 명칭 미포함)" if not filtered else ""))
    return result


def fetch_adsets(campaign_id: str):
    """광고세트 목록 — 최근 생성 순."""
    print("  광고세트 목록을 불러오는 중...", end=" ", flush=True)
    r    = api_get(f"{campaign_id}/adsets", {
        "fields": "id,name,status,daily_budget,targeting,promoted_object,created_time",
        "limit":  "50",
    })
    data = [a for a in r.get("data", []) if a.get("status") in ("ACTIVE", "PAUSED")]
    data.sort(key=lambda x: x.get("created_time", ""), reverse=True)
    print(f"{len(data)}개")
    return data


def fetch_custom_audiences():
    """커스텀 오디언스 목록 — 최근 생성 순."""
    r    = api_get(f"{ACCOUNT}/customaudiences", {
        "fields": "id,name,subtype,created_time",
        "limit":  "100",
    })
    data = r.get("data", [])
    data.sort(key=lambda x: x.get("created_time", ""), reverse=True)
    return data


# ── 광고세트 분석 ──────────────────────────────────────────────────

def detect_os(adset: dict) -> str:
    name  = adset.get("name", "").lower()
    url   = adset.get("promoted_object", {}).get("object_store_url", "")
    if name.startswith("ios") or "itunes.apple.com" in url:
        return "ios"
    return "aos"


def detect_targeting(adset: dict) -> tuple:
    """(targeting_key, audience_ids) 반환."""
    targeting = adset.get("targeting", {})
    audiences = targeting.get("custom_audiences", [])
    if not audiences:
        return "all", []
    ids = [a["id"] for a in audiences]
    if targeting.get("lookalike_specs"):
        return "lookalike", ids
    return "re", ids


def parse_budget(adset: dict) -> int:
    try:
        return int(adset.get("daily_budget", DEFAULT_BUDGET))
    except (ValueError, TypeError):
        return DEFAULT_BUDGET


# ── 입력 헬퍼 ─────────────────────────────────────────────────────

def ask(prompt: str, default=None) -> str:
    hint = f"  (기본값: {default})" if default is not None else ""
    sys.stdout.write(f"  {prompt}{hint}\n  ▶ ")
    sys.stdout.flush()
    val = sys.stdin.readline().strip()
    return val if val else (str(default) if default is not None else "")


def ask_number(prompt: str, lo: int, hi: int) -> int:
    while True:
        raw = ask(prompt)
        try:
            n = int(raw)
            if lo <= n <= hi:
                return n
        except ValueError:
            pass
        print(f"  ↳ {lo}~{hi} 사이의 숫자를 입력하세요.")


def ask_multiline(label: str, default: str = "") -> str:
    """빈 줄 입력 시 완료."""
    print(f"  {label}")
    if default:
        print("  (그냥 enter 하면 기본값 사용)")
    print("  빈 줄 입력 시 완료  ─────────")
    lines = []
    while True:
        sys.stdout.write("  > ")
        sys.stdout.flush()
        line = sys.stdin.readline().rstrip("\n")
        if not line:
            break
        lines.append(line)
    text = "\n".join(lines)
    return text if text else default


def make_ad_name(base: str, index: int) -> str:
    m = re.match(r'^(.*\([^)]+\))(_[^_]+_\d{2}\.\d{2}\.\d{2})$', base)
    if m:
        return f"{m.group(1)}{index}{m.group(2)}"
    return f"{base}_{index}"


def validate_ad_name(pattern: str) -> bool:
    return bool(re.match(r'^(aos|ios)_(vd|im)_(all|re|lookalike)', pattern))


def divider(title=""):
    bar = "═" * 60
    if title:
        pad = max(0, (56 - len(title)) // 2)
        print(f"\n{'─' * pad}  {title}  {'─' * pad}")
    else:
        print(f"\n{bar}")


# ── 커스텀 오디언스 선택 (검색 포함) ──────────────────────────────

def select_audiences_interactive() -> list:
    """최근 5개 표시 + 검색 → 번호로 복수 선택."""
    print("\n  커스텀 오디언스를 불러오는 중...", end=" ", flush=True)
    all_aud = fetch_custom_audiences()
    print(f"{len(all_aud)}개")

    if not all_aud:
        print("  ⚠️  조회된 오디언스가 없습니다. ID를 직접 입력하세요.")
        raw = ask("오디언스 ID (쉼표로 구분)")
        return [a.strip() for a in raw.split(",") if a.strip()]

    selected_ids = []
    while not selected_ids:
        # 현재 표시할 목록
        display = all_aud[:5]

        print("\n  최근 생성된 오디언스 (상위 5개):")
        for i, a in enumerate(display, 1):
            sub = a.get("subtype", "")
            sub_str = f"  [{sub}]" if sub else ""
            print(f"  {i:2}. {a['name']}{sub_str}")
            print(f"       ID: {a['id']}")

        print()
        search = ask("검색어 입력 (enter=위 목록에서 바로 선택)").strip()

        if search:
            filtered = [a for a in all_aud if search.lower() in a["name"].lower()]
            if not filtered:
                print(f"  ↳ '{search}' 검색 결과 없음. 다시 시도하세요.")
                continue
            display = filtered[:10]
            print(f"\n  검색 결과 ({len(filtered)}개, 최대 10개 표시):")
            for i, a in enumerate(display, 1):
                sub = a.get("subtype", "")
                sub_str = f"  [{sub}]" if sub else ""
                print(f"  {i:2}. {a['name']}{sub_str}")
                print(f"       ID: {a['id']}")

        raw = ask("\n선택할 번호 입력  (쉼표로 복수 선택, 예: 1,3)")
        try:
            indices      = [int(x.strip()) - 1 for x in raw.split(",") if x.strip()]
            selected_ids = [display[i]["id"] for i in indices if 0 <= i < len(display)]
        except (ValueError, IndexError):
            pass

        if not selected_ids:
            print("  ↳ 올바른 번호를 입력하세요.")

    names = [a["name"] for a in all_aud if a["id"] in selected_ids]
    print(f"\n  ✅ 선택된 오디언스: {', '.join(names)}")
    return selected_ids


# ── 메인 마법사 ────────────────────────────────────────────────────

def main():
    print("\n" + "═" * 60)
    print("     📋  커버링 Meta 광고 세팅 마법사  v2")
    print("═" * 60)
    print("  ⚠️  생성되는 모든 세트·광고는 일시정지(PAUSED) 상태입니다.")
    print("      활성화는 Meta 광고 관리자에서 직접 진행하세요.\n")

    if not TOKEN:
        print("❌ FACEBOOK_ACCESS_TOKEN 환경변수가 없습니다.")
        print("   PowerShell: $env:FACEBOOK_ACCESS_TOKEN = '토큰값'")
        sys.exit(1)

    # ════════════════════════════════════════════════════════════
    # [사전] OS 선택
    # ════════════════════════════════════════════════════════════
    divider("OS 선택")
    print()
    print("  어떤 OS 캠페인에 광고세트를 생성할까요?")
    print()
    print("   1.  AOS  (Android)  — Facebook + Instagram 지면")
    print("   2.  iOS  (iPhone)   — Instagram 전용 지면")
    print()
    os_num = ask_number("OS 번호 선택", 1, 2)
    os_key = "aos" if os_num == 1 else "ios"

    print(f"\n  ✅ 선택된 OS: {os_key.upper()}")
    print(f"     노출 지면: {PLACEMENT_INFO[os_key]}")

    # ════════════════════════════════════════════════════════════
    # STEP 1 : 캠페인 선택
    # ════════════════════════════════════════════════════════════
    divider("STEP 1  캠페인 선택")
    print()

    campaigns = fetch_campaigns(os_key)

    if not campaigns:
        print("\n  ⚠️  조회된 캠페인이 없습니다. 캠페인 ID를 직접 입력하세요.")
        campaign_id       = ask("캠페인 ID")
        campaign_name_str = f"(직접 입력: {campaign_id})"
        try:
            r      = api_get(campaign_id, {"fields": "budget_rebalance_flag"})
            is_cbo = bool(r.get("budget_rebalance_flag"))
        except RuntimeError as e:
            raise RuntimeError(
                f"CBO 여부를 확인하지 못했습니다: {campaign_id}. 조회 실패 상태에서는 생성하지 않습니다."
            ) from e
    else:
        print()
        for i, c in enumerate(campaigns, 1):
            icon      = "🟢" if c["status"] == "ACTIVE" else "⏸"
            created   = c.get("created_time", "")[:10]
            cbo_badge = "  [CBO]" if c.get("budget_rebalance_flag") else ""
            print(f"  {i:2}. {icon} {c['name']}{cbo_badge}")
            print(f"       ID: {c['id']}  |  생성일: {created}")
        print()
        idx               = ask_number("캠페인 번호 선택", 1, len(campaigns)) - 1
        campaign_id       = campaigns[idx]["id"]
        campaign_name_str = campaigns[idx]["name"]
        is_cbo            = bool(campaigns[idx].get("budget_rebalance_flag"))

    print(f"\n  ✅ 선택된 캠페인: {campaign_name_str}")
    if is_cbo:
        print("     📌 CBO 캠페인 — 예산은 캠페인 레벨에서 관리됩니다.")

    # ════════════════════════════════════════════════════════════
    # STEP 2 : 복사할 광고세트 선택
    # ════════════════════════════════════════════════════════════
    divider("STEP 2  복사할 광고세트 선택")
    print("\n  선택한 세트의 타겟·예산 설정을 복사합니다. (최근 생성 순)\n")

    adsets = fetch_adsets(campaign_id)

    if not adsets:
        print("  ⚠️  광고세트가 없습니다. 기본값(논타겟·₩30,000)으로 진행합니다.")
        source_adset  = None
        src_targeting = "all"
        src_audiences = []
        src_budget    = DEFAULT_BUDGET
    else:
        for i, a in enumerate(adsets, 1):
            icon    = "🟢" if a["status"] == "ACTIVE" else "⏸"
            bgt     = parse_budget(a)
            tgt, _  = detect_targeting(a)
            created = a.get("created_time", "")[:10]
            print(f"  {i:2}. {icon} {a['name']}")
            print(f"       ID: {a['id']}  |  타겟: {tgt}  |  예산: ₩{bgt:,}/일  |  생성일: {created}")
        print()
        idx           = ask_number("복사할 광고세트 번호 선택", 1, len(adsets)) - 1
        source_adset  = adsets[idx]
        src_targeting, src_audiences = detect_targeting(source_adset)
        src_budget    = parse_budget(source_adset)

    if source_adset:
        print(f"\n  ✅ 복사 기준: {source_adset['name']}")
        print(f"     타겟: {src_targeting}  |  예산: ₩{src_budget:,}/일")

    # ════════════════════════════════════════════════════════════
    # STEP 3 : 신규 광고세트 설정
    # ════════════════════════════════════════════════════════════
    divider("STEP 3  신규 광고세트 설정")

    # ── 3-1. 광고세트명 ──────────────────────────────────────────
    print()
    if source_adset:
        suggested = f"[사본] {source_adset['name']}"
        print(f"  제안 세트명: {suggested}")
        print()
        # 최근 세트명 3개 참조 표시 (복사 세트 제외)
        refs = [a["name"] for a in adsets if a["id"] != source_adset["id"]][:3]
        if refs:
            print("  ─ 최근 세트명 참조 (네이밍 컨벤션 확인용) ─")
            for r in refs:
                print(f"    • {r}")
            print()
    else:
        suggested = None

    adset_name = ""
    while not adset_name:
        adset_name = ask(
            "새 광고세트명 입력",
            default=suggested if suggested else None,
        )
        if not adset_name:
            print("  ↳ 광고세트명은 필수입니다.")

    # ── 3-2. 타겟 설정 ───────────────────────────────────────────
    print()
    divider("타겟 설정")
    print(f"\n  복사 세트 타겟: {TARGETING_LABELS.get(src_targeting, src_targeting)}")
    if src_audiences:
        print(f"  복사 세트 오디언스 ID: {', '.join(src_audiences)}")
    print()

    keep_targeting = ask("복사 세트의 타겟을 그대로 사용하시겠습니까? (y/n)", default="y")

    if keep_targeting.lower() != "n":
        targeting_key = src_targeting
        audience_ids  = src_audiences
        print(f"  → 타겟 유지: {TARGETING_LABELS.get(targeting_key)}")
    else:
        print()
        print("  타겟을 새로 선택합니다.")
        print()
        print(f"   1. {TARGETING_LABELS['all']}")
        print(f"   2. {TARGETING_LABELS['re']}")
        print(f"   3. {TARGETING_LABELS['lookalike']}")
        print()
        tgt_num       = ask_number("타겟 번호 선택", 1, 3)
        targeting_key = {"1": "all", "2": "re", "3": "lookalike"}[str(tgt_num)]

        if targeting_key in ("re", "lookalike"):
            audience_ids = select_audiences_interactive()
        else:
            audience_ids = []

    # ── 3-3. 예산 ────────────────────────────────────────────────
    print()
    divider("예산 설정")
    if is_cbo:
        print("\n  📌 CBO 캠페인 — 예산은 캠페인 레벨에서 관리됩니다. 세트 예산 설정 불필요.")
        budget = DEFAULT_BUDGET  # 변수 초기화용 (API 호출 시 전달되지 않음)
    else:
        print(f"\n  기본 예산: ₩{DEFAULT_BUDGET:,}/일")
        if source_adset and src_budget != DEFAULT_BUDGET:
            print(f"  복사 세트 예산: ₩{src_budget:,}/일  (참고)")
        print()

        change_budget = ask("예산을 변경하시겠습니까? (y/n)", default="n")
        if change_budget.lower() == "y":
            while True:
                raw = ask("새 일예산 입력 (KRW)")
                try:
                    budget = int(raw.replace(",", "").replace("₩", "").strip())
                    if budget > 0:
                        break
                except ValueError:
                    pass
                print("  ↳ 올바른 숫자를 입력하세요.")
            print(f"  → 예산 변경: ₩{budget:,}/일")
        else:
            budget = src_budget
            print(f"  → 복사 세트 예산 사용: ₩{budget:,}/일")

    # ── 3-4. 지면 (자동 설정 안내) ───────────────────────────────
    print()
    print("  📱 노출 지면 (OS 기반 자동 설정)")
    print(f"     {PLACEMENT_INFO[os_key]}")

    # ════════════════════════════════════════════════════════════
    # STEP 4 : 콘텐츠 및 광고 설정
    # ════════════════════════════════════════════════════════════
    divider("STEP 4  콘텐츠 및 광고 설정")

    # ── 4-1. 콘텐츠 폴더 ─────────────────────────────────────────
    print()
    media_files = []
    folder      = None
    while not media_files:
        raw    = ask("콘텐츠 폴더 경로")
        folder = Path(raw.strip('"').strip("'"))
        if not folder.is_dir():
            print(f"  ↳ 폴더를 찾을 수 없습니다: {folder}")
            continue
        media_files = sorted(
            [f for f in folder.iterdir()
             if f.is_file() and f.suffix.lower() in (VIDEO_EXTS | IMAGE_EXTS)]
        )
        if not media_files:
            print("  ↳ 지원 형식 파일 없음 (mp4/mov/jpg/jpeg/png)")

    print(f"\n  ✅ 파일 {len(media_files)}개:")
    for mf in media_files:
        print(f"     - {mf.name}")

    # ── 4-2. 광고명 패턴 ─────────────────────────────────────────
    today = datetime.now().strftime("%y.%m.%d")
    print(f"\n  광고명 형식: {{os}}_{{format}}_{{targeting}}_{{concept}}({{hook}})_{{manager}}_{today}")
    print(f"  예시: {os_key}_vd_{targeting_key}_컨셉명(후킹)_mk1_{today}")
    print()

    ad_name_pattern = ""
    while not ad_name_pattern:
        ad_name_pattern = ask("광고명 패턴 입력")
        if not ad_name_pattern:
            print("  ↳ 광고명 패턴은 필수입니다.")
            continue
        if not validate_ad_name(ad_name_pattern):
            print("  ↳ ⚠️  네이밍 컨벤션 불일치.")
            cont = ask("그대로 진행하시겠습니까? (y/n)", default="y")
            if cont.lower() != "y":
                ad_name_pattern = ""

    print("\n  광고명 미리보기:")
    for i in range(1, min(4, len(media_files) + 1)):
        print(f"     {i}번 파일 → {make_ad_name(ad_name_pattern, i)}")
    if len(media_files) > 3:
        print(f"     ... (총 {len(media_files)}개)")

    # ── 4-3. 광고 제목 ───────────────────────────────────────────
    default_title = CFG["default_creative"]["title"]
    print()
    title = ask("광고 제목", default=default_title)

    # ── 4-4. 광고 문구 ───────────────────────────────────────────
    default_msg = CFG["default_creative"]["message"]
    print("\n  광고 문구 기본값 미리보기:")
    print(f"  {default_msg[:80]}...")
    print()
    use_default = ask("기본 문구 사용? (y=기본값 / n=직접 입력)", default="y")
    if use_default.lower() == "n":
        message = ask_multiline("광고 문구를 입력하세요:")
        if not message:
            print("  ↳ 입력 없음 — 기본값 사용")
            message = default_msg
    else:
        message = default_msg

    # ════════════════════════════════════════════════════════════
    # 최종 요약
    # ════════════════════════════════════════════════════════════
    print("\n" + "═" * 60)
    print("  📋  실행 요약")
    print("═" * 60)
    print(f"  OS         : {os_key.upper()}")
    print(f"  캠페인     : {campaign_name_str}")
    print(f"  캠페인 ID  : {campaign_id}")
    if source_adset:
        print(f"  복사 세트  : {source_adset['name']}")
    print(f"  새 세트명  : {adset_name}")
    print(f"  타겟       : {TARGETING_LABELS.get(targeting_key, targeting_key)}")
    if audience_ids:
        print(f"  오디언스   : {', '.join(audience_ids)}")
    if is_cbo:
        print("  일예산     : CBO (캠페인 레벨 예산)")
    else:
        print(f"  일예산     : ₩{budget:,}")
    print(f"  노출 지면  : {PLACEMENT_INFO[os_key]}")
    print("  어드벤티지 크리에이티브: 전체 OFF")
    print(f"  콘텐츠 폴더: {folder}")
    print(f"  파일       : {len(media_files)}개")
    ad_first = make_ad_name(ad_name_pattern, 1)
    ad_last  = make_ad_name(ad_name_pattern, len(media_files))
    range_str = f"{ad_first} ~ {ad_last}" if len(media_files) > 1 else ad_first
    print(f"  광고명     : {range_str}")
    print(f"  제목       : {title}")
    print(f"  문구       : {message[:60]}{'...' if len(message) > 60 else ''}")
    print("  생성 상태  : 일시정지(PAUSED) — 사람이 직접 활성화")
    print("═" * 60)
    print()
    print("  y  → 실행")
    print("  d  → dry-run (API 호출 없이 미리보기)")
    print("  n  → 취소")
    print()

    confirm = ask("선택", default="y")
    if confirm.lower() == "n":
        print("\n취소되었습니다.")
        return

    dry_run = confirm.lower() == "d"
    if dry_run:
        print("\n⚠️  DRY-RUN 모드 — 실제 API 호출 없음\n")

    # ════════════════════════════════════════════════════════════
    # 실행
    # ════════════════════════════════════════════════════════════
    sys.path.insert(0, SCRIPT_DIR)
    from create_adset_from_folder import (
        create_adset as _create_adset,
        upload_video, upload_image,
        create_video_creative, create_image_creative,
        create_ad,
    )

    divider("실행 시작")

    adset_id = _create_adset(
        campaign_id=campaign_id,
        adset_name=adset_name,
        os_key=os_key,
        targeting_key=targeting_key,
        budget=budget,
        audience_ids=audience_ids,
        dry_run=dry_run,
        is_cbo=is_cbo,
    )

    results = []
    for i, media_file in enumerate(media_files, start=1):
        ext   = media_file.suffix.lower()
        ad_nm = make_ad_name(ad_name_pattern, i)
        print(f"\n[{i}/{len(media_files)}] {media_file.name}")
        print(f"  → 광고명: {ad_nm}")
        try:
            if ext in VIDEO_EXTS:
                asset_id    = upload_video(media_file, dry_run=dry_run)
                creative_id = create_video_creative(
                    asset_id, ad_nm, title, message, os_key, dry_run=dry_run)
            else:
                asset_id    = upload_image(media_file, dry_run=dry_run)
                creative_id = create_image_creative(
                    asset_id, ad_nm, title, message, os_key, dry_run=dry_run)
            ad_id = create_ad(adset_id, ad_nm, creative_id, dry_run=dry_run)
            results.append({
                "file": media_file.name, "ad_name": ad_nm,
                "ad_id": ad_id, "status": "ok",
            })
        except (requests.RequestException, RuntimeError, OSError, ValueError) as e:
            print(f"  ❌ 오류: {e}")
            results.append({
                "file": media_file.name, "ad_name": ad_nm,
                "status": "error", "error": str(e),
            })
        time.sleep(0.5)

    # 결과 저장
    if not dry_run:
        summary = {
            "campaign_id":   campaign_id,
            "campaign_name": campaign_name_str,
            "source_adset":  source_adset["id"] if source_adset else None,
            "adset_id":      adset_id,
            "adset_name":    adset_name,
            "os":            os_key,
            "targeting":     targeting_key,
            "budget":        budget,
            "folder":        str(folder),
            "ads":           results,
        }
        ts  = datetime.now().strftime("%Y%m%d_%H%M%S")
        out = os.path.join(SCRIPT_DIR, f"created_adset_{ts}.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        print(f"\n✅ 결과 저장: {out}")

    ok_count  = sum(1 for r in results if r["status"] == "ok")
    err_count = len(results) - ok_count

    print(f"\n{'═' * 60}")
    print("  ✅ 완료")
    print(f"  광고세트 ID : {adset_id}")
    print(f"  광고 생성   : 성공 {ok_count}개 / 실패 {err_count}개")
    print()
    for r in results:
        mark = "✅" if r["status"] == "ok" else "❌"
        val  = r.get("ad_id", r.get("error", "-"))
        print(f"  {mark}  {r['ad_name']}")
        print(f"      광고 ID: {val}  |  상태: 일시정지(PAUSED)")
    print()
    print("  ⚠️  광고 활성화는 Meta 광고 관리자에서 직접 진행하세요.")
    print("═" * 60)


if __name__ == "__main__":
    main()
