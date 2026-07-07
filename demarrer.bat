@echo off
title Maraichage Manager

:: Check if node_modules exists
if not exist "node_modules\" (
    echo.
    echo  Installation des dependances...
    call npm install
    echo.
)

:: Check if electron is available
if exist "node_modules\electron\" (
    echo.
    echo  Lancement de Maraichage Manager (mode bureau)...
    echo.
    call npx electron .
) else (
    echo.
    echo  Lancement de Maraichage Manager (mode navigateur)...
    echo  L'application va s'ouvrir dans votre navigateur.
    echo  Ne fermez pas cette fenetre pendant l'utilisation.
    echo.
    node server.js
)

pause
