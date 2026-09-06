@echo off
REM ===========================================================================
REM  ResumeMaxxer - stop everything and free the ports
REM
REM  Closing the three service windows does not reliably kill what they
REM  started. `npm run dev` and `npm run start` each spawn a child node
REM  process, and closing the console can leave that child orphaned and still
REM  bound to its port. The next `start.bat` then fails with:
REM
REM     Error: Port 5173 is already in use
REM     ERROR: [WinError 10013] An attempt was made to access a socket in a
REM            way forbidden by its access permissions
REM
REM  This kills whatever is listening on the app's ports, whoever started it,
REM  and stops the LaTeX container.
REM ===========================================================================

setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo   Stopping ResumeMaxxer
echo   =====================
echo.

set "FREED="

REM  The regex matches IPv4 (0.0.0.0:5173) and IPv6 ([::1]:5173) listeners.
REM  Vite binds IPv6 by default, so a plain ":%%P " search misses it.
for %%P in (3000 8000 5173) do (
    set "DONE_%%P="
    for /f "tokens=5" %%I in ('netstat -ano -p tcp ^| findstr /r /c:"LISTENING" ^| findstr /r /c:":%%P[ ]"') do (
        if not defined DONE_%%P (
            set "DONE_%%P=1"
            set "FREED=1"
            for /f "delims=" %%N in ('powershell -NoProfile -Command "(Get-Process -Id %%I -EA SilentlyContinue).ProcessName"') do (
                echo   Port %%P  stopping %%N ^(PID %%I^)
            )
            taskkill /PID %%I /T /F >nul 2>&1
        )
    )
    if not defined DONE_%%P echo   Port %%P  already free
)

REM  The LaTeX compiler is a container, so it outlives every window. Left
REM  running it is harmless, but "stop" should mean stop. The Tectonic package
REM  cache is a named volume and survives this.
docker info >nul 2>&1
if errorlevel 1 (
    echo   Docker    not running, nothing to stop
) else (
    docker compose ps --quiet 2>nul | findstr /r "." >nul 2>&1
    if errorlevel 1 (
        echo   Docker    LaTeX service not running
    ) else (
        echo   Docker    stopping the LaTeX service
        docker compose down >nul 2>&1
        set "FREED=1"
    )
)

echo.
if defined FREED (
    echo   Stopped. Ports are free.
) else (
    echo   Nothing was running.
)
echo.

endlocal
