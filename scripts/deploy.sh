#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Deploy de AUTENZA en la Pi, con backup previo, verificación y vuelta atrás.
# Correr EN LA PI, desde cualquier lado (hace cd a la raíz del proyecto):
#
#   ./scripts/deploy.sh                    # despliega origin/main
#   ./scripts/deploy.sh v1.4.0             # despliega un tag
#   ./scripts/deploy.sh --ref <commit>     # o un commit puntual
#
# También por SSH, sin copiar nada: ssh <pi> 'cd <proyecto> && ./scripts/deploy.sh v1.4.0'
#
# Qué hace, en orden:
#   1. Pre-chequeos: árbol de git sin cambios en archivos versionados, .env,
#      docker/curl, un solo deploy a la vez (lock).
#   2. Registra el commit actual (al que se vuelve si algo falla).
#   3. Backup previo (base + archivos) con el servicio db-backup.
#   4. git fetch y resuelve el ref. Por defecto sólo acepta commits que ya están
#      en origin/main (o sea, que pasaron por PR y CI); --allow-unmerged para una
#      emergencia (queda registrado).
#   5. Checkout del ref y `docker compose up -d --build backend frontend`.
#   6. Espera el healthcheck del backend y hace un smoke local: /api/health y la
#      home a través del nginx del front.
#   7. Si 5 o 6 fallan: vuelve al commit anterior, reconstruye y verifica.
#   8. Deja una línea en scripts/deploys.log (fecha, de→a, operador, resultado).
#
# OJO con las migraciones: `migrate deploy` corre al arrancar el backend y NO se
# revierte con el rollback de código. Si la versión nueva migró la base de una
# forma que la anterior no tolera, el rollback deja el backend sin levantar: ahí
# se restaura el backup del paso 3 (scripts/restore.sh) — decisión manual.
#
# Opciones / variables:
#   --ref REF | REF        DEPLOY_REF             (default origin/main)
#   --skip-backup          DEPLOY_SKIP_BACKUP=1   (sólo si el backup se hizo aparte)
#   --allow-unmerged       DEPLOY_ALLOW_UNMERGED=1
#   --force                redeploy aunque ya esté en ese commit
#   DEPLOY_OPERATOR        quién despliega, para el log (default: el usuario)
#   DEPLOY_HEALTH_TIMEOUT  segundos de espera del healthcheck (default 300)
#   SMOKE_BASE_URL         dónde responde el front en la Pi (default http://127.0.0.1)
#   DEPLOY_LOG             archivo de registro (default scripts/deploys.log, ignorado por git)
#
# Nota: los comandos de docker van con </dev/null. `docker compose exec -T` (y
# otros) leen la entrada estándar; si este script llega por una tubería (ssh ...
# 'bash -s' < deploy.sh), se comerían el resto del script.
# ─────────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail

