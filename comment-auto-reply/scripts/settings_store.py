# -*- coding: utf-8 -*-
"""
답글 '기준' 설정 저장소.
- reply_settings.json (비밀 아님 → 저장소/팀 공유 가능): 답글 톤 지침 + 유형별 템플릿 override
- config.json (gitignore): API 키 / 모델  ← 여기서 읽고 씀
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SETTINGS_PATH = ROOT / "reply_settings.json"
CONFIG_PATH = ROOT / "config.json"

DEFAULTS = {
    "tone_guide": "",      # AI 답글 생성 시 시스템 프롬프트에 추가할 지침(비우면 기본만)
    "templates": {},       # {유형라벨: 답글문구}  비어있으면 template_engine 기본 사용
}


def load():
    cfg = dict(DEFAULTS)
    if SETTINGS_PATH.exists():
        try:
            u = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
            for k in DEFAULTS:
                if k in u:
                    cfg[k] = u[k]
        except Exception:
            pass
    return cfg


def save(d):
    out = {k: d.get(k, DEFAULTS[k]) for k in DEFAULTS}
    SETTINGS_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")


def get_api():
    """(key, model) — config.json 에서."""
    key, model = "", "claude-opus-4-8"
    if CONFIG_PATH.exists():
        try:
            c = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            key = c.get("anthropic_api_key", "") or ""
            model = c.get("anthropic_model", model) or model
        except Exception:
            pass
    return key, model


def set_api(key, model):
    """config.json 의 키/모델만 갱신(파일 없으면 생성, 다른 값 보존)."""
    c = {}
    if CONFIG_PATH.exists():
        try:
            c = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception:
            c = {}
    c["anthropic_api_key"] = key
    c["anthropic_model"] = model
    CONFIG_PATH.write_text(json.dumps(c, ensure_ascii=False, indent=2), encoding="utf-8")
