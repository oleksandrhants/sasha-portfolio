@echo off
setlocal
cd /d "%~dp0"
set "EDITOR_NODE=node"
where node >nul 2>nul
if errorlevel 1 (
  if exist "%ProgramFiles%\nodejs\node.exe" (
    set "EDITOR_NODE=%ProgramFiles%\nodejs\node.exe"
  ) else (
    echo Install Node.js LTS from https://nodejs.org and run this file again.
    pause
    exit /b 1
  )
)
set "EDITOR_CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%EDITOR_CHROME%" set "EDITOR_CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%EDITOR_CHROME%" set "EDITOR_CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not exist "%EDITOR_CHROME%" (
  echo Google Chrome was not found. Install Chrome and try again.
  pause
  exit /b 1
)
echo Keep this window open while editing. Ctrl+C stops the server.
"%EDITOR_NODE%" editor\server.cjs --chrome "%EDITOR_CHROME%"
pause
