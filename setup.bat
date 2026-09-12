@echo off
title WebAIFreeAPI Setup
cd /d "%~dp0"
echo ========================================================
echo             WebAIFreeAPI Setup
echo ========================================================
echo.

set "TARGET_DIR=C:\ai-free"

if /i "%CD%" NEQ "%TARGET_DIR%" (
    echo [1/4] Copying files to %TARGET_DIR%...
    if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
    robocopy . "%TARGET_DIR%" /E /XC /XN /XO /NFL /NDL /NJH /NJS >nul
    cd /d "%TARGET_DIR%"
)

echo [2/4] Verifying browser components...
call "%TARGET_DIR%\node\node.exe" "%TARGET_DIR%\node_modules\playwright\cli.js" install chromium
call "%TARGET_DIR%\node\node.exe" "%TARGET_DIR%\node_modules\patchright\cli.js" install chromium

echo [3/4] Creating desktop shortcuts...
call "%TARGET_DIR%\node\node.exe" "%TARGET_DIR%\scripts\create-shortcuts.mjs"

echo [4/4] Configuring OpenCode Desktop integration...
call "%TARGET_DIR%\node\node.exe" "%TARGET_DIR%\scripts\setup-opencode.mjs"

echo.
echo ========================================================
echo             Installation completed!
echo ========================================================
echo.
echo Launching WebAIFreeAPI Launcher...
start "" "%TARGET_DIR%\launcher.bat"
exit
