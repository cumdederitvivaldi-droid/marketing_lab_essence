# -*- coding: utf-8 -*-
"""
config.json 을 읽어 디버그 크롬을 띄운다 (경로/포트/URL 자동 적용).
팀원 PC에서도 chrome.exe 위치를 자동으로 찾는다.
"""
import sys, os, subprocess
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import config
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

cfg = config.CFG
chrome = config.find_chrome(cfg)
profile = str(Path(os.environ["USERPROFILE"]) / cfg["chrome_profile_dirname"])
port = cfg["cdp_port"]

args = [chrome, f"--remote-debugging-port={port}", f"--user-data-dir={profile}",
        cfg["meta_inbox_url"], cfg["tiktok_comments_url"],
        f"https://docs.google.com/spreadsheets/d/{cfg['rules_spreadsheet_id']}/edit"]

print(f"전용 크롬 실행 (포트 {port})\n  chrome: {chrome}\n  프로필: {profile}")
subprocess.Popen(args)
print("\n뜬 크롬에서 Meta / TikTok / Google 에 로그인하세요. (이 창은 닫아도 됩니다)")
