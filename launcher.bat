@echo off
chcp 65001 >nul
cd /d "%~dp0"
"%~dp0node\node.exe" "%~dp0bin\launcher.mjs" %*
