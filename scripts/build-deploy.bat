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

:: Find the newest setup installer in dist-electron (works with any version
:: and tolerates both "Manufacturing ERP Setup X.exe" and
:: "Manufacturing-ERP-Setup-X.exe" artifact naming)
set "INSTALLER="
for /f "delims=" %%I in ('dir /b /o-d "dist-electron\Manufacturing*ERP*Setup*.exe" 2^>nul') do (
    if not defined INSTALLER set "INSTALLER=dist-electron\%%I"
)
if not defined INSTALLER (
    echo [!] No installer found in dist-electron\Manufacturing*ERP*Setup*.exe
    pause
    exit /b 1
)
echo Detected installer: %INSTALLER%
echo.

:: Step 3b — Verify code signature (informational)
echo [3b] Verifying installer signature...
call node scripts\verify-signature.cjs "%INSTALLER%"
if %errorlevel% equ 0 (
    echo Signature valid.
) else (
    echo.
    echo [!] Installer is NOT signed with a trusted certificate.
    echo     Users will see a SmartScreen "unknown publisher" warning.
    echo     See CODE_SIGNING.md to enable signing (Azure Trusted Signing / CA cert).
)
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
    echo  2. %DESKTOP%\%~nxINSTALLER%
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
