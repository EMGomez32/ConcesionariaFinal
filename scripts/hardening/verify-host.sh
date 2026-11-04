#!/usr/bin/env bash
# Las comillas invertidas de los printf son Markdown (código), no sustitución de comandos.
# shellcheck disable=SC2016
# ─────────────────────────────────────────────────────────────────────────────
# Evidencia del estado de seguridad del host, para auditoría (SOC 2 CC6/CC7,
# ISO 27001 A.8.8/A.8.9/A.8.20/A.8.16). SÓLO LECTURA: no cambia nada, no
# arranca ni para servicios y no lee secretos (ni el .env, ni llaves privadas,
# ni las llaves públicas completas: de authorized_keys sólo las huellas).
#
# Imprime un informe en Markdown con fecha. Uso típico, en la Pi:
#   sudo ./scripts/hardening/verify-host.sh > evidencia-host-$(date +%F).md
#
# El informe tiene datos internos (usuarios, puertos, nombres de contenedores):
# guardalo fuera del repo (es público). evidencia-host-*.md ya está en .gitignore.
#
# Sin root igual corre, pero varias secciones salen incompletas (se avisa).
# Variables opcionales:
#   COMPOSE_PROJECT   proyecto de compose de AUTENZA (default: concesionaria),
#                     para encontrar el volumen <proyecto>_backups
#   BACKUP_VOL        nombre del volumen de backups (pisa al anterior)
#   TAILSCALE_IF      interfaz de Tailscale (default tailscale0)
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
# Sin `set -e` a propósito: es un relevamiento; si una sección falla, se anota y se sigue.

PROJECT="${COMPOSE_PROJECT:-concesionaria}"
BACKUP_VOL="${BACKUP_VOL:-${PROJECT}_backups}"
TAILSCALE_IF="${TAILSCALE_IF:-tailscale0}"
HERE="$(cd "$(dirname "$0")" && pwd)"

tiene() { command -v "$1" >/dev/null 2>&1; }
ES_ROOT=0; [ "$(id -u)" -eq 0 ] && ES_ROOT=1
seccion() { printf '\n## %s\n\n' "$1"; }
bloque() { local t; t="$(cat)"; printf '```\n%s\n```\n' "${t:-(sin salida)}"; }
# svc ACCION UNIDAD: estado de un servicio de systemd ("?" si no se puede saber).
svc() { local s; s="$(systemctl "$1" "$2" 2>/dev/null | head -1)"; echo "${s:-?}"; }
nota() { printf '> %s\n\n' "$*"; }
estado() { printf -- '- **%s**: %s\n' "$1" "$2"; }

printf '# Evidencia de seguridad del host\n\n'
estado "Fecha" "$(date '+%Y-%m-%d %H:%M:%S %Z (%z)')"
estado "Host" "$(hostname 2>/dev/null || echo '?')"
# shellcheck source=/dev/null
estado "Sistema" "$( [ -r /etc/os-release ] && . /etc/os-release && echo "${PRETTY_NAME:-?}") · kernel $(uname -r)"
estado "Encendido desde" "$(uptime -s 2>/dev/null || echo '?')"
estado "Relevado por" "${SUDO_USER:-$(id -un)} ($( [ "$ES_ROOT" = 1 ] && echo 'con root' || echo 'SIN root: secciones incompletas'))"
estado "Script" "scripts/hardening/verify-host.sh @ $(git -C "$HERE" rev-parse --short HEAD 2>/dev/null || echo '?')"

# ── SSH ─────────────────────────────────────────────────────────────────────
seccion "SSH (configuración efectiva)"
if tiene sshd && [ "$ES_ROOT" = 1 ]; then
    sshd -T 2>/dev/null | grep -Ei '^(port|listenaddress|permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|authenticationmethods|maxauthtries|allowusers|allowgroups|denyusers|x11forwarding|permitemptypasswords|logingracetime|clientaliveinterval) ' | sort | bloque
    DROPINS=""
    for f in /etc/ssh/sshd_config.d/*.conf; do [ -e "$f" ] && DROPINS="${DROPINS}${f##*/} "; done
    [ -n "$DROPINS" ] && printf 'Drop-ins: %s\n\n' "$DROPINS"
