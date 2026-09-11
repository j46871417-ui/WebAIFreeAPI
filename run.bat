@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\tray.ps1"

