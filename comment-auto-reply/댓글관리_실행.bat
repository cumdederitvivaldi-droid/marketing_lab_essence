@echo off
REM 커버링 댓글 자동답글 프로그램 실행 (창이 뜹니다)
cd /d "%~dp0"
start "" pythonw "scripts\gui.py"
if errorlevel 1 start "" python "scripts\gui.py"
