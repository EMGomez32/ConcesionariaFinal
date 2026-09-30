#!/bin/sh
# Backup diario de PostgreSQL + archivos (uploads y wa-auth). Corre dentro del
# contenedor db-backup (imagen scripts/backup-image, busybox ash), con las PG*
# de compose.
#
# - Dump de la base comprimido con timestamp en /backups.
# - Archivo tar.gz de los volúmenes uploads (DNI, recibos, fotos) y wa-auth
#   (credenciales de cada WhatsApp vinculado), montados de sólo lectura en /data.
# - CIFRADO con age si BACKUP_AGE_RECIPIENT (clave PÚBLICA) está definida: la
#   clave privada NO vive en la Pi, así que quien robe el volumen o el bucket no
#   puede leer los backups. Sin recipient los archivos quedan en claro (600).
# - VERIFICA la integridad ANTES de cifrar (gzip -t / tar -tz). Sin esto, si
#   pg_dump muere a mitad y gzip comprime el pedazo devolviendo 0, un dump
#   TRUNCADO se guardaría como válido (falsa seguridad, peor que no tener backup).
# - Offsite (rclone) SOLO de archivos cifrados. Sin cifrado no se sube nada,
#   salvo BACKUP_OFFSITE_ALLOW_PLAINTEXT=1 (no recomendado: hay PII y creds).
# - Borra lo de más de RETENTION_DAYS días.
# - Ante un fallo llama a BACKUP_ALERT_CMD y sale != 0. Al terminar bien deja
#   /backups/.last_success (lo lee el healthcheck del servicio en compose).
set -eu

# pipefail: que un pg_dump fallido a mitad haga fallar el pipe, no solo gzip.
# Lo soporta busybox ash (alpine) y bash; se ignora si el shell no lo soporta
# (la verificación de integridad de abajo es la defensa que funciona siempre).
( set -o pipefail ) 2>/dev/null && set -o pipefail || true

# Todo lo que se escriba (dumps, temporales) queda sólo para el dueño (600/700).
umask 077

BACKUP_DIR="${BACKUP_DIR:-/backups}"
DATA_DIR="${DATA_DIR:-/data}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d_%H%M%S)"
MIN_BYTES="${BACKUP_MIN_BYTES:-1000}"   # un dump válido nunca es tan chico
AGE_RECIPIENT="${BACKUP_AGE_RECIPIENT:-}"

EXT=""
[ -n "${AGE_RECIPIENT}" ] && EXT=".age"
DB_OUT="${BACKUP_DIR}/concesionaria_${STAMP}.sql.gz${EXT}"
FILES_OUT="${BACKUP_DIR}/files_${STAMP}.tar.gz${EXT}"

TMP_DIR="$(mktemp -d)"
cleanup() {
    rm -rf "${TMP_DIR}"
    rm -f "${DB_OUT}.tmp" "${FILES_OUT}.tmp"
}
trap cleanup EXIT

# Punto de alerta: si se configura un comando/webhook en BACKUP_ALERT_CMD, se
# ejecuta (recibe el tipo de evento y el motivo como argumentos $1 y $2).
alert() {
    [ -n "${BACKUP_ALERT_CMD:-}" ] && sh -c "${BACKUP_ALERT_CMD}" backup-alert "$1" "$2" || true
}

fail() {
    echo "[backup] ERROR: $1" >&2
    alert "backup" "$1"
    exit 1
}

# seal IN OUT: cifra IN hacia OUT con age (uno o varios recipients separados por
# espacios) o, sin recipient, lo mueve tal cual.
seal() {
    if [ -z "${AGE_RECIPIENT}" ]; then
        mv "$1" "$2"
        return
    fi
    ARGS=""
    for r in ${AGE_RECIPIENT}; do ARGS="${ARGS} -r ${r}"; done
    # shellcheck disable=SC2086
    age ${ARGS} -o "$2" "$1" || return 1
    [ -s "$2" ] || return 1
}

echo "[backup] $(date -Iseconds) iniciando -> ${DB_OUT}"
if [ -n "${AGE_RECIPIENT}" ]; then
    echo "[backup] cifrado age ACTIVO"
else
    echo "[backup] WARN: BACKUP_AGE_RECIPIENT no definido, los backups quedan SIN cifrar" >&2
fi

# ── 1) Base de datos ────────────────────────────────────────────────────────
# --clean --if-exists deja el dump listo para restaurar sobre una base existente.
DB_PLAIN="${TMP_DIR}/db.sql.gz"
pg_dump --clean --if-exists --no-owner --no-privileges | gzip -c > "${DB_PLAIN}" \
    || fail "el dump/compresión falló"

# Integridad: gzip -t detecta un archivo truncado o corrupto aunque el pipe
# haya devuelto 0. Es la defensa principal contra dumps truncados por válidos.
gzip -t "${DB_PLAIN}" || fail "el dump quedó corrupto (gzip -t falló)"

# Tamaño mínimo: un dump vacío o casi vacío delata un fallo silencioso.
BYTES="$(wc -c < "${DB_PLAIN}")"
[ "${BYTES}" -ge "${MIN_BYTES}" ] || fail "dump sospechosamente chico (${BYTES} bytes)"

