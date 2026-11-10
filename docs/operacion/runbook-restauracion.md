# Runbook: restauración y reconstrucción

Se apoya en [scripts/BACKUPS.md](../../scripts/BACKUPS.md) (qué se respalda y
cómo se cifra) y en los scripts `scripts/restore.sh`, `scripts/restore-files.sh`
y `scripts/restore-drill.sh`. Objetivos de RPO y RTO: [respaldo y
continuidad](../seguridad/respaldo-y-continuidad.md).

Marcadores: `<host-de-produccion>`, `<host-nuevo>`, `<usuario-operador>`,
`<directorio-del-proyecto>`, `<dominio-de-produccion>`, `<remote-offsite>`.

## Qué necesitás tener a mano (fuera del host)

En el gestor de contraseñas:

- [ ] la copia vigente del `.env` de la raíz;
- [ ] la clave privada de `age` (`age-identity.txt`);
- [ ] las credenciales del offsite (si no están en el `.env`);
- [ ] acceso a Cloudflare (túnel y DNS) y a la red de administración;
- [ ] códigos de recuperación del 2FA de tu cuenta super_admin.

Sin la clave privada de `age`, los backups cifrados no se pueden leer. Sin
`INTEGRACIONES_SECRET_KEY` (en el `.env`), los secretos de integraciones y del
2FA que trae el dump no se pueden descifrar. Si el backup es de **antes** de una
rotación de esa clave, hace falta la clave de esa época: va en
`INTEGRACIONES_SECRET_KEYS_ANTERIORES` (por eso las claves retiradas se conservan
en el gestor) y después de restaurar se corre `npm run recifrar-secretos -- --apply`.

## 1. Simulacro (no toca producción)

Mensual, y siempre después de cambiar algo del backup:

```bash
cd <directorio-del-proyecto>
BACKUP_AGE_IDENTITY=/ruta/segura/age-identity.txt sh scripts/restore-drill.sh
```

Restaura el último dump en un Postgres descartable, compara conteos con la base
viva y prueba el último archivo de `uploads` y `wa-auth`. Sale con código
distinto de 0 si algo falla y deja una línea en `scripts/restore-drill.log`.
Copiá esa línea al archivo privado de evidencias. Después borrá la clave
privada del host si la copiaste para el simulacro.

## 2. Restaurar la base en el mismo host

Reemplaza los datos actuales. Es la última opción frente a un error de datos:
antes evaluá corregir con un script.

```bash
cd <directorio-del-proyecto>
docker compose run --rm --entrypoint sh db-backup -c 'ls -1t /backups'   # elegí el archivo
docker compose stop backend
docker compose run --rm \
  -e BACKUP_FILE=concesionaria_AAAAMMDD_HHMMSS.sql.gz.age -e RESTORE_CONFIRM=yes \
  -e BACKUP_AGE_IDENTITY=/identity.txt -v /ruta/segura/age-identity.txt:/identity.txt:ro \
  --entrypoint sh db-backup /usr/local/bin/restore.sh </dev/null
docker compose up -d backend          # migrate deploy + init-rls + setup-app-role
```

Para volver a un dump puntual tomado antes de un deploy (`pg_dump -Fc`):
`docker compose exec -T db pg_restore -U <usuario-db> -d <base> --clean --if-exists < ~/pre-deploy-<ts>.dump`,
con el backend detenido.

## 3. Restaurar archivos (uploads y sesiones de WhatsApp)

Con el backend detenido (las sesiones de WhatsApp se escriben solas y pisarían
lo restaurado). Los nombres de los volúmenes dependen del proyecto de compose:
miralos con `docker volume ls`.

```bash
docker compose stop backend
docker run --rm \
  -v <proyecto>_backups:/backups:ro \
  -v <proyecto>_uploads:/data/uploads \
  -v <proyecto>_wa-auth:/data/wa-auth \
  -v "$PWD/scripts/restore-files.sh":/restore-files.sh:ro \
  -v /ruta/segura/age-identity.txt:/identity.txt:ro \
  -e BACKUP_FILE=files_AAAAMMDD_HHMMSS.tar.gz.age \
  -e BACKUP_AGE_IDENTITY=/identity.txt -e RESTORE_CONFIRM=yes \
  --entrypoint sh autenza-db-backup:local /restore-files.sh
docker compose up -d backend
```

Si las sesiones de WhatsApp no se recuperan, cada concesionaria tiene que volver
a escanear el QR desde Configuración.

## 4. Reconstruir producción en otro host desde cero

Escenarios: el host murió, lo robaron, está comprometido o hay que mudarse.

1. **Host nuevo.** Linux de 64 bits con disco cifrado, usuario operador sin
   login por contraseña y zona horaria `America/Argentina/Buenos_Aires`.
   Si el host anterior está comprometido, nada se copia de él salvo backups
   cifrados.
2. **Endurecimiento.** `scripts/hardening/pi-host-hardening.sh` primero en
   *dry-run* (es el modo por defecto), revisar la salida y después aplicarlo.
   Guardar la salida de `scripts/hardening/verify-host.sh` como evidencia.
3. **Base de software.** Docker y el plugin compose desde el repositorio
   oficial; el cliente de la red de administración; `cloudflared`.
4. **Código.**
   ```bash
   git clone <url-del-repo> <directorio-del-proyecto> && cd <directorio-del-proyecto>
   git checkout --detach vX.Y.Z        # el último tag que estaba en producción
   ```
5. **Secretos.** Copiá el `.env` desde el gestor de contraseñas a la raíz del
   proyecto con `chmod 600 .env`. Si el incidente pudo exponer secretos, rotalos
   ahora ([runbook de incidentes](runbook-incidentes.md), sección C).
6. **Backups.** Traé el último dump y el último `files_*` cifrados desde el
   offsite (por ejemplo `rclone copy <remote-offsite> ./restore-in/`) y copialos
   al volumen `backups` una vez creado (paso 7).
7. **Base sola primero.**
   ```bash
   docker compose up -d db
   docker compose create --build db-backup     # imagen y volumen de backups, sin arrancarlo
   docker run --rm -v <proyecto>_backups:/backups -v "$PWD/restore-in":/in:ro alpine sh -c 'cp /in/* /backups/'
   ```
   Restaurá la base (sección 2) y los archivos (sección 3).
8. **Todo el stack.** `docker compose up -d --build`. El arranque aplica
   migraciones pendientes, RLS y el rol `app_rw`. Verificá `docker compose ps`.
9. **Túnel.** En Cloudflare, mové el túnel al host nuevo (o creá uno nuevo y
   apuntá el DNS de `<dominio-de-produccion>`). Desconectá el túnel del host
   viejo.
10. **Verificación.** Smoke del [runbook de deploy](runbook-deploy.md), sección 3;
    conteos de tablas contra el último simulacro; login con 2FA; ver una foto y
    un adjunto privado; estado de las integraciones y de WhatsApp;
    `db-backup` en `healthy` y un backup nuevo hecho.
11. **Cierre.** Anotá el RTO real (desde la decisión de reconstruir hasta el
    smoke en verde) y el RPO real (antigüedad del backup usado). Avisá a las
    concesionarias si hubo corte o pérdida de datos. Borrá del host nuevo la
    clave privada de `age` y la carpeta `restore-in`.

## 5. Después de cualquier restauración

- Registrá qué se restauró, desde qué backup, cuánto se perdió y cuánto tardó.
- Si se perdieron datos personales o hubo exposición, aplicá la sección de
  brechas de la [política de incidentes](../seguridad/gestion-de-incidentes.md).
- Si algo de este runbook no funcionó como dice, corregilo en un PR ese mismo día.
