# Runbook: incidentes

Pasos operativos para los cuatro casos más probables. La clasificación, los
roles, la comunicación y el manejo de brechas de datos personales están en la
[política de gestión de incidentes](../seguridad/gestion-de-incidentes.md).

**Siempre, primero:** abrí el registro del incidente (plantilla en la política)
con la hora de detección. Anotá cada acción con hora mientras la hacés.

Marcadores: `<host-de-produccion>`, `<usuario-operador>`, `<directorio-del-proyecto>`,
`<dominio-de-produccion>`.

## A. Caída del servicio

1. **Confirmá desde afuera:** `curl -s https://<dominio-de-produccion>/api/health`
   y el monitor externo (`.github/workflows/uptime.yml`). Mirá el estado público
   de Cloudflare.
2. **Entrá al host** por la red de administración. Si no podés, andá a la sección D.
3. **Diagnóstico rápido:**
   ```bash
   cd <directorio-del-proyecto>
   docker compose ps                      # ¿qué servicio no está healthy?
   docker compose logs --tail=200 backend
   df -h; free -m                         # disco y memoria
   systemctl status cloudflared           # el túnel
   ```
4. **Causas típicas y acción:**
   - Backend en *crash-loop* tras un deploy → rollback ([runbook de deploy](runbook-deploy.md), sección 5).
   - Variable faltante (el log de arranque lo dice) → corregí el `.env` de la raíz y `docker compose up -d backend`.
   - Disco lleno → liberá espacio (imágenes viejas: `docker image prune`); nunca borres volúmenes ni backups.
   - Base caída → `docker compose logs db`; si hay corrupción, [runbook de restauración](runbook-restauracion.md).
   - Túnel caído → `sudo systemctl restart cloudflared` y revisá el panel de Cloudflare.
5. **Si la caída supera 30 minutos en horario comercial**, avisá a las
   concesionarias por el canal acordado (plantilla en la política).
6. **Cierre:** smoke completo, nota de qué pasó y post-mortem si fue SEV1 o SEV2.

## B. Sospecha de intrusión

Señales: alerta de `security_events` (`SECURITY_ALERT_WEBHOOK_URL`), logins
raros en `audit_log`, procesos o contenedores desconocidos, cambios no
explicados en archivos, cuentas o llaves.

1. **No borres nada.** Primero preservá evidencia, con hora:
   ```bash
   mkdir -p ~/evidencia-$(date +%Y%m%d_%H%M%S) && cd $_
   docker compose -f <directorio-del-proyecto>/docker-compose.yml ps -a > ps.txt
   docker compose -f <directorio-del-proyecto>/docker-compose.yml logs --since 72h > logs.txt 2>&1
   sudo journalctl --since "-72h" > journal.txt
   last -F > last.txt; ss -tunap > sockets.txt; ps auxf > procesos.txt
   ```
   Exportá también `audit_log` y `security_events` del período (consulta de
   solo lectura) y calculá un hash de cada archivo (`sha256sum * > hashes.txt`).
   Copiá la carpeta al archivo privado de evidencias.
2. **Contené** según el alcance:
   - Cuenta de la app comprometida → desactivala
     (`docker compose exec -T -e USER_EMAIL=<email> -e USER_DEACTIVATE=true backend node dist-ops/scripts/set-password.js </dev/null`)
     y cerrá sus sesiones.
   - Todas las sesiones en duda → rotá `JWT_SECRET` y `JWT_REFRESH_SECRET`
     con `scripts/rotate-secrets.sh` (todos vuelven a loguearse).
   - Host comprometido → cortá la exposición pública (`sudo systemctl stop cloudflared`),
     dejá el host encendido para la evidencia y planificá reconstruir en limpio
     ([runbook de restauración](runbook-restauracion.md), sección 4).
3. **Rotá** todo secreto que el atacante pudo leer (sección C).
4. **Evaluá si hubo datos personales afectados.** Si sí, seguí la sección de
   brechas de la política: el aviso a la concesionaria tiene plazo.
5. **Erradicá y recuperá:** reconstrucción o parche, smoke, monitoreo reforzado
   una semana.

## C. Filtración de un secreto

Un secreto que estuvo en un chat (incluido un asistente de IA), en un commit, en
un log, en una captura o en una carpeta sincronizada **está comprometido**,
aunque se haya borrado. Rotalo en origen; borrar el rastro no alcanza.

