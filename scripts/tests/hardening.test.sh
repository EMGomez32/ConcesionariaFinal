#!/usr/bin/env bash
# Los cuerpos de los comandos simulados van entre comillas simples a propósito: se
# expanden cuando corre el stub, no al escribirlo.
# shellcheck disable=SC2016
# Test de las GUARDAS de scripts/hardening/pi-host-hardening.sh, con comandos del
# sistema simulados (sshd, systemctl, ufw, iptables...) y /etc apuntando a un
# directorio temporal (HARDEN_ETC). No necesita root ni toca el sistema.
#
# Lo importante es que el script NO deje al dueño afuera de la Pi:
#   - sin llaves válidas (o con permisos que sshd rechaza) no escribe nada de SSH;
#   - si `sshd -t` falla, revierte el drop-in;
#   - el firewall no se aplica si la sesión actual entra por una vía que se cierra;
#   - en modo plan no escribe nada; dos corridas no duplican reglas.
# NO prueba ufw/iptables/sshd reales: eso se ve en la Pi con verify-host.sh.
#
# USO:  bash scripts/tests/hardening.test.sh   (Linux; necesita ssh-keygen)
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="${HERE}/../hardening/pi-host-hardening.sh"
ROOT="$(mktemp -d)"
trap 'rm -rf "${ROOT}"' EXIT

PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  ok   - $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL - $1"; }
check() { local d="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else bad "$d"; fi; }

command -v ssh-keygen >/dev/null || { echo "falta ssh-keygen"; exit 1; }

# ── comandos simulados ──────────────────────────────────────────────────────
BIN="${ROOT}/bin"; mkdir -p "${BIN}"
CALLS="${ROOT}/calls.log"
stub() { printf '#!/bin/sh\n%s\n' "$2" > "${BIN}/$1"; chmod +x "${BIN}/$1"; }
stub getent 'u="$2"; case " ${STUB_USERS} " in *" $u "*) echo "$u:x:1000:1000::${STUB_HOMES}/$u:/bin/bash";; *) exit 2;; esac'
stub sshd 'echo "sshd $*" >> "'"${CALLS}"'"
case "$1" in
  -t) exit "${STUB_SSHD_T_RC:-0}";;
  -T) printf "passwordauthentication no\nkbdinteractiveauthentication no\npermitrootlogin no\nmaxauthtries 3\n";;
esac'
stub systemctl 'echo "systemctl $*" >> "'"${CALLS}"'"'
stub ufw 'echo "ufw $*" >> "'"${CALLS}"'"; [ "$1" = status ] && echo "Status: inactive"; exit 0'
stub iptables 'exit 0'
stub dpkg 'exit 0'
stub apt-get 'echo "apt-get $*" >> "'"${CALLS}"'"'
stub docker 'exit 1'
stub ip 'case " ${STUB_IFACES:-} " in *" $3 "*) exit 0;; *) exit 1;; esac'
stub who 'exit 0'
# Dueño de los archivos: sin root no se puede hacer chown, así que el "dueño" de lo
# que está bajo cada home simulado es el usuario de ese home (como en la Pi).
REAL_STAT="$(command -v stat)"
stub stat 'if [ "$1" = "-c" ] && [ "$2" = "%U" ]; then r="${3#${STUB_HOMES}/}"; if [ "$r" != "$3" ]; then echo "${r%%/*}"; exit 0; fi; fi
exec "'"${REAL_STAT}"'" "$@"'

ETCD="${ROOT}/etc"
HOMES="${ROOT}/home"
mkdir -p "${HOMES}"

# nuevo_usuario NOMBRE [con-llave]
nuevo_usuario() {
    mkdir -p "${HOMES}/$1/.ssh"; chmod 755 "${HOMES}/$1"; chmod 700 "${HOMES}/$1/.ssh"
    if [ "${2:-}" = con-llave ]; then
        ssh-keygen -q -t ed25519 -N '' -C "test-$1" -f "${ROOT}/key-$1" >/dev/null
        cp "${ROOT}/key-$1.pub" "${HOMES}/$1/.ssh/authorized_keys"
        chmod 600 "${HOMES}/$1/.ssh/authorized_keys"
    fi
}

