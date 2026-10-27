@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  py -3 -m venv .venv
  if errorlevel 1 (
    echo Instala Python 3.10 o posterior desde python.org y vuelve a abrir este archivo.
    pause
    exit /b 1
  )
)
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 (
  echo No se pudieron instalar las dependencias. Revisa la conexion a Internet.
  pause
  exit /b 1
)
.venv\Scripts\python.exe pc_app.py
pause
