#!/bin/sh
# Simulacro de restore (US-05): verifica que el ÚLTIMO backup diario se puede
# restaurar DE VERDAD, sin tocar producción. Restaura el dump en un postgres
# DESCARTABLE y compara conteos contra la base viva. Sale != 0 si algo falla,
# así sirve tanto a mano como en un cron/monitor ("un backup que nunca
# restauraste no sabés si sirve").
#
# Si los backups están cifrados (.age) hace falta la clave PRIVADA:
#   BACKUP_AGE_IDENTITY=/ruta/segura/age-identity.txt sh scripts/restore-drill.sh
# La clave se monta de sólo lectura en un contenedor efímero; no se copia ni queda.
#
# También verifica el último archivo de uploads + wa-auth (files_*.tar.gz[.age]).
# Al terminar OK deja una línea con fecha en scripts/restore-drill.log (ignorado
# por git) como evidencia de cuándo se probó por última vez.
#
# USO (en la Pi, desde el directorio del proyecto):
#   sh scripts/restore-drill.sh
#
# Overrides por env: COMPOSE_PROJECT, BACKUP_VOL, LIVE_DB_CONTAINER, PG_IMAGE,
# BACKUP_IMAGE (imagen con age/tar, default la del servicio db-backup).
set -eu

PROJECT="${COMPOSE_PROJECT:-concesionaria}"
BACKUP_VOL="${BACKUP_VOL:-${PROJECT}_backups}"
LIVE_DB_CONTAINER="${LIVE_DB_CONTAINER:-${PROJECT}-db-1}"
PG_IMAGE="${PG_IMAGE:-postgres:16-alpine}"
BACKUP_IMAGE="${BACKUP_IMAGE:-autenza-db-backup:local}"
DRILL_CONTAINER="restore-drill-pg-$$"
HERE="$(cd "$(dirname "$0")" && pwd)"

cleanup() { docker rm -f "$DRILL_CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# run_tools CMD: corre CMD en la imagen de backup con el volumen (ro) y, si hay,
# la clave privada montada en /identity.txt.
run_tools() {
    if [ -n "${BACKUP_AGE_IDENTITY:-}" ]; then
        docker run --rm -i -v "$BACKUP_VOL":/backups:ro -v "$BACKUP_AGE_IDENTITY":/identity.txt:ro \
            --entrypoint sh "$BACKUP_IMAGE" -c "$1"
    else
        docker run --rm -i -v "$BACKUP_VOL":/backups:ro --entrypoint sh "$BACKUP_IMAGE" -c "$1"
    fi
}

echo "[drill] volumen de backups: $BACKUP_VOL"
LATEST=$(run_tools 'ls -1t /backups/concesionaria_*.sql.gz* 2>/dev/null | head -1 | xargs -n1 basename') || true
[ -n "$LATEST" ] || { echo "[drill] ERROR: no hay backups de la base en $BACKUP_VOL" >&2; exit 1; }
echo "[drill] ultimo backup de la base: $LATEST"

case "$LATEST" in
    *.age)
        [ -n "${BACKUP_AGE_IDENTITY:-}" ] && [ -f "$BACKUP_AGE_IDENTITY" ] \
            || { echo "[drill] ERROR: el backup está cifrado; definí BACKUP_AGE_IDENTITY=/ruta/a/la/clave-privada" >&2; exit 1; }
        DECODE="age -d -i /identity.txt /backups/$LATEST | gunzip -c"
        ;;
    *) DECODE="gunzip -c /backups/$LATEST" ;;
esac

echo "[drill] verificando integridad (descifrado + gzip)..."
run_tools "$DECODE >/dev/null" \
    || { echo "[drill] ERROR: backup corrupto o clave incorrecta" >&2; exit 1; }

echo "[drill] levantando postgres descartable..."
docker run -d --name "$DRILL_CONTAINER" -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=restore_test \
    "$PG_IMAGE" >/dev/null
