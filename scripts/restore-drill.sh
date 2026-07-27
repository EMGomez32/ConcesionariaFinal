#!/bin/sh
# Simulacro de restore (US-05): verifica que el ÚLTIMO backup diario se puede
# restaurar DE VERDAD, sin tocar producción. Restaura el dump en un postgres
# DESCARTABLE y compara conteos contra la base viva. Sale != 0 si algo falla,
# así sirve tanto a mano como en un cron/monitor ("un backup que nunca
# restauraste no sabés si sirve").
#
# USO (en la Pi, desde el directorio del proyecto):
#   sh scripts/restore-drill.sh
#
# Overrides por env: COMPOSE_PROJECT, BACKUP_VOL, LIVE_DB_CONTAINER, PG_IMAGE.
set -eu

PROJECT="${COMPOSE_PROJECT:-concesionaria}"
BACKUP_VOL="${BACKUP_VOL:-${PROJECT}_backups}"
LIVE_DB_CONTAINER="${LIVE_DB_CONTAINER:-${PROJECT}-db-1}"
PG_IMAGE="${PG_IMAGE:-postgres:16-alpine}"
DRILL_CONTAINER="restore-drill-pg-$$"

cleanup() { docker rm -f "$DRILL_CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "[drill] volumen de backups: $BACKUP_VOL"
LATEST=$(docker run --rm -v "$BACKUP_VOL":/backups:ro "$PG_IMAGE" \
    sh -c 'ls -1t /backups/concesionaria_*.sql.gz 2>/dev/null | head -1 | xargs -n1 basename') || true
[ -n "$LATEST" ] || { echo "[drill] ERROR: no hay backups en $BACKUP_VOL" >&2; exit 1; }
echo "[drill] ultimo backup: $LATEST"

echo "[drill] verificando integridad gzip..."
docker run --rm -v "$BACKUP_VOL":/backups:ro "$PG_IMAGE" gzip -t "/backups/$LATEST" \
    || { echo "[drill] ERROR: backup corrupto (gzip -t)" >&2; exit 1; }

echo "[drill] levantando postgres descartable..."
docker run -d --name "$DRILL_CONTAINER" -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=restore_test \
    -v "$BACKUP_VOL":/backups:ro "$PG_IMAGE" >/dev/null
# pg_isready devuelve OK prematuramente durante el arranque del entrypoint;
# un `select 1` exitoso es la señal confiable de que acepta queries.
i=0
while [ $i -lt 45 ]; do
    docker exec "$DRILL_CONTAINER" psql -U postgres -d restore_test -c 'select 1' >/dev/null 2>&1 && break
    i=$((i + 1)); sleep 1
done
[ $i -lt 45 ] || { echo "[drill] ERROR: el postgres descartable no arranco" >&2; exit 1; }

echo "[drill] restaurando $LATEST..."
docker exec "$DRILL_CONTAINER" sh -c "gunzip -c /backups/$LATEST | psql -U postgres -d restore_test -v ON_ERROR_STOP=1 -q" \
    || { echo "[drill] ERROR: el restore fallo" >&2; exit 1; }

TABLES=$(docker exec "$DRILL_CONTAINER" psql -U postgres -d restore_test -t -A -c \
    "select count(*) from information_schema.tables where table_schema='public'")
[ "${TABLES:-0}" -ge 1 ] || { echo "[drill] ERROR: 0 tablas tras el restore" >&2; exit 1; }
echo "[drill] restaurado OK: $TABLES tablas"

echo "[drill] conteos (base restaurada):"
docker exec "$DRILL_CONTAINER" psql -U postgres -d restore_test -c \
    "select (select count(*) from usuarios) usuarios, (select count(*) from concesionarias) concesionarias, (select count(*) from vehiculos) vehiculos, (select count(*) from ventas) ventas;"

if docker ps --format '{{.Names}}' | grep -qx "$LIVE_DB_CONTAINER"; then
    echo "[drill] conteos (produccion, para comparar):"
    docker exec "$LIVE_DB_CONTAINER" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select (select count(*) from usuarios) usuarios, (select count(*) from concesionarias) concesionarias, (select count(*) from vehiculos) vehiculos, (select count(*) from ventas) ventas;"' || true
fi

echo "[drill] OK: el backup $LATEST se restaura correctamente."
