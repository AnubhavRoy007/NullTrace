@echo off
title NullTrace Server
cd /d "%~dp0server"

echo.
echo ========================================
echo   NullTrace - Local Server
echo ========================================
echo.

REM Try common Node.js install locations if not on PATH
set "NODE_EXE="
where node >nul 2>&1 && set "NODE_EXE=node"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\node\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\node\node.exe"
if not defined NODE_EXE if exist "%USERPROFILE%\Coding\node.exe" set "NODE_EXE=%USERPROFILE%\Coding\node.exe"

if not defined NODE_EXE (
  echo [ERROR] Node.js was not found.
  echo.
  echo 1. Download and install from: https://nodejs.org
  echo 2. During install, check "Add to PATH"
  echo 3. Close this window, open a NEW Command Prompt, run this file again
  echo.
  pause
  exit /b 1
)

echo Found Node: %NODE_EXE%
"%NODE_EXE%" --version
echo.

REM Port already in use = server probably already running (not a real failure)
netstat -ano 2>nul | findstr ":3847" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo [OK] Server is ALREADY RUNNING on port 3847.
  echo.
  echo   Pitch deck: http://127.0.0.1:3847/demo
  echo   Health:     http://127.0.0.1:3847/health
  echo.
  echo If you want to restart, close the other server window first.
  echo.
  pause
  exit /b 0
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
  echo.
)

echo Starting server at http://127.0.0.1:3847
echo Pitch deck:  http://127.0.0.1:3847/demo
echo Press Ctrl+C to stop.
echo.
"%NODE_EXE%" index.js
if errorlevel 1 (
  echo.
  echo [ERROR] Server exited with an error.
  echo If you see EADDRINUSE, another copy is already running.
  echo.
)

pause
