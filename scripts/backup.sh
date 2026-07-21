#!/bin/sh
# Backup diario de PostgreSQL. Corre dentro del contenedor db-backup
# (imagen postgres:16-alpine), con las variables PG* ya definidas por compose.
#
# - Genera un dump comprimido con timestamp en /backups.
# - Borra los dumps de más de RETENTION_DAYS días.
# - Sale con error si el dump falla (para que se vea en `docker compose logs`).
set -eu

RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="/backups/concesionaria_${STAMP}.sql.gz"

echo "[backup] $(date -Iseconds) iniciando dump -> ${OUT}"

# --clean --if-exists deja el dump listo para restaurar sobre una base existente.
if pg_dump --clean --if-exists --no-owner --no-privileges | gzip -c > "${OUT}.tmp"; then
    mv "${OUT}.tmp" "${OUT}"
    SIZE="$(du -h "${OUT}" | cut -f1)"
    echo "[backup] OK (${SIZE})"
else
    rm -f "${OUT}.tmp"
    echo "[backup] ERROR: el dump falló" >&2
    exit 1
fi

# Retención: borrar backups viejos.
DELETED="$(find /backups -name 'concesionaria_*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)"
echo "[backup] retención ${RETENTION_DAYS}d: ${DELETED} dump(s) viejos borrados"
echo "[backup] listado actual:"
ls -1t /backups/concesionaria_*.sql.gz 2>/dev/null | head -5 || true
