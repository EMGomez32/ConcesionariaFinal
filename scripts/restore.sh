#!/bin/sh
# Restaura un dump de la base generado por backup.sh (cifrado .age o en claro).
#
# USO (desde el directorio del proyecto, en el servidor):
#   1. Listar backups disponibles:
#        docker compose run --rm --entrypoint sh db-backup -c 'ls -1t /backups'
#   2. Restaurar uno concreto (REEMPLAZA los datos actuales de la base):
#        docker compose run --rm \
#          -e BACKUP_FILE=concesionaria_YYYYMMDD_HHMMSS.sql.gz.age \
#          -e RESTORE_CONFIRM=yes \
#          -e BACKUP_AGE_IDENTITY=/identity.txt \
#          -v /ruta/segura/age-identity.txt:/identity.txt:ro \
#          --entrypoint sh db-backup /usr/local/bin/restore.sh
#
# - RESTORE_CONFIRM=yes es obligatorio: restaura sobre la base VIVA (--clean).
# - Si el backup es .age hace falta la clave PRIVADA (BACKUP_AGE_IDENTITY): no
#   vive en la Pi, traela de tu gestor de contraseñas y montala sólo para esto.
# - Los archivos (uploads / wa-auth) se restauran con scripts/restore-files.sh.
set -eu

if [ -z "${BACKUP_FILE:-}" ]; then
    echo "ERROR: definí BACKUP_FILE con el nombre del dump a restaurar." >&2
    echo "Disponibles:" >&2
    ls -1t /backups/concesionaria_*.sql.gz* 2>/dev/null >&2 || echo "  (ninguno)" >&2
    exit 1
fi

FULL="/backups/${BACKUP_FILE}"
if [ ! -f "${FULL}" ]; then
    echo "ERROR: no existe ${FULL}" >&2
    exit 1
fi

if [ "${RESTORE_CONFIRM:-}" != "yes" ]; then
    echo "ERROR: esto SOBRESCRIBE los datos actuales de ${PGDATABASE:-?}@${PGHOST:-?}." >&2
    echo "       Si es lo que querés, repetí con RESTORE_CONFIRM=yes." >&2
    exit 1
fi

case "${FULL}" in
    *.age)
        if [ -z "${BACKUP_AGE_IDENTITY:-}" ] || [ ! -f "${BACKUP_AGE_IDENTITY}" ]; then
            echo "ERROR: el backup está cifrado; montá tu clave privada y definí BACKUP_AGE_IDENTITY." >&2
            exit 1
        fi
        # Verificar que la clave sirve ANTES de tocar la base.
        age -d -i "${BACKUP_AGE_IDENTITY}" "${FULL}" | gunzip -t \
            || { echo "ERROR: no se pudo descifrar/verificar el dump (¿clave equivocada o archivo corrupto?)" >&2; exit 1; }
        DUMP_CMD="age -d -i ${BACKUP_AGE_IDENTITY} ${FULL}"
        ;;
    *)
        gunzip -t "${FULL}" || { echo "ERROR: el dump está corrupto (gzip -t)" >&2; exit 1; }
        DUMP_CMD="cat ${FULL}"
        ;;
esac

echo "[restore] restaurando ${FULL} en ${PGDATABASE}@${PGHOST}..."
${DUMP_CMD} | gunzip -c | psql -v ON_ERROR_STOP=1
echo "[restore] OK. Reiniciá el backend para reconectar y recrear RLS/rol: docker compose restart backend"
