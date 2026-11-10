# Runbook: deploy a producción

Producción corre con `docker compose` en un único host, detrás de Cloudflare
Tunnel. El código llega **por git**. WinSCP, `prisma db push` y las guías
`ETAPA1/2-DEPLOY.md` quedaron obsoletos (el texto final de `scripts/verify.sh`
todavía nombra WinSCP: ignoralo).

Marcadores: `<host-de-produccion>`, `<usuario-operador>`, `<directorio-del-proyecto>`,
`<dominio-de-produccion>`, `<usuario-db>` y `<base>`. Los valores reales están en
el gestor de contraseñas del operador, no en este repo.

Política que lo enmarca: [gestión de cambios](../seguridad/gestion-de-cambios.md).

## 1. Antes de empezar

- [ ] El cambio entró a `main` por PR con todos los checks en verde.
- [ ] Hay un tag anotado en ese commit (`git tag -a vX.Y.Z -m "<resumen>"` y `git push origin vX.Y.Z`).
- [ ] Leíste el diff desde el tag anterior (`git log --oneline <tag-anterior>..vX.Y.Z`) y respondiste:

| Pregunta | Si la respuesta es sí |
|---|---|
| ¿Hay migraciones nuevas en `BackConcesionaria/prisma/migrations/`? | Revisá que sean aditivas. Si borran o cambian tipos, planificá ventana y backup verificado. |
| ¿Hay variables de entorno nuevas? | Agregá el valor al `.env` de la **raíz** del proyecto en el host **antes** del deploy. |
| ¿Hay volúmenes nuevos? | Confirmá que el `Dockerfile` crea el directorio con dueño `node` (ver gotcha 6). |
| ¿Se agregó un valor al enum de roles? | Prepará el alta de la fila en `roles` (gotcha 8). |
| ¿Hay tablas nuevas con datos de un tenant? | Confirmá que están en `TENANT_TABLES` de `prisma/init-rls.ts`. |
| ¿Cambia `nginx.conf`, la imagen de backup o el compose? | Hacé rebuild de todos los servicios, no solo de backend y frontend. |

## 2. Deploy estándar

```bash
ssh <usuario-operador>@<host-de-produccion>     # por la red de administración, con llave
cd <directorio-del-proyecto>
scripts/deploy.sh                                # ver la cabecera del script para los parámetros vigentes
```

`scripts/deploy.sh` hace un backup previo de la base, actualiza el código, hace
rebuild, corre el smoke y vuelve a la versión anterior si algo falla. Cada
corrida queda en el log de deploys. Si termina con error, no improvises:
seguí la sección 5 (rollback) y abrí un incidente si hay impacto.

## 3. Verificación (smoke)

El script corre su smoke. Además, desde tu equipo:

```bash
D=https://<dominio-de-produccion>
curl -s -o /dev/null -w "%{http_code}\n" $D/                        # 200
curl -s $D/api/health                                              # 200, status UP
curl -s -o /dev/null -w "%{http_code}\n" $D/api/ventas             # 401 (sin token)
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H 'Content-Type: application/json' -d '{}' $D/api/auth/login   # 400
curl -s -o /dev/null -w "%{http_code}\n" -X POST $D/api/auth/refresh   # 401 (sin cookie)
```

En el host: `docker compose ps` (backend y `db-backup` en `healthy`) y
`docker compose logs --tail=100 backend` (sin errores de `migrate deploy`,
`init-rls`, `setup-app-role` ni de los workers).

Por último, entrá a la web con tu cuenta (con 2FA), recargá la página y
confirmá que la sesión sigue. Si el cambio toca un flujo de negocio, probalo
en el tenant de demostración, nunca en el de un cliente.

## 4. Procedimiento manual

Solo si `scripts/deploy.sh` no está disponible o falla por una causa ajena al
cambio. Es un cambio de emergencia: aplica el procedimiento *break-glass* de
[gestión de cambios](../seguridad/gestion-de-cambios.md).

```bash
cd <directorio-del-proyecto>
TS=$(date +%Y%m%d_%H%M%S)

# 1. Backup previo, verificado
docker compose exec -T db pg_dump -U <usuario-db> -Fc <base> > ~/pre-deploy-$TS.dump </dev/null
docker compose exec -T db pg_restore --list < ~/pre-deploy-$TS.dump | head   # debe listar objetos

# 2. Código: el tag, nunca una rama suelta
git fetch --tags origin
git checkout --detach vX.Y.Z           # el .env está ignorado por git: no se toca

# 3. Rebuild y arranque (migrate deploy + init-rls + setup-app-role corren solos)
docker compose up -d --build backend frontend </dev/null

# 4. Esperar healthy y revisar logs
docker compose ps
docker compose logs --tail=100 backend
```

