#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Endurecimiento del host (Raspberry Pi / Debian 13 con Docker). Lo corre el
# DUEÑO a mano en la Pi; nada de esto se ejecuta solo.
#
# Por defecto NO cambia nada: imprime el plan (qué escribiría y qué comandos
# correría) y los chequeos de seguridad. Con --apply lo ejecuta. Es idempotente:
# correrlo dos veces no duplica reglas ni archivos.
#
#   sudo ./scripts/hardening/pi-host-hardening.sh                     # plan
#   sudo ./scripts/hardening/pi-host-hardening.sh --apply             # aplicar todo
#   sudo ./scripts/hardening/pi-host-hardening.sh --apply --only ssh  # un paso
#
# Pasos (nombres para --only / --skip, separados por coma):
#   ssh         drop-in en /etc/ssh/sshd_config.d/: sólo llaves, sin root,
#               MaxAuthTries 3, AllowUsers. ANTES de aplicarlo verifica que cada
#               usuario permitido tenga al menos una llave válida (y permisos que
#               sshd acepte) y valida con `sshd -t`; si algo falla, no toca nada.
#   fail2ban    jail de sshd (backend systemd: el sshd de Debian 13 loguea al journal).
#   upgrades    unattended-upgrades SÓLO del repositorio de seguridad de Debian.
#   firewall    ufw: entrada denegada salvo loopback y Tailscale (y la LAN si se
#               pide), más las reglas de DOCKER-USER (ver "Por qué DOCKER-USER").
#   tz          zona horaria America/Argentina/Buenos_Aires.
#   journald    journal persistente con tope de tamaño y de antigüedad.
#   docker      SÓLO avisos (no cambia nada): contenedores con el socket de
#               Docker montado, privilegiados o con puertos en 0.0.0.0.
#
# Parámetros (opción o variable de entorno):
#   --ssh-users "a b"   SSH_ALLOW_USERS   usuarios con SSH (default: quien hizo sudo)
#   --ssh-port N        SSH_PORT          puerto de sshd (default 22)
#   --ts-if IFACE       TAILSCALE_IF      interfaz de Tailscale (default tailscale0)
#   --lan-cidr CIDR     LAN_CIDR          red local a la que se le permite entrar
#                                         (vacío = la LAN no entra; sólo Tailscale)
#   --lan-ports "22"    LAN_PORTS         puertos TCP abiertos a LAN_CIDR (default: el de SSH)
#   --lan-docker        LAN_DOCKER=1      la LAN también llega a los puertos publicados por Docker
#   --f2b-ignore "..."  F2B_IGNOREIP      IPs/redes que fail2ban nunca banea
#                                         (default: loopback + rango de Tailscale 100.64.0.0/10)
#   --tz ZONA           HOST_TZ           (default America/Argentina/Buenos_Aires)
#   --journal-max TAM   JOURNAL_MAX_USE   (default 1G)
#   --journal-ret T     JOURNAL_MAX_RETENTION (default 3month)
#   --yes                                 no pedir confirmación en --apply
#   --force-firewall                      aplicar el firewall aunque la sesión actual
#                                         no entre por una vía permitida (NO recomendado)
#
# Orden sugerido la primera vez: plan completo → --apply --only ssh (y probar una
# sesión NUEVA) → --apply --only firewall (y probar otra vez) → --apply del resto.
#
# ── Por qué DOCKER-USER ──────────────────────────────────────────────────────
# Docker publica los puertos (`-p 0.0.0.0:8080:80`) con reglas DNAT en la tabla
# nat; esos paquetes pasan por la cadena FORWARD, no por INPUT, que es la única
# que filtra ufw. Resultado: con ufw "deny incoming", un puerto publicado por un
# contenedor SIGUE abierto a la LAN. La cadena DOCKER-USER es la que Docker deja
# para el administrador: se evalúa antes que sus propias reglas y Docker nunca la
# modifica. Acá se carga desde /etc/ufw/after.rules (así se recrea en cada
# arranque/recarga de ufw, antes de que levante Docker, y sobrevive a un
# reinicio): se deja pasar lo ya establecido y lo que entra por loopback,
# Tailscale o las redes de Docker, y se DESCARTAN las conexiones nuevas hacia
# los contenedores desde cualquier otra interfaz (la LAN). Lo que un contenedor
# publica en 127.0.0.1 no cambia (no pasa por FORWARD).
#
# ── Si perdés el SSH ─────────────────────────────────────────────────────────
#   1. Las sesiones abiertas NO se cortan (sshd recarga sin matar sesiones y ufw
#      deja pasar lo ya establecido): no cierres la sesión actual hasta probar
#      una nueva desde otra terminal.
#   2. Por Tailscale (`ssh <usuario>@<ip-tailscale>`) se sigue entrando aunque la
#      LAN quede cerrada.
#   3. Consola física (monitor + teclado), o el disco en otra máquina:
#        sudo rm /etc/ssh/sshd_config.d/00-hardening.conf && sudo systemctl reload ssh
#        sudo ufw disable
#      (los archivos anteriores quedan con sufijo .bak-hardening-<fecha>).
# ─────────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail
umask 022
# Un fallo NO previsto corta el script (mejor que seguir cambiando el host a ciegas).
# Cada paso es idempotente: se corrige la causa y se vuelve a correr.
trap 'printf "\n  ✗ falló (línea %s): %s\n    Lo aplicado hasta acá queda. Corregí y volvé a correr (es idempotente).\n" "$LINENO" "$BASH_COMMAND" >&2' ERR

