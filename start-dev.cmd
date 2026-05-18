@echo off
setlocal

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1" %*
set "EXITCODE=%ERRORLEVEL%"
echo.
if not "%EXITCODE%"=="0" (
  echo.
  echo Startup failed.
  pause >nul
  exit /b %EXITCODE%
)

echo Startup finished.
echo Frontend: http://127.0.0.1:5173
echo Backend : http://127.0.0.1:5000/api/health
echo Browser : opens automatically unless you pass -NoBrowser
echo Press any key to close this window.
pause >nul

endlocal
