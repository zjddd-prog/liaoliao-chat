@echo off
echo ============================================
echo    聊聊 ChatSpace - 启动聊天服务器
echo ============================================
echo.
echo 正在启动服务器...
echo.

cd /d "%~dp0"

set NODE_OPTIONS=
node server.js

pause
