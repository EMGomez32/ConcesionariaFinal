#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Rotación de secretos (Sprint 1 · US-07). Correr EN LA PI, en la raíz del
# proyecto (donde están docker-compose.yml y .env).
#
#   ./scripts/rotate-secrets.sh
#
# Qué hace, de forma SEGURA:
#   1. Respalda el .env actual (.env.bak.<timestamp>).
#   2. Rota JWT_SECRET y JWT_REFRESH_SECRET con valores nuevos y fuertes.
#   3. Recrea el backend para tomar el .env nuevo y verifica que quede sano.
#      (Recrear con `up -d`, NO `restart`: restart no recarga el .env.)
#   4. Si el backend no levanta, restaura el .env del backup y aborta.
#
# Qué NO hace por vos (con instrucciones al final):
#   · La SMTP key de Brevo  → se rota en el panel de Brevo (credencial de un 3ro).
#   · POSTGRES_PASSWORD     → rotarla implica ALTER USER en la base ya inicializada;
#                             se documenta aparte por ser más delicado.
#
# Efecto: rotar los JWT invalida TODAS las sesiones activas (todos re-loguean).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."

# --- Pre-checks -------------------------------------------------------------
[ -f docker-compose.yml ] || { echo "ERROR: corré esto en la raíz del proyecto (falta docker-compose.yml)."; exit 1; }
[ -f .env ] || { echo "ERROR: no encuentro .env en $(pwd)."; exit 1; }

# Generador de secreto fuerte (48 bytes hex = 96 chars, sin caracteres raros).
gen() { openssl rand -hex 48 2>/dev/null || head -c 48 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

# --- 1. Backup del .env -----------------------------------------------------
STAMP="$(date +%Y%m%d_%H%M%S)"
BAK=".env.bak.${STAMP}"
cp .env "${BAK}"
echo "[rotate] backup del .env -> ${BAK}"

# --- 2. Rotar JWT secrets ---------------------------------------------------
NEW_JWT="$(gen)"
NEW_REFRESH="$(gen)"

# El delimitador | es seguro: los valores son hex (0-9a-f), sin | ni /.
if grep -q '^JWT_SECRET=' .env; then
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${NEW_JWT}|" .env
else
    echo "JWT_SECRET=${NEW_JWT}" >> .env
fi
if grep -q '^JWT_REFRESH_SECRET=' .env; then
    sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=${NEW_REFRESH}|" .env
else
    echo "JWT_REFRESH_SECRET=${NEW_REFRESH}" >> .env
fi
echo "[rotate] JWT_SECRET y JWT_REFRESH_SECRET rotados."

# --- 3. Recrear el backend y verificar salud --------------------------------
echo "[rotate] recreando el backend para tomar el .env nuevo..."
docker compose up -d backend

echo "[rotate] esperando a que el backend quede healthy..."
OK=""
for _ in $(seq 1 24); do   # hasta ~2 min
    STATE="$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q backend)" 2>/dev/null || echo unknown)"
    if [ "${STATE}" = "healthy" ]; then OK=1; break; fi
    sleep 5
done

if [ -z "${OK}" ]; then
    echo "[rotate] ✗ el backend NO quedó healthy. Restaurando el .env anterior y recreando..." >&2
    cp "${BAK}" .env
    docker compose up -d backend
    echo "[rotate] .env restaurado desde ${BAK}. Revisá 'docker compose logs backend'." >&2
    exit 1
fi

echo "[rotate] ✓ backend sano con los secretos nuevos. Las sesiones activas quedaron invalidadas (re-login)."
echo ""
echo "──────────────────────────────────────────────────────────────────────"
echo " PENDIENTE (manual, no lo hace este script):"
echo ""
echo " 1) BREVO (urgente — la key estuvo en texto plano = comprometida):"
echo "    · Panel Brevo → SMTP y API → SMTP → 'Generar una nueva clave SMTP'."
echo "    · Reemplazá SMTP_PASS en .env por la nueva. Revocá la anterior."
echo "    · Aplicá:  docker compose up -d backend"
echo ""
echo " 2) POSTGRES_PASSWORD (opcional, más delicado — la base ya está inicializada):"
echo "    NUEVA=\$(openssl rand -hex 24)"
echo "    docker compose exec db psql -U postgres -c \"ALTER USER postgres PASSWORD '\$NUEVA';\""
echo "    sed -i \"s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=\$NUEVA|\" .env"
echo "    docker compose up -d           # recrea backend y db-backup con la nueva"
echo ""
echo " 3) Borrá los backups viejos del .env cuando confirmes que todo anda:"
echo "    rm .env.bak.*"
echo "──────────────────────────────────────────────────────────────────────"
