# -*- coding: utf-8 -*-
"""
커버링 Meta 광고 자동 세팅 — 웹 UI
Streamlit 기반. Render.com 배포 후 브라우저에서 사용.

환경변수: FACEBOOK_ACCESS_TOKEN (서버에 설정) — 없으면 사이드바 입력
"""

import copy
import hashlib
import json
import os
import re
import tempfile
import time
from datetime import datetime
from pathlib import Path

import requests
import streamlit as st

# ── 페이지 설정 ────────────────────────────────────────────────────
st.set_page_config(
    page_title="커버링 Meta 광고 자동 세팅",
    page_icon="📢",
    layout="wide",
)

# ── 설정 로드 ──────────────────────────────────────────────────────
SCRIPT_DIR  = Path(__file__).parent
MSG_FILE    = SCRIPT_DIR / "saved_message.json"

_config_path = SCRIPT_DIR / "config.json"
try:
    with open(_config_path, encoding="utf-8") as _f:
        CFG = json.load(_f)
except FileNotFoundError:
    st.error(f"❌ config.json 파일을 찾을 수 없습니다: {_config_path}")
    st.stop()
except json.JSONDecodeError as e:
    st.error(f"❌ config.json 파싱 오류: {e}")
    st.stop()

ACCOUNT = CFG["account_id"]
BASE    = "https://graph.facebook.com/" + os.environ.get("META_GRAPH_VERSION", "v21.0")

VIDEO_EXTS       = {".mp4", ".mov"}
IMAGE_EXTS       = {".jpg", ".jpeg", ".png"}
IMAGE_MIME_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}
DEFAULT_BUDGET   = 30_000

# server mode: token from env var → multiple users share process, no file-based shared state
_SERVER_MODE = bool(os.environ.get("FACEBOOK_ACCESS_TOKEN"))

PLACEMENT_INFO = {
    "ios": "Instagram (스트림·스토리·릴스·탐색)",
    "aos": "Facebook + Instagram (피드·스토리·릴스)",
}
TARGETING_OPTIONS = {
    "논타겟 (all)":        "all",
    "리타겟 (re)":         "re",
    "유사타겟 (lookalike)": "lookalike",
}

# 광고세트 네이밍 규칙
ADSET_RULES_MD = """
| 순서 | 항목 | 예시 값 |
|------|------|---------|
| 1 | OS | `aos` / `ios` |
| 2 | 세트목표 | `purchase` / `install` / `registration` |
| 3 | 세팅_타겟 | `all` / `re` / `lookalike` |
| 4 | 지역코드 | `cr` / `cna` / `asn` / `dcj` |
| 5 | 콘텐츠_형식 | `vd` / `im` / `slide` / `all` |
| 6 | 컨셉(후킹) | `이사워킹맘(대형폐기물)` |
| 7 | 담당자+버전 | `mk1` / `sj1` |
| 8 | 날짜 | `26.03.04` |
"""
ADSET_NAME_EXAMPLE = "aos_purchase_lookalike_dcj_vd_이사워킹맘(대형폐기물)_sj1_26.03.04"


# ── 메시지 저장/로드 ───────────────────────────────────────────────
def load_saved_message() -> str:
    """저장된 광고 문구를 반환합니다. 세션 저장값 → 로컬 파일 → config 기본값 순으로 탐색합니다."""
    if st.session_state.get("_msg_persistence"):
        return st.session_state["_msg_persistence"]
    if not _SERVER_MODE and MSG_FILE.exists():
        try:
            with open(MSG_FILE, encoding="utf-8") as f:
                return json.load(f).get("message", CFG["default_creative"]["message"])
        except (json.JSONDecodeError, OSError):
            pass
    return CFG["default_creative"]["message"]


def save_message(msg: str):
    """광고 문구를 저장합니다. 서버 모드에서는 세션 상태에, 로컬에서는 파일에 저장합니다."""
    st.session_state["_msg_persistence"] = msg
    if not _SERVER_MODE:
        with open(MSG_FILE, "w", encoding="utf-8") as f:
            json.dump({"message": msg}, f, ensure_ascii=False)


# ── API ───────────────────────────────────────────────────────────
def get_token() -> str:
    """세션 상태 또는 환경변수에서 Facebook Access Token을 반환합니다."""
    return st.session_state.get("token_input") or os.environ.get("FACEBOOK_ACCESS_TOKEN", "")


