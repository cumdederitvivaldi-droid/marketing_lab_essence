# -*- coding: utf-8 -*-
"""
설정 로더 + 경로 자동탐지. 팀원 PC마다 다른 부분(gcloud/chrome 경로)을 자동으로 찾는다.
config.json 은 comment-reply/ 루트에 있다.
"""
import os
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent      # .../comment-reply
CONFIG_PATH = ROOT / "config.json"

_DEFAULTS = {
    "brand_handle": "covering__official",
    "tiktok_brand_handle": "covering_dadama",
    "meta_inbox_url": ("https://business.facebook.com/latest/inbox/instagram"
                       "?asset_id=101050698831852&business_id=2631638427131158"
                       "&mailbox_id=101050698831852"),
    "tiktok_comments_url": "https://www.tiktok.com/business-suite/comments",
    "rules_spreadsheet_id": "1hDl3rXQLchiUqZzIX0MoMNC52rfzyU9jkdxq7qA6NPg",
    "cdp_port": 9222,
    "chrome_profile_dirname": "comment-reply-chrome",
    "gcloud_path": "",
    "chrome_path": "",
    "anthropic_api_key": "",
    "anthropic_model": "claude-opus-4-8",
}


def anthropic_key(cfg):
    """API 키: 환경변수 우선, 없으면 config.json."""
    return os.environ.get("ANTHROPIC_API_KEY") or cfg.get("anthropic_api_key") or ""


def load():
    cfg = dict(_DEFAULTS)
    if CONFIG_PATH.exists():
        try:
            user = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            cfg.update({k: v for k, v in user.items() if not k.startswith("_")})
        except Exception as e:
            print(f"[config] config.json 읽기 실패, 기본값 사용: {e}")
    return cfg


def find_gcloud(cfg):
    """gcloud 실행파일 경로 자동탐지."""
    if cfg.get("gcloud_path"):
        return cfg["gcloud_path"]
    for name in ("gcloud.cmd", "gcloud"):
        p = shutil.which(name)
        if p:
            return p
    # 흔한 설치 위치
    cands = [
        Path(os.environ.get("LOCALAPPDATA", "")) / r"Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
        Path(r"C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"),
        Path(r"C:\Program Files\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"),
    ]
    for c in cands:
        if c.exists():
            return str(c)
    raise SystemExit("[오류] gcloud 를 찾지 못했습니다. config.json 의 gcloud_path 에 직접 경로를 적거나 gcloud CLI를 설치하세요.")


def find_chrome(cfg):
    """chrome.exe 경로 자동탐지."""
    if cfg.get("chrome_path"):
        return cfg["chrome_path"]
    cands = [
        Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
        Path(os.environ.get("LOCALAPPDATA", "")) / r"Google\Chrome\Application\chrome.exe",
    ]
    for c in cands:
        if c.exists():
            return str(c)
    raise SystemExit("[오류] chrome.exe 를 찾지 못했습니다. config.json 의 chrome_path 에 직접 경로를 적으세요.")


CFG = load()
