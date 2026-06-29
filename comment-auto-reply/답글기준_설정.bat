@echo off
REM 답글 기준 설정 창 (API키/모델/톤/유형별 답글)
cd /d "%~dp0"
start "" pythonw "scripts\settings_gui.py"
if errorlevel 1 start "" python "scripts\settings_gui.py"
