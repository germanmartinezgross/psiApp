#!/bin/bash
# ============================================================
# Iniciar PsiApp — Mac / Linux
# Para usar: doble clic sobre este archivo
# (Si no abre, hacé clic derecho → Abrir)
# ============================================================

# Ir a la carpeta donde está este script
cd "$(dirname "$0")"

# Color para mensajes
VERDE='\033[0;32m'
ROJO='\033[0;31m'
RESET='\033[0m'

echo ""
echo "  =========================================="
echo "      🧠 PsiApp — Iniciando servidor..."
echo "  =========================================="
echo ""

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo -e "${ROJO}  ERROR: Node.js no está instalado.${RESET}"
    echo "  Descargalo desde https://nodejs.org"
    echo ""
    read -p "  Presioná Enter para cerrar..."
    exit 1
fi

# Instalar dependencias si no existen
if [ ! -d "node_modules" ]; then
    echo "  Instalando dependencias por primera vez..."
    echo "  (esto puede tardar un minuto)"
    echo ""
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${ROJO}  ERROR al instalar dependencias.${RESET}"
        read -p "  Presioná Enter para cerrar..."
        exit 1
    fi
fi

echo -e "${VERDE}  Servidor iniciando...${RESET}"
echo "  La app se abrirá en el navegador en unos segundos."
echo "  Para cerrar la app: cerrá esta ventana."
echo ""

# Abrir el navegador después de 3 segundos (en segundo plano)
(sleep 3 && open "http://localhost:3000" 2>/dev/null || xdg-open "http://localhost:3000" 2>/dev/null) &

# Iniciar el servidor
npm start

echo ""
echo "  Servidor detenido."
read -p "  Presioná Enter para cerrar..."
