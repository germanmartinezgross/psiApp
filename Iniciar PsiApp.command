#!/bin/bash
# ============================================================
# Iniciar PsiApp — Mac / Linux
# ============================================================

cd "$(dirname "$0")"

VERDE='\033[0;32m'
ROJO='\033[0;31m'
AMARILLO='\033[0;33m'
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

# Actualizar desde GitHub si git está disponible
if command -v git &> /dev/null; then
    echo -e "${AMARILLO}  Buscando actualizaciones...${RESET}"
    git pull origin master 2>&1
    if [ $? -ne 0 ]; then
        echo "  AVISO: No se pudo actualizar. Continuando con versión local..."
    else
        echo -e "${VERDE}  Todo actualizado.${RESET}"
    fi
    echo ""
else
    echo "  (Git no instalado - saltando actualización)"
    echo ""
fi

# Instalar/actualizar dependencias
if [ ! -d "node_modules" ]; then
    echo "  Instalando dependencias por primera vez..."
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${ROJO}  ERROR al instalar dependencias.${RESET}"
        read -p "  Presioná Enter para cerrar..."
        exit 1
    fi
else
    npm install --silent 2>/dev/null
fi

echo -e "${VERDE}  Servidor iniciando...${RESET}"
echo "  La app se abrirá en el navegador en unos segundos."
echo "  Para cerrar la app: cerrá esta ventana."
echo ""

(sleep 3 && open "http://localhost:3000" 2>/dev/null || xdg-open "http://localhost:3000" 2>/dev/null) &

npm start

echo ""
echo "  Servidor detenido."
read -p "  Presioná Enter para cerrar..."