def api_get(endpoint, params=None):
    """Meta Graph API GET 요청을 실행하고 응답 dict를 반환합니다. 오류 시 RuntimeError를 발생시킵니다."""
    r = None
    try:
        r = requests.get(
            f"{BASE}/{endpoint}",
            params={**(params or {}), "access_token": get_token()},
            timeout=30,
        )
        d = r.json()
    except requests.exceptions.JSONDecodeError as e:
        status = r.status_code if r is not None else "n/a"
        body   = r.text[:200].strip() if r is not None else ""
        raise RuntimeError(f"응답이 JSON이 아닙니다 [{endpoint}] status={status} body={body}") from e
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"네트워크 오류 [{endpoint}]: {e}") from e
    if "error" in d:
        err = d["error"]
        detail = _fmt_error(err, endpoint)
        raise RuntimeError(detail)
    return d


def api_post(endpoint, data=None, files=None, dry_run=False):
    """Meta Graph API POST 요청을 실행합니다. dry_run=True이면 실제 호출 없이 더미 ID를 반환합니다."""
    if dry_run:
        return {"id": f"DRY_{endpoint.split('/')[-1].upper()[:12]}"}
    payload = {**(data or {}), "access_token": get_token()}
    r = None
    try:
        if files:
            r = requests.post(f"{BASE}/{endpoint}", data=payload, files=files, timeout=120)
        else:
            r = requests.post(f"{BASE}/{endpoint}", json=payload, timeout=60)
        d = r.json()
    except requests.exceptions.JSONDecodeError as e:
        status = r.status_code if r is not None else "n/a"
        body   = r.text[:200].strip() if r is not None else ""
        raise RuntimeError(f"응답이 JSON이 아닙니다 [{endpoint}] status={status} body={body}") from e
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"네트워크 오류 [{endpoint}]: {e}") from e
    if "error" in d:
        err = d["error"]
        detail = _fmt_error(err, endpoint)
        raise RuntimeError(detail)
    return d


def _fmt_error(err: dict, endpoint: str) -> str:
    """Meta API 오류 dict를 사용자 친화적인 문자열로 포맷합니다."""
    lines = [f"❌ API 오류 [{endpoint}]"]
    lines.append(f"메시지: {err.get('message', '알 수 없는 오류')}")
    if err.get("error_user_title"):
        lines.append(f"제목: {err['error_user_title']}")
    if err.get("error_user_msg"):
        lines.append(f"설명: {err['error_user_msg']}")
    if err.get("error_subcode"):
        lines.append(f"서브코드: {err['error_subcode']}")
    if err.get("type"):
        lines.append(f"타입: {err['type']}")
    if err.get("code"):
        lines.append(f"코드: {err['code']}")
    return "\n".join(lines)


# ── 캐시된 데이터 조회 ─────────────────────────────────────────────
@st.cache_data(ttl=300, show_spinner=False)
def fetch_campaigns(os_key, tok_prefix=""):
    """OS 키에 맞는 활성/일시정지 캠페인 목록을 조회합니다 (5분 캐시)."""
    r = api_get(f"{ACCOUNT}/campaigns", {
        "fields": "id,name,status,created_time,budget_rebalance_flag",
        "limit":  "50",
    })
    data = [c for c in r.get("data", []) if c.get("status") in ("ACTIVE", "PAUSED")]
    data.sort(key=lambda x: x.get("created_time", ""), reverse=True)
    keyword  = "ios" if os_key == "ios" else "aos"
    filtered = [c for c in data if keyword in c.get("name", "").lower()]
    return filtered if filtered else data


@st.cache_data(ttl=300, show_spinner=False)
def fetch_adsets(campaign_id, tok_prefix=""):
    """캠페인 내 활성/일시정지 광고세트 목록을 조회합니다 (5분 캐시)."""
    r = api_get(f"{campaign_id}/adsets", {
        "fields": "id,name,status,daily_budget,targeting,promoted_object,created_time",
        "limit":  "50",
    })
    data = [a for a in r.get("data", []) if a.get("status") in ("ACTIVE", "PAUSED")]
    data.sort(key=lambda x: x.get("created_time", ""), reverse=True)
    return data


@st.cache_data(ttl=300, show_spinner=False)
def fetch_custom_audiences(tok_prefix=""):
    """커스텀 오디언스 목록을 조회합니다 (5분 캐시)."""
    r = api_get(f"{ACCOUNT}/customaudiences", {
        "fields": "id,name,subtype,created_time",
        "limit":  "100",
    })
    data = r.get("data", [])
    data.sort(key=lambda x: x.get("created_time", ""), reverse=True)
    return data


@st.cache_data(ttl=300, show_spinner=False)
def fetch_saved_audiences(tok_prefix=""):
    """Meta Saved Audiences(저장된 타겟) 목록을 조회합니다 (5분 캐시)."""
    r = api_get(f"{ACCOUNT}/saved_audiences", {
        "fields": "id,name,targeting,created_time",
        "limit":  "200",
    })
    data = r.get("data", [])
    data.sort(key=lambda x: x.get("created_time", ""), reverse=True)
    return data


