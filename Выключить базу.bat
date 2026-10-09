@echo off
chcp 65001 >nul
cd /d "%~dp0"
title БД ФСИТ
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop.ps1"
echo.
pause
