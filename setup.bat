@echo off
chcp 65001 >nul
title Установка AI Free
cd /d "%~dp0"
echo ========================================================
echo        Установка AI Free на ваш компьютер
echo ========================================================
echo.

set "TARGET_DIR=C:\ai-free"

if /i "%CD%" NEQ "%TARGET_DIR%" (
    echo [1/4] Копирование файлов в %TARGET_DIR%...
    if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
    robocopy . "%TARGET_DIR%" /E /XC /XN /XO /NFL /NDL /NJH /NJS >nul
    cd /d "%TARGET_DIR%"
)

echo [2/4] Проверка браузерных компонентов Chromium для Playwright...
call "%TARGET_DIR%\node\node.exe" "%TARGET_DIR%\node_modules\playwright\cli.js" install chromium
call "%TARGET_DIR%\node\node.exe" "%TARGET_DIR%\node_modules\patchright\cli.js" install chromium

echo [3/4] Создание ярлыков на Рабочем столе...
call "%TARGET_DIR%\node\node.exe" "%TARGET_DIR%\scripts\create-shortcuts.mjs"

echo [4/4] Настройка конфигурации для OpenCode Desktop...
call "%TARGET_DIR%\node\node.exe" "%TARGET_DIR%\scripts\setup-opencode.mjs"

echo.
echo ========================================================
echo          Установка успешно завершена!
echo ========================================================
echo.
echo Запуск AI Free Launcher...
start "" "%TARGET_DIR%\launcher.bat"
exit
