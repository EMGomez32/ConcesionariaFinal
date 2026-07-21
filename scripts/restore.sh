#!/bin/sh
# Restaura un backup generado por backup.sh.
#
# USO (desde el directorio del proyecto, en el servidor):
#   1. Listar backups disponibles:
#        docker compose run --rm db-backup ls -1t /backups
#   2. Restaurar uno concreto (reemplaza los datos actuales de la base):
#        docker compose run --rm -e BACKUP_FILE=concesionaria_YYYYMMDD_HHMMSS.sql.gz \
#          --entrypoint sh db-backup /usr/local/bin/restore.sh
#
# Montá este script igual que backup.sh en el volumen si querés usarlo desde
# el contenedor, o corré los comandos de abajo a mano.
set -eu

if [ -z "${BACKUP_FILE:-}" ]; then
    echo "ERROR: definí BACKUP_FILE con el nombre del dump a restaurar." >&2
    echo "Disponibles:" >&2
    ls -1t /backups/concesionaria_*.sql.gz 2>/dev/null >&2 || echo "  (ninguno)" >&2
    exit 1
fi

FULL="/backups/${BACKUP_FILE}"
if [ ! -f "${FULL}" ]; then
    echo "ERROR: no existe ${FULL}" >&2
    exit 1
fi

echo "[restore] restaurando ${FULL} en ${PGDATABASE}@${PGHOST}..."
echo "[restore] ATENCIÓN: esto sobrescribe los datos actuales. Ctrl+C para abortar (5s)."
sleep 5

gunzip -c "${FULL}" | psql -v ON_ERROR_STOP=1
echo "[restore] OK. Reiniciá el backend para reconectar limpio: docker compose restart backend"
