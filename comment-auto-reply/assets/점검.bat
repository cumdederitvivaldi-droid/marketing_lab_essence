@echo off
chcp 65001 >nul
REM 설치가 제대로 됐는지 자가진단 (무엇이 빠졌는지 알려줍니다)
cd /d "%~dp0\.."
python "scripts\check_setup.py"
pause
