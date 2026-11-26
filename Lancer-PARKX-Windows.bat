@echo off
title PARKX - Serveur local
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n est pas installe. Installez-le depuis https://nodejs.org puis relancez ce fichier.
  echo Vous pouvez aussi ouvrir directement application\PARKX.html
  start "" "https://nodejs.org"
  pause
  exit /b
)
node serveur-local.mjs
pause
