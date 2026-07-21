#!/bin/sh
# Backup diario de PostgreSQL. Corre dentro del contenedor db-backup
# (imagen postgres:16-alpine, /bin/sh = busybox ash), con las PG* de compose.
#
# - Genera un dump comprimido con timestamp en /backups.
# - VERIFICA la integridad del dump antes de darlo por bueno. Sin esto, si
#   pg_dump muere a mitad y gzip comprime el pedazo devolviendo 0, un dump
#   TRUNCADO se guardaría como válido (falsa seguridad, peor que no tener backup).
# - Borra los dumps de más de RETENTION_DAYS días.
# - Sale con error y (opcional) alerta si el dump falla o queda corrupto.
set -eu

# pipefail: que un pg_dump fallido a mitad haga fallar el pipe, no solo gzip.
# Lo soporta busybox ash (alpine) y bash; se ignora si el shell no lo soporta
# (la verificación de integridad de abajo es la defensa que funciona siempre).
( set -o pipefail ) 2>/dev/null && set -o pipefail || true

RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="/backups/concesionaria_${STAMP}.sql.gz"
MIN_BYTES="${BACKUP_MIN_BYTES:-1000}"   # un dump válido nunca es tan chico

fail() {
    rm -f "${OUT}.tmp"
    echo "[backup] ERROR: $1" >&2
    # Punto de alerta: si se configura un comando/webhook en BACKUP_ALERT_CMD,
    # se ejecuta ante un fallo (recibe "backup" y el motivo como argumentos).
    [ -n "${BACKUP_ALERT_CMD:-}" ] && sh -c "${BACKUP_ALERT_CMD}" backup-alert "backup" "$1" || true
    exit 1
}

echo "[backup] $(date -Iseconds) iniciando dump -> ${OUT}"

# --clean --if-exists deja el dump listo para restaurar sobre una base existente.
pg_dump --clean --if-exists --no-owner --no-privileges | gzip -c > "${OUT}.tmp" \
    || fail "el dump/compresión falló"

# Integridad: gzip -t detecta un archivo truncado o corrupto aunque el pipe
# haya devuelto 0. Es la defensa principal contra dumps truncados por válidos.
gzip -t "${OUT}.tmp" || fail "el dump quedó corrupto (gzip -t falló)"

# Tamaño mínimo: un dump vacío o casi vacío delata un fallo silencioso.
BYTES="$(wc -c < "${OUT}.tmp")"
[ "${BYTES}" -ge "${MIN_BYTES}" ] || fail "dump sospechosamente chico (${BYTES} bytes)"

mv "${OUT}.tmp" "${OUT}"
SIZE="$(du -h "${OUT}" | cut -f1)"
echo "[backup] OK (${SIZE}, ${BYTES} bytes, integridad verificada)"

# Retención: borrar backups viejos.
DELETED="$(find /backups -name 'concesionaria_*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)"
echo "[backup] retención ${RETENTION_DAYS}d: ${DELETED} dump(s) viejos borrados"
echo "[backup] listado actual:"
ls -1t /backups/concesionaria_*.sql.gz 2>/dev/null | head -5 || true