Después corré el smoke de la sección 3 y anotá a mano en el log de deploys:
fecha, versión, operador, resultado y motivo del camino manual.

## 5. Rollback

1. **Sin migraciones nuevas:** `git checkout --detach <tag-anterior>` y
   `docker compose up -d --build backend frontend </dev/null`. Smoke.
2. **Con migraciones aditivas** (columnas o tablas nuevas que el código viejo
   ignora): mismo paso 1; la base queda adelantada y no molesta.
3. **Con migraciones que el código viejo no tolera:** preferí arreglar hacia
   adelante (*fix-forward*). Restaurar el dump previo pierde lo que se escribió
   desde el deploy: es una decisión de incidente
   ([runbook de restauración](runbook-restauracion.md)).

Todo rollback se registra en el log de deploys y, si hubo impacto, como incidente.

## 6. Gotchas reales

1. **El contenedor solo ve las variables listadas** en el bloque `environment:`
   de `docker-compose.yml`, con valores del `.env` de la raíz.
   `BackConcesionaria/.env` no llega al runtime y el síntoma es silencioso.
   Para comprobar que una variable llegó sin imprimirla:
   `docker compose exec -T backend sh -c 'test -n "$NOMBRE" && echo definida' </dev/null`.
2. **El entorno del contenedor no es el del servidor.** `docker compose exec backend env`
   muestra la conexión de superusuario; el servidor arranca con la de `app_rw`
   (`exec env DATABASE_URL=...`). Para confirmar el rol sin leer secretos:
   `docker compose exec -T db psql -U <usuario-db> -d <base> -c "select distinct usename from pg_stat_activity where datname = '<base>'" </dev/null`.
3. **`restart` no relee el `.env`.** Para tomar un valor nuevo usá `docker compose up -d <servicio>`.
4. **Rebuild del front recrea el backend** (dependencia del compose): contá con
   unos segundos sin API aunque el cambio sea solo de front.
5. **Scripts por SSH:** todo `docker compose exec` o `run` dentro de un script
   que llega por stdin lleva `-T` **y** `</dev/null`; si no, se come el resto
   del script y el log se corta sin error. Mandá los scripts legibles (archivo
   o stdin), no ofuscados. Desde PowerShell, las comillas de JSON en
   `curl -d` se rompen: usá `-d '{}'` o un archivo.
6. **Volúmenes nuevos:** Docker crea el punto de montaje como `root:root` si no
   existe en la imagen, y el backend corre como `node` (uid 1000). El
   `Dockerfile` debe crear el directorio y darle dueño `node` en el
   `mkdir -p ... && chown node:node ...` de la etapa final (el resto de `/app` es
   de root y de solo lectura para la app).
   Para un volumen ya creado: `docker run --rm -v <volumen>:/vol alpine chown -R 1000:1000 /vol`.
7. **Migraciones:** el arranque corre `prisma migrate deploy`. Nunca `db push`.
   Nunca `migrate diff --from-migrations` sin una shadow DB descartable: Prisma
   **resetea** la base apuntada. Si una migración queda `FAILED`:
   `docker compose run --rm -T backend npx prisma migrate resolve --rolled-back <nombre> </dev/null`,
   corregí y volvé a deployar.
8. **Enum de roles:** la migración agrega el valor pero no la fila en `roles`
   (el seed no corre en el arranque). Alta idempotente, revisada en el PR y
   registrada en el log de deploys:
   ```sql
   INSERT INTO roles (nombre, created_at, updated_at)
   SELECT '<rol>', now(), now()
   WHERE NOT EXISTS (SELECT 1 FROM roles WHERE nombre = '<rol>' AND deleted_at IS NULL);
   ```
9. **RLS:** las migraciones no crean policies. Toda tabla nueva con tenant va a
   `TENANT_TABLES` en `prisma/init-rls.ts`. Workers, webhooks y cron no tienen
   request: bajo `app_rw` ven cero filas sin error si no usan `withAuthBypass` o
   `withTenantTransaction`. Un camino probado solo como superusuario no está probado.