# ── 헬퍼 ──────────────────────────────────────────────────────────
def detect_targeting(adset):
    """광고세트 데이터에서 타겟 유형('all'/'re'/'lookalike')과 오디언스 ID 목록을 추출합니다."""
    targeting = adset.get("targeting", {})
    audiences = targeting.get("custom_audiences", [])
    if not audiences:
        return "all", []
    ids = [a["id"] for a in audiences]
    return ("lookalike" if targeting.get("lookalike_specs") else "re"), ids


def parse_budget(adset):
    """광고세트 데이터에서 일예산 정수를 추출합니다. 파싱 실패 시 기본값을 반환합니다."""
    try:
        return int(adset.get("daily_budget", DEFAULT_BUDGET))
    except (ValueError, TypeError):
        return DEFAULT_BUDGET


def make_ad_name(base, index):
    """광고세트명 패턴에서 컨셉 블록 뒤에 인덱스를 삽입하여 광고명을 생성합니다."""
    m = re.match(r"^(.*\([^)]+\))(_[^_]+_\d{2}\.\d{2}\.\d{2})$", base)
    return f"{m.group(1)}{index}{m.group(2)}" if m else f"{base}_{index}"


def validate_adset_name(name: str):
    """(is_valid, error_message) 반환."""
    parts = name.split("_")
    if len(parts) < 8:
        return False, f"세그먼트가 부족합니다 (현재 {len(parts)}개, 최소 8개 필요)"
    if parts[0] not in ("aos", "ios"):
        return False, f"[1] OS는 `aos` 또는 `ios` 여야 합니다  →  현재: `{parts[0]}`"
    if parts[1] not in ("purchase", "install", "registration"):
        return False, f"[2] 세트목표는 `purchase / install / registration` 중 하나여야 합니다  →  현재: `{parts[1]}`"
    if parts[2] not in ("all", "re", "lookalike"):
        return False, f"[3] 세팅_타겟은 `all / re / lookalike` 중 하나여야 합니다  →  현재: `{parts[2]}`"
    if parts[3] not in ("cr", "cna", "asn", "dcj"):
        return False, f"[4] 지역코드는 `cr / cna / asn / dcj` 중 하나여야 합니다  →  현재: `{parts[3]}`"
    if parts[4] not in ("vd", "im", "all", "slide"):
        return False, f"[5] 콘텐츠_형식은 `vd / im / all / slide` 중 하나여야 합니다  →  현재: `{parts[4]}`"
    if not re.match(r"^[a-z]+\d+$", parts[-2]):
        return False, f"[7] 담당자+버전은 영문소문자+숫자 형식이어야 합니다 (예: mk1, sj2)  →  현재: `{parts[-2]}`"
    if not re.match(r"^\d{2}\.\d{2}\.\d{2}$", parts[-1]):
        return False, f"[마지막] 날짜는 `YY.MM.DD` 형식이어야 합니다  →  현재: `{parts[-1]}`"
    return True, ""


_PLACEMENT_KEYS = (
    "publisher_platforms", "facebook_positions", "instagram_positions",
    "messenger_positions", "audience_network_positions", "user_os", "user_device",
)


def apply_os_placements(targeting: dict, os_key: str) -> dict:
    """저장된 타겟 위에 OS 전용 지면 설정을 덮어씁니다."""
    t      = copy.deepcopy(targeting)
    for key in _PLACEMENT_KEYS:
        t.pop(key, None)
    os_cfg = CFG["apps"][os_key]
    if os_cfg.get("user_os"):
        t["user_os"]     = os_cfg["user_os"]
        t["user_device"] = os_cfg["user_device"]
    if os_key == "ios":
        t["publisher_platforms"] = ["instagram"]
        t["instagram_positions"] = ["stream", "story", "reels", "explore"]
    else:
        t["publisher_platforms"] = ["facebook", "instagram"]
        t["facebook_positions"]  = ["feed", "story"]
        t["instagram_positions"] = ["stream", "story", "reels", "explore"]
    return t


def build_targeting(os_key, targeting_key, audience_ids=None):
    """config 템플릿과 OS 설정을 조합하여 Meta 광고 타겟팅 dict를 생성합니다."""
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
    if os_key == "ios":
        t["publisher_platforms"] = ["instagram"]
        t["instagram_positions"] = ["stream", "story", "reels", "explore"]
    else:
        t["publisher_platforms"] = ["facebook", "instagram"]
        t["facebook_positions"]  = ["feed", "story"]
        t["instagram_positions"] = ["stream", "story", "reels", "explore"]
    return t


