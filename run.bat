@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist "%~dp0bin\WebAIFreeAPI.exe" (
    start "" "%~dp0bin\WebAIFreeAPI.exe"
) else (
    powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\tray.ps1"
)

