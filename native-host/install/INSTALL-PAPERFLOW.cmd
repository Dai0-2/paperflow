@echo off
setlocal
cd /d "%~dp0"

echo Installing PaperFlow Native Host for the current Windows user...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1" -BinaryPath "%~dp0paperflow-host.exe"

if errorlevel 1 (
  echo.
  echo Installation failed. Keep this window open and send the error to PaperFlow support.
  pause
  exit /b 1
)

echo.
echo Installation completed.
echo Fully close and reopen Chrome, then sign in from PaperFlow.
pause
