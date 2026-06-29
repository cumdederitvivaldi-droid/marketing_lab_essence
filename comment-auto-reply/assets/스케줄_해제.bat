@echo off
chcp 65001 >nul
REM 무인 초안 준비 스케줄 해제
cd /d "%~dp0\.."
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\register_schedule.ps1" -Action unregister
pause