# correr [VAR=valor ...] -- ARGS...: corre el script con el entorno de prueba.
correr() {
    local envs=()
    while [ "$1" != "--" ]; do envs+=("$1"); shift; done; shift
    : > "${CALLS}"
    env PATH="${BIN}:${PATH}" HARDEN_ETC="${ETCD}" STUB_HOMES="${HOMES}" \
        STUB_USERS="operador sinllave permisos" SSH_CONNECTION="" SUDO_USER="" \
        "${envs[@]}" bash "${SCRIPT}" "$@" > "${ROOT}/out.log" 2>&1
    RC=$?
}
salida() { grep -q -- "$1" "${ROOT}/out.log"; }
llamado() { grep -q -- "$1" "${CALLS}"; }
DROPIN="${ETCD}/ssh/sshd_config.d/00-hardening.conf"

nuevo_usuario operador con-llave
nuevo_usuario sinllave
nuevo_usuario permisos con-llave

echo "# modo plan"
correr STUB_IFACES="tailscale0" SSH_CONNECTION="100.101.102.103 50000 100.64.0.7 22" -- --ssh-users operador
check "plan: termina bien" test "${RC}" -eq 0
check "plan: no crea nada en /etc" test ! -e "${ETCD}"
check "plan: muestra lo que escribiría" salida "\[plan\] escribiría ${DROPIN}"
# Lecturas (`ufw status`, `sshd -T`) sí; nada que cambie estado.
check "plan: no ejecuta nada que cambie el sistema" test "$(grep -Ec 'systemctl|apt-get|ufw (default|allow|reload|--force)|sshd -t' "${CALLS}")" -eq 0

echo "# SSH: guardas contra quedarse afuera"
correr -- --apply --yes --only ssh --ssh-users sinllave
check "sin llaves: falla" test "${RC}" -ne 0
check "sin llaves: avisa que quedaría afuera" salida "quedaría AFUERA"
check "sin llaves: no escribe el drop-in" test ! -e "${DROPIN}"
check "sin llaves: no recarga sshd" test ! -s "${CALLS}"

correr -- --apply --yes --only ssh --ssh-users "operador sinllave"
check "un usuario sin llaves en la lista alcanza para no aplicar" test ! -e "${DROPIN}"

chmod 666 "${HOMES}/permisos/.ssh/authorized_keys"
correr -- --apply --yes --only ssh --ssh-users permisos
check "authorized_keys escribible por otros: falla" test "${RC}" -ne 0
check "authorized_keys escribible por otros: explica los permisos" salida "sshd ignoraría las llaves"
check "authorized_keys escribible por otros: no escribe el drop-in" test ! -e "${DROPIN}"

correr -- --apply --yes --only ssh --ssh-users nadie
check "usuario inexistente: falla sin escribir" test "${RC}" -ne 0 -a ! -e "${DROPIN}"

echo "# SSH: aplicar"
correr -- --apply --yes --only ssh --ssh-users operador
check "con llave: termina bien" test "${RC}" -eq 0
check "con llave: drop-in con PasswordAuthentication no" grep -qx "PasswordAuthentication no" "${DROPIN}"
check "con llave: drop-in con PermitRootLogin no" grep -qx "PermitRootLogin no" "${DROPIN}"
check "con llave: drop-in con MaxAuthTries 3" grep -qx "MaxAuthTries 3" "${DROPIN}"
check "con llave: drop-in con AllowUsers" grep -qx "AllowUsers operador" "${DROPIN}"
check "con llave: valida con sshd -t" llamado "sshd -t"
check "con llave: recarga sshd" llamado "systemctl reload ssh"

correr -- --apply --yes --only ssh --ssh-users operador
check "segunda corrida: idempotente" salida "ya aplicado"
check "segunda corrida: no recarga de nuevo" test ! "$(grep -c 'systemctl reload' "${CALLS}")" -gt 0

cp "${DROPIN}" "${ROOT}/dropin-antes"
nuevo_usuario otro con-llave
correr STUB_USERS="operador otro" STUB_SSHD_T_RC=1 -- --apply --yes --only ssh --ssh-users "operador otro"
check "sshd -t falla: el script falla" test "${RC}" -ne 0
check "sshd -t falla: revierte al drop-in anterior" cmp -s "${DROPIN}" "${ROOT}/dropin-antes"
check "sshd -t falla: no recarga sshd" test ! "$(grep -c 'systemctl reload' "${CALLS}")" -gt 0

