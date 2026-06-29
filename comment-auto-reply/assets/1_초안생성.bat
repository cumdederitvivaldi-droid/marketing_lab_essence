@echo off
chcp 65001 >nul
REM ============================================================
REM  1단계: 댓글 수집 → AI 답글 초안 → 검토 엑셀 열기
REM  (먼저 크롬_디버그_실행.bat 으로 로그인된 크롬을 켜두세요)
REM ============================================================
cd /d "%~dp0\.."

echo [1/4] 댓글 수집 중...
python "scripts\scrape_comments.py"
if errorlevel 1 ( echo [오류] 댓글 수집 실패. 크롬이 켜져 있는지 확인하세요. & pause & exit /b 1 )

echo.
echo [2/4] 기준 시트 읽는 중...
python "scripts\read_rules.py"

echo.
echo [3/4] 답글 초안 생성 중... (키 있으면 AI, 없으면 템플릿)
python "scripts\generate_drafts.py"
if errorlevel 1 ( echo [오류] 초안 생성 실패. 점검.bat 으로 상태를 확인하세요. & pause & exit /b 1 )

echo.
echo [4/4] 검토용 엑셀 생성 중...
python "scripts\make_review_xlsx.py"

echo.
echo 검토 엑셀을 엽니다. 초안을 확인/수정하고, 게시할 행의 '승인' 칸에 O 를 두고 저장하세요.
start "" "out\검토_답글.xlsx"
echo 검토가 끝나면 2_게시.bat 을 실행하세요.
pause
