@echo off
chcp 65001 >nul
cd /d "C:\ai-free"
set "PATH=C:\ai-free\node;%PATH%"
node "C:\Users\gabov\.ai-free\launcher.mjs"
pause