else
    nota "sshd -T necesita root (lee las llaves del host)."
fi

seccion "Llaves autorizadas (sólo huellas)"
nota "Se listan huellas SHA256 y el comentario de cada llave; nunca la llave completa."
while IFS=: read -r usuario _ uid _ _ home _; do
    { [ "$uid" -ge 1000 ] && [ "$uid" -lt 60000 ]; } || [ "$usuario" = root ] || continue
    for f in "$home/.ssh/authorized_keys" "$home/.ssh/authorized_keys2"; do
        [ -e "$f" ] || continue
        if [ ! -r "$f" ]; then printf -- '- %s: `%s` (sin permiso de lectura)\n' "$usuario" "$f"; continue; fi
        printf -- '- **%s** (`%s`, permisos %s):\n' "$usuario" "$f" "$(stat -c '%a %U' "$f" 2>/dev/null)"
        ssh-keygen -l -f "$f" 2>/dev/null | sed 's/^/  - /' || printf '  - (no se pudo leer)\n'
    done
done < <(getent passwd)
printf '\n'
estado "Grupo sudo" "$(getent group sudo | cut -d: -f4)"
estado "Grupo docker (equivale a root)" "$(getent group docker | cut -d: -f4)"

# ── Firewall ────────────────────────────────────────────────────────────────
seccion "Firewall"
if tiene ufw && [ "$ES_ROOT" = 1 ]; then
    ufw status verbose 2>&1 | bloque
else
    nota "ufw no instalado o sin root."
fi
printf '### Cadena DOCKER-USER (filtra los puertos que publica Docker)\n\n'
if tiene iptables && [ "$ES_ROOT" = 1 ]; then
    { echo "# IPv4"; iptables -S DOCKER-USER 2>&1; echo "# IPv6"; ip6tables -S DOCKER-USER 2>&1; } | bloque
    if iptables -S DOCKER-USER 2>/dev/null | grep -q -- '--ctstate NEW -j DROP'; then
        estado "Puertos de Docker cerrados a la LAN" "sí"
    else
        estado "Puertos de Docker cerrados a la LAN" "**NO** (los puertos publicados en 0.0.0.0 llegan desde la LAN)"
    fi
else
    nota "iptables no disponible o sin root."
fi

seccion "Sockets escuchando en todas las interfaces"
nota "0.0.0.0 / [::] / *: accesibles desde la LAN y Tailscale salvo que el firewall los filtre."
if tiene ss; then
    ss -Hltunp 2>/dev/null | awk '$5 ~ /^(0\.0\.0\.0|\[::\]|\*):/ {print $1, $5, $7}' | sort -u | bloque
else
    nota "ss no disponible."
fi

# ── fail2ban ────────────────────────────────────────────────────────────────
seccion "fail2ban"
if tiene fail2ban-client && [ "$ES_ROOT" = 1 ]; then
    estado "Servicio" "$(svc is-active fail2ban) / $(svc is-enabled fail2ban)"
    # Sólo contadores: la lista de IPs baneadas no hace falta para la evidencia.
    fail2ban-client status sshd 2>&1 | grep -Ev 'Banned IP list|File list|Journal matches' | bloque
else
    estado "fail2ban" "no instalado o sin root"
fi

# ── Actualizaciones ─────────────────────────────────────────────────────────
seccion "Actualizaciones"
estado "unattended-upgrades" "$(dpkg -s unattended-upgrades >/dev/null 2>&1 && echo instalado || echo 'NO instalado') · servicio $(svc is-enabled unattended-upgrades)"
if tiene apt-config; then
    apt-config dump 2>/dev/null | grep -E '^APT::Periodic::(Update-Package-Lists|Unattended-Upgrade) |^Unattended-Upgrade::(Origins-Pattern|Automatic-Reboot)' | bloque
fi
if [ -r /var/log/unattended-upgrades/unattended-upgrades.log ]; then
    estado "Última corrida" "$(grep -E '^[0-9]{4}-' /var/log/unattended-upgrades/unattended-upgrades.log | tail -1 | cut -c1-19)"
