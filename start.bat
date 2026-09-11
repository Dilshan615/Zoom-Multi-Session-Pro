@echo off
title Zoom Multi-Session Bot
cd /d "%~dp0"
echo ====================================================
echo   Starting Zoom Multi-Session Bot Pro...
echo ====================================================
echo.
start http://localhost:3000
node server.js
pause