correr -- --apply --yes --only ssh --ssh-users $'operador\nPermitRootLogin yes'
check "parámetro con salto de línea: rechazado" test "${RC}" -eq 2

echo "# firewall"
mkdir -p "${ETCD}/ufw"
printf '# after.rules original\n*filter\n:ufw-after-input - [0:0]\nCOMMIT\n' > "${ETCD}/ufw/after.rules"
cp "${ETCD}/ufw/after.rules" "${ROOT}/after-original"

correr STUB_IFACES="tailscale0" SSH_CONNECTION="192.168.1.50 50000 192.168.1.10 22" -- --apply --yes --only firewall
check "sesión desde la LAN sin --lan-cidr: falla" test "${RC}" -ne 0
check "sesión desde la LAN sin --lan-cidr: no toca after.rules" cmp -s "${ETCD}/ufw/after.rules" "${ROOT}/after-original"
check "sesión desde la LAN sin --lan-cidr: no activa ufw" test ! "$(grep -c 'ufw --force enable' "${CALLS}")" -gt 0

correr STUB_IFACES="" SSH_CONNECTION="" -- --apply --yes --only firewall
check "sin interfaz de Tailscale ni LAN: no aplica" test "${RC}" -ne 0 -a ! "$(grep -c 'ufw --force enable' "${CALLS}")" -gt 0

correr STUB_IFACES="tailscale0" SSH_CONNECTION="100.101.102.103 50000 100.64.0.7 22" -- --apply --yes --only firewall
check "sesión por Tailscale: aplica" test "${RC}" -eq 0
check "conserva el after.rules original" grep -q "^# after.rules original" "${ETCD}/ufw/after.rules"
check "agrega la cadena DOCKER-USER" grep -q "^:DOCKER-USER - \[0:0\]" "${ETCD}/ufw/after.rules"
check "descarta conexiones nuevas hacia los bridges de Docker" grep -q -- "-A DOCKER-USER -o br-+ -m conntrack --ctstate NEW -j DROP" "${ETCD}/ufw/after.rules"
check "deja pasar Tailscale" grep -q -- "-A DOCKER-USER -i tailscale0 -j RETURN" "${ETCD}/ufw/after.rules"
check "también IPv6 (after6.rules)" grep -q "^:DOCKER-USER" "${ETCD}/ufw/after6.rules"
check "ufw: deny incoming" llamado "ufw default deny incoming"
check "ufw: permite tailscale0" llamado "ufw allow in on tailscale0"
check "ufw: lo activa" llamado "ufw --force enable"
check "sin LAN: no abre puertos a la LAN" test ! "$(grep -c 'ufw allow from' "${CALLS}")" -gt 0

correr STUB_IFACES="tailscale0" SSH_CONNECTION="100.101.102.103 50000 100.64.0.7 22" -- --apply --yes --only firewall
check "segunda corrida: el bloque no se duplica" test "$(grep -c '^# BEGIN hardening DOCKER-USER' "${ETCD}/ufw/after.rules")" -eq 1

correr STUB_IFACES="tailscale0" SSH_CONNECTION="192.168.1.50 50000 192.168.1.10 22" -- --apply --yes --only firewall --lan-cidr 192.168.1.0/24 --lan-docker
check "sesión desde la LAN declarada: aplica" test "${RC}" -eq 0
check "LAN declarada: abre el SSH a esa red" llamado "ufw allow from 192.168.1.0/24 to any port 22 proto tcp"
check "--lan-docker: la LAN llega a los contenedores" grep -q -- "-A DOCKER-USER -s 192.168.1.0/24 -j RETURN" "${ETCD}/ufw/after.rules"
check "el bloque se reemplaza (sigue habiendo uno)" test "$(grep -c '^# BEGIN hardening DOCKER-USER' "${ETCD}/ufw/after.rules")" -eq 1

echo "# ayuda"
correr -- --help
check "--help termina bien y muestra los pasos" test "${RC}" -eq 0
check "--help no ejecuta nada" test ! -s "${CALLS}"

echo
echo "${PASS} ok, ${FAIL} fallas"
[ "${FAIL}" -eq 0 ]