fi
if tiene apt; then
    PEND="$(apt list --upgradable 2>/dev/null | tail -n +2)"
    estado "Paquetes con actualización pendiente" "$(printf '%s' "$PEND" | grep -c . ) (de seguridad: $(printf '%s' "$PEND" | grep -c -- '-security'))"
    for STAMP_APT in /var/lib/apt/periodic/update-success-stamp /var/lib/apt/lists; do
        [ -e "$STAMP_APT" ] || continue
        estado "Última actualización de índices" "$(stat -c '%y' "$STAMP_APT" | cut -d. -f1)"; break
    done
fi
estado "Reinicio pendiente" "$( [ -f /var/run/reboot-required ] && echo "**sí** ($(tr '\n' ' ' < /var/run/reboot-required.pkgs 2>/dev/null))" || echo no)"

# ── Contenedores ────────────────────────────────────────────────────────────
seccion "Contenedores"
if tiene docker && docker info >/dev/null 2>&1 </dev/null; then
    estado "Docker" "$(docker version --format '{{.Server.Version}}' 2>/dev/null </dev/null)"
    DWARN="$(docker info 2>&1 </dev/null | grep -i '^WARNING' || true)"
    if [ -n "$DWARN" ]; then printf 'Avisos de `docker info` (p. ej. sin cgroup de memoria = mem_limit ignorado):\n\n'; printf '%s\n' "$DWARN" | bloque; fi
    printf '| Contenedor | Imagen | Usuario | no-new-privileges | Privilegiado | docker.sock | Memoria máx. | Puertos en 0.0.0.0/[::] |\n'
    printf '|---|---|---|---|---|---|---|---|\n'
    mapfile -t IDS < <(docker ps -q </dev/null)
    if [ ${#IDS[@]} -gt 0 ]; then
        docker inspect --format '{{.Name}}|{{.Config.Image}}|{{if .Config.User}}{{.Config.User}}{{else}}root{{end}}|{{range .HostConfig.SecurityOpt}}{{.}} {{end}}|{{.HostConfig.Privileged}}|{{range .Mounts}}{{.Source}} {{end}}|{{.HostConfig.Memory}}|{{range $p, $b := .NetworkSettings.Ports}}{{range $b}}{{.HostIp}}:{{.HostPort}} {{end}}{{end}}' "${IDS[@]}" </dev/null \
        | while IFS='|' read -r nombre imagen usuario secopt priv montajes mem puertos; do
            nnp="no"; [[ "$secopt" == *no-new-privileges* ]] && nnp="sí"
            sock="no"; [[ "$montajes" == *docker.sock* ]] && sock="**sí**"
            pub="$(echo "$puertos" | tr ' ' '\n' | grep -E '^(0\.0\.0\.0|::|):' | tr '\n' ' ')"
            memh="sin límite"; [ "${mem:-0}" -gt 0 ] 2>/dev/null && memh="$((mem / 1048576)) MiB"
            printf '| %s | %s | %s | %s | %s | %s | %s | %s |\n' "${nombre#/}" "$imagen" "$usuario" "$nnp" "$priv" "$sock" "$memh" "${pub:-—}"
        done
    fi
    printf '\n'
else
    nota "docker no disponible para este usuario."
fi

# ── Disco y backups ─────────────────────────────────────────────────────────
seccion "Cifrado de disco"
lsblk -o NAME,FSTYPE,SIZE,MOUNTPOINTS 2>/dev/null | bloque
if lsblk -o FSTYPE 2>/dev/null | grep -q crypto_LUKS; then estado "LUKS" "sí, hay volúmenes cifrados"
else estado "LUKS" "**no** hay volúmenes cifrados (compensar con backups cifrados con age)"; fi

seccion "Backups"
if tiene docker && docker volume inspect "$BACKUP_VOL" >/dev/null 2>&1 </dev/null; then
    MP="$(docker volume inspect -f '{{.Mountpoint}}' "$BACKUP_VOL" </dev/null)"
    if [ -r "$MP/.last_success" ]; then
        ULT="$(cat "$MP/.last_success")"
        estado "Último backup completo" "$(date -d "@$ULT" '+%Y-%m-%d %H:%M %Z') (hace $(( ($(date +%s) - ULT) / 3600 )) h)"
    else
        estado "Último backup completo" "sin marca .last_success en ${BACKUP_VOL} (o sin root)"
    fi
    if [ -r "$MP" ]; then
        contar() { find "$MP" -maxdepth 1 -type f -name "$1" 2>/dev/null | wc -l; }
        estado "Archivos de backup" "$(contar 'concesionaria_*') de base, $(contar 'files_*') de archivos; cifrados (.age): $(contar '*.age')"
    fi
    BK="$(docker ps --filter "label=com.docker.compose.project=${PROJECT}" --filter "label=com.docker.compose.service=db-backup" -q </dev/null | head -1)"
    [ -n "$BK" ] && estado "Healthcheck de db-backup" "$(docker inspect -f '{{.State.Health.Status}}' "$BK" </dev/null 2>/dev/null)"
else
    estado "Volumen ${BACKUP_VOL}" "no encontrado (definí COMPOSE_PROJECT o BACKUP_VOL)"
fi
REPO="$(cd "$HERE/../.." && pwd)"
if [ -r "$REPO/scripts/restore-drill.log" ]; then
    estado "Último simulacro de restore" "$(tail -1 "$REPO/scripts/restore-drill.log" | cut -d' ' -f1-2)"
else
    estado "Último simulacro de restore" "sin registro (scripts/restore-drill.log)"
fi
if [ -r "$REPO/scripts/deploys.log" ]; then
    printf '\nÚltimos deploys (scripts/deploys.log):\n\n'
    tail -5 "$REPO/scripts/deploys.log" | bloque
fi

# ── Acceso remoto, hora y logs ──────────────────────────────────────────────
seccion "Tailscale"
if tiene tailscale; then
    TSJ="$(tailscale status --self --peers=false --json 2>/dev/null || true)"
    if [ -n "$TSJ" ] && tiene python3; then
        # Sólo el nodo propio: los pares de la tailnet no hacen falta para la evidencia.
        printf '%s' "$TSJ" | python3 -c '
import json, sys, datetime
d = json.load(sys.stdin); s = d.get("Self") or {}
exp = s.get("KeyExpiry")
print("- **Estado**:", d.get("BackendState", "?"), "· online:", s.get("Online"))
if exp:
    t = datetime.datetime.fromisoformat(exp.replace("Z", "+00:00"))
    dias = (t - datetime.datetime.now(datetime.timezone.utc)).days
    print("- **Vencimiento de la clave del nodo**: %s (en %d días)%s" % (exp, dias, " **— renovar o desactivar el vencimiento**" if dias < 30 else ""))
else:
    print("- **Vencimiento de la clave del nodo**: desactivado (no vence)")
'
    else
        estado "Tailscale" "instalado; sin python3 o sin respuesta de tailscale status"
    fi
    estado "Interfaz ${TAILSCALE_IF}" "$(ip -br addr show "$TAILSCALE_IF" 2>/dev/null | awk '{print $2}' || echo 'no existe')"
else
    estado "Tailscale" "no instalado"
fi

seccion "Hora"
if tiene timedatectl; then
    timedatectl show -p Timezone -p NTP -p NTPSynchronized 2>/dev/null | bloque
fi
estado "Servicio NTP" "systemd-timesyncd $(svc is-active systemd-timesyncd) · chrony $(svc is-active chrony)"

seccion "Logs del sistema (journald)"
estado "Almacenamiento" "$( [ -d /var/log/journal ] && echo persistente || echo 'volátil (se pierde al reiniciar)')"
estado "Uso" "$(journalctl --disk-usage 2>/dev/null | sed -e 's/.*take up //' -e 's/ in the file system.*//')"
if ls /etc/systemd/journald.conf.d/*.conf >/dev/null 2>&1; then
    grep -hE '^(Storage|SystemMaxUse|MaxRetentionSec)=' /etc/systemd/journald.conf.d/*.conf | bloque
fi

printf '\n---\nGenerado por scripts/hardening/verify-host.sh (sólo lectura).\n'
