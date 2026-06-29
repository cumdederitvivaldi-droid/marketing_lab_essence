@echo off
chcp 65001 >nul
REM ============================================================
REM  [무인용] 댓글 수집 + AI/템플릿 초안 + 검토 엑셀 준비 (게시는 안 함)
REM  스케줄러(09:00/19:00)가 이 파일을 실행합니다. 사람이 도착해 엑셀만 검토→게시.
REM ============================================================
cd /d "%~dp0\.."
echo [%date% %time%] auto_draft 시작 >> "out\_auto_draft.log"

REM 디버그 크롬이 떠 있지 않으면 실행 (로그인은 프로필에 유지됨)
powershell -NoProfile -Command "try{(Invoke-WebRequest 'http://localhost:9222/json/version' -UseBasicParsing -TimeoutSec 3)|Out-Null;exit 0}catch{exit 1}"
if errorlevel 1 (
  echo [%date% %time%] 크롬 실행 >> "out\_auto_draft.log"
  python "scripts\launch_chrome.py" >> "out\_auto_draft.log" 2>&1
  timeout /t 15 /nobreak >nul
)

python "scripts\scrape_comments.py"  >> "out\_auto_draft.log" 2>&1
python "scripts\read_rules.py"       >> "out\_auto_draft.log" 2>&1
python "scripts\generate_drafts.py"  >> "out\_auto_draft.log" 2>&1
python "scripts\make_review_xlsx.py" >> "out\_auto_draft.log" 2>&1

echo [%date% %time%] 완료 — out\검토_답글.xlsx 준비됨 (검토 후 2_게시.bat) >> "out\_auto_draft.log"