# ── Parámetros ──────────────────────────────────────────────────────────────
APPLY=0
ASSUME_YES=0
FORCE_FIREWALL=0
ONLY=""
SKIP=""
SSH_ALLOW_USERS="${SSH_ALLOW_USERS:-${SUDO_USER:-}}"
SSH_PORT="${SSH_PORT:-22}"
TAILSCALE_IF="${TAILSCALE_IF:-tailscale0}"
LAN_CIDR="${LAN_CIDR:-}"
LAN_PORTS="${LAN_PORTS:-}"
LAN_DOCKER="${LAN_DOCKER:-0}"
F2B_IGNOREIP="${F2B_IGNOREIP:-127.0.0.1/8 ::1 100.64.0.0/10}"
HOST_TZ="${HOST_TZ:-America/Argentina/Buenos_Aires}"
JOURNAL_MAX_USE="${JOURNAL_MAX_USE:-1G}"
JOURNAL_MAX_RETENTION="${JOURNAL_MAX_RETENTION:-3month}"
# Raíz de /etc. Sólo la cambian los tests (scripts/tests/hardening.test.sh) para
# escribir en un directorio temporal; en la Pi siempre es /etc.
ETC="${HARDEN_ETC:-/etc}"

usage() { sed -n '2,/Por qué DOCKER-USER/p' "$0" | sed -e '$d' -e 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [ $# -gt 0 ]; do
    case "$1" in
        --apply) APPLY=1 ;;
        --yes|-y) ASSUME_YES=1 ;;
        --force-firewall) FORCE_FIREWALL=1 ;;
        --only) ONLY="${2:?--only necesita pasos}"; shift ;;
        --skip) SKIP="${2:?--skip necesita pasos}"; shift ;;
        --ssh-users) SSH_ALLOW_USERS="${2:?}"; shift ;;
        --ssh-port) SSH_PORT="${2:?}"; shift ;;
        --ts-if) TAILSCALE_IF="${2:?}"; shift ;;
        --lan-cidr) LAN_CIDR="${2:?}"; shift ;;
        --lan-ports) LAN_PORTS="${2:?}"; shift ;;
        --lan-docker) LAN_DOCKER=1 ;;
        --f2b-ignore) F2B_IGNOREIP="${2:?}"; shift ;;
        --tz) HOST_TZ="${2:?}"; shift ;;
        --journal-max) JOURNAL_MAX_USE="${2:?}"; shift ;;
        --journal-ret) JOURNAL_MAX_RETENTION="${2:?}"; shift ;;
        -h|--help) usage 0 ;;
        *) echo "Opción desconocida: $1 (ver --help)" >&2; exit 2 ;;
    esac
    shift
done

SSH_ALLOW_USERS="$(echo "$SSH_ALLOW_USERS" | tr ',' ' ' | xargs)"
LAN_PORTS="$(echo "${LAN_PORTS:-$SSH_PORT}" | tr ',' ' ' | xargs)"
STAMP="$(date +%Y%m%d_%H%M%S)"

# Valores que terminan en archivos de config: sólo caracteres esperables, para que
# un parámetro mal tipeado no meta una línea extra en sshd_config o en las reglas.
validar() { [[ "$2" =~ $3 ]] || { echo "Valor inválido para $1: '$2'" >&2; exit 2; }; }
validar --ssh-users "$SSH_ALLOW_USERS" '^[a-z_][a-z0-9_.@ -]*$|^$'
validar --ssh-port "$SSH_PORT" '^[0-9]{1,5}$'
validar --ts-if "$TAILSCALE_IF" '^[A-Za-z0-9_.-]+$'
validar --lan-cidr "$LAN_CIDR" '^$|^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$'
validar --lan-ports "$LAN_PORTS" '^[0-9 ]+$'
validar --f2b-ignore "$F2B_IGNOREIP" '^[0-9A-Fa-f.:/ ]+$'

# ── Salida ──────────────────────────────────────────────────────────────────
if [ -t 1 ]; then B=$'\e[1m'; R=$'\e[31m'; G=$'\e[32m'; Y=$'\e[33m'; N=$'\e[0m'; else B=""; R=""; G=""; Y=""; N=""; fi
titulo() { printf '\n%s== %s ==%s\n' "$B" "$1" "$N"; }
info()   { printf '  %s\n' "$*"; }
ok()     { printf '  %s✓%s %s\n' "$G" "$N" "$*"; }
aviso()  { printf '  %s!%s %s\n' "$Y" "$N" "$*"; }
error()  { printf '  %s✗ %s%s\n' "$R" "$*" "$N" >&2; }
plan()   { printf '  %s[plan]%s %s\n' "$Y" "$N" "$*"; }

