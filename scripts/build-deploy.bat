@echo off
title Manufacturing ERP — Build & Deploy
cd /d "%~dp0.."

echo ============================================
echo  Manufacturing ERP — Build ^& Deploy
echo ============================================
echo.

:: Check prerequisites
where pnpm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] pnpm is not installed.
    echo Install it with: npm install -g pnpm
    pause
    exit /b 1
)

:: Step 1 — Install dependencies
echo [1/5] Installing dependencies...
call pnpm install
if %errorlevel% neq 0 (
    echo [!] pnpm install failed.
    pause
    exit /b 1
)
echo Done.
echo.

:: Step 2 — Lint check
echo [2/5] Running lint checks...
call npm run lint
if %errorlevel% neq 0 (
    echo [!] Lint checks failed. Review the errors above.
    pause
    exit /b 1
)
echo Done.
echo.

:: Step 3 — Build the app + installer
echo [3/5] Building application and installer...
echo This may take a few minutes.
call npm run electron:build:win
if %errorlevel% neq 0 (
    echo [!] Build failed. Check the output above.
    pause
    exit /b 1
)
echo Done.
echo.

:: Step 4 — Zip source code (excluding heavy / generated folders)
echo [4/5] Creating source archive...
set "DESKTOP=%USERPROFILE%\Desktop"
set "ZIPNAME=manufacturing-erp-source.zip"
set "ZIPFILE=%DESKTOP%\%ZIPNAME%"

:: Use tar to create the archive (native on Windows 10 1803+)
:: .tar.gz is used instead of .zip because tar handles long paths
:: and exclusion patterns more reliably across different Windows setups.
set "ZIPNAME=manufacturing-erp-source.tar.gz"
set "ZIPFILE=%DESKTOP%\%ZIPNAME%"

tar -czf "%ZIPFILE%" ^
    --exclude="node_modules" ^
    --exclude=".freebuff" ^
    --exclude=".git" ^
    --exclude="dist" ^
    --exclude="dist-electron" ^
    --exclude="*.exe" ^
    --exclude="*.log" ^
    --exclude="*.tar.gz" ^
    .
if %errorlevel% neq 0 (
    echo [!] Failed to create source archive.
    echo     Check that tar is available on this machine.
    pause
    exit /b 1
)
echo Done.
echo  Archive: %ZIPFILE%
echo.

:: Step 5 — Copy installer to Desktop
echo [5/5] Copying installer to Desktop...
set "INSTALLER=dist-electron\Manufacturing ERP Setup 1.0.0.exe"

if not exist "%INSTALLER%" (
    echo [!] Installer not found at %INSTALLER%
    echo     The application build succeeded but the NSIS installer
    echo     did not compile. The source archive is still on your
    echo     Desktop.
    pause
    exit /b 1
)

copy /Y "%INSTALLER%" "%DESKTOP%" >nul
if %errorlevel% equ 0 (
    echo Done.
    echo.
    echo ============================================
    echo  SUCCESS — Both files on your Desktop
    echo ============================================
    echo.
    echo  1. %DESKTOP%\%ZIPNAME%
    echo     Portable source code — share this with
    echo     developers. Extract and run this same
    echo     script to build on another machine.
    echo.
    echo  2. %DESKTOP%\Manufacturing ERP Setup 1.0.0.exe
    echo     Standalone installer — run on any Windows
    echo     machine to install the app.
    echo.
    echo  Tip: The archive excludes node_modules (250MB+).
    echo  Recipients must run: pnpm install
) else (
    echo [!] Failed to copy installer to Desktop.
    echo     The source archive is still available at:
    echo     %ZIPFILE%
    pause
    exit /b 1
)

echo.
pause
