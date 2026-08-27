@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Egg Admin Streamlit
cd /d "%~dp0"

echo.
echo ========================================================
echo          EGG ADMIN STREAMLIT - CHAY LOCAL
echo ========================================================
echo.

set "PYTHON_CMD="
where py >nul 2>&1
if not errorlevel 1 set "PYTHON_CMD=py -3"
if not defined PYTHON_CMD (
  where python >nul 2>&1
  if not errorlevel 1 set "PYTHON_CMD=python"
)

if not defined PYTHON_CMD (
  echo [LOI] Chua cai Python 3.10 tro len.
  echo Tai tai: https://www.python.org/downloads/windows/
  echo Khi cai, nho danh dau Add Python to PATH.
  goto :failed
)

if not exist ".venv\Scripts\python.exe" (
  echo [1/4] Tao moi truong Python rieng...
  %PYTHON_CMD% -m venv .venv
  if errorlevel 1 goto :failed
)

echo [2/4] Kiem tra va cai thu vien...
call ".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r requirements.txt
if errorlevel 1 goto :failed

echo [3/4] Kiem tra co so du lieu...
call ".venv\Scripts\python.exe" -m unittest discover -s tests -q
if errorlevel 1 goto :failed

echo [4/4] Mo Egg Admin tai http://localhost:8501 ...
echo Nhan Ctrl+C de dung ung dung.
echo.
start "" powershell -NoProfile -Command "Start-Sleep -Seconds 4; Start-Process 'http://localhost:8501'"
call ".venv\Scripts\python.exe" -m streamlit run app.py --server.address localhost --server.port 8501 --browser.gatherUsageStats false
goto :end

:failed
echo.
echo Khoi dong khong thanh cong. Hay doc dong [LOI] o tren.
pause
exit /b 1

:end
endlocal
