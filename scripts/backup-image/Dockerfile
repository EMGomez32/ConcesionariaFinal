# Imagen del servicio db-backup: postgres:16-alpine + las herramientas que el
# backup necesita (rclone para el offsite, age para cifrar, tar para uploads y
# wa-auth). Se instalan ACÁ, en el build, y no en cada arranque del contenedor
# (antes: `apk add rclone` en backup.sh en runtime, sin versión ni verificación).
# Misma imagen (digest) que el servicio db de docker-compose.yml: pg_dump de la misma versión.
FROM postgres:16-alpine@sha256:aa6cb33cf4c19c765cefcf48d96176258800870a9a1e930ad126200f9d825139
RUN apk add --no-cache rclone age tar
