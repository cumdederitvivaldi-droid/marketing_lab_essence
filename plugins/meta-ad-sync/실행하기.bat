@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo =============================================
echo  커버링 효율정리 - 신규 소재 추가 자동화
echo =============================================
echo.

REM Python 확인
where python >nul 2>&1
if errorlevel 1 (
    echo [오류] Python이 설치되어 있지 않습니다.
    echo https://www.python.org/downloads/ 에서 설치 후 재실행하세요.
    pause & exit /b 1
)

REM openpyxl 확인 및 설치
python -c "import openpyxl" >nul 2>&1
if errorlevel 1 (
    echo [안내] openpyxl 설치 중...
    python -m pip install openpyxl
)

REM config.py 존재 여부 확인
if not exist config.py (
    echo [오류] config.py 파일이 없습니다.
    echo config.example.py 를 복사하여 config.py 로 이름 변경 후 내용을 채우세요.
    pause & exit /b 1
)

echo 실행 중...
echo.
python scripts\core.py

if errorlevel 1 (
    echo.
    echo [오류] 실행 중 문제가 발생했습니다. 위 메시지를 확인하세요.
) else (
    echo.
    echo ver2.xlsx 파일이 생성되었습니다.
)

echo.
pause
