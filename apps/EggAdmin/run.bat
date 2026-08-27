@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Egg Admin - MRP tinh gon
cd /d "%~dp0"

echo.
echo ========================================================
echo              EGG ADMIN - KHOI DONG LOCAL
echo ========================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [LOI] Chua cai Node.js 20 tro len.
  echo Tai tai: https://nodejs.org/
  goto :failed
)

for /f "tokens=1 delims=." %%V in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%V"
if %NODE_MAJOR% LSS 20 (
  echo [LOI] Node.js dang dung qua cu. Can Node.js 20 tro len.
  goto :failed
)

where docker >nul 2>&1
if errorlevel 1 (
  echo [LOI] Chua cai Docker Desktop.
  echo Tai tai: https://www.docker.com/products/docker-desktop/
  goto :failed
)

docker info >nul 2>&1
if errorlevel 1 (
  echo [LOI] Docker Desktop chua chay. Hay mo Docker Desktop va doi den khi Ready.
  goto :failed
)

echo [1/6] Tao hoac kiem tra cau hinh local...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-local.ps1"
if errorlevel 1 goto :failed

echo [2/6] Cai thu vien Egg Admin lan dau...
call npm install --workspaces=false --no-package-lock
if errorlevel 1 goto :failed

echo [3/6] Khoi dong PostgreSQL...
docker compose up -d
if errorlevel 1 goto :failed

echo [4/6] Doi database san sang...
for /L %%I in (1,1,30) do (
  docker compose exec -T db pg_isready -U egg_admin -d egg_admin >nul 2>&1
  if not errorlevel 1 goto :database_ready
  timeout /t 1 /nobreak >nul
)
echo [LOI] PostgreSQL khong san sang sau 30 giay.
goto :failed

:database_ready
echo [5/6] Tao cau truc database va tai khoan...
call npm run db:generate --workspaces=false
if errorlevel 1 goto :failed
call npm run db:push --workspaces=false
if errorlevel 1 goto :failed
call npm run db:seed --workspaces=false
if errorlevel 1 goto :failed

echo [6/6] Mo Egg Admin tai http://localhost:3030 ...
echo.
if exist "%~dp0local-credentials.txt" (
  echo Tai khoan duoc luu tai:
  echo %~dp0local-credentials.txt
  echo.
)

start "" powershell -NoProfile -Command "Start-Sleep -Seconds 5; Start-Process 'http://localhost:3030'"
call npm run dev --workspaces=false
goto :end

:failed
echo.
echo Khoi dong khong thanh cong. Hay doc dong [LOI] o tren.
pause
exit /b 1

:end
endlocal