# ── 실행 로직 ──────────────────────────────────────────────────────
def run_creation(params, uploaded_files, log):
    """광고세트 1개와 업로드된 파일 수만큼 광고를 Meta API로 생성합니다. 결과를 (adset_id, results) 로 반환합니다."""
    dry_run      = params["dry_run"]
    os_key       = params["os_key"]
    campaign_id  = params["campaign_id"]
    adset_name   = params["adset_name"]
    targeting_key = params["targeting_key"]
    audience_ids = params["audience_ids"]
    budget       = params["budget"]
    is_cbo       = params["is_cbo"]
    ad_names     = params["ad_names"]          # per-file list
    title        = params["title"]
    message      = params["message"]
    saved_aud_targeting = params.get("saved_audience_targeting")

    # CBO 재확인 (실패 시 캠페인 선택 단계에서 감지된 값 유지)
    if not dry_run:
        log("🔍 CBO 여부 재확인 중...")
        try:
            rc     = api_get(campaign_id, {"fields": "budget_rebalance_flag"})
            is_cbo = bool(rc.get("budget_rebalance_flag"))
        except RuntimeError as e:
            log(f"⚠️ CBO 재확인 실패 — 캠페인 선택 시 감지된 값 사용 (is_cbo={is_cbo})\n오류: {e}")

    # 타겟팅 빌드
    if saved_aud_targeting:
        targeting = apply_os_placements(saved_aud_targeting, os_key)
        if audience_ids:
            targeting["custom_audiences"] = [{"id": aid} for aid in audience_ids]
    else:
        targeting = build_targeting(os_key, targeting_key, audience_ids)

    # 광고세트 생성
    log(f"📋 광고세트 생성 중: **{adset_name}**")
    os_cfg = CFG["apps"][os_key]
    base   = CFG["default_adset"]
    promoted = {
        "application_id":    os_cfg["application_id"],
        "object_store_url":  os_cfg["store_url"],
        "smart_pse_enabled": False,
    }
    if os_cfg.get("custom_event_type"):
        promoted["custom_event_type"] = os_cfg["custom_event_type"]

    adset_payload = {
        "name":              adset_name,
        "campaign_id":       campaign_id,
        "status":            "PAUSED",
        "billing_event":     base["billing_event"],
        "optimization_goal": os_cfg["optimization_goal"],
        "bid_strategy":      base["bid_strategy"],
        "promoted_object":   promoted,
        "targeting":         targeting,
    }
    if not is_cbo:
        adset_payload["daily_budget"] = str(budget)
    else:
        log("ℹ️ CBO 캠페인 — 세트 예산 미설정")

    r        = api_post(f"{ACCOUNT}/adsets", data=adset_payload, dry_run=dry_run)
    adset_id = r.get("id")
    log(f"✅ 광고세트 ID: `{adset_id}`")

    results = []
    adv_off = json.dumps({
        "creative_features_spec": {
            "adapt_to_placement": {"enroll_status": "OPT_OUT"},
        }
    }, ensure_ascii=False)

    for i, uf in enumerate(uploaded_files, start=1):
        ext   = Path(uf.name).suffix.lower()
        ad_nm = ad_names[i - 1] if i <= len(ad_names) else f"{Path(uf.name).stem}_{i}"
        log(f"\n**[{i}/{len(uploaded_files)}] {uf.name}**  →  광고명: `{ad_nm}`")

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                tmp.write(uf.getvalue())
                tmp_path = Path(tmp.name)

            store_url = CFG["apps"][os_key]["store_url"]

            if ext in VIDEO_EXTS:
                log("  📤 영상 업로드 중...")
                if not dry_run:
                    file_size    = tmp_path.stat().st_size
                    r_s          = api_post(f"{ACCOUNT}/advideos", data={
                        "upload_phase": "start",
                        "file_size":    str(file_size),
                        "name":         uf.name,
                    })
                    session_id   = r_s["upload_session_id"]
                    video_id     = r_s["video_id"]
                    start_offset = int(r_s["start_offset"])
                    end_offset   = int(r_s["end_offset"])

                    chunk_num = 0
                    with open(tmp_path, "rb") as fh:
                        while start_offset < file_size:
                            fh.seek(start_offset)
                            chunk     = fh.read(end_offset - start_offset)
                            chunk_num += 1
                            log(f"  청크 {chunk_num}: {start_offset/1024/1024:.1f} / {file_size/1024/1024:.1f} MB")
                            r2           = api_post(f"{ACCOUNT}/advideos", data={
                                "upload_phase":      "transfer",
                                "upload_session_id": session_id,
                                "start_offset":      str(start_offset),
                            }, files={"video_file_chunk": (uf.name, chunk, "application/octet-stream")})
                            start_offset = int(r2["start_offset"])
                            end_offset   = int(r2["end_offset"])
                            time.sleep(0.3)

                    api_post(f"{ACCOUNT}/advideos", data={
                        "upload_phase":      "finish",
                        "upload_session_id": session_id,
                    })
                    log(f"  ✅ 업로드 완료  video_id: `{video_id}`")

                    log("  ⏳ 영상 처리 대기 중 (최대 10분)...")
                    deadline = time.time() + 600
                    while time.time() < deadline:
                        r_st    = api_get(video_id, {"fields": "status"})
                        vst     = r_st.get("status", {})
                        vstatus = vst.get("video_status", "processing")
                        prog    = vst.get("processing_progress", 0)
                        log(f"  영상 처리 중 {prog}%  ({vstatus})")
                        if vstatus == "ready":
                            log("  ✅ 영상 처리 완료")
                            break
                        if vstatus == "error":
                            raise RuntimeError(f"영상 처리 실패: {vst}")
                        time.sleep(15)
                    else:
                        raise RuntimeError("영상 처리 타임아웃 (10분) — 이 파일을 실패로 처리합니다.")

                    r_th      = api_get(video_id, {"fields": "thumbnails"})
                    thumbs    = r_th.get("thumbnails", {}).get("data", [])
                    thumb_url = next((t["uri"] for t in thumbs if t.get("is_preferred")), None)
                    asset_id  = video_id
                else:
                    asset_id  = "DRY_VIDEO_ID"
                    thumb_url = None

                video_data = {
                    "video_id": asset_id,
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
                    "page_id":           CFG["page_id"],
                    "instagram_user_id": CFG["instagram_user_id"],
                    "video_data":        video_data,
                }

            else:
                log("  📤 이미지 업로드 중...")
                if not dry_run:
                    mime = IMAGE_MIME_TYPES.get(ext, "image/jpeg")
                    with open(tmp_path, "rb") as fh:
                        r_img = api_post(f"{ACCOUNT}/adimages",
                                         files={"filename": (uf.name, fh, mime)})
                    images     = r_img.get("images", {})
                    image_hash = next(iter(images.values())).get("hash") if images else None
                    log(f"  ✅ 이미지 업로드 완료  hash: `{image_hash}`")
                else:
                    image_hash = "DRY_IMAGE_HASH"

                story_spec = {
                    "page_id":           CFG["page_id"],
                    "instagram_user_id": CFG["instagram_user_id"],
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

            log("  🎨 소재 생성 중...")
            r_cr      = api_post(f"{ACCOUNT}/adcreatives", data={
                "name":                    f"[AUTO] {ad_nm}",
                "object_story_spec":       json.dumps(story_spec, ensure_ascii=False),
                "degrees_of_freedom_spec": adv_off,
            }, dry_run=dry_run)
            creative_id = r_cr.get("id")
            log(f"  ✅ 소재 ID: `{creative_id}`")

            r_ad  = api_post(f"{ACCOUNT}/ads", data={
                "name":     ad_nm,
                "adset_id": adset_id,
                "creative": {"creative_id": creative_id},
                "status":   "PAUSED",
            }, dry_run=dry_run)
            ad_id = r_ad.get("id")
            log(f"  ✅ 광고 ID: `{ad_id}`")

            results.append({"file": uf.name, "ad_name": ad_nm, "ad_id": ad_id, "status": "ok"})

        except (requests.RequestException, RuntimeError, ValueError, OSError) as e:
            log(f"  ❌ 오류:\n{e}")
            results.append({"file": uf.name, "ad_name": ad_nm, "status": "error", "error": str(e)})

        finally:
            if tmp_path:
                try:
                    tmp_path.unlink()
                except OSError:
                    pass

        time.sleep(0.5)

    return adset_id, results


# ════════════════════════════════════════════════════════════════════
# UI
# ════════════════════════════════════════════════════════════════════

st.title("📢 커버링 Meta 광고 자동 세팅")
st.caption("생성되는 모든 광고는 **일시정지(PAUSED)** 상태입니다. 활성화는 Meta 광고 관리자에서 직접 진행하세요.")

# ── 사이드바: 토큰 ────────────────────────────────────────────────
with st.sidebar:
    st.header("🔑 액세스 토큰")
    _env_token = os.environ.get("FACEBOOK_ACCESS_TOKEN", "")
    if _env_token:
        st.session_state["token_input"] = _env_token
        st.success("토큰 자동 로드됨 ✅")
    else:
        st.text_input(
            "Facebook Access Token",
            type="password",
            placeholder="EAAFIua6...",
            key="token_input",
            help="Meta 비즈니스 설정 → 시스템 사용자 → 토큰 생성",
        )
        if not st.session_state.get("token_input"):
            st.warning("토큰을 입력하면 시작됩니다.")

TOKEN = get_token()
if not TOKEN:
    st.info("← 왼쪽 사이드바에 Facebook Access Token을 입력하세요.")
    st.stop()

tok_prefix = hashlib.sha256(TOKEN.encode("utf-8")).hexdigest()  # 캐시 무효화용 (토큰 노출 방지)

st.divider()

# ══ 1. OS 선택 ════════════════════════════════════════════════════
st.subheader("1️⃣  OS 선택")
c1, c2 = st.columns(2)
with c1:
    if st.button("🤖  AOS (Android)\nFacebook + Instagram",
                 use_container_width=True,
                 type="primary" if st.session_state.get("os_key") == "aos" else "secondary"):
        st.session_state.os_key = "aos"
        st.rerun()
with c2:
    if st.button("🍎  iOS (iPhone)\nInstagram 전용",
                 use_container_width=True,
                 type="primary" if st.session_state.get("os_key") == "ios" else "secondary"):
        st.session_state.os_key = "ios"
        st.rerun()

os_key = st.session_state.get("os_key")
if not os_key:
    st.info("OS를 선택하면 다음 단계가 나타납니다.")
    st.stop()
st.success(f"**{os_key.upper()}**  |  지면: {PLACEMENT_INFO[os_key]}")

# ══ 2. 캠페인 선택 ══════════════════════════════════════════════
st.divider()
st.subheader("2️⃣  캠페인 선택")

campaign_id   = None
campaign_name = None
is_cbo        = False

if st.toggle("캠페인 ID 직접 입력", key="toggle_manual_campaign"):
    _cid = st.text_input("캠페인 ID", placeholder="예: 120231883282870514").strip()
    if _cid:
        with st.spinner("캠페인 정보 확인 중..."):
            try:
                rc            = api_get(_cid, {"fields": "name,budget_rebalance_flag"})
                campaign_id   = _cid
                campaign_name = rc.get("name", f"(ID: {_cid})")
                is_cbo        = bool(rc.get("budget_rebalance_flag"))
            except RuntimeError as e:
                st.error(str(e))
                st.stop()
else:
    with st.spinner("캠페인 목록 불러오는 중..."):
        try:
            campaigns = fetch_campaigns(os_key, tok_prefix=tok_prefix)
        except RuntimeError as e:
            st.error(str(e))
            st.stop()

    if not campaigns:
        st.warning("조회된 캠페인이 없습니다. ID 직접 입력을 사용하세요.")
        st.stop()

    labels   = [
        f"{'🟢' if c['status'] == 'ACTIVE' else '⏸'}  {c['name']}"
        f"{'  [CBO]' if c.get('budget_rebalance_flag') else ''}  |  {c.get('created_time','')[:10]}"
        for c in campaigns
    ]
    idx          = st.selectbox(f"{os_key.upper()} 캠페인 ({len(campaigns)}개)",
                                range(len(labels)), format_func=lambda i: labels[i])
    campaign_id   = campaigns[idx]["id"]
    campaign_name = campaigns[idx]["name"]
    is_cbo        = bool(campaigns[idx].get("budget_rebalance_flag"))

if not campaign_id:
    st.stop()
if is_cbo:
    st.info("📌 CBO 캠페인 — 예산은 캠페인 레벨에서 관리됩니다.")

# ══ 3. 복사할 광고세트 선택 ═══════════════════════════════════
st.divider()
st.subheader("3️⃣  복사할 광고세트 선택")

with st.spinner("광고세트 목록 불러오는 중..."):
    try:
        adsets = fetch_adsets(campaign_id, tok_prefix=tok_prefix)
    except RuntimeError as e:
        st.warning(f"광고세트 조회 실패: {e}")
        adsets = []

source_adset  = None
src_targeting = "all"
src_audiences: list = []
src_budget    = DEFAULT_BUDGET

if adsets:
    if not st.toggle("처음부터 직접 설정 (복사 없음)"):
        adset_labels = [
            f"{'🟢' if a['status'] == 'ACTIVE' else '⏸'}  {a['name']}"
            f"  |  타겟: {detect_targeting(a)[0]}  |  ₩{parse_budget(a):,}/일  |  {a.get('created_time','')[:10]}"
            for a in adsets
        ]
        ai           = st.selectbox(f"광고세트 ({len(adsets)}개, 최근 생성 순)",
                                    range(len(adset_labels)), format_func=lambda i: adset_labels[i])
        source_adset = adsets[ai]
        src_targeting, src_audiences = detect_targeting(source_adset)
        src_budget   = parse_budget(source_adset)
        st.caption(f"타겟: **{src_targeting}** | 예산: **₩{src_budget:,}/일**")
else:
    st.caption("광고세트가 없습니다. 기본값으로 설정합니다.")

# ══ 4. 신규 광고세트 설정 ════════════════════════════════════
st.divider()
st.subheader("4️⃣  신규 광고세트 설정")

today            = datetime.now().strftime("%y.%m.%d")
default_adset_nm = (
    f"[사본] {source_adset['name']}" if source_adset
    else f"{os_key}_purchase_all_cr_vd_컨셉(후킹)_mk1_{today}"
)

adset_name_input = st.text_input("광고세트명 *", value=default_adset_nm)

# 네이밍 규칙 검증
if adset_name_input.strip():
    is_valid, err_msg = validate_adset_name(adset_name_input.strip())
    if not is_valid:
        st.warning(f"⚠️ 네이밍 규칙 불일치 — {err_msg}")
        with st.expander("📋 광고세트 네이밍 규칙 확인", expanded=True):
            st.markdown(ADSET_RULES_MD)
            st.markdown(f"**예시:** `{ADSET_NAME_EXAMPLE}`")

# ── 타겟 ─────────────────────────────────────────────────────
st.markdown("**타겟 설정**")

# 저장된 타겟 (Meta Saved Audiences) — 최근 생성 순
with st.spinner("저장된 타겟 불러오는 중..."):
    try:
        saved_audiences = fetch_saved_audiences(tok_prefix=tok_prefix)
    except RuntimeError as e:
        st.warning(f"저장된 타겟 조회 실패: {e}")
        saved_audiences = []

selected_saved_audience = None
if saved_audiences:
    sa_labels = ["(선택 안 함)"] + [
        f"{a['name']}  ({a.get('created_time', '')[:10]})" for a in saved_audiences
    ]
    sa_idx = st.selectbox(
        "저장된 타겟 선택 (Meta Saved Audiences)",
        range(len(sa_labels)),
        format_func=lambda i: sa_labels[i],
        help="최근 생성 순으로 표시됩니다. 선택하면 해당 타겟의 지역·인구통계 설정을 그대로 사용합니다.",
    )
    if sa_idx > 0:
        selected_saved_audience = saved_audiences[sa_idx - 1]
        st.caption(f"선택된 저장 타겟: **{selected_saved_audience['name']}**")
else:
    st.caption("저장된 타겟이 없습니다.")

# targeting_key: 광고세트명 3번째 세그먼트에서 자동 감지
_name_parts   = adset_name_input.strip().split("_")
targeting_key = (
    _name_parts[2]
    if len(_name_parts) >= 3 and _name_parts[2] in ("all", "re", "lookalike")
    else src_targeting
)
audience_ids: list = []

# ── 예산 ─────────────────────────────────────────────────────
if is_cbo:
    st.caption("💡 CBO 캠페인 — 세트 예산 설정 불필요")
    budget = DEFAULT_BUDGET
else:
    budget = st.number_input("일예산 (KRW) *", min_value=1_000, value=src_budget, step=1_000)

# ══ 5. 파일 업로드 ════════════════════════════════════════════
st.divider()
st.subheader("5️⃣  콘텐츠 파일 업로드")

uploaded_files = st.file_uploader(
    "영상(mp4/mov) 또는 이미지(jpg/jpeg/png)  — 여러 개 선택 가능",
    type=["mp4", "mov", "jpg", "jpeg", "png"],
    accept_multiple_files=True,
)
if not uploaded_files:
    st.info("파일을 업로드하면 광고 설정 단계가 나타납니다.")
    st.stop()

st.success(f"✅ {len(uploaded_files)}개 파일")
for uf in uploaded_files:
    st.caption(f"  • {uf.name}  ({uf.size / 1024 / 1024:.1f} MB)")

# ══ 6. 광고 설정 ══════════════════════════════════════════════
st.divider()
st.subheader("6️⃣  광고 소재 이름")

# 파일 목록이 바뀌면 기본값 초기화
current_file_names = [uf.name for uf in uploaded_files]
if st.session_state.get("_prev_files") != current_file_names:
    st.session_state["_prev_files"] = current_file_names
    for i, uf in enumerate(uploaded_files):
        st.session_state[f"ad_name_{i}"] = Path(uf.name).stem

st.caption("파일명을 기본값으로 불러왔습니다. 직접 수정할 수 있습니다.")
ad_names = []
for i, uf in enumerate(uploaded_files):
    nm = st.text_input(
        f"[{i+1}] {uf.name}",
        key=f"ad_name_{i}",
    )
    ad_names.append(nm)

# ── 광고 제목 & 문구 ──────────────────────────────────────────
st.divider()
st.subheader("광고 제목 & 문구")

title         = st.text_input("광고 제목", value=CFG["default_creative"]["title"])
use_default   = st.checkbox("기본 광고 문구 사용", value=True)

saved_msg     = load_saved_message()

if use_default:
    message = saved_msg
    with st.expander("현재 저장된 기본 문구 확인"):
        st.text(saved_msg)
else:
    msg_col, btn_col = st.columns([5, 1])
    with msg_col:
        message = st.text_area("광고 문구", value=saved_msg, height=220, key="message_area")
    with btn_col:
        st.write("")
        st.write("")
        if st.button("💾 저장", help="다음 세션에도 이 문구가 기본값으로 사용됩니다"):
            save_message(message)
            st.success("저장됨!")

# ══ 실행 ══════════════════════════════════════════════════════
st.divider()

with st.expander("📋 실행 전 요약", expanded=True):
    r1, r2 = st.columns(2)
    with r1:
        st.markdown(f"""
| 항목 | 값 |
|------|-----|
| OS | **{os_key.upper()}** |
| 캠페인 | {campaign_name} |
| 새 광고세트명 | {adset_name_input or '(미입력)'} |
| 타겟 | {selected_saved_audience['name'] if selected_saved_audience else f'{targeting_key} (직접 설정)'} |
""")
    with r2:
        st.markdown(f"""
| 항목 | 값 |
|------|-----|
| 일예산 | {'CBO' if is_cbo else f'₩{budget:,}'} |
| 파일 수 | {len(uploaded_files)}개 |
| 광고명 | {ad_names[0] if ad_names else '(미설정)'}{'...' if len(ad_names) > 1 else ''} |
| 생성 상태 | ⏸ PAUSED |
""")

# 유효성 최종 체크
final_errors = []
if not adset_name_input.strip():
    final_errors.append("광고세트명을 입력해주세요.")
if targeting_key in ("re", "lookalike") and not selected_saved_audience:
    final_errors.append("리타겟/유사타겟 세팅에는 저장된 타겟(Saved Audience)을 선택해야 합니다.")
if any(not nm.strip() for nm in ad_names):
    final_errors.append("모든 광고 소재 이름을 입력해주세요.")

for err in final_errors:
    st.error(f"❌ {err}")

b1, b2 = st.columns(2)
with b1:
    run_dry  = st.button("🔍 미리보기 (API 호출 없음)", use_container_width=True, disabled=bool(final_errors))
with b2:
    run_real = st.button("🚀 광고 생성 시작", use_container_width=True, type="primary", disabled=bool(final_errors))

if not (run_dry or run_real):
    st.stop()

dry_run = run_dry and not run_real
params  = {
    "dry_run":                  dry_run,
    "os_key":                   os_key,
    "campaign_id":              campaign_id,
    "adset_name":               adset_name_input.strip(),
    "targeting_key":            targeting_key,
    "audience_ids":             audience_ids,
    "budget":                   budget,
    "is_cbo":                   is_cbo,
    "ad_names":                 [nm.strip() for nm in ad_names],
    "title":                    title,
    "message":                  message,
    "saved_audience_targeting": selected_saved_audience.get("targeting") if selected_saved_audience else None,
}

log_lines: list = []
log_area        = st.empty()

def log(msg):
    """로그 메시지를 누적하여 Streamlit UI에 마크다운으로 렌더링합니다."""
    log_lines.append(msg)
    log_area.markdown("\n\n".join(log_lines))

label = "⚠️ 미리보기 실행 중 (API 호출 없음)..." if dry_run else "🚀 광고 생성 중..."
try:
    with st.status(label, expanded=True) as status:
        adset_id, results = run_creation(params, uploaded_files, log)
        ok_cnt  = sum(1 for r in results if r["status"] == "ok")
        err_cnt = len(results) - ok_cnt
        status.update(
            label="🔍 미리보기 완료" if dry_run else f"✅ 완료  성공 {ok_cnt}개 / 실패 {err_cnt}개",
            state="complete",
        )

    st.subheader("📊 결과")
    st.code(f"광고세트 ID: {adset_id}", language=None)
    for r in results:
        if r["status"] == "ok":
            st.success(f"✅ {r['ad_name']}  |  광고 ID: {r['ad_id']}")
        else:
            with st.expander(f"❌ {r['file']} — 오류 상세"):
                st.error(r.get("error", "알 수 없는 오류"))

    if not dry_run and results:
        summary = {
            "timestamp":    datetime.now().isoformat(),
            "campaign_id":  campaign_id,
            "campaign":     campaign_name,
            "adset_id":     adset_id,
            "adset_name":   adset_name_input,
            "os":           os_key,
            "targeting":    targeting_key,
            "ads":          results,
        }
        st.download_button(
            "📥 결과 JSON 다운로드",
            data=json.dumps(summary, ensure_ascii=False, indent=2),
            file_name=f"created_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json",
            mime="application/json",
        )
    st.info("⚠️ 광고 활성화는 Meta 광고 관리자에서 직접 진행하세요.")

except (RuntimeError, ValueError) as e:
    st.error(str(e))
