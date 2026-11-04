# Backups de AUTENZA

Qué se respalda, cómo se cifra y cómo se restaura. El servicio `db-backup`
(docker-compose.yml) corre `scripts/backup.sh` una vez al día.

| Qué | Dónde vive | Backup |
|---|---|---|
| Base Postgres | volumen `pgdata` | `concesionaria_*.sql.gz[.age]` |
| Uploads (DNI, recibos, fotos) | volumen `uploads` | `files_*.tar.gz[.age]` |
| Sesiones de WhatsApp | volumen `wa-auth` | `files_*.tar.gz[.age]` (mismo archivo) |
| `.env` (JWT, `INTEGRACIONES_SECRET_KEY`, SMTP…) | la Pi | **manual**, ver abajo |
| Clave privada de age | tu gestor de contraseñas | **manual** |

## Puesta en marcha (una vez)

1. En tu PC: `age-keygen -o age-identity.txt`. Imprime una clave pública `age1…`.
2. Guardá `age-identity.txt` en tu gestor de contraseñas. **No** en la Pi ni en git.
   Si la perdés, los backups cifrados son irrecuperables.
3. En el `.env` de la Pi: `BACKUP_AGE_RECIPIENT=age1…` (la pública).
   Recomendado: una segunda clave de otra persona/dispositivo, separadas por espacio.
4. Alertas: `BACKUP_ALERT_CMD` (ver `.env.example`).
5. `docker compose up -d --build db-backup` (la imagen trae `age`, `rclone` y `tar`).
6. Probá: `docker compose exec db-backup sh /usr/local/bin/backup.sh` y
   `docker compose ps` (el servicio debe quedar `healthy`).
7. Corré el simulacro (abajo) para confirmar que el backup se restaura.

## Guardar el `.env` fuera de la Pi

El `.env` no está en el backup automático (tiene los secretos). Sin
`INTEGRACIONES_SECRET_KEY` los secretos de integraciones del dump no se pueden
descifrar. Guardá una copia en el gestor de contraseñas y actualizala cada vez que
rotes un secreto.

## Offsite (Cloudflare R2)

Sólo se suben archivos `.age`. Sin `BACKUP_AGE_RECIPIENT` el offsite se omite y se
dispara la alerta (a menos que fuerces `BACKUP_OFFSITE_ALLOW_PLAINTEXT=1`, no
recomendado).

## Monitoreo

- `docker compose ps`: `db-backup` queda `unhealthy` si el último backup completo
  (base + archivos) tiene más de 26 h o nunca se hizo.
- Cada fallo llama a `BACKUP_ALERT_CMD`.

## Simulacro de restore (mensual)

```sh
BACKUP_AGE_IDENTITY=/ruta/segura/age-identity.txt sh scripts/restore-drill.sh
```

Restaura el último dump en un Postgres descartable, compara conteos con
producción, verifica que se pueda leer el último `files_*` y deja una línea con
fecha en `scripts/restore-drill.log`. Ese log es la evidencia de la última prueba.

## Restauración real

Base (sobrescribe la base viva; ver la cabecera de `scripts/restore.sh`):

```sh
docker compose run --rm \
  -e BACKUP_FILE=concesionaria_YYYYMMDD_HHMMSS.sql.gz.age -e RESTORE_CONFIRM=yes \
  -e BACKUP_AGE_IDENTITY=/identity.txt -v /ruta/segura/age-identity.txt:/identity.txt:ro \
  --entrypoint sh db-backup /usr/local/bin/restore.sh
docker compose restart backend   # recrea RLS y el rol app_rw (init-rls / setup-app-role)
```

Archivos: `scripts/restore-files.sh` (cabecera con el `docker run`). Frená el backend
antes para que Baileys no pise `wa-auth`.

## Límites conocidos

- RPO de hasta 24 h (un backup diario).
- El archivo de `uploads` es un tar completo por día: si el volumen crece mucho
  conviene pasar a incrementales.
- El test `scripts/tests/backup.test.sh` (corre en el CI) usa `pg_dump`, `age` y
  `rclone` simulados: valida la lógica, no los binarios reales. Eso lo cubre el
  simulacro en la Pi.
