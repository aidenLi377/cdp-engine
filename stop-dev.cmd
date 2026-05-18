@echo off
setlocal

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-dev.ps1" %*
set "EXITCODE=%ERRORLEVEL%"
echo.
if not "%EXITCODE%"=="0" (
  echo.
  echo Stop failed.
  pause >nul
  exit /b %EXITCODE%
)

echo Stop finished.
echo Press any key to close this window.
pause >nul

endlocal
