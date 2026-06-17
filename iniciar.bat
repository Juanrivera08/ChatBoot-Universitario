@echo off
echo ========================================
echo    CHATBOT USH - Iniciando sistema...
echo ========================================
echo.

echo [1/3] Iniciando bases de datos (Docker)...
docker compose up postgres chromadb -d
timeout /t 8 /nobreak > nul

echo [2/3] Iniciando backend...
start "Backend USH" cmd /k "cd /d %~dp0backend && npm run dev"

timeout /t 5 /nobreak > nul

echo [3/3] Iniciando frontend...
start "Frontend USH" cmd /k "cd /d %~dp0frontend && npm run dev"

timeout /t 4 /nobreak > nul

echo.
echo ========================================
echo  TODO LISTO
echo  Abre tu navegador en:
echo  http://localhost:5173
echo ========================================
echo.
pause
