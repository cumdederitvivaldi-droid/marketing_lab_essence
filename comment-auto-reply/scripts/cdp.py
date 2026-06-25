# -*- coding: utf-8 -*-
"""
공통 헬퍼: 디버그 포트 9222로 떠 있는 전용 크롬에 CDP로 붙어
이미 로그인된 브라우저 컨텍스트를 그대로 사용한다.

전제: assets/크롬_디버그_실행.bat 로 크롬을 먼저 띄워둘 것.
"""
import io
import os
import sys
import json
from pathlib import Path

# pip --user 설치 경로 보조 추가 (존재할 때만)
_usersite = os.path.join(os.environ.get("APPDATA", ""), "Python", "Python312", "site-packages")
if os.path.isdir(_usersite) and _usersite not in sys.path:
    sys.path.insert(0, _usersite)

# 한글 출력 깨짐 방지 (이중 래핑/버퍼 닫힘 방지를 위해 reconfigure 사용)
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config
from playwright.sync_api import sync_playwright

CDP_URL = f"http://localhost:{config.CFG['cdp_port']}"

# ── 경로 (comment-reply/ 기준) ─────────────────────────────
ROOT = Path(__file__).resolve().parent.parent          # .../comment-reply
OUT_DIR = ROOT / "out"
STATE_DIR = ROOT / "state"
OUT_DIR.mkdir(exist_ok=True)
STATE_DIR.mkdir(exist_ok=True)

COMMENTS_JSON = OUT_DIR / "comments.json"
RULES_JSON = OUT_DIR / "rules.json"
DRAFTS_JSON = OUT_DIR / "drafts.json"
DRAFTS_APPROVED_JSON = OUT_DIR / "drafts_approved.json"
REPLIED_JSON = STATE_DIR / "replied.json"


def connect():
    """
    (playwright, browser) 를 돌려준다.
    호출부에서 browser.contexts[0] 로 로그인된 컨텍스트를 얻어 쓴다.
    사용 후 playwright.stop() 을 호출할 것 (browser.close() 하면 사용자의 크롬이 닫히므로 금지).
    """
    pw = sync_playwright().start()
    try:
        browser = pw.chromium.connect_over_cdp(CDP_URL)
    except Exception as e:
        pw.stop()
        raise SystemExit(
            f"[연결 실패] 디버그 크롬({CDP_URL})에 붙지 못했습니다.\n"
            f"  → assets/크롬_디버그_실행.bat 으로 크롬을 먼저 켜세요.\n"
            f"  상세: {e}"
        )
    if not browser.contexts:
        pw.stop()
        raise SystemExit("[오류] 브라우저 컨텍스트가 없습니다. 크롬을 다시 실행해 주세요.")
    return pw, browser


def get_context(browser):
    """로그인 세션이 들어있는 기본 컨텍스트."""
    return browser.contexts[0]


# ── 상태(이미 답글 단 댓글) 입출력 ─────────────────────────
def load_replied():
    if REPLIED_JSON.exists():
        return set(json.loads(REPLIED_JSON.read_text(encoding="utf-8")))
    return set()


def add_replied(comment_ids):
    cur = load_replied()
    cur.update(comment_ids)
    REPLIED_JSON.write_text(
        json.dumps(sorted(cur), ensure_ascii=False, indent=2), encoding="utf-8"
    )


def save_json(path: Path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def load_json(path: Path, default=None):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default
