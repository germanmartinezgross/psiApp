@echo off
title PsiApp — Servidor
cd /d "%~dp0"

:: Verificar que Node.js este instalado
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ============================================================
    echo   ERROR: Node.js no esta instalado.
    echo   Descargalo desde https://nodejs.org y volvé a intentar.
    echo ============================================================
    pause
    exit /b 1
)

:: Actualizar desde GitHub si git esta disponible
where git >nul 2>&1
if %errorlevel% equ 0 (
    echo.
    echo   Buscando actualizaciones...
    git pull origin master
    if %errorlevel% equ 0 (
        echo   Actualizado correctamente.
    ) else (
        echo   AVISO: No se pudo actualizar ^(ver error arriba^).
        echo   Continuando con la version local...
    )
    echo.
)

:: Instalar dependencias si no existen
if not exist "node_modules" (
    echo   Instalando dependencias por primera vez...
    npm install
    if %errorlevel% neq 0 (
        echo ERROR al instalar dependencias.
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
echo  Para cerrar: presiona Ctrl+C en esta ventana.
echo.

start /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

npm start

echo.
echo  Servidor detenido. Podes cerrar esta ventana.
pause