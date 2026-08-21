@echo off
REM ============================================================
REM  MarinaAI Command Hub - Startup / Apply-Updates
REM  Ensures the dashboard service is running with the LATEST
REM  code and frontend build on every boot / after updates.
REM
REM  Usage:
REM    startup.bat            -> rebuild frontend + restart service
REM    startup.bat --check    -> only verify service is running
REM ============================================================
setlocal enabledelayedexpansion

set "APP_DIR=C:\Users\linde\Projects\MarinaAI\agent"
set "SERVICE=MarinaAI"
set "PORT=3000"
set "NODE=C:\Program Files\nodejs\node.exe"

cd /d "%APP_DIR%"

echo ============================================================
echo  MarinaAI Command Hub - Startup Sequence
echo ============================================================

REM ---- Check if running as Administrator ----
net session >nul 2>&1
if %errorlevel%==0 (
    set "IS_ADMIN=1"
) else (
    set "IS_ADMIN=0"
)

REM ---- Optional: rebuild frontend (skip with --check) ----
if /i "%~1"=="--check" goto :check_only

echo.
echo [1/3] Rebuilding frontend (npm run build)...
call npm run build
if %errorlevel% neq 0 (
    echo   ERROR: Frontend build failed. Continuing with existing dist/.
) else (
    echo   Frontend build OK.
)

echo.
echo [2/3] Restarting service to load latest code...
if "%IS_ADMIN%"=="1" (
    net stop %SERVICE% >nul 2>&1
    timeout /t 2 /nobreak >nul
    net start %SERVICE% >nul 2>&1
    if %errorlevel% equ 0 (
        echo   Service restarted OK.
    ) else (
        echo   WARNING: Could not restart service. It may already be running.
    )
) else (
    echo   NOT running as Administrator - cannot restart service.
    echo   The service auto-starts on boot with the latest code.
    echo   To apply updates now, run this script as Administrator.
)

:check_only
echo.
echo [3/3] Verifying dashboard is responding on port %PORT%...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:%PORT%/api/health' -UseBasicParsing -TimeoutSec 5; Write-Host ('  Dashboard OK - HTTP ' + $r.StatusCode) } catch { Write-Host '  Dashboard NOT responding.' }"

echo.
echo ============================================================
echo  Startup sequence complete.
echo  Command Hub: http://localhost:%PORT%
echo ============================================================
endlocal
