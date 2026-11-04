#!/bin/sh
# Restaura el archivo de uploads + wa-auth generado por backup.sh (files_*.tar.gz[.age]).
#
# Corre con los volúmenes destino MONTADOS EN ESCRITURA (el servicio db-backup
# los tiene de sólo lectura), así que se usa `docker run` directo:
#
#   docker run --rm \
#     -v concesionaria_backups:/backups:ro \
#     -v concesionaria_uploads:/data/uploads \
#     -v concesionaria_wa-auth:/data/wa-auth \
#     -v "$PWD/scripts/restore-files.sh":/restore-files.sh:ro \
#     -v /ruta/segura/age-identity.txt:/identity.txt:ro \
#     -e BACKUP_FILE=files_YYYYMMDD_HHMMSS.tar.gz.age \
#     -e BACKUP_AGE_IDENTITY=/identity.txt -e RESTORE_CONFIRM=yes \
#     --entrypoint sh autenza-db-backup:local /restore-files.sh
#
# Detené el backend antes (docker compose stop backend) y levantalo después:
# Baileys escribe en wa-auth y pisaría lo restaurado.
# El nombre de los volúmenes depende del proyecto de compose (docker volume ls).
set -eu

DATA_DIR="${DATA_DIR:-/data}"

if [ -z "${BACKUP_FILE:-}" ]; then
    echo "ERROR: definí BACKUP_FILE (files_*.tar.gz[.age])." >&2
    ls -1t /backups/files_*.tar.gz* 2>/dev/null >&2 || echo "  (ninguno)" >&2
    exit 1
fi
FULL="/backups/${BACKUP_FILE}"
[ -f "${FULL}" ] || { echo "ERROR: no existe ${FULL}" >&2; exit 1; }

if [ "${RESTORE_CONFIRM:-}" != "yes" ]; then
    echo "ERROR: esto SOBRESCRIBE archivos en ${DATA_DIR}. Repetí con RESTORE_CONFIRM=yes." >&2
    exit 1
fi

case "${FULL}" in
    *.age)
        if [ -z "${BACKUP_AGE_IDENTITY:-}" ] || [ ! -f "${BACKUP_AGE_IDENTITY}" ]; then
            echo "ERROR: el backup está cifrado; montá tu clave privada y definí BACKUP_AGE_IDENTITY." >&2
            exit 1
        fi
        age -d -i "${BACKUP_AGE_IDENTITY}" "${FULL}" | tar -tz >/dev/null \
            || { echo "ERROR: no se pudo descifrar/verificar el archivo" >&2; exit 1; }
        age -d -i "${BACKUP_AGE_IDENTITY}" "${FULL}" | tar -xz -C "${DATA_DIR}"
        ;;
    *)
        tar -tzf "${FULL}" >/dev/null || { echo "ERROR: el archivo está corrupto" >&2; exit 1; }
        tar -xzf "${FULL}" -C "${DATA_DIR}"
        ;;
esac
echo "[restore-files] OK: ${BACKUP_FILE} restaurado en ${DATA_DIR}. Levantá el backend: docker compose start backend"
