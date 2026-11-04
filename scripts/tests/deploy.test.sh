#!/usr/bin/env bash
# Los cuerpos de los comandos simulados van entre comillas simples a propósito: se
# expanden cuando corre el stub, no al escribirlo.
# shellcheck disable=SC2016
# Test de la LÓGICA de scripts/deploy.sh contra un repo git de verdad (con su
# "origin") y docker/curl simulados. Verifica: backup ANTES del deploy, que sólo
# se despliega lo que está en origin/main, tags, que no pisa cambios locales, que
# si la versión nueva no queda sana vuelve a la anterior, y el registro de deploys.
# NO prueba docker compose real: eso es el primer deploy en la Pi.
#
# USO:  bash scripts/tests/deploy.test.sh   (Linux; necesita git y flock)
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_SH="${HERE}/../deploy.sh"
ROOT="$(mktemp -d)"
trap 'rm -rf "${ROOT}"' EXIT

PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  ok   - $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL - $1"; }
check() { local d="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else bad "$d"; fi; }

for c in git flock; do command -v "$c" >/dev/null || { echo "falta $c"; exit 1; }; done

# ── docker y curl simulados ─────────────────────────────────────────────────
BIN="${ROOT}/bin"; mkdir -p "${BIN}"
CALLS="${ROOT}/calls.log"
cat > "${BIN}/docker" <<STUB
#!/bin/sh
# El "contenedor" sano/enfermo depende de la versión que está en el checkout:
# si existe el archivo ROMPE, el backend nunca queda healthy.
echo "docker \$* @\$(git rev-parse --short HEAD 2>/dev/null)" >> "${CALLS}"
case "\$*" in
  "compose version") exit 0 ;;
  "compose ps --status running --services") printf 'db-backup\nbackend\nfrontend\n' ;;
  "compose exec -T db-backup sh /usr/local/bin/backup.sh") exit "\${STUB_BACKUP_RC:-0}" ;;
  "compose exec -T db-backup sh -c "*) echo "concesionaria_20261104_120000.sql.gz.age" ;;
  "compose up -d --build backend frontend") exit 0 ;;
  "compose ps -q backend") echo cid-backend ;;
  "inspect -f {{.State.Health.Status}} cid-backend") if [ -e ROMPE ]; then echo unhealthy; else echo healthy; fi ;;
  "compose logs"*) echo "(logs del backend)" ;;
  *) exit 0 ;;
esac
STUB
cat > "${BIN}/curl" <<'STUB'
#!/bin/sh
for a in "$@"; do u="$a"; done
case "$u" in
  */api/health) echo '{"success":true,"data":{"status":"UP"}}' ;;
  */) echo '<html><body><div id="root"></div></body></html>' ;;
esac
STUB
printf '#!/bin/sh\nexit 0\n' > "${BIN}/sleep"
chmod +x "${BIN}/docker" "${BIN}/curl" "${BIN}/sleep"

# ── repo de prueba: origin (bare) + el checkout "de la Pi" ──────────────────
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com
ORIGIN="${ROOT}/origin.git"; DEV="${ROOT}/dev"; PI="${ROOT}/pi"
git init -q --bare -b main "${ORIGIN}"
git init -q -b main "${DEV}"
mkdir -p "${DEV}/scripts"
cp "${DEPLOY_SH}" "${DEV}/scripts/deploy.sh"
printf 'services: {}\n' > "${DEV}/docker-compose.yml"
printf '.env\n*.log\nscripts/.deploy.lock\n' > "${DEV}/.gitignore"
commit() { echo "$1" > "${DEV}/version.txt"; git -C "${DEV}" add -A; git -C "${DEV}" commit -q -m "$1"; git -C "${DEV}" rev-parse --short HEAD; }
C1="$(commit v1)"
git -C "${DEV}" remote add origin "${ORIGIN}"; git -C "${DEV}" push -q origin main
git clone -q "${ORIGIN}" "${PI}"; echo "SECRETO=x" > "${PI}/.env"
C2="$(commit v2)"; git -C "${DEV}" tag v2.0.0; git -C "${DEV}" push -q origin main --tags

LOGF="${PI}/scripts/deploys.log"
correr() { # correr [VAR=valor ...] -- ARGS...
    local envs=()
    while [ "$1" != "--" ]; do envs+=("$1"); shift; done; shift
    : > "${CALLS}"
    ( cd "${PI}" && env PATH="${BIN}:${PATH}" DEPLOY_OPERATOR=tester DEPLOY_HEALTH_TIMEOUT=10 "${envs[@]}" \
        bash scripts/deploy.sh "$@" ) > "${ROOT}/out.log" 2>&1
    RC=$?
}
head_pi() { git -C "${PI}" rev-parse --short HEAD; }
ultima_linea() { tail -1 "${LOGF}" 2>/dev/null; }
contiene() { case "$1" in *"$2"*) return 0 ;; *) return 1 ;; esac; }
orden_backup_antes_de_up() {
    local b u
    b="$(grep -n 'backup.sh' "${CALLS}" | head -1 | cut -d: -f1)"
    u="$(grep -n 'compose up' "${CALLS}" | head -1 | cut -d: -f1)"
    [ -n "$b" ] && [ -n "$u" ] && [ "$b" -lt "$u" ]
}

