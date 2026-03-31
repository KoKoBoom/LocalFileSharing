@echo off
setlocal

set PORT=8800

cd /d "%~dp0"

:main
cls
echo =======================================
echo Private Transfer Station Server
echo =======================================
echo.

echo [1/5] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [INFO] Node.js not found. Please install it from https://nodejs.org/
    echo.
    echo Waiting for Node.js installation...
    call :wait_for_node
    if errorlevel 1 (
        echo [ERROR] Node.js installation timeout
        pause
        exit /b 1
    )
)
echo [OK] Node.js is installed
echo.

echo [2/5] Checking dependencies...
if not exist "node_modules" (
    echo [INFO] node_modules not found
    echo [INFO] Installing dependencies...
    call :install_deps
    if errorlevel 1 (
        echo [ERROR] Dependency installation failed
        pause
        exit /b 1
    )
)
echo [OK] Dependencies ready
echo.

echo [3/5] Checking index.js...
if not exist "index.js" (
    echo [INFO] index.js not found
    echo [INFO] Building project...
    call :build_project
    if errorlevel 1 (
        echo [ERROR] Build failed
        pause
        exit /b 1
    )
)
echo [OK] Build ready
echo.

echo [4/5] Checking port...
netstat -ano | findstr :%PORT% >nul 2>&1
if not errorlevel 1 (
    echo [WARNING] Port %PORT% is in use, attempting to free it...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%PORT%') do (
        taskkill /F /PID %%a >nul 2>&1
    )
    timeout /t 2 >nul
)
echo [OK] Port %PORT% is available
echo.

echo [5/5] Starting server...
start "File Clipboard Server" cmd /min /k "node index.js"
timeout /t 3 >nul

netstat -ano | findstr :%PORT% >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Server failed to start
    pause
    exit /b 1
)

start http://localhost:%PORT%

cls
echo =======================================
echo Private Transfer Station Server
echo =======================================
echo.
echo [OK] Server started successfully!
echo.
echo Local URL: http://localhost:%PORT%
echo.
echo Press Ctrl+C or close window to stop
echo =======================================
echo.
goto :eof

:wait_for_node
set /a count=0
:wait_node_loop
cls
echo =======================================
echo Private Transfer Station Server
echo =======================================
echo.
echo [1/5] Checking Node.js...
echo.
echo Waiting for Node.js installation...
echo.
echo Press Ctrl+C to cancel
echo.
set /a count+=1
if %count% gtr 120 (
    exit /b 1
)
timeout /t 5 >nul
node --version >nul 2>&1
if not errorlevel 1 (
    exit /b 0
)
goto wait_node_loop

:install_deps
call npm install
if errorlevel 1 exit /b 1
exit /b 0

:build_project
call npm run build
if errorlevel 1 exit /b 1
exit /b 0
