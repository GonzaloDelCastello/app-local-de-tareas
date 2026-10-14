@echo off
rem ---------------------------------------------------------------------------
rem  Arranca el tablero de tareas y abre el navegador.
rem
rem  Doble clic. No hace falta abrir una terminal, ni acordarse de npm.cmd, ni
rem  saber en que carpeta esta el proyecto.
rem
rem  La ventana que queda abierta ES el servidor: mientras este abierta, la app
rem  funciona. Para cortarla: Ctrl+C, o cerrar la ventana.
rem
rem  Todo el texto esta SIN acentos a proposito: la consola de Windows no
rem  siempre usa UTF-8, y un acento mal decodificado se ve como basura.
rem ---------------------------------------------------------------------------

title Tablero de tareas
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: no se encontro Node.js.
  echo Instalalo desde https://nodejs.org y volve a intentar.
  echo.
  pause
  exit /b 1
)

echo Arrancando el tablero de tareas...
echo.
echo La pagina se abre sola en unos segundos: http://127.0.0.1:3000
echo Para cortar el servidor: Ctrl+C en esta ventana, o cerrala.
echo.

rem El navegador se abre 3 segundos despues y en segundo plano, para que el
rem servidor tenga tiempo de estar escuchando. Si se abriera antes, el navegador
rem mostraria "no se puede conectar a este sitio".
rem
rem Con TAREAS_SIN_NAVEGADOR=1 se arranca sin abrirlo. Sirve para probar el
rem script sin que aparezca una pestana nueva.
if not defined TAREAS_SIN_NAVEGADOR (
  start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://127.0.0.1:3000'"
)

node src\servidor.ts

rem Si el servidor se detuvo, casi siempre fue por un error: el puerto ocupado,
rem por ejemplo. Sin este pause, la ventana se cerraria enseguida y el mensaje no
rem se llegaria a leer nunca.
echo.
echo El servidor se detuvo.
pause