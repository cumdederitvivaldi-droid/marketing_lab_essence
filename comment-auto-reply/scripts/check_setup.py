# -*- coding: utf-8 -*-
"""
설치 자가진단. 무엇이 준비됐고 무엇이 빠졌는지 ✅/❌ 로 알려준다.
사용: python check_setup.py  (또는 assets/점검.bat)
"""
import sys, os
_usersite = os.path.join(os.environ.get("APPDATA", ""), "Python", "Python312", "site-packages")
if os.path.isdir(_usersite) and _usersite not in sys.path:
    sys.path.insert(0, _usersite)
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import config

ROOT = Path(__file__).resolve().parent.parent
ok_all = True


def line(ok, label, hint=""):
    global ok_all
    mark = "✅" if ok else "❌"
    print(f"  {mark} {label}" + (f"   → {hint}" if (not ok and hint) else ""))
    if not ok:
        ok_all = False


def warn(label, hint=""):
    print(f"  ⚠️  {label}" + (f"   → {hint}" if hint else ""))


print("\n=== 댓글 자동답글 설치 점검 ===\n")

# Python
line(sys.version_info[:2] >= (3, 10), f"Python {sys.version.split()[0]}", "Python 3.12 설치 + PATH 추가")

# 패키지
for mod, pip in [("playwright", "playwright"), ("gspread", "gspread"),
                 ("anthropic", "anthropic"), ("openpyxl", "openpyxl"),
                 ("google.oauth2.credentials", "google-auth")]:
    try:
        __import__(mod)
        line(True, f"패키지 {pip}")
    except Exception:
        line(False, f"패키지 {pip}", f"설치.bat 재실행 (pip install {pip})")

cfg = config.CFG

# Chrome 경로
try:
    chrome = config.find_chrome(cfg)
    line(True, f"Chrome 발견")
except SystemExit:
    line(False, "Chrome 미발견", "Chrome 설치 또는 config.json 의 chrome_path")

# 디버그 크롬 떠 있는지
import urllib.request
port = cfg["cdp_port"]
try:
    with urllib.request.urlopen(f"http://localhost:{port}/json/version", timeout=3):
        line(True, f"디버그 크롬 실행 중 (포트 {port})")
except Exception:
    warn(f"디버그 크롬 미실행 (포트 {port})", "크롬_디버그_실행.bat 으로 켜고 로그인하세요(실행 시 필요)")

# API 키 (선택: 없으면 템플릿 방식으로 동작)
if config.anthropic_key(cfg):
    print("  ✅ Anthropic API 키 (AI 답글 — 더 자연스러움)")
else:
    warn("Anthropic API 키 없음 (선택사항)", "없어도 템플릿 방식으로 무료 동작 / 키 있으면 더 자연스러운 답글")

# config.json
line((ROOT / "config.json").exists(), "config.json 존재",
     "config.example.json 을 복사해 config.json 으로 저장")

# 기준 시트(스냅샷 또는 최신)
has_rules = (ROOT / "out" / "rules.json").exists() or (ROOT / "references" / "rules_snapshot.json").exists()
line(has_rules, "답글 기준 시트(스냅샷/최신)", "references/rules_snapshot.json 누락 — 저장소 다시 받기")

# gcloud (선택)
try:
    config.find_gcloud(cfg)
    print("  ✅ gcloud 발견 (시트 최신화 가능)")
except SystemExit:
    warn("gcloud 없음 (선택사항)", "없어도 동봉 스냅샷으로 동작 / 시트 최신화하려면 gcloud + gcloud auth login")

print("\n" + ("🎉 핵심 항목 준비 완료! 1_초안생성.bat 을 실행하세요." if ok_all
              else "위 ❌ 항목을 해결한 뒤 다시 점검하세요. 막히면 이도형에게 문의.") + "\n")
