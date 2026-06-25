@echo off
chcp 65001 >nul
REM 매일 09:00 / 19:00 무인 초안 준비 스케줄 등록
cd /d "%~dp0\.."
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\register_schedule.ps1" -Action register
echo.
echo 게시는 자동으로 되지 않습니다. 9시/7시에 초안과 검토엑셀이 준비되면,
echo 검토 후 2_게시.bat 으로 직접 게시하세요.
pause
