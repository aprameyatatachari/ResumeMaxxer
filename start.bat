@echo off
REM ===========================================================================
REM  ResumeMaxxer - start everything
REM
REM  Starts the LaTeX compiler container, then launches the three application
REM  services in separate windows:
REM     latex-pdf    http://localhost:2020   Tectonic (Docker)
REM     auth-server  http://localhost:3000   Better Auth (Node)
REM     backend      http://localhost:8000   FastAPI
REM     frontend     http://localhost:5173   Vite
REM
REM  Ports are fixed on purpose - the JWT issuer/audience and both CORS
REM  allowlists are pinned to them, so a service that moves will fail to
REM  authenticate rather than silently degrade.
REM
REM  Run from anywhere: double-click, or `start.bat` in a terminal.
REM  Close the three windows to stop everything.
REM ===========================================================================

setlocal
cd /d "%~dp0"

echo.
echo   ResumeMaxxer
echo   ============
echo.

REM --- Preflight: fail early with a clear message rather than three broken
REM     windows the user has to read stack traces out of. ---------------------

set "MISSING="

if not exist "backend\.env"     set "MISSING=%MISSING% backend\.env"
if not exist "auth-server\.env" set "MISSING=%MISSING% auth-server\.env"
if not exist "frontend\.env.local" set "MISSING=%MISSING% frontend\.env.local"

if not "%MISSING%"=="" (
    echo   [X] Missing config file^(s^):%MISSING%
    echo.
    echo       Copy the templates and fill them in:
    echo         copy backend\.env.example backend\.env
    echo         copy auth-server\.env.example auth-server\.env
    echo         copy frontend\.env.example frontend\.env.local
    echo.
    pause
    exit /b 1
)

if not exist "backend\.venv\Scripts\python.exe" (
    echo   [X] Python virtualenv not found at backend\.venv
    echo.
    echo       Create it:
    echo         cd backend ^&^& python -m venv .venv
    echo         .venv\Scripts\python.exe -m pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

if not exist "auth-server\node_modules" (
    echo   [X] auth-server dependencies not installed.
    echo       Run:  cd auth-server ^&^& npm install
    echo.
    pause
    exit /b 1
)

if not exist "frontend\node_modules" (
    echo   [X] frontend dependencies not installed.
    echo       Run:  cd frontend ^&^& npm install
    echo.
    pause
    exit /b 1
)

REM --- Warn about ports already in use, but keep going: a leftover process
REM     from a previous run is common and the service will say so itself. -----

REM  The regex matches both IPv4 (0.0.0.0:5173) and IPv6 ([::1]:5173) listeners.
REM  Vite binds IPv6 by default, so a plain ":%%P " search misses it entirely.
for %%P in (2020 3000 8000 5173) do (
    netstat -ano -p tcp | findstr /r /c:"LISTENING" | findstr /r /c:":%%P[ ]" >nul 2>&1
    if not errorlevel 1 echo   [!] Port %%P is already in use - that service may fail to start.
)

REM --- LaTeX compiler -------------------------------------------------------
REM  The resume is generated as real LaTeX and compiled by a container. Without
REM  it the app runs but the preview and download fail with a clear message.

docker info >nul 2>&1
if errorlevel 1 (
    echo   [!] Docker is not running - the PDF preview will not work.
    echo       Start Docker Desktop, then: docker compose up -d
) else (
    echo   Starting LaTeX service ^(http://localhost:2020^) ...
    docker compose up -d >nul 2>&1
    if errorlevel 1 (
        echo   [!] docker compose failed. Run it by hand to see why.
    )
)

REM --- Launch ---------------------------------------------------------------
REM  Each service gets its own titled window so logs stay readable and any one
REM  of them can be restarted without killing the others.

echo   Starting auth service  ^(http://localhost:3000^) ...
start "ResumeMaxxer auth" cmd /k "cd /d "%~dp0auth-server" && npm run dev"

REM  The backend fetches the auth service's JWKS on its first authenticated
REM  request, not at boot, so it does not need auth to be up first. The pause
REM  is only so the three windows appear in a sensible order.
timeout /t 2 /nobreak >nul

echo   Starting backend       ^(http://localhost:8000^) ...
start "ResumeMaxxer backend" cmd /k "cd /d "%~dp0backend" && .venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000"

timeout /t 2 /nobreak >nul

echo   Starting frontend      ^(http://localhost:5173^) ...
start "ResumeMaxxer frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo   All three starting in separate windows.
echo.
echo     App        http://localhost:5173
echo     API docs   http://localhost:8000/docs
echo     Health     http://localhost:8000/health
echo.
echo   Close those windows to stop the services.
echo.

endlocal