# Todo adentro de main(): bash termina de leer la función ANTES de ejecutarla.
# Como el deploy hace checkout de otra versión de ESTE archivo, sin esto bash
# podría seguir leyendo el archivo nuevo desde la mitad.
main() {
    local REF="${DEPLOY_REF:-origin/main}"
    local SKIP_BACKUP="${DEPLOY_SKIP_BACKUP:-0}"
    local ALLOW_UNMERGED="${DEPLOY_ALLOW_UNMERGED:-0}"
    local FORCE=0
    local OPERADOR="${DEPLOY_OPERATOR:-${SUDO_USER:-${USER:-$(id -un)}}}"
    local HEALTH_TIMEOUT="${DEPLOY_HEALTH_TIMEOUT:-300}"
    local SMOKE="${SMOKE_BASE_URL:-http://127.0.0.1}"

    while [ $# -gt 0 ]; do
        case "$1" in
            --ref) REF="${2:?--ref necesita un valor}"; shift ;;
            --skip-backup) SKIP_BACKUP=1 ;;
            --allow-unmerged) ALLOW_UNMERGED=1 ;;
            --force) FORCE=1 ;;
            -h|--help) sed -n '2,/^# ───.*$/p' "$0" | tail -n +2 | sed -e '$d' -e 's/^# \{0,1\}//'; return 0 ;;
            -*) echo "Opción desconocida: $1" >&2; return 2 ;;
            *) REF="$1" ;;
        esac
        shift
    done

    cd "$(dirname "$0")/.."
    local RAIZ; RAIZ="$(pwd)"
    local LOG="${DEPLOY_LOG:-$RAIZ/scripts/deploys.log}"
    local INICIO; INICIO="$(date +%s)"

    log()  { printf '[deploy %s] %s\n' "$(date +%H:%M:%S)" "$*"; }
    fallo() { printf '[deploy %s] ERROR: %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
    registrar() { # registrar RESULTADO DESDE HASTA DETALLE
        printf '%s | de=%s | a=%s | ref=%s | operador=%s | resultado=%s | %ss | %s\n' \
            "$(date -Iseconds)" "$2" "$3" "$REF" "$OPERADOR" "$1" "$(( $(date +%s) - INICIO ))" "$4" >> "$LOG" \
            || fallo "no se pudo escribir ${LOG}"
    }
    describir() { git log -1 --format='%h %s' "$1" 2>/dev/null | cut -c1-80; }

    # ── 1. Pre-chequeos ────────────────────────────────────────────────────
    [ -f docker-compose.yml ] || { fallo "no encuentro docker-compose.yml en ${RAIZ}"; return 1; }
    [ -f .env ] || { fallo "falta .env en ${RAIZ} (los secretos de producción)"; return 1; }
    local c; for c in git docker curl flock; do
        command -v "$c" >/dev/null 2>&1 || { fallo "falta el comando ${c}"; return 1; }
    done
    docker compose version >/dev/null 2>&1 </dev/null || { fallo "falta el plugin docker compose"; return 1; }

    # Un deploy a la vez: dos en paralelo se pisan el checkout y los contenedores.
    exec 9>"$RAIZ/scripts/.deploy.lock"
    flock -n 9 || { fallo "ya hay otro deploy corriendo"; return 1; }

    if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
        fallo "hay cambios sin commitear en archivos versionados (no se pisan):"
        git status --short --untracked-files=no >&2
        return 1
    fi

    local LIBRE_MB; LIBRE_MB="$(df -Pm . | awk 'NR==2{print $4}')"
    if [ "${LIBRE_MB:-0}" -lt 2048 ]; then log "AVISO: quedan ${LIBRE_MB} MB libres; el build de las imágenes puede fallar"; fi

    # ── 2. Commit actual ───────────────────────────────────────────────────
    local PREV; PREV="$(git rev-parse HEAD)"
    log "versión actual: $(describir "$PREV")"

    # ── 4 (antes que el backup: si el ref no existe, no hace falta backup) ──
    log "git fetch..."
    git fetch --prune --tags --quiet origin </dev/null
    local TARGET
    TARGET="$(git rev-parse --verify --quiet "${REF}^{commit}")" || { fallo "no existe el ref '${REF}'"; return 1; }
    log "versión a desplegar: $(describir "$TARGET") (${REF})"

    if ! git merge-base --is-ancestor "$TARGET" origin/main; then
        if [ "$ALLOW_UNMERGED" = 1 ]; then
            log "AVISO: ${REF} NO está en origin/main; se despliega igual por --allow-unmerged (queda en el log)"
        else
            fallo "${REF} no está en origin/main (no pasó por PR + CI). Para una emergencia: --allow-unmerged"
            return 1
        fi
    fi
    if [ "$TARGET" = "$PREV" ] && [ "$FORCE" = 0 ]; then
        log "ya está desplegado ${REF} ($(git rev-parse --short HEAD)); nada que hacer (--force para reconstruir igual)"
        return 0
    fi

    # ── 3. Backup previo ───────────────────────────────────────────────────
    local DETALLE_BACKUP="backup=omitido"
    if [ "$SKIP_BACKUP" = 1 ]; then
        log "AVISO: sin backup previo (--skip-backup)"
    else
        log "backup previo (base + archivos)..."
        local servicios; servicios="$(docker compose ps --status running --services </dev/null || true)"
        if ! printf '%s\n' "$servicios" | grep -qx db-backup; then
            fallo "el servicio db-backup no está corriendo: no se puede hacer el backup previo (o usá --skip-backup)"
            registrar ABORTADO "$(git rev-parse --short "$PREV")" "$(git rev-parse --short "$TARGET")" "sin backup previo"
            return 1
        fi
        if ! docker compose exec -T db-backup sh /usr/local/bin/backup.sh </dev/null; then
            fallo "el backup previo falló: no se despliega"
            registrar ABORTADO "$(git rev-parse --short "$PREV")" "$(git rev-parse --short "$TARGET")" "falló el backup previo"
            return 1
        fi
        DETALLE_BACKUP="backup=$(docker compose exec -T db-backup sh -c 'ls -1t /backups/concesionaria_* 2>/dev/null | head -1 | xargs -n1 basename' </dev/null 2>/dev/null | tr -d '\r' || echo '?')"
        log "backup OK (${DETALLE_BACKUP#backup=})"
    fi

    # ── 5 y 6. Desplegar y verificar ───────────────────────────────────────
    levantar() { # levantar COMMIT
        git -c advice.detachedHead=false checkout --quiet --detach "$1" </dev/null || return 1
        docker compose up -d --build backend frontend </dev/null || return 1
    }
    verificar() {
        local id estado t=0
        log "esperando el healthcheck del backend (hasta ${HEALTH_TIMEOUT}s; incluye migraciones)..."
        while [ "$t" -lt "$HEALTH_TIMEOUT" ]; do
            id="$(docker compose ps -q backend </dev/null)"
            estado="$(docker inspect -f '{{.State.Health.Status}}' "$id" </dev/null 2>/dev/null || echo desconocido)"
            [ "$estado" = healthy ] && break
            sleep 5; t=$((t + 5))
        done
        [ "$estado" = healthy ] || { fallo "el backend no quedó healthy (estado: ${estado})"; return 1; }
        log "backend healthy; smoke local por el nginx del front..."
        local cuerpo
        cuerpo="$(curl -fsS -m 10 --retry 5 --retry-delay 3 --retry-all-errors "${SMOKE}/api/health")" \
            || { fallo "${SMOKE}/api/health no respondió"; return 1; }
        [[ "$cuerpo" == *'"status"'* ]] || { fallo "/api/health respondió algo inesperado"; return 1; }
        # Se guarda y después se busca: con pipefail, `curl | grep -q` puede dar un
        # falso negativo (grep cierra la tubería antes de que curl termine) y eso
        # dispararía un rollback sin motivo.
        local home
        home="$(curl -fsS -m 10 --retry 3 --retry-delay 2 --retry-all-errors "${SMOKE}/")" \
            || { fallo "la home no respondió"; return 1; }
        [[ "$home" == *'id="root"'* ]] || { fallo "la home no devolvió la SPA"; return 1; }
        log "smoke OK"
    }

    # Ctrl-C / corte a mitad del deploy: se intenta volver a la versión anterior.
    local EN_CURSO=1
    trap 'if [ "${EN_CURSO:-0}" = 1 ]; then fallo "deploy interrumpido: volviendo a la versión anterior"; levantar "$PREV" || true; registrar INTERRUMPIDO "$(git rev-parse --short "$PREV")" "$(git rev-parse --short "$TARGET")" "$DETALLE_BACKUP"; fi' INT TERM

    log "desplegando..."
    if levantar "$TARGET" && verificar; then
        EN_CURSO=0
        registrar OK "$(git rev-parse --short "$PREV")" "$(git rev-parse --short "$TARGET")" "$DETALLE_BACKUP"
        log "OK: corriendo $(describir "$TARGET")"
        log "evidencia: ${LOG}"
        return 0
    fi

    # ── 7. Rollback ────────────────────────────────────────────────────────
    fallo "el deploy falló; volviendo a $(describir "$PREV")"
    docker compose logs --no-color --tail 40 backend </dev/null >&2 || true
    if levantar "$PREV" && verificar; then
        EN_CURSO=0
        registrar ROLLBACK_OK "$(git rev-parse --short "$PREV")" "$(git rev-parse --short "$TARGET")" "$DETALLE_BACKUP"
        fallo "se volvió a la versión anterior y quedó sana. Revisá los logs de arriba antes de reintentar."
        return 1
    fi
    EN_CURSO=0
    registrar ROLLBACK_FALLIDO "$(git rev-parse --short "$PREV")" "$(git rev-parse --short "$TARGET")" "$DETALLE_BACKUP"
    fallo "el ROLLBACK también falló: la app puede estar caída."
    fallo "Si la versión nueva migró la base, restaurar el backup previo (${DETALLE_BACKUP#backup=}) con scripts/restore.sh."
    return 1
}

main "$@"; exit $?