seal "${DB_PLAIN}" "${DB_OUT}.tmp" || fail "el cifrado del dump falló"
mv "${DB_OUT}.tmp" "${DB_OUT}"
chmod 600 "${DB_OUT}" 2>/dev/null || true
echo "[backup] base OK ($(du -h "${DB_OUT}" | cut -f1), ${BYTES} bytes sin cifrar, integridad verificada)"

# ── 2) Archivos (uploads + wa-auth) ─────────────────────────────────────────
# Desactivable con BACKUP_FILES=0. Sólo incluye los directorios que existen.
FILES_OK=1
if [ "${BACKUP_FILES:-1}" = "1" ]; then
    DIRS=""
    for d in uploads wa-auth; do
        [ -d "${DATA_DIR}/${d}" ] && DIRS="${DIRS} ${d}"
    done
    if [ -z "${DIRS}" ]; then
        echo "[backup] WARN: no hay ${DATA_DIR}/uploads ni ${DATA_DIR}/wa-auth montados; backup de archivos omitido" >&2
        alert "backup" "backup de archivos omitido: volúmenes no montados"
        FILES_OK=0
    else
        FILES_PLAIN="${TMP_DIR}/files.tar.gz"
        RC=0
        # Baileys escribe en wa-auth mientras se lee: tar puede avisar "file changed"
        # (código 1). Se tolera SI el archivo resultante verifica íntegro.
        # shellcheck disable=SC2086
        tar -C "${DATA_DIR}" -czf "${FILES_PLAIN}" ${DIRS} || RC=$?
        if [ "${RC}" -gt 1 ] || ! tar -tzf "${FILES_PLAIN}" >/dev/null 2>&1; then
            echo "[backup] ERROR: el archivo de uploads/wa-auth falló o quedó corrupto (tar rc=${RC})" >&2
            alert "backup" "backup de archivos (uploads/wa-auth) falló"
            FILES_OK=0
        elif seal "${FILES_PLAIN}" "${FILES_OUT}.tmp"; then
            mv "${FILES_OUT}.tmp" "${FILES_OUT}"
            chmod 600 "${FILES_OUT}" 2>/dev/null || true
            echo "[backup] archivos OK (${DIRS# } -> $(du -h "${FILES_OUT}" | cut -f1))"
        else
            echo "[backup] ERROR: el cifrado del archivo de uploads/wa-auth falló" >&2
            alert "backup" "cifrado del backup de archivos falló"
            FILES_OK=0
        fi
    fi
fi

# ── 3) Offsite (OPCIONAL) a un remote S3-compatible ─────────────────────────
# Se activa SOLO si BACKUP_OFFSITE_REMOTE está seteado (ver .env.example). Sube
# únicamente archivos cifrados (.age): un dump en claro tiene DNI, ingresos,
# hashes y las credenciales de WhatsApp. Un fallo offsite NO invalida el backup
# local (ya verificado): se avisa y se sigue.
if [ -n "${BACKUP_OFFSITE_REMOTE:-}" ]; then
    for f in "${DB_OUT}" "${FILES_OUT}"; do
        [ -f "${f}" ] || continue
        case "${f}" in
            *.age) ;;
            *)
                if [ "${BACKUP_OFFSITE_ALLOW_PLAINTEXT:-0}" != "1" ]; then
                    echo "[backup] WARN: offsite omitido para $(basename "${f}"): no está cifrado (definí BACKUP_AGE_RECIPIENT)" >&2
                    alert "offsite" "offsite omitido: backup sin cifrar (falta BACKUP_AGE_RECIPIENT)"
                    continue
                fi
                ;;
        esac
        if rclone copy "${f}" "${BACKUP_OFFSITE_REMOTE}/" --no-traverse; then
            echo "[backup] offsite OK -> ${BACKUP_OFFSITE_REMOTE}/$(basename "${f}")"
        else
            echo "[backup] WARN: el push offsite de $(basename "${f}") falló (el backup local quedó OK igual)" >&2
            alert "offsite" "rclone copy falló"
        fi
    done
    # Retención remota: espejar RETENTION_DAYS también en el offsite.
    rclone delete "${BACKUP_OFFSITE_REMOTE}/" --min-age "${RETENTION_DAYS}d" \
        --include 'concesionaria_*.sql.gz*' --include 'files_*.tar.gz*' 2>/dev/null || true
fi

# ── 4) Retención local ──────────────────────────────────────────────────────
DELETED="$(find "${BACKUP_DIR}" -type f \( -name 'concesionaria_*.sql.gz*' -o -name 'files_*.tar.gz*' \) \
    -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)"
echo "[backup] retención ${RETENTION_DAYS}d: ${DELETED} backup(s) viejos borrados"
echo "[backup] listado actual:"
ls -1t "${BACKUP_DIR}"/concesionaria_*.sql.gz* "${BACKUP_DIR}"/files_*.tar.gz* 2>/dev/null | head -6 || true

# Marca de último backup bueno (base + archivos) para el healthcheck.
if [ "${FILES_OK}" = "1" ]; then
    date +%s > "${BACKUP_DIR}/.last_success"
    echo "[backup] $(date -Iseconds) terminado OK"
else
    echo "[backup] terminado CON ERRORES en archivos (la base quedó respaldada)" >&2
    exit 1
fi
