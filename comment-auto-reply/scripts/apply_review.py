# -*- coding: utf-8 -*-
"""
out/검토_답글.xlsx 의 승인 결과 → out/drafts_approved.json.
승인칸이 O(대소문자 무관)이고 답글초안이 비어있지 않은 행만 게시 대상으로 만든다.
엑셀에서 수정한 답글 텍스트가 그대로 반영된다.
"""
import sys, os, json
_usersite = os.path.join(os.environ.get("APPDATA", ""), "Python", "Python312", "site-packages")
if os.path.isdir(_usersite) and _usersite not in sys.path:
    sys.path.insert(0, _usersite)
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
DRAFTS = OUT / "drafts.json"
XLSX = OUT / "검토_답글.xlsx"
APPROVED = OUT / "drafts_approved.json"


def main():
    if not XLSX.exists():
        raise SystemExit("out/검토_답글.xlsx 이 없습니다. 먼저 make_review_xlsx.py 를 실행하세요.")
    drafts = json.loads(DRAFTS.read_text(encoding="utf-8")) if DRAFTS.exists() else []
    meta = {d["comment_id"]: d for d in drafts}

    wb = openpyxl.load_workbook(XLSX)
    ws = wb.active
    approved = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or len(row) < 8:
            continue
        _, platform, author, comment, reply, approve, _need, cid = row[:8]
        if not cid:
            continue
        if str(approve or "").strip().upper() != "O":
            continue
        reply = (reply or "").strip()
        if not reply:
            continue
        base = meta.get(cid, {})
        approved.append({
            "platform": base.get("platform", platform),
            "comment_id": cid,
            "author": base.get("author", author),
            "comment_text": base.get("comment_text", comment),
            "post_index": base.get("post_index", 0),
            "permalink": base.get("permalink", ""),
            "draft_reply": reply,
            "needs_human": False,
        })

    APPROVED.write_text(json.dumps(approved, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"승인 {len(approved)}건 → out/drafts_approved.json")
    if not approved:
        print("  (승인된 행이 없습니다. 엑셀에서 게시할 행의 '승인' 칸에 O 를 넣고 저장하세요.)")


if __name__ == "__main__":
    main()
