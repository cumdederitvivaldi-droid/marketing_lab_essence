# -*- coding: utf-8 -*-
"""
답글 기준 스프레드시트를 gcloud 토큰 + gspread 로 읽어 out/rules.json 에 저장한다.
(시트를 공개로 바꿀 필요 없음 — 로그인 계정 권한으로 비공개 접근)

기존 check_current_sheet.py 의 인증 패턴을 그대로 사용한다.
"""
import sys, os, subprocess, json
# pip --user 설치 경로가 sys.path 에 없을 때만 보조로 추가 (있을 때만, 다른 PC에서도 안전)
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

SPREADSHEET_ID = config.CFG["rules_spreadsheet_id"]

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "out"
OUT_DIR.mkdir(exist_ok=True)
RULES_JSON = OUT_DIR / "rules.json"


def main():
    # gcloud 가 없거나 인증이 안 돼 있으면, 에러 대신 안내만 하고 종료(스냅샷 사용).
    try:
        GCLOUD = config.find_gcloud(config.CFG)
        token = subprocess.check_output(
            [GCLOUD, "auth", "print-access-token"], shell=True
        ).decode().strip()
        if not token:
            raise RuntimeError("빈 토큰")
        import gspread
        from google.oauth2.credentials import Credentials
        gc = gspread.authorize(Credentials(token=token))
        ss = gc.open_by_key(SPREADSHEET_ID)
    except SystemExit:
        print("[건너뜀] gcloud 미설치/미인증 → 동봉된 기준 스냅샷을 사용합니다.")
        return
    except Exception as e:
        print(f"[건너뜀] 시트 갱신 실패({e}) → 동봉된 기준 스냅샷을 사용합니다.")
        return

    sheets = []
    for ws in ss.worksheets():
        vals = ws.get_all_values()
        sheets.append({
            "title": ws.title,
            "gid": ws.id,
            "rows": vals,            # 2D 배열 그대로 (헤더 포함)
        })
        print(f"[읽음] 시트 '{ws.title}'  {len(vals)}행")

    RULES_JSON.write_text(
        json.dumps({"spreadsheet_id": SPREADSHEET_ID, "sheets": sheets},
                   ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"\n저장 완료 → {RULES_JSON}")
    # 첫 시트 앞부분 미리보기
    if sheets and sheets[0]["rows"]:
        print("\n-- 미리보기 (첫 시트 최대 8행) --")
        for r in sheets[0]["rows"][:8]:
            print("  " + " | ".join(c for c in r if c.strip())[:200])


if __name__ == "__main__":
    main()
