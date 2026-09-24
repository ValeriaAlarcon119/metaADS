@echo off
REM ---------------------------------------------------------------
REM  CELRED ADS MANAGER - abrir el panel
REM
REM  Doble clic y listo: arranca el servidor y abre el navegador.
REM  Para cerrarlo, cierra esta ventana negra.
REM ---------------------------------------------------------------
cd /d "%~dp0"
title CELRED Ads Manager - panel
echo.
echo   Arrancando el panel...
echo   Cuando termines, cierra esta ventana.
echo.
start "" http://127.0.0.1:4317
node servidor.js --puerto 4317
pause
