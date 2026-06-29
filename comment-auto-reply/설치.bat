@echo off
chcp 65001 >nul
REM ============================================================
REM  댓글 자동답글 - 팀원 PC 최초 설치 스크립트
REM  (한 번만 실행하면 됩니다)
REM ============================================================
echo ============================================
echo  댓글 자동답글 설치를 시작합니다
echo ============================================
echo.

REM 1) Python 확인
python --version >nul 2>&1
if errorlevel 1 (
  echo [오류] Python 이 설치되어 있지 않습니다.
  echo   https://www.python.org/downloads/ 에서 Python 3.12 설치 후, 설치 시
  echo   "Add Python to PATH" 체크하고 다시 실행하세요.
  pause
  exit /b 1
)
echo [1/4] Python 확인 완료
python --version

REM 2) 파이썬 패키지 설치
echo.
echo [2/4] 필요한 패키지 설치 (playwright, gspread, google-auth, anthropic, openpyxl)...
python -m pip install --user --upgrade playwright gspread google-auth google-auth-oauthlib anthropic openpyxl
if errorlevel 1 ( echo [오류] 패키지 설치 실패 & pause & exit /b 1 )

REM 3) Playwright 브라우저(크로미움) 설치
echo.
echo [3/4] Playwright 크로미움 설치...
python -m playwright install chromium

REM 4) gcloud 확인 (선택 — 시트 최신화용, 없어도 동봉 스냅샷으로 동작)
echo.
echo [4/4] gcloud 확인 (선택사항)...
where gcloud >nul 2>&1
if errorlevel 1 (
  echo   [안내] gcloud 가 없어도 됩니다. 답글 기준은 동봉된 스냅샷으로 동작합니다.
  echo   (기준 시트를 직접 최신화하려는 담당자만) https://cloud.google.com/sdk/docs/install 설치 후 gcloud auth login
) else (
  echo   gcloud 발견. 시트 최신화가 필요하면: gcloud auth login
)

echo.
echo.
echo [추가] Anthropic API 키는 '선택'입니다.
echo   - 키 없이도 템플릿 방식으로 무료 동작합니다(자주 나오는 질문 위주).
echo   - 키가 있으면 더 자연스러운 AI 답글: 환경변수 ANTHROPIC_API_KEY 또는 config.json 의 anthropic_api_key
echo   (팀 공용 키 하나를 config.json 에 넣어 배포해도 됩니다 / 발급: https://console.anthropic.com/)

echo.
echo ============================================
echo  설치 완료!  (먼저 assets\점검.bat 으로 준비상태를 확인할 수 있어요)
echo.
echo  ★ 가장 쉬운 방법: 폴더의 '댓글관리_실행.bat' 더블클릭 → 창에서 버튼만 누르면 됩니다
echo     [전용 크롬 열기]→로그인  →  [① 수집+초안]  →  표에서 검토  →  [② 게시]
echo.
echo  (대안: 엑셀 방식) 크롬_디버그_실행.bat → 1_초안생성.bat → 엑셀 검토 → 2_게시.bat
echo ============================================
echo.
echo 지금 바로 준비상태를 점검합니다...
python "scripts\check_setup.py"
pause
