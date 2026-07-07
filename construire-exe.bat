@echo off
title Maraichage Manager - Build

:: Check admin rights
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  Ce script necessite les droits administrateur.
    echo  Relancement en tant qu'administrateur...
    echo.
    powershell -Command "Start-Process cmd -ArgumentList '/c cd /d \"%~dp0\" && \"%~f0\"' -Verb RunAs"
    exit /b
)

echo.
echo  ================================================
echo   Maraichage Manager - Construction
echo  ================================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERREUR : Node.js n'est pas installe !
    echo  Telechargez-le sur : https://nodejs.org
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VERSION=%%v
echo  OK - Node.js : %NODE_VERSION%
echo.

cd /d "%~dp0"

set CSC_IDENTITY_AUTO_DISCOVERY=false

if exist "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign" (
    echo  Nettoyage du cache winCodeSign...
    rmdir /s /q "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign" 2>nul
    echo  OK
    echo.
)

echo  Installation des dependances...
call npm install
if %errorlevel% neq 0 (
    echo  ERREUR lors de l'installation.
    pause
    exit /b 1
)
echo.
echo  OK - Dependances installees.
echo.

echo  ================================================
echo  Choisissez une option :
echo    1. Construire le .exe (local)
echo    2. Construire ET publier sur GitHub
echo  ================================================
echo.
set /p CHOICE="Votre choix (1 ou 2) : "

if "%CHOICE%"=="2" (
    echo.
    echo  Construction et publication sur GitHub...
    echo  (le token GH_TOKEN doit etre configure)
    echo.
    call npm run publish-win
) else (
    echo.
    echo  Construction locale...
    echo.
    call npm run build-win
)

if %errorlevel% neq 0 (
    echo.
    echo  ERREUR lors de la construction.
    pause
    exit /b 1
)

echo.
echo  ================================================
echo   Construction terminee avec succes !
echo   L'installeur se trouve dans le dossier dist\
echo  ================================================
echo.
explorer dist
pause