10. **2FA de super_admin y admin:** es obligatorio en producción para los dos
    roles (`MFA_REQUIRED_ROLES` vacía). Para exigírselo sólo al super_admin:
    `MFA_REQUIRED_ROLES=super_admin` y `docker compose up -d backend`. Si se pierde el
    segundo factor y no quedan códigos de recuperación:
    `docker compose exec -T backend node dist-ops/scripts/reset-2fa.js <email> </dev/null`
    (queda en `security_events`). Es un incidente: registralo.
11. **Prisma Studio** es acceso de superusuario sin autenticación. Solo con
    `docker compose --profile debug up -d prisma-studio`, por túnel SSH al
    puerto de loopback, y al terminar
    `docker compose --profile debug stop prisma-studio && docker compose --profile debug rm -f prisma-studio`.
12. **Seeds:** no corren en el arranque. `seed-ci` y `seed-demo` no se corren en
    producción. Después de inicializar un entorno, revisá que no queden cuentas
    residuales del seed.
13. **Cambios de datos en producción:** solo con un script o SQL versionado y
    revisado en un PR, con backup previo y registro. Nada de `UPDATE` a mano.
14. **El `.env` de la raíz** va con permisos `600`. Después de cambiarlo,
    actualizá la copia en el gestor de contraseñas y borrá los `.env.bak.*`
    que hayan quedado una vez verificado el cambio.
15. **`INTEGRACIONES_SECRET_KEY`** es obligatoria en producción: sin ella el
    backend no arranca. Si ya está en el `.env`, no se toca nunca: con otra clave
    los secretos ya cifrados (integraciones y 2FA) quedan ilegibles. Si falta, se
    genera en el host con `openssl rand -hex 32` y se guarda una copia en el gestor
    de contraseñas; los secretos que estaban en claro se siguen leyendo.
16. **La imagen del backend no trae ts-node ni typescript** (build multi-etapa).
    Los scripts de operación van compilados en `dist-ops/`:
    `docker compose exec -T backend node dist-ops/scripts/<script>.js ... </dev/null`.
    Los de `npm run` (`retencion`, `seed`, `seed-demo`, `init-rls`,
    `setup-app-role`) ya corren ese JS. Nunca `npx ts-node` dentro del
    contenedor: sin TTY, npx lo baja del registro de npm en vez de fallar.

## 7. Una sola vez: primer deploy del hardening (PR #114)

Antes:

- [ ] `INTEGRACIONES_SECRET_KEY` definida (gotcha 15). Para comprobarla sin
      imprimirla: `grep -c '^INTEGRACIONES_SECRET_KEY=.\+' .env` tiene que dar `1`.
- [ ] `CORS_ALLOWED_ORIGINS` con el dominio de producción y nada más (o sin
      definir: compose usa `APP_URL`).
- [ ] Los administradores saben que en su próximo login activan el 2FA (gotcha 10).
- [ ] (Opcional) `SECURITY_ALERT_WEBHOOK_URL` con una URL `https`.
- [ ] El primer deploy recrea `db` (la imagen pasó a ir por digest): unos segundos
      sin base. `scripts/deploy.sh` hace el backup antes.

Después:

1. Documentos de vehículos a la zona privada: primero la simulación y, si la
   lista es la esperada, `--aplicar`; al final otra simulación tiene que dar cero.
   ```bash
   docker compose exec -T backend node dist-ops/scripts/migrar-documentos-vehiculos.js </dev/null
   docker compose exec -T backend node dist-ops/scripts/migrar-documentos-vehiculos.js --aplicar </dev/null
   ```
2. Purgar en Cloudflare la caché de las URLs que listó el script y de
   `/uploads/solicitudes-*` (antes se servían como públicas).
3. Retención de datos: correr la simulación y revisar qué tocaría.
   `docker compose exec -T backend npm run retencion </dev/null`. Recién con el
   resultado revisado, programarla en el cron del host (por ejemplo, semanal con
   `-- --apply`) y anotarlo en el log de deploys.
4. Endurecer el host con `scripts/hardening/pi-host-hardening.sh` en este orden:
   simulación, `--apply --only ssh` (probá una sesión nueva antes de cerrar la
   actual), `--apply --only firewall` y al final el resto. Guardá la salida de
   `scripts/hardening/verify-host.sh` como evidencia.