declare -a RESUMEN=()
FALLOS=0
resultado() {
    RESUMEN+=("$(printf '%-9s %s' "$1" "$2")")
    if [ "$2" = "ERROR" ]; then FALLOS=$((FALLOS + 1)); fi
}

paso_activo() {
    local p="$1"
    if [ -n "$ONLY" ] && [[ ",${ONLY// /}," != *",$p,"* ]]; then return 1; fi
    if [ -n "$SKIP" ] && [[ ",${SKIP// /}," == *",$p,"* ]]; then return 1; fi
    return 0
}

tiene() { command -v "$1" >/dev/null 2>&1; }

# run CMD...: en --apply lo ejecuta; si no, lo muestra.
run() {
    if [ "$APPLY" = 1 ]; then "$@"; else plan "$*"; fi
}

# escribir_archivo RUTA MODO < contenido
# Idempotente. Devuelve 0 = cambió (o cambiaría, en plan), 1 = ya tenía ese
# contenido, 2 = error. En --apply respalda el anterior (.bak-hardening-<fecha>)
# y escribe de forma atómica; en plan muestra la diferencia.
# OJO: se llama como `escribir_archivo ... || rc=$?`, y en ese contexto bash
# ignora `set -e` adentro de la función: por eso cada comando chequea su error.
escribir_archivo() {
    local destino="$1" modo="$2" tmp
    tmp="$(mktemp)" || return 2
    cat > "$tmp" || { rm -f "$tmp"; return 2; }
    if [ -f "$destino" ] && cmp -s "$tmp" "$destino"; then
        rm -f "$tmp"; return 1
    fi
    if [ "$APPLY" = 1 ]; then
        mkdir -p "$(dirname "$destino")" || { rm -f "$tmp"; return 2; }
        if [ -f "$destino" ]; then cp -p "$destino" "${destino}.bak-hardening-${STAMP}" || { rm -f "$tmp"; return 2; }; fi
        install -m "$modo" "$tmp" "${destino}.tmp-hardening" || { rm -f "$tmp"; return 2; }
        mv -f "${destino}.tmp-hardening" "$destino" || { rm -f "$tmp"; return 2; }
        info "escrito ${destino}"
    else
        plan "escribiría ${destino} (modo ${modo}):"
        if [ -r "$destino" ]; then
            diff -u "$destino" "$tmp" | sed 's/^/      /' || true
        else
            sed 's/^/      + /' "$tmp"
        fi
    fi
    rm -f "$tmp"
    return 0
}

# cambio_de RC: traduce el código de escribir_archivo a 1 (cambió), 0 (igual) o "error".
cambio_de() { case "$1" in 0) echo 1 ;; 1) echo 0 ;; *) echo error ;; esac; }

