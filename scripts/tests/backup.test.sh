#!/bin/sh
# Test de la LÓGICA de scripts/backup.sh con binarios simulados (pg_dump, age,
# rclone), sin Docker ni base. Verifica: cifrado, que NUNCA se suba nada en claro
# al offsite, alertas ante fallos, retención, permisos y la marca .last_success.
# NO prueba age/rclone/pg_dump reales: eso lo cubre restore-drill.sh en la Pi.
#
# USO:  sh scripts/tests/backup.test.sh
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
BACKUP_SH="${HERE}/../backup.sh"
ROOT="$(mktemp -d)"
trap 'rm -rf "${ROOT}"' EXIT

PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  ok   - $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL - $1"; }
check() { # check "descripción" comando...
    desc="$1"; shift
    if "$@" >/dev/null 2>&1; then ok "${desc}"; else bad "${desc}"; fi
}

# ── binarios simulados ──────────────────────────────────────────────────────
BIN="${ROOT}/bin"
mkdir -p "${BIN}"
cat > "${BIN}/pg_dump" <<'STUB'
#!/bin/sh
[ "${STUB_PGDUMP_FAIL:-0}" = "1" ] && { echo "pg_dump: boom" >&2; exit 1; }
i=0; while [ $i -lt 200 ]; do echo "INSERT INTO t VALUES ($i, 'dato de prueba largo para pasar el minimo');"; i=$((i + 1)); done
STUB
cat > "${BIN}/age" <<'STUB'
#!/bin/sh
# age -r R [-r R] -o OUT IN   (simula: cabecera de age + contenido)
out=""; while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift 2;; -r) echo "$2" >> "${STUB_AGE_RECIPIENTS}"; shift 2;; *) in="$1"; shift;; esac; done
{ echo "age-encryption.org/v1"; cat "${in}"; } > "${out}"
STUB
cat > "${BIN}/rclone" <<'STUB'
#!/bin/sh
echo "$*" >> "${STUB_RCLONE_LOG}"
[ "${STUB_RCLONE_FAIL:-0}" = "1" ] && [ "$1" = "copy" ] && exit 1
exit 0
STUB
chmod +x "${BIN}/pg_dump" "${BIN}/age" "${BIN}/rclone"

# run_backup NOMBRE [VAR=valor ...]: corre backup.sh en un sandbox limpio.
run_backup() {
    NAME="$1"; shift
    W="${ROOT}/${NAME}"
    mkdir -p "${W}/backups" "${W}/data/uploads/vehiculos" "${W}/data/wa-auth"
    echo "foto" > "${W}/data/uploads/vehiculos/a.png"
    echo "creds" > "${W}/data/wa-auth/creds.json"
    : > "${W}/rclone.log"; : > "${W}/alerts.log"; : > "${W}/age-recipients.log"
    env PATH="${BIN}:${PATH}" BACKUP_MIN_BYTES=100 \
        BACKUP_DIR="${W}/backups" DATA_DIR="${W}/data" \
        BACKUP_ALERT_CMD="echo \"\$1|\$2\" >> ${W}/alerts.log" \
        STUB_RCLONE_LOG="${W}/rclone.log" STUB_AGE_RECIPIENTS="${W}/age-recipients.log" \
        "$@" sh "${BACKUP_SH}" > "${W}/out.log" 2>&1
    RC=$?
}

count() { ls -1 "$1"/$2 2>/dev/null | wc -l | tr -d ' '; }

# ── 1) sin cifrado, sin offsite ─────────────────────────────────────────────
echo "1) sin recipient ni offsite"
run_backup t1
[ "${RC}" -eq 0 ] && ok "sale 0" || bad "sale 0 (rc=${RC})"
[ "$(count "${ROOT}/t1/backups" 'concesionaria_*.sql.gz')" = "1" ] && ok "dump .sql.gz" || bad "dump .sql.gz"
[ "$(count "${ROOT}/t1/backups" 'files_*.tar.gz')" = "1" ] && ok "archivo de uploads/wa-auth" || bad "archivo files_*.tar.gz"
check "dump íntegro (gzip -t)" gzip -t "$(ls "${ROOT}"/t1/backups/concesionaria_*.sql.gz)"
check "archivos contienen wa-auth y uploads" sh -c "tar -tzf $(ls "${ROOT}"/t1/backups/files_*.tar.gz) | grep -q wa-auth/creds.json && tar -tzf $(ls "${ROOT}"/t1/backups/files_*.tar.gz) | grep -q uploads/vehiculos/a.png"
check "deja .last_success" test -s "${ROOT}/t1/backups/.last_success"
grep -q "SIN cifrar" "${ROOT}/t1/out.log" && ok "avisa que no hay cifrado" || bad "avisa que no hay cifrado"

