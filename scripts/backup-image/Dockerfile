# Imagen del servicio db-backup: postgres:16-alpine + las herramientas que el
# backup necesita (rclone para el offsite, age para cifrar, tar para uploads y
# wa-auth). Se instalan ACÁ, en el build, y no en cada arranque del contenedor
# (antes: `apk add rclone` en backup.sh en runtime, sin versión ni verificación).
FROM postgres:16-alpine
RUN apk add --no-cache rclone age tar