# pg_isready devuelve OK prematuramente durante el arranque del entrypoint;
# un `select 1` exitoso es la señal confiable de que acepta queries.
i=0
while [ $i -lt 45 ]; do
    docker exec "$DRILL_CONTAINER" psql -U postgres -d restore_test -c 'select 1' >/dev/null 2>&1 && break
    i=$((i + 1)); sleep 1
done
[ $i -lt 45 ] || { echo "[drill] ERROR: el postgres descartable no arranco" >&2; exit 1; }

echo "[drill] restaurando $LATEST..."
run_tools "$DECODE" | docker exec -i "$DRILL_CONTAINER" psql -U postgres -d restore_test -v ON_ERROR_STOP=1 -q \
    || { echo "[drill] ERROR: el restore fallo" >&2; exit 1; }

TABLES=$(docker exec "$DRILL_CONTAINER" psql -U postgres -d restore_test -t -A -c \
    "select count(*) from information_schema.tables where table_schema='public'")
[ "${TABLES:-0}" -ge 1 ] || { echo "[drill] ERROR: 0 tablas tras el restore" >&2; exit 1; }
echo "[drill] restaurado OK: $TABLES tablas"

# La RLS es lo que aísla a los tenants: si el dump no trajo las policies, un
# restore real dejaría la base sin aislamiento hasta que init-rls corra.
POLICIES=$(docker exec "$DRILL_CONTAINER" psql -U postgres -d restore_test -t -A -c \
    "select count(*) from pg_policies where schemaname='public'")
[ "${POLICIES:-0}" -ge 1 ] || echo "[drill] WARN: el restore no trajo policies RLS (se recrean al arrancar el backend con init-rls)" >&2
echo "[drill] policies RLS restauradas: ${POLICIES:-0}"

echo "[drill] conteos (base restaurada):"
docker exec "$DRILL_CONTAINER" psql -U postgres -d restore_test -c \
    "select (select count(*) from usuarios) usuarios, (select count(*) from concesionarias) concesionarias, (select count(*) from vehiculos) vehiculos, (select count(*) from ventas) ventas;"

if docker ps --format '{{.Names}}' | grep -qx "$LIVE_DB_CONTAINER"; then
    echo "[drill] conteos (produccion, para comparar):"
    docker exec "$LIVE_DB_CONTAINER" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select (select count(*) from usuarios) usuarios, (select count(*) from concesionarias) concesionarias, (select count(*) from vehiculos) vehiculos, (select count(*) from ventas) ventas;"' || true
fi

# Archivos (uploads + wa-auth): el backup existe y se puede leer completo.
LATEST_FILES=$(run_tools 'ls -1t /backups/files_*.tar.gz* 2>/dev/null | head -1 | xargs -n1 basename') || true
if [ -z "$LATEST_FILES" ]; then
    echo "[drill] ERROR: no hay backup de archivos (files_*.tar.gz) en $BACKUP_VOL: uploads y wa-auth NO están respaldados" >&2
    exit 1
fi
case "$LATEST_FILES" in
    *.age) FDECODE="age -d -i /identity.txt /backups/$LATEST_FILES | tar -tz" ;;
    *)     FDECODE="tar -tzf /backups/$LATEST_FILES" ;;
esac
NFILES=$(run_tools "$FDECODE | wc -l") \
    || { echo "[drill] ERROR: el backup de archivos $LATEST_FILES no se pudo leer" >&2; exit 1; }
echo "[drill] archivos: $LATEST_FILES legible ($(echo "$NFILES" | tr -d ' ') entradas)"

echo "[drill] OK: el backup $LATEST se restaura correctamente."
# Evidencia de cuándo se probó por última vez (scripts/restore-drill.log, ignorado por git).
echo "$(date -Iseconds) OK $LATEST $LATEST_FILES tablas=$TABLES policies=${POLICIES:-0}" >> "$HERE/restore-drill.log" 2>/dev/null || true