# ── 2) con recipient ────────────────────────────────────────────────────────
echo "2) con BACKUP_AGE_RECIPIENT (dos claves)"
run_backup t2 BACKUP_AGE_RECIPIENT="age1aaa age1bbb"
[ "${RC}" -eq 0 ] && ok "sale 0" || bad "sale 0 (rc=${RC})"
[ "$(count "${ROOT}/t2/backups" 'concesionaria_*.sql.gz.age')" = "1" ] && ok "dump cifrado .age" || bad "dump cifrado .age"
[ "$(count "${ROOT}/t2/backups" 'files_*.tar.gz.age')" = "1" ] && ok "archivos cifrados .age" || bad "archivos cifrados .age"
[ "$(count "${ROOT}/t2/backups" 'concesionaria_*.sql.gz')" = "0" ] && ok "no queda dump en claro" || bad "no queda dump en claro"
[ "$(count "${ROOT}/t2/backups" 'files_*.tar.gz')" = "0" ] && ok "no queda tar en claro" || bad "no queda tar en claro"
head -1 "$(ls "${ROOT}"/t2/backups/concesionaria_*.age)" | grep -q "age-encryption.org" && ok "cabecera age" || bad "cabecera age"
[ "$(wc -l < "${ROOT}/t2/age-recipients.log" | tr -d ' ')" -ge 4 ] && ok "usa los dos recipients" || bad "usa los dos recipients"
[ -z "$(find "${ROOT}/t2/backups" -name '*.tmp')" ] && ok "sin .tmp residuales" || bad "sin .tmp residuales"

# ── 3) offsite SIN cifrado: no debe subir nada ──────────────────────────────
echo "3) offsite sin cifrado"
run_backup t3 BACKUP_OFFSITE_REMOTE="r2:bucket/db"
[ "${RC}" -eq 0 ] && ok "sale 0 (el backup local quedó bien)" || bad "sale 0 (rc=${RC})"
! grep -q "^copy" "${ROOT}/t3/rclone.log" && ok "NO se sube nada en claro" || bad "NO se sube nada en claro"
grep -q "^offsite|" "${ROOT}/t3/alerts.log" && ok "alerta de offsite omitido" || bad "alerta de offsite omitido"

# ── 4) offsite con cifrado ──────────────────────────────────────────────────
echo "4) offsite con cifrado"
run_backup t4 BACKUP_AGE_RECIPIENT="age1aaa" BACKUP_OFFSITE_REMOTE="r2:bucket/db"
[ "$(grep -c "^copy" "${ROOT}/t4/rclone.log")" = "2" ] && ok "sube base y archivos" || bad "sube base y archivos"
! grep "^copy" "${ROOT}/t4/rclone.log" | grep -v "\.age " >/dev/null && ok "sólo se suben .age" || bad "sólo se suben .age"
grep -q "^delete .*files_\*" "${ROOT}/t4/rclone.log" && ok "retención remota incluye files_*" || bad "retención remota incluye files_*"

# ── 5) offsite en claro forzado ─────────────────────────────────────────────
echo "5) BACKUP_OFFSITE_ALLOW_PLAINTEXT=1"
run_backup t5 BACKUP_OFFSITE_REMOTE="r2:bucket/db" BACKUP_OFFSITE_ALLOW_PLAINTEXT=1
[ "$(grep -c "^copy" "${ROOT}/t5/rclone.log")" = "2" ] && ok "sube en claro sólo si se fuerza" || bad "sube en claro sólo si se fuerza"

# ── 6) fallos ───────────────────────────────────────────────────────────────
echo "6) pg_dump falla"
run_backup t6 STUB_PGDUMP_FAIL=1
[ "${RC}" -ne 0 ] && ok "sale != 0" || bad "sale != 0"
grep -q "^backup|" "${ROOT}/t6/alerts.log" && ok "dispara la alerta" || bad "dispara la alerta"
[ "$(count "${ROOT}/t6/backups" 'concesionaria_*')" = "0" ] && ok "no deja dump" || bad "no deja dump"
[ ! -e "${ROOT}/t6/backups/.last_success" ] && ok "no marca .last_success" || bad "no marca .last_success"