| Secreto | Cómo se rota | Efecto |
|---|---|---|
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | `scripts/rotate-secrets.sh` en el host (respalda, rota, verifica y revierte si falla). | Todas las sesiones caen. |
| `POSTGRES_PASSWORD` | `ALTER USER` en la base, actualizar `.env` y `docker compose up -d` de `backend` y `db-backup`. Probar primero el comando en una base descartable. | Corte breve. |
| `APP_DB_PASSWORD` / `APP_DATABASE_URL` | Cambiar las dos con el mismo valor en el `.env` y `docker compose up -d backend` (`setup-app-role` actualiza el rol al arrancar). | Corte breve. |
| `INTEGRACIONES_SECRET_KEY` | Rotar la clave con el procedimiento de [criptografía y secretos](../seguridad/criptografia-y-secretos.md#rotación-de-integraciones_secret_key) (clave nueva, la vieja a `INTEGRACIONES_SECRET_KEYS_ANTERIORES`, deploy, `npm run recifrar-secretos -- --apply`, sacar la vieja). Si se filtró la clave, quien además tenga un dump o un backup puede descifrar lo que protege: rotar también en origen los tokens de Meta y Mercado Libre y las contraseñas IMAP, y pedir a los usuarios con 2FA que lo vuelvan a configurar. | Sin corte por la rotación en sí; si se filtró, integraciones y 2FA a reconfigurar. |
| SMTP (`SMTP_PASS`) | Revocar la clave en el panel del proveedor, crear otra, actualizar `.env`, `docker compose up -d backend`. Revisar el historial de envíos del proveedor. | Ninguno visible. |
| `ML_CLIENT_SECRET` | Regenerarlo en el panel de developers de Mercado Libre, actualizar `.env`, recrear el backend. | Puede pedir revincular cuentas. |
| Credenciales del offsite (R2) | Revocar el token en Cloudflare, crear otro con permisos mínimos sobre el bucket, actualizar `.env`, `docker compose up -d db-backup`. | Ninguno. |
| Clave privada de `age` | Generar un par nuevo, poner la pública nueva en `BACKUP_AGE_RECIPIENT`; conservar la vieja solo hasta que venzan los backups cifrados con ella y después destruirla. Si la vieja se filtró, tratar los backups existentes como expuestos. | Ninguno. |
| `SECURITY_ALERT_WEBHOOK_URL`, `BACKUP_ALERT_CMD` | Regenerar el destino en el servicio de alertas y actualizar `.env`. | Ninguno. |
| Llave SSH | Borrar su línea de `~/.ssh/authorized_keys` del host; generar otra en el equipo legítimo. | Ninguno. |
| Cuenta SaaS (GitHub, Cloudflare, Tailscale, gestor de contraseñas…) | Cambiar contraseña, regenerar 2FA y códigos de recuperación, revocar sesiones y tokens. | Ninguno. |

Después de rotar: actualizá la copia del `.env` en el gestor de contraseñas,
borrá los `.env.bak.*` y anotá en el registro qué se rotó y cuándo.

## D. Pérdida de acceso administrativo (SSH o red de administración)

El sitio puede seguir sirviendo por Cloudflare aunque vos no puedas entrar.
Sin acceso no hay deploy ni restauración: tratalo como SEV2.

1. **Descartá lo simple:** tu equipo está en la red de administración, el
   cliente de la red está logueado, la llave SSH es la correcta.
2. **Llave de nodo vencida o nodo desautorizado:** se reautentica desde el propio
   host (consola física o teclado y pantalla). Al reautenticar, repetí todos los
   flags no default que tenía el nodo: si no, se pierden. Después, en la consola
   de administración de la red, desactivá el vencimiento de la llave del nodo
   servidor o agendá su renovación con aviso.
3. **SSH rechaza la llave:** entrá por consola física y revisá `authorized_keys`
   y la configuración de `sshd` (`sudo sshd -t`). No habilites el login por
   contraseña para salir del paso.
4. **Sin acceso físico:** si el servicio funciona, esperá a tenerlo y no toques
   nada por otra vía. Si el servicio está caído y no hay acceso posible,
   evaluá reconstruir en otro host ([runbook de restauración](runbook-restauracion.md)).
5. **Prevención:** la [revisión trimestral de accesos](../seguridad/control-de-acceso.md)
   incluye la fecha de vencimiento de las llaves de nodo y un segundo camino de
   acceso probado.
