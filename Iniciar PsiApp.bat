@echo off
title PsiApp — Servidor
cd /d "%~dp0"

:: Verificar que Node.js esté instalado
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ============================================================
    echo   ERROR: Node.js no está instalado.
    echo   Descargalo desde https://nodejs.org y volvé a intentar.
    echo ============================================================
    pause
    exit /b 1
)

:: Verificar que las dependencias estén instaladas
if not exist "node_modules" (
    echo ============================================================
    echo   Instalando dependencias por primera vez...
    echo   Esto puede tardar un minuto.
    echo ============================================================
    npm install
    if %errorlevel% neq 0 (
        echo ERROR al instalar dependencias. Revisá la conexión a internet.
        pause
        exit /b 1
    )
)

echo.
echo  ==========================================
echo      PsiApp - Iniciando servidor...
echo  ==========================================
echo.
echo  La app se va a abrir en el navegador.
echo  NO cierres esta ventana mientras usas la app.
echo  Para cerrar: presioná Ctrl+C en esta ventana.
echo.

:: Abrir el navegador después de 2.5 segundos (en segundo plano)
start /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

:: Iniciar el servidor (en primer plano, esta ventana queda como el servidor)
npm start

echo.
echo  Servidor detenido. Podés cerrar esta ventana.
pause