echo "6b) dump sospechosamente chico"
run_backup t6b BACKUP_MIN_BYTES=100000
[ "${RC}" -ne 0 ] && ok "sale != 0" || bad "sale != 0"
grep -q "chico" "${ROOT}/t6b/alerts.log" && ok "alerta por tamaño" || bad "alerta por tamaño"

echo "7) el push offsite falla: el backup local vale igual"
run_backup t7 BACKUP_AGE_RECIPIENT="age1aaa" BACKUP_OFFSITE_REMOTE="r2:bucket/db" STUB_RCLONE_FAIL=1
[ "${RC}" -eq 0 ] && ok "sale 0" || bad "sale 0 (rc=${RC})"
grep -q "^offsite|" "${ROOT}/t7/alerts.log" && ok "alerta de offsite" || bad "alerta de offsite"
check "deja .last_success" test -s "${ROOT}/t7/backups/.last_success"

echo "8) volúmenes de archivos no montados"
W="${ROOT}/t8"; mkdir -p "${W}/backups" "${W}/data"; : > "${W}/alerts.log"
env PATH="${BIN}:${PATH}" BACKUP_MIN_BYTES=100 BACKUP_DIR="${W}/backups" DATA_DIR="${W}/data" \
    BACKUP_ALERT_CMD="echo \"\$1|\$2\" >> ${W}/alerts.log" sh "${BACKUP_SH}" > "${W}/out.log" 2>&1
RC=$?
[ "${RC}" -ne 0 ] && ok "sale != 0 (no marca éxito)" || bad "sale != 0"
grep -q "^backup|" "${W}/alerts.log" && ok "alerta" || bad "alerta"
[ "$(count "${W}/backups" 'concesionaria_*.sql.gz')" = "1" ] && ok "la base igual quedó respaldada" || bad "la base igual quedó respaldada"

# ── 9) retención ────────────────────────────────────────────────────────────
echo "9) retención"
W="${ROOT}/t9"; mkdir -p "${W}/backups"
touch -d "40 days ago" "${W}/backups/concesionaria_20200101_000000.sql.gz.age" "${W}/backups/files_20200101_000000.tar.gz.age" 2>/dev/null \
    || touch -t 202001010000 "${W}/backups/concesionaria_20200101_000000.sql.gz.age" "${W}/backups/files_20200101_000000.tar.gz.age"
run_backup t9x
cp "${ROOT}/t9/backups/"* "${ROOT}/t9x/backups/" 2>/dev/null
touch -t 202001010000 "${ROOT}/t9x/backups/concesionaria_20200101_000000.sql.gz.age" "${ROOT}/t9x/backups/files_20200101_000000.tar.gz.age"
env PATH="${BIN}:${PATH}" BACKUP_MIN_BYTES=100 BACKUP_DIR="${ROOT}/t9x/backups" DATA_DIR="${ROOT}/t9x/data" RETENTION_DAYS=14 \
    sh "${BACKUP_SH}" > "${ROOT}/t9x/out2.log" 2>&1
[ ! -e "${ROOT}/t9x/backups/concesionaria_20200101_000000.sql.gz.age" ] && [ ! -e "${ROOT}/t9x/backups/files_20200101_000000.tar.gz.age" ] \
    && ok "borra dumps y archivos viejos (incluye .age)" || bad "borra dumps y archivos viejos (incluye .age)"
[ "$(count "${ROOT}/t9x/backups" 'concesionaria_*.sql.gz')" -ge 1 ] && ok "conserva los recientes" || bad "conserva los recientes"

# ── permisos (umask 077) ────────────────────────────────────────────────────
echo "10) permisos"
case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) echo "  skip - permisos POSIX no aplican en Windows (se prueba en el CI de Linux)" ;;
    *)
        PERM="$(ls -l "$(ls "${ROOT}"/t2/backups/concesionaria_*.age)" | cut -c1-10)"
        [ "${PERM}" = "-rw-------" ] && ok "backup con permisos 600" || bad "backup con permisos 600 (${PERM})"
        ;;
esac

echo
echo "resultado: ${PASS} ok, ${FAIL} fallas"
[ "${FAIL}" -eq 0 ]
