@echo off
chcp 65001 >nul
cd /d "C:\ai-free"
"C:\ai-free\node\node.exe" "C:\ai-free\bin\launcher.mjs" %*
