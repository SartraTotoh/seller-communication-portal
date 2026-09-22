@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Seller Communication Portal v4.9.3 - TRIPLE SOURCE + CAMPAIGN 360
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0AUTO-DEPLOY.ps1"
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" (
  echo [STOPPED SAFELY] Seller Communication Portal v4.9.3 was not fully deployed.
  echo Exit code: %RC%
  echo No Education Portal deployment is permitted by this package.
  echo.
  pause
  exit /b %RC%
)
echo [DONE] Seller Communication Portal v4.9.3 auto deploy completed.
echo Live Sync setup and Production verification were opened in your browser.
echo.
pause
endlocal
