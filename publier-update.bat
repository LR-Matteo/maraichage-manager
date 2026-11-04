@echo off
title Maraichage Manager - Publier une mise a jour
cd /d "%~dp0"

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ERREUR : Node.js n'est pas installe !
    echo  Telechargez-le sur : https://nodejs.org
    pause
    exit /b 1
)

echo.
echo  N'oubliez pas d'avoir incremente la version dans package.json
echo  avant de continuer (sinon la publication sera refusee).
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publier-update.ps1"

echo.
pause