apt_instalar() {
    local faltan=() p
    for p in "$@"; do dpkg -s "$p" >/dev/null 2>&1 || faltan+=("$p"); done
    [ ${#faltan[@]} -eq 0 ] && return 0
    if [ "$APPLY" = 1 ]; then
        DEBIAN_FRONTEND=noninteractive apt-get update -qq </dev/null
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${faltan[@]}" </dev/null
    else
        plan "apt-get install -y ${faltan[*]}"
    fi
}

# ── Pre-chequeos ────────────────────────────────────────────────────────────
titulo "Endurecimiento del host ($( [ "$APPLY" = 1 ] && echo 'APLICAR' || echo 'PLAN, sin cambios'))"
if [ "$APPLY" = 1 ] && [ "$ETC" = /etc ] && [ "$(id -u)" -ne 0 ]; then
    error "--apply necesita root: corré con sudo."; exit 2
fi
if [ "$APPLY" = 0 ] && [ "$(id -u)" -ne 0 ]; then
    aviso "corriendo sin root: algunos chequeos (llaves, sshd -T, ufw, docker) quedan incompletos. Mejor: sudo $0"
fi
# shellcheck source=/dev/null
if [ -r /etc/os-release ]; then info "sistema: $(. /etc/os-release; echo "${PRETTY_NAME:-?}")"; fi
info "usuarios SSH: ${SSH_ALLOW_USERS:-<ninguno>} · puerto ${SSH_PORT} · Tailscale: ${TAILSCALE_IF} · LAN: ${LAN_CIDR:-<cerrada>}"

if [ "$APPLY" = 1 ] && [ "$ASSUME_YES" = 0 ]; then
    if [ ! -t 0 ]; then error "sin terminal para confirmar: agregá --yes si de verdad querés aplicar"; exit 2; fi
    printf '\n  Esto va a cambiar la configuración del host. Escribí APLICAR para seguir: '
    read -r resp
    [ "$resp" = "APLICAR" ] || { echo "  Cancelado."; exit 1; }
fi

# ── (a) SSH ─────────────────────────────────────────────────────────────────
SSHD_DROPIN="${ETC}/ssh/sshd_config.d/00-hardening.conf"

# Cuenta las llaves válidas de un usuario (las que ssh-keygen puede leer).
llaves_validas() {
    local usuario="$1" home f n=0 lineas
    home="$(getent passwd "$usuario" | cut -d: -f6)"
    [ -n "$home" ] || { echo 0; return; }
    for f in "$home/.ssh/authorized_keys" "$home/.ssh/authorized_keys2"; do
        [ -s "$f" ] || continue
        lineas="$(ssh-keygen -l -f "$f" 2>/dev/null | wc -l)" || lineas=0
        n=$((n + lineas))
    done
    echo "$n"
}

# StrictModes (default de sshd): si el home, ~/.ssh o authorized_keys son
# escribibles por el grupo u otros, o tienen otro dueño, sshd IGNORA las llaves.
# Con la contraseña deshabilitada eso es quedarse afuera: se verifica antes.
permisos_ssh_ok() {
    local usuario="$1" home d modo dueno bien=0
    home="$(getent passwd "$usuario" | cut -d: -f6)"
    for d in "$home" "$home/.ssh" "$home/.ssh/authorized_keys"; do
        [ -e "$d" ] || continue
        modo="$(stat -c '%a' "$d" 2>/dev/null)" || continue
        dueno="$(stat -c '%U' "$d" 2>/dev/null)" || continue
        if [ $(( 8#$modo & 8#022 )) -ne 0 ] || { [ "$dueno" != "$usuario" ] && [ "$dueno" != root ]; }; then
            error "$d: permisos $modo, dueño $dueno → sshd ignoraría las llaves. Arreglo: sudo chmod go-w '$d' && sudo chown $usuario '$d'"
            bien=1
        fi
    done
    return "$bien"
}

paso_ssh() {
    titulo "(a) SSH: sólo llaves, sin root, MaxAuthTries 3, AllowUsers"
    if [ -z "$SSH_ALLOW_USERS" ]; then
        error "no hay usuarios para AllowUsers: pasá --ssh-users (o corré con sudo desde tu usuario)"
        resultado ssh ERROR; return
    fi
    if ! tiene ssh-keygen || ! tiene getent; then
        error "faltan ssh-keygen/getent para verificar las llaves: no se toca SSH"
        resultado ssh ERROR; return
    fi
    local u n bloqueado=0
    for u in $SSH_ALLOW_USERS; do
        if ! getent passwd "$u" >/dev/null; then
            error "el usuario '$u' no existe"; bloqueado=1; continue
        fi
        n="$(llaves_validas "$u")"
        if [ "$n" -ge 1 ]; then ok "$u tiene $n llave(s) válida(s) en authorized_keys"
        else error "$u NO tiene llaves válidas en ~/.ssh/authorized_keys: con este cambio quedaría AFUERA"; bloqueado=1; continue; fi
        if ! permisos_ssh_ok "$u"; then bloqueado=1; fi
    done
    if [ "$bloqueado" = 1 ]; then
        error "SSH sin cambios. Cargá una llave (ssh-copy-id desde tu máquina), probá entrar con ella y repetí."
        resultado ssh ERROR; return
    fi

    local cambio rc=0
    escribir_archivo "$SSHD_DROPIN" 0644 <<EOF || rc=$?
# Gestionado por scripts/hardening/pi-host-hardening.sh — no editar a mano.
# "00-" para que se lea primero: en sshd vale el PRIMER valor que encuentra.
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitRootLogin no
MaxAuthTries 3
AllowUsers ${SSH_ALLOW_USERS}
EOF
    cambio="$(cambio_de "$rc")"
    if [ "$cambio" = error ]; then error "no se pudo escribir ${SSHD_DROPIN}"; resultado ssh ERROR; return; fi
    if [ "$cambio" = 0 ]; then ok "drop-in ya aplicado (${SSHD_DROPIN})"; fi

    if [ "$APPLY" = 1 ] && [ "$cambio" = 1 ]; then
        # Validación ANTES de recargar: si la config no es válida, se vuelve atrás.
        if ! sshd -t; then
            error "sshd -t falló: se revierte el drop-in"
            if [ -f "${SSHD_DROPIN}.bak-hardening-${STAMP}" ]; then mv -f "${SSHD_DROPIN}.bak-hardening-${STAMP}" "$SSHD_DROPIN"; else rm -f "$SSHD_DROPIN"; fi
            resultado ssh ERROR; return
        fi
        if systemctl reload ssh 2>/dev/null || systemctl reload sshd; then
            ok "sshd recargado (las sesiones abiertas siguen vivas)"
        else
            error "no se pudo recargar sshd: la config nueva queda escrita pero NO activa (systemctl status ssh)"
            resultado ssh ERROR; return
        fi
    elif [ "$cambio" = 1 ]; then
        plan "sshd -t && systemctl reload ssh"
    fi

    # Config EFECTIVA: otro drop-in que se lea antes o un bloque Match pueden pisar valores.
    if { [ "$APPLY" = 1 ] || [ "$cambio" = 0 ]; } && tiene sshd && [ "$(id -u)" -eq 0 ]; then
        local efectiva primero par clave esperado actual malas=0
        primero="${SSH_ALLOW_USERS%% *}"
        efectiva="$(sshd -T -C "user=${primero},host=localhost,addr=127.0.0.1" 2>/dev/null || true)"
        for par in "passwordauthentication no" "kbdinteractiveauthentication no" "permitrootlogin no" "maxauthtries 3"; do
            clave="${par% *}"; esperado="${par#* }"
            actual="$(echo "$efectiva" | awk -v k="$clave" '$1==k{print $2; exit}')"
            if [ "$actual" = "$esperado" ]; then ok "efectivo: $clave $actual"
            else error "efectivo: $clave ${actual:-?} (se esperaba $esperado): revisá otros archivos de ${ETC}/ssh/sshd_config.d/ y bloques Match"; malas=1; fi
        done
        if [ "$malas" = 1 ]; then resultado ssh ERROR; return; fi
    fi
    if [ "$APPLY" = 1 ] && [ "$cambio" = 1 ]; then
        aviso "ANTES de cerrar esta sesión, abrí OTRA terminal y probá: ssh ${SSH_ALLOW_USERS%% *}@<ip-tailscale-de-la-pi>"
        resultado ssh APLICADO
    elif [ "$cambio" = 1 ]; then resultado ssh PLAN
    else resultado ssh OK; fi
}

# ── (b) fail2ban ────────────────────────────────────────────────────────────
paso_fail2ban() {
    titulo "(b) fail2ban: jail de sshd"
    apt_instalar fail2ban python3-systemd
    local cambio rc=0
    escribir_archivo "${ETC}/fail2ban/jail.d/00-hardening-sshd.local" 0644 <<EOF || rc=$?
# Gestionado por scripts/hardening/pi-host-hardening.sh — no editar a mano.
# Debian 13 no trae rsyslog: sshd loguea al journal, por eso backend = systemd.
[sshd]
enabled  = true
backend  = systemd
port     = ${SSH_PORT}
maxretry = 5
findtime = 10m
bantime  = 1h
# Reincidentes: cada ban nuevo dura más (hasta 1 semana).
bantime.increment = true
bantime.maxtime   = 1w
# Nunca banear el acceso de administración (Tailscale ya autentica el equipo).
ignoreip = ${F2B_IGNOREIP}
EOF
    cambio="$(cambio_de "$rc")"
    if [ "$cambio" = error ]; then error "no se pudo escribir el jail"; resultado fail2ban ERROR; return; fi
    if [ "$cambio" = 0 ]; then ok "jail ya configurado"; fi
    if [ "$APPLY" = 1 ]; then
        if ! fail2ban-client -t >/dev/null; then error "fail2ban-client -t: configuración inválida"; resultado fail2ban ERROR; return; fi
        systemctl enable --now fail2ban
        if [ "$cambio" = 1 ]; then systemctl restart fail2ban; fi
        sleep 2
        if fail2ban-client status sshd >/dev/null 2>&1; then ok "jail sshd activo"
        else error "el jail sshd no quedó activo (journalctl -u fail2ban)"; resultado fail2ban ERROR; return; fi
        resultado fail2ban APLICADO
    else
        plan "systemctl enable --now fail2ban && fail2ban-client status sshd"
        if [ "$cambio" = 1 ]; then resultado fail2ban PLAN; else resultado fail2ban OK; fi
    fi
}

# ── (c) unattended-upgrades sólo de seguridad ───────────────────────────────
paso_upgrades() {
    titulo "(c) Actualizaciones automáticas SÓLO de seguridad"
    apt_instalar unattended-upgrades
    local c1 c2 rc=0
    escribir_archivo "${ETC}/apt/apt.conf.d/20auto-upgrades" 0644 <<'EOF' || rc=$?
// Gestionado por scripts/hardening/pi-host-hardening.sh — no editar a mano.
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
    c1="$(cambio_de "$rc")"; rc=0
    # El 50unattended-upgrades de Debian también incluye el stable (label=Debian),
    # o sea las point releases. #clear vacía esa lista y deja SÓLO seguridad. Sin
    # reinicio automático: verify-host.sh avisa si hace falta reiniciar.
    escribir_archivo "${ETC}/apt/apt.conf.d/52unattended-upgrades-seguridad" 0644 <<'EOF' || rc=$?
// Gestionado por scripts/hardening/pi-host-hardening.sh — no editar a mano.
#clear Unattended-Upgrade::Origins-Pattern;
Unattended-Upgrade::Origins-Pattern {
        "origin=Debian,codename=${distro_codename}-security,label=Debian-Security";
        "origin=Debian,codename=${distro_codename},label=Debian-Security";
};
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
EOF
    c2="$(cambio_de "$rc")"
    if [ "$c1" = error ] || [ "$c2" = error ]; then error "no se pudo escribir la config de apt"; resultado upgrades ERROR; return; fi
    if [ "$c1$c2" = 00 ]; then ok "ya configurado"; fi
    if [ "$APPLY" = 1 ]; then
        systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
        if unattended-upgrade --dry-run >/dev/null 2>&1; then ok "unattended-upgrade --dry-run OK"
        else aviso "unattended-upgrade --dry-run devolvió error (revisá /var/log/unattended-upgrades/)"; fi
        resultado upgrades APLICADO
    elif [ "$c1$c2" != 00 ]; then resultado upgrades PLAN
    else resultado upgrades OK; fi
}

# ── (d) Firewall: ufw + DOCKER-USER ─────────────────────────────────────────
UFW_AFTER4="${ETC}/ufw/after.rules"
UFW_AFTER6="${ETC}/ufw/after6.rules"
MARCA_INI="# BEGIN hardening DOCKER-USER (pi-host-hardening.sh)"
MARCA_FIN="# END hardening DOCKER-USER"

bloque_docker_user() {
    local lan=""
    if [ "$1" = 4 ] && [ "$LAN_DOCKER" = 1 ] && [ -n "$LAN_CIDR" ]; then
        lan="-A DOCKER-USER -s ${LAN_CIDR} -j RETURN"
    fi
    cat <<EOF
${MARCA_INI}
# Docker publica puertos por FORWARD (DNAT), salteando las reglas de entrada de
# ufw. Declarar la cadena acá la vacía y la recarga en cada inicio de ufw.
*filter
:DOCKER-USER - [0:0]
-A DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
-A DOCKER-USER -i lo -j RETURN
-A DOCKER-USER -i ${TAILSCALE_IF} -j RETURN
-A DOCKER-USER -i docker0 -j RETURN
-A DOCKER-USER -i br-+ -j RETURN
${lan:+$lan
}-A DOCKER-USER -o docker0 -m conntrack --ctstate NEW -j DROP
-A DOCKER-USER -o br-+ -m conntrack --ctstate NEW -j DROP
-A DOCKER-USER -j RETURN
COMMIT
${MARCA_FIN}
EOF
}

# Imprime el archivo con el bloque reemplazado (o agregado al final).
con_bloque() {
    local archivo="$1" familia="$2"
    if [ -f "$archivo" ] && [ ! -r "$archivo" ]; then
        aviso "no se puede leer ${archivo} (¿sin root?): el plan lo muestra como si no existiera" >&2
    elif [ -f "$archivo" ]; then
        awk -v ini="$MARCA_INI" -v fin="$MARCA_FIN" '
            $0==ini {salta=1; next}
            $0==fin {salta=0; next}
            !salta {print}' "$archivo"
    fi
    bloque_docker_user "$familia"
}

# ip_en_cidr4 IP CIDR: ¿la IPv4 está dentro de la red? (sin depender de python)
ip_en_cidr4() {
    local ip="$1" red="${2%/*}" bits="${2#*/}" a b c d e f g h
    [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
    [[ "$red" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
    [[ "$bits" =~ ^[0-9]+$ ]] && [ "$bits" -le 32 ] || return 1
    IFS=. read -r a b c d <<< "$ip"
    IFS=. read -r e f g h <<< "$red"
    local n1=$(( (a << 24) | (b << 16) | (c << 8) | d ))
    local n2=$(( (e << 24) | (f << 16) | (g << 8) | h ))
    local mascara=$(( bits == 0 ? 0 : (0xFFFFFFFF << (32 - bits)) & 0xFFFFFFFF ))
    [ $(( n1 & mascara )) -eq $(( n2 & mascara )) ]
}

# IP desde la que está conectada ESTA sesión. sudo borra SSH_CONNECTION del
# entorno, así que se cae a `who -m` (la terminal de la sesión). Imprime "local"
# si es una consola física y nada si no se pudo determinar.
ip_cliente() {
    if [ -n "${SSH_CONNECTION:-}" ]; then echo "${SSH_CONNECTION%% *}"; return; fi
    local w; w="$(who -m 2>/dev/null || true)"
    [ -n "$w" ] || return 0
    case "$w" in
        *"("*")"*) echo "$w" | sed -n 's/.*(\([^)]*\)).*/\1/p' ;;
        *) echo local ;;
    esac
}

# ¿La sesión actual entra por una vía que va a quedar permitida?
sesion_actual_segura() {
    local ip; ip="$(ip_cliente)"
    case "$ip" in
        local) return 0 ;;
        "") error "no se pudo determinar desde dónde estás conectado (¿sin terminal?)"; return 1 ;;
        127.*|::1) return 0 ;;
        fd7a:115c:a1e0:*) info "sesión actual desde Tailscale (${ip})"; return 0 ;;
    esac
    if ip_en_cidr4 "$ip" 100.64.0.0/10; then info "sesión actual desde Tailscale (${ip})"; return 0; fi
    if [ -n "$LAN_CIDR" ] && ip_en_cidr4 "$ip" "$LAN_CIDR"; then info "sesión actual desde la LAN permitida (${ip})"; return 0; fi
    error "tu sesión entra desde ${ip}, que no es Tailscale ni ${LAN_CIDR:-una LAN permitida}: con este firewall las sesiones NUEVAS desde ahí no entran"
    return 1
}

paso_firewall() {
    titulo "(d) Firewall: ufw (entrada) + DOCKER-USER (puertos publicados por Docker)"
    if ! ip link show "$TAILSCALE_IF" >/dev/null 2>&1; then
        if [ -z "$LAN_CIDR" ]; then
            error "no existe la interfaz ${TAILSCALE_IF} y no se pasó --lan-cidr: el SSH quedaría sólo por consola física. No se aplica."
            resultado firewall ERROR; return
        fi
        aviso "no existe la interfaz ${TAILSCALE_IF}: sólo queda la LAN (${LAN_CIDR})"
    fi
    if ! sesion_actual_segura; then
        if [ "$FORCE_FIREWALL" = 1 ]; then aviso "--force-firewall: se sigue igual"
        else error "Entrá por Tailscale (o pasá --lan-cidr con tu red) y repetí. Firewall sin cambios."; resultado firewall ERROR; return; fi
    fi
    local dinfo=""
    if tiene docker; then dinfo="$(docker info 2>/dev/null </dev/null || true)"; fi
    if [[ "$dinfo" == *"Firewall Backend: nftables"* ]]; then
        aviso "Docker usa el backend nftables: no hay cadena DOCKER-USER de iptables y estas reglas no lo filtran."
    fi
    apt_instalar ufw

    local c4 c6 rc=0 tmp4 tmp6 estado
    tmp4="$(mktemp)"; tmp6="$(mktemp)"
    con_bloque "$UFW_AFTER4" 4 > "$tmp4"
    con_bloque "$UFW_AFTER6" 6 > "$tmp6"
    escribir_archivo "$UFW_AFTER4" 0640 < "$tmp4" || rc=$?
    c4="$(cambio_de "$rc")"; rc=0
    escribir_archivo "$UFW_AFTER6" 0640 < "$tmp6" || rc=$?
    c6="$(cambio_de "$rc")"
    rm -f "$tmp4" "$tmp6"
    if [ "$c4" = error ] || [ "$c6" = error ]; then error "no se pudo escribir after.rules/after6.rules"; resultado firewall ERROR; return; fi
    if [ "$c4$c6" = 00 ]; then ok "reglas de DOCKER-USER ya presentes en after.rules/after6.rules"; fi

    # `ufw` saltea las reglas que ya existen, así que repetir es inocuo.
    run ufw default deny incoming
    run ufw default allow outgoing
    run ufw allow in on lo comment 'loopback'
    run ufw allow in on "$TAILSCALE_IF" comment 'admin por Tailscale'
    # WireGuard de Tailscale: sin esto igual conecta, pero por relay (más lento).
    run ufw allow 41641/udp comment 'tailscale directo'
    if [ -n "$LAN_CIDR" ]; then
        local p
        for p in $LAN_PORTS; do run ufw allow from "$LAN_CIDR" to any port "$p" proto tcp comment 'LAN'; done
    fi
    estado="$(ufw status 2>/dev/null || true)"
    if [ "$APPLY" = 1 ]; then
        if [[ "$estado" == *"Status: active"* ]]; then
            if ! ufw reload; then
                error "ufw reload falló: se restauran after.rules/after6.rules"
                if [ -f "${UFW_AFTER4}.bak-hardening-${STAMP}" ]; then cp -p "${UFW_AFTER4}.bak-hardening-${STAMP}" "$UFW_AFTER4"; fi
                if [ -f "${UFW_AFTER6}.bak-hardening-${STAMP}" ]; then cp -p "${UFW_AFTER6}.bak-hardening-${STAMP}" "$UFW_AFTER6"; fi
                ufw reload || true
                resultado firewall ERROR; return
            fi
        else
            ufw --force enable
        fi
        systemctl enable ufw >/dev/null 2>&1 || true
        ok "ufw activo:"; ufw status verbose | sed 's/^/      /'
        info "DOCKER-USER (IPv4):"
        iptables -S DOCKER-USER 2>/dev/null | sed 's/^/      /' || aviso "no se pudo leer DOCKER-USER"
        resultado firewall APLICADO
    else
        plan "ufw --force enable (o ufw reload si ya estaba activo)"
        if [ "$c4$c6" != 00 ] || [[ "$estado" != *"Status: active"* ]]; then resultado firewall PLAN; else resultado firewall OK; fi
    fi
}

# ── (e) Zona horaria ────────────────────────────────────────────────────────
paso_tz() {
    titulo "(e) Zona horaria"
    local actual
    actual="$(timedatectl show -p Timezone --value 2>/dev/null || cat /etc/timezone 2>/dev/null || echo '?')"
    if [ "$actual" = "$HOST_TZ" ]; then ok "ya está en ${HOST_TZ}"; resultado tz OK; return; fi
    info "actual: ${actual} → ${HOST_TZ} (sólo el host: logs, cron, journal; los contenedores siguen en UTC)"
    run timedatectl set-timezone "$HOST_TZ"
    if [ "$APPLY" = 1 ]; then resultado tz APLICADO; else resultado tz PLAN; fi
}

# ── (f) journald ────────────────────────────────────────────────────────────
paso_journald() {
    titulo "(f) journald: persistente y con tope"
    local cambio rc=0
    escribir_archivo "${ETC}/systemd/journald.conf.d/50-hardening.conf" 0644 <<EOF || rc=$?
# Gestionado por scripts/hardening/pi-host-hardening.sh — no editar a mano.
# Persistente: los logs del sistema (SSH, fail2ban, sudo) sobreviven a un reinicio,
# que es justo cuando más se necesitan para investigar. Con tope de tamaño y de
# antigüedad para no llenar el disco ni guardar más de lo necesario.
[Journal]
Storage=persistent
Compress=yes
SystemMaxUse=${JOURNAL_MAX_USE}
SystemKeepFree=2G
MaxRetentionSec=${JOURNAL_MAX_RETENTION}
EOF
    cambio="$(cambio_de "$rc")"
    if [ "$cambio" = error ]; then error "no se pudo escribir la config de journald"; resultado journald ERROR; return; fi
    if [ "$cambio" = 0 ]; then ok "ya configurado"; resultado journald OK; return; fi
    run mkdir -p /var/log/journal
    run systemctl restart systemd-journald
    if [ "$APPLY" = 1 ]; then resultado journald APLICADO; else resultado journald PLAN; fi
}

# ── (g) Avisos de Docker (no cambia nada) ───────────────────────────────────
paso_docker() {
    titulo "(g) Docker: avisos (no se cambia nada)"
    if ! tiene docker || ! docker info >/dev/null 2>&1 </dev/null; then aviso "docker no disponible para este usuario"; resultado docker OMITIDO; return; fi
    local hallazgos=0 linea grupos
    local -a ids=()
    mapfile -t ids < <(docker ps -q </dev/null)
    if [ ${#ids[@]} -eq 0 ]; then ok "no hay contenedores corriendo"; resultado docker OK; return; fi
    while IFS= read -r linea; do
        [ -n "$linea" ] || continue
        aviso "monta el socket de Docker (quien lo controla es root del host): ${linea}"; hallazgos=$((hallazgos + 1))
    done < <(docker inspect --format '{{.Name}} {{range .Mounts}}{{.Source}} {{end}}' "${ids[@]}" </dev/null | awk '/docker\.sock/{print $1}' | sed 's#^/##')
    while IFS= read -r linea; do
        [ -n "$linea" ] || continue
        aviso "contenedor privilegiado: ${linea}"; hallazgos=$((hallazgos + 1))
    done < <(docker inspect --format '{{.Name}} {{.HostConfig.Privileged}}' "${ids[@]}" </dev/null | awk '$2=="true"{print $1}' | sed 's#^/##')
    while IFS= read -r linea; do
        [ -n "$linea" ] || continue
        aviso "publica puertos en todas las interfaces (0.0.0.0/[::]): ${linea}"; hallazgos=$((hallazgos + 1))
    done < <(docker ps --format $'{{.Names}}\t{{.Ports}}' </dev/null | awk -F'\t' '$2 ~ /0\.0\.0\.0:|\[::\]:|:::/ {print $1" → "$2}')
    if [ "$hallazgos" = 0 ]; then ok "sin contenedores con el socket, privilegiados ni puertos en 0.0.0.0"
    else info "Con el paso 'firewall' aplicado esos puertos quedan cerrados a la LAN (DOCKER-USER), pero lo correcto es publicarlos en 127.0.0.1."; fi
    grupos=" $(id -nG "${SUDO_USER:-$(id -un)}" 2>/dev/null || true) "
    if [[ "$grupos" == *" docker "* ]]; then
        aviso "el usuario ${SUDO_USER:-$(id -un)} está en el grupo docker: equivale a root sin contraseña"
    fi
    if [ "$hallazgos" = 0 ]; then resultado docker OK; else resultado docker AVISOS; fi
}

# `if` y no `&&`: adentro de una función llamada desde una lista && bash ignora
# `set -e`, y acá queremos que un error no previsto corte.
for p in ssh fail2ban upgrades firewall tz journald docker; do
    if paso_activo "$p"; then "paso_$p"; fi
done

titulo "Resumen"
for linea in "${RESUMEN[@]}"; do info "$linea"; done
if [ "$APPLY" = 0 ]; then
    info ""
    info "Nada cambió (modo plan). Para aplicar: sudo $0 --apply  (o --apply --only <paso>)"
fi
info "Evidencia para auditoría: sudo ./scripts/hardening/verify-host.sh > evidencia-host-\$(date +%F).md"
[ "$FALLOS" -eq 0 ] || exit 1
