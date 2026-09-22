@echo off
setlocal
cd /d "%~dp0"
title Seller Communication Portal v4.9.3R4.4 - Top-Level Workspace Login Handoff

echo ===============================================================
echo  Seller Communication Portal v4.9.3R4.4 - LOGIN HANDOFF FIX
echo  Run this file only. Existing Smart Links / Sheets are NOT reset.
echo ===============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo STOP: Node.js is required. Use the same PC/profile used for R4.3.
  pause
  exit /b 1
)

node "app\tools\validate-r4.4.mjs"
if errorlevel 1 (
  echo.
  echo STOP: Local R4.4 validation failed. Nothing was deployed.
  pause
  exit /b 1
)

node "app\tools\r44-workspace-login-recovery.mjs"
set RC=%ERRORLEVEL%
echo.
if not "%RC%"=="0" (
  echo [STOPPED SAFELY] R4.4 login handoff recovery did not complete.
  echo Existing Tracking_Links / Short_Link_Routes were not reset.
) else (
  echo [DONE] R4.4 deployed. In the browser, click the orange Continue button once.
)
echo.
pause
exit /b %RC%
