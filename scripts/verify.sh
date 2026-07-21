#!/bin/sh
# Verificación previa a subir a la Raspberry: compila backend y frontend.
# Corré esto ANTES de subir por WinSCP para no romper el build en el server.
#
# Uso (desde la raíz del proyecto, con Git Bash en Windows):
#   sh scripts/verify.sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "▶ Backend: instalando y compilando..."
cd "$ROOT/BackConcesionaria"
npm install --silent
npx prisma generate
npm run build
echo "✓ Backend OK"

echo ""
echo "▶ Frontend: instalando y compilando..."
cd "$ROOT/FrontConcesionaria"
npm install --legacy-peer-deps --silent
npm run build
echo "✓ Frontend OK"

echo ""
echo "✅ Todo compila. Ya podés subir por WinSCP (excluí node_modules y dist)."