echo "# deploy normal (origin/main)"
correr --
check "termina bien" test "${RC}" -eq 0
check "queda en la versión nueva" test "$(head_pi)" = "${C2}"
check "hace el backup ANTES de levantar" orden_backup_antes_de_up
check "levanta backend y frontend con la versión nueva" grep -q "compose up -d --build backend frontend @${C2}" "${CALLS}"
check "registra OK con de→a y operador" contiene "$(ultima_linea)" "de=${C1} | a=${C2} | ref=origin/main | operador=tester | resultado=OK"
check "registra qué backup se hizo" contiene "$(ultima_linea)" "backup=concesionaria_20261104_120000.sql.gz.age"

echo "# ya desplegado"
correr --
check "sin cambios: termina bien" test "${RC}" -eq 0
check "sin cambios: no reconstruye" test "$(grep -c 'compose up' "${CALLS}")" -eq 0

echo "# versión rota → rollback"
touch "${DEV}/ROMPE"; C3="$(commit v3-rota)"; git -C "${DEV}" push -q origin main
correr --
check "falla" test "${RC}" -ne 0
check "vuelve al commit anterior" test "$(head_pi)" = "${C2}"
check "levantó la rota y después la anterior" test "$(grep -c 'compose up' "${CALLS}")" -eq 2
check "la segunda vez levantó la anterior" grep -q "compose up -d --build backend frontend @${C2}" "${CALLS}"
check "registra ROLLBACK_OK" contiene "$(ultima_linea)" "de=${C2} | a=${C3} | ref=origin/main | operador=tester | resultado=ROLLBACK_OK"
git -C "${DEV}" rm -q ROMPE; C4="$(commit v4)"; git -C "${DEV}" push -q origin main

echo "# tag"
correr -- v2.0.0
check "un tag que ya corre: no hace nada" test "${RC}" -eq 0 -a "$(grep -c 'compose up' "${CALLS}")" -eq 0
correr -- --ref origin/main
check "deploy de la versión arreglada" test "${RC}" -eq 0 -a "$(head_pi)" = "${C4}"
correr -- v2.0.0
check "volver a un tag anterior a mano" test "${RC}" -eq 0 -a "$(head_pi)" = "${C2}"
check "registra el tag como ref" contiene "$(ultima_linea)" "ref=v2.0.0"

echo "# guardas"
git -C "${DEV}" checkout -q -b experimento; CX="$(commit experimento)"; git -C "${DEV}" push -q origin experimento; git -C "${DEV}" checkout -q main
correr -- origin/experimento
check "commit fuera de main: rechazado" test "${RC}" -ne 0 -a "$(head_pi)" = "${C2}"
check "commit fuera de main: no reconstruye ni hace backup" test "$(grep -Ec 'compose up|backup.sh' "${CALLS}")" -eq 0
correr DEPLOY_ALLOW_UNMERGED=1 -- origin/experimento
check "--allow-unmerged (emergencia): despliega" test "${RC}" -eq 0 -a "$(head_pi)" = "${CX}"
correr -- --ref origin/main

echo "cambio local" >> "${PI}/version.txt"
correr -- v2.0.0
check "archivo versionado modificado: rechazado" test "${RC}" -ne 0
check "archivo versionado modificado: no pisa el cambio" grep -q "cambio local" "${PI}/version.txt"
git -C "${PI}" checkout -q -- version.txt

correr STUB_BACKUP_RC=1 -- v2.0.0
check "backup fallido: no despliega" test "${RC}" -ne 0 -a "$(head_pi)" = "${C4}" -a "$(grep -c 'compose up' "${CALLS}")" -eq 0
check "backup fallido: queda registrado" contiene "$(ultima_linea)" "resultado=ABORTADO"

correr -- no-existe
check "ref inexistente: rechazado sin tocar nada" test "${RC}" -ne 0 -a "$(head_pi)" = "${C4}"

( cd "${PI}" && exec 9>scripts/.deploy.lock && flock -n 9 && correr -- v2.0.0 && echo "${RC}" > "${ROOT}/rc-lock" )
check "con otro deploy en curso: rechazado" test "$(cat "${ROOT}/rc-lock" 2>/dev/null || echo 0)" -ne 0

echo
echo "${PASS} ok, ${FAIL} fallas"
[ "${FAIL}" -eq 0 ]
