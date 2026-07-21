# Etapa 1 — Asegurar y estabilizar · Guía de despliegue

Cambios aplicados para cerrar los riesgos críticos antes de poner datos reales de
una concesionaria. Leé esto completo antes de subir a la Raspberry.

---

## 1. Qué cambió (resumen)

| Área | Antes | Ahora |
|------|-------|-------|
| **Credenciales** | Usuarios demo `admin123`/`super123` creados en cada arranque | Seed condicional, credenciales por `.env`, sin contraseñas hardcodeadas |
| **Secretos** | `JWT_SECRET`, password de Postgres en el compose | En `.env` (fuera del repo); el arranque falla si faltan; prod rechaza los valores dev |
| **API** | Mayoría de endpoints sin autenticación | `authenticate` global en `/api` (salvo `/auth` y `/health`) |
| **Rate limit** | Anulado (saltea IPs internas de Docker) | `trust proxy` + límite real por IP; login limitado a 5 intentos fallidos/15 min por cuenta |
| **Base de datos** | `db push --accept-data-loss` en cada arranque | `db push` sin `--accept-data-loss` (aborta en vez de borrar datos); baseline de migración corregido |
| **Backups** | Ninguno | Servicio `db-backup`: dump diario comprimido + retención + restauración |
| **Debug** | `/api/debug/*` expuesto en prod | Solo se monta con `NODE_ENV=development` |
| **Puertos** | Postgres (5432) y Prisma Studio (5555) abiertos a la LAN | Ligados a `127.0.0.1` (solo la propia máquina) |
| **Logs** | Consola, nivel `warn`, ANSI en archivos | JSON estructurado nivel `info`, con correlationId; rotación en Docker |

---

## 2. Pasos para desplegar

### 2.1. Subí los archivos por WinSCP
Todo el proyecto. Asegurate de **incluir** el nuevo `.env` (tiene los secretos) y
la carpeta `scripts/`. **Excluí** `node_modules` y `dist` (se generan en el build).

> El `.env` ya viene con secretos fuertes generados. Si preferís generar los tuyos:
> `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`

### 2.2. Reconstruí y levantá
```bash
cd ~/docker/Concesionaria
docker compose up -d --build
```
El backend aplica el schema (`db push`), configura RLS y arranca. Ya **no** corre el seed.

### 2.3. Cambiá las credenciales demo que YA están en la base
Los usuarios `admin@demo.com` / `superadmin@demo.com` siguen en tu base con las
contraseñas viejas. Elegí una opción:

**Opción A — crear tu admin real y desactivar los demo:**
```bash
# 1. Crear el admin real (solo si la base estuviera vacía; si ya tenés datos, saltá al paso 2)
docker compose exec backend npx ts-node prisma/seed.ts

# 2. Cambiar la contraseña del admin demo existente
docker compose exec -e USER_EMAIL=admin@demo.com -e USER_PASSWORD='TuClaveFuerte123' \
  backend npx ts-node scripts/set-password.ts

# 3. Desactivar el super_admin demo (no lo necesitás en una instalación de un solo cliente)
docker compose exec -e USER_EMAIL=superadmin@demo.com -e USER_DEACTIVATE=true \
  backend npx ts-node scripts/set-password.ts
```

**Opción B — base vacía / instalación nueva:** definí `SEED_ADMIN_EMAIL` y
`SEED_ADMIN_PASSWORD` en el `.env` (ya están de ejemplo) y corré el seed una vez:
```bash
docker compose exec backend npx ts-node prisma/seed.ts
```
El seed crea roles, el plan y —solo si la base está vacía— tu concesionaria y admin.

### 2.4. Verificá los backups
```bash
# Forzar un backup ahora y ver que se genera
docker compose exec db-backup sh /usr/local/bin/backup.sh
docker compose exec db-backup ls -1t /backups
```
Corre automáticamente cada 24 h. Retención por defecto: 14 días (`BACKUP_RETENTION_DAYS`).

**Restaurar** (reemplaza los datos actuales):
```bash
docker compose exec db-backup ls -1t /backups        # elegí el archivo
docker compose exec -e BACKUP_FILE=concesionaria_AAAAMMDD_HHMMSS.sql.gz \
  db-backup sh /usr/local/bin/restore.sh
docker compose restart backend
```

> **Recomendado:** copiar los dumps fuera de la Pi (otra máquina o un bucket S3/Backblaze).
> El backup vive en un volumen Docker de la misma Pi; si falla la SD, se pierde con todo.
> Un `scp` o `rclone` diario del volumen `backups` cierra ese hueco.

---

## 3. Verificación rápida post-deploy

```bash
# La API rechaza requests sin token (debe dar 401):
curl -s -o /dev/null -w "%{http_code}\n" https://autenza.nebulant.com.ar/api/ventas   # → 401

# El login sigue funcionando y el health también:
curl -s https://autenza.nebulant.com.ar/api/health                                    # → status UP

# Debug NO existe en prod (debe dar 404):
curl -s -o /dev/null -w "%{http_code}\n" https://autenza.nebulant.com.ar/api/debug/me # → 404
```
Después probá entrar por la web con tu usuario: si el login anda y ves los datos, todo OK.

---

## 4. Cutover a migraciones versionadas (opcional, recomendado a futuro)

Hoy el arranque usa `prisma db push` (seguro: sin `--accept-data-loss`). El baseline
de migración en `prisma/migrations/` ya quedó **corregido y al día con el schema**.
Cuando quieras pasar a migraciones versionadas (ideal para actualizar varias
instancias de clientes de forma reproducible):

```bash
# 1. Marcar tu base existente como "ya migrada" (baseline), sin re-crear tablas:
docker compose exec backend npx prisma migrate resolve --applied 20260225152241_init_v3

# 2. Cambiar el command del backend en docker-compose.yml:
#    de:  npx prisma db push && npm run init-rls && npm start
#    a:   npx prisma migrate deploy && npm run init-rls && npm start

# 3. A partir de ahí, cada cambio de schema se hace con:
#    npx prisma migrate dev --name descripcion   (en desarrollo, genera la migración)
#    y migrate deploy la aplica en producción.
```

---

## 5. Puntos diferidos (Etapa 2)

Estos quedaron identificados pero **no** se tocaron en Etapa 1 por ser cambios de
mayor alcance o menor severidad (ya mitigados por auth + rate limit):

- **Uploads en memoria (multer):** el riesgo de agotar RAM quedó acotado porque
  ahora las rutas de upload exigen token y el rate limit es real. Pasar a
  almacenamiento en disco requiere adaptar el `LocalStorageAdapter` (buffer→path).
- **`/uploads` servido sin autenticación:** los nombres son aleatorios (128 bits,
  no adivinables), pero un link filtrado da acceso permanente. Servirlos por un
  endpoint autenticado con chequeo de tenant es una mejora de Etapa 2.
- **`createdBy` / `updatedBy` en tablas transaccionales:** hoy el `AuditLog`
  registra quién hizo cada acción; agregar el autor en cada registro (para
  reportes directos) implica migración de schema + tocar todos los `create`.
- **Lockout persistente de cuenta:** el límite actual (5 intentos fallidos/15 min
  por cuenta) se reinicia al reiniciar el contenedor. Un lockout con estado en la
  base es una mejora opcional.
